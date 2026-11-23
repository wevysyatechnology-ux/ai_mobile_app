-- Real audio-only in-app calling between two connected members. Signaling
-- (SDP offer/answer) rides on this table; ICE candidates go through the
-- companion call_ice_candidates table (INSERT-based Realtime, like
-- chat_messages). No external calling-service account is used — the app
-- already ships @daily-co/react-native-webrtc (a standard raw WebRTC
-- implementation, transitively installed for the Vapi AI-voice feature) and
-- talks straight WebRTC peer-to-peer, with Supabase Realtime as the
-- signaling channel.
CREATE TABLE IF NOT EXISTS public.call_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.core_connections(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ringing'
        CHECK (status IN ('ringing', 'active', 'declined', 'missed', 'ended')),
    offer_sdp JSONB,
    answer_sdp JSONB,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT call_sessions_no_self CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_connection_id ON public.call_sessions(connection_id);
-- Used by the always-mounted incoming-call banner's realtime filter.
CREATE INDEX IF NOT EXISTS idx_call_sessions_callee ON public.call_sessions(callee_id);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their call sessions" ON public.call_sessions;
CREATE POLICY "Participants can view their call sessions"
    ON public.call_sessions FOR SELECT TO authenticated
    USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Only the caller may start a call, and only against an accepted connection
-- where they and the named callee are the two participants — mirrors
-- chat_messages' EXISTS-on-accepted-connection pattern.
DROP POLICY IF EXISTS "Caller can start a call on an accepted connection" ON public.call_sessions;
CREATE POLICY "Caller can start a call on an accepted connection"
    ON public.call_sessions FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = caller_id
        AND EXISTS (
            SELECT 1 FROM public.core_connections c
            WHERE c.id = call_sessions.connection_id
              AND c.status = 'accepted'
              AND ((c.requester_id = caller_id AND c.recipient_id = callee_id)
                OR (c.recipient_id = caller_id AND c.requester_id = callee_id))
        )
    );

-- Either participant can update status/SDP fields (answer/decline/end/missed)
-- — same permissive-RLS + service-layer-enforces-nuance split as
-- core_connections.
DROP POLICY IF EXISTS "Participants can update their call session" ON public.call_sessions;
CREATE POLICY "Participants can update their call session"
    ON public.call_sessions FOR UPDATE TO authenticated
    USING (auth.uid() = caller_id OR auth.uid() = callee_id)
    WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

GRANT SELECT, INSERT, UPDATE ON public.call_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.set_call_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_call_sessions_updated_at ON public.call_sessions;
CREATE TRIGGER trg_call_sessions_updated_at
    BEFORE UPDATE ON public.call_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_call_sessions_updated_at();
