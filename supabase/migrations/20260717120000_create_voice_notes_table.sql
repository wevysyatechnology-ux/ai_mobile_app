-- Voice Notes / Meeting Companion: transcript + summary only, no raw audio
-- (storage decision per product plan — cost + privacy, aligns with existing AI-consent gate).

CREATE TABLE IF NOT EXISTS public.voice_notes (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_i2we_id  uuid        REFERENCES public.core_i2we(id) ON DELETE SET NULL,
  type             text        NOT NULL CHECK (type IN ('note', 'meeting_summary')),
  title            text        NOT NULL,
  transcript       text        NOT NULL,
  summary          text,
  action_items     jsonb,
  tags             jsonb,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_notes_user_id_idx ON public.voice_notes (user_id);
CREATE INDEX IF NOT EXISTS voice_notes_created_at_idx ON public.voice_notes (created_at DESC);

ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_notes_select_own" ON public.voice_notes;
DROP POLICY IF EXISTS "voice_notes_insert_own" ON public.voice_notes;
DROP POLICY IF EXISTS "voice_notes_update_own" ON public.voice_notes;
DROP POLICY IF EXISTS "voice_notes_delete_own" ON public.voice_notes;

-- Strictly per-user: a voice note is personal, never shared knowledge.
CREATE POLICY "voice_notes_select_own"
  ON public.voice_notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "voice_notes_insert_own"
  ON public.voice_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_notes_update_own"
  ON public.voice_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_notes_delete_own"
  ON public.voice_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.voice_notes TO authenticated;
GRANT ALL ON TABLE public.voice_notes TO service_role;
