-- Per-speaker call transcript segments. Each device records and transcribes
-- ONLY its own microphone (independent of the WebRTC call audio itself, via
-- a separate expo-av Audio.Recording instance) and writes its own text here
-- once the call ends. A viewer merges both participants' rows (ordered by
-- created_at) into a single conversation transcript. No server-side audio
-- recording exists or is possible with this pure peer-to-peer WebRTC
-- architecture -- see supabase/migrations/20260909120000_create_call_sessions.sql.
CREATE TABLE IF NOT EXISTS public.call_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
    speaker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON public.call_transcripts(call_id, created_at);

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants of a call can read transcripts" ON public.call_transcripts;
CREATE POLICY "Participants of a call can read transcripts"
    ON public.call_transcripts FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.call_sessions cs
            WHERE cs.id = call_transcripts.call_id
              AND (auth.uid() = cs.caller_id OR auth.uid() = cs.callee_id)
        )
    );

DROP POLICY IF EXISTS "Participants of a call can add their own transcript segment" ON public.call_transcripts;
CREATE POLICY "Participants of a call can add their own transcript segment"
    ON public.call_transcripts FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = speaker_id
        AND EXISTS (
            SELECT 1 FROM public.call_sessions cs
            WHERE cs.id = call_transcripts.call_id
              AND (auth.uid() = cs.caller_id OR auth.uid() = cs.callee_id)
        )
    );

GRANT SELECT, INSERT ON public.call_transcripts TO authenticated;
