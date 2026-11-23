-- ICE candidates trickle in over time from both peers during WebRTC
-- connection setup; each is its own row so Realtime INSERT delivery (same
-- idiom as chat_messages) can push them to the other side as they're
-- discovered, rather than waiting to batch them onto call_sessions.
CREATE TABLE IF NOT EXISTS public.call_ice_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    candidate JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_ice_candidates_call_id ON public.call_ice_candidates(call_id, created_at);

ALTER TABLE public.call_ice_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants of a call can read ICE candidates" ON public.call_ice_candidates;
CREATE POLICY "Participants of a call can read ICE candidates"
    ON public.call_ice_candidates FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.call_sessions cs
            WHERE cs.id = call_ice_candidates.call_id
              AND (auth.uid() = cs.caller_id OR auth.uid() = cs.callee_id)
        )
    );

DROP POLICY IF EXISTS "Participants of a call can send ICE candidates" ON public.call_ice_candidates;
CREATE POLICY "Participants of a call can send ICE candidates"
    ON public.call_ice_candidates FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.call_sessions cs
            WHERE cs.id = call_ice_candidates.call_id
              AND (auth.uid() = cs.caller_id OR auth.uid() = cs.callee_id)
        )
    );

GRANT SELECT, INSERT ON public.call_ice_candidates TO authenticated;
