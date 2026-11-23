-- Fix cross-user data leak in knowledge_base: personal docs (source = 'user_activity')
-- were stored under a single global title with no per-user scoping, so any authenticated
-- user's RAG search could surface another user's link/deal/i2we stats.
--
-- Adds a nullable user_id column: NULL = shared/global knowledge (core_knowledge, custom),
-- non-null = personal document owned by that user. RLS now restricts personal rows to
-- their owner while leaving shared knowledge readable/writable by all authenticated users
-- (unchanged from the original policy).

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS knowledge_base_user_id_idx ON public.knowledge_base (user_id);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.knowledge_base;
CREATE POLICY "Read shared knowledge or own personal docs"
  ON public.knowledge_base
  FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Allow service role to insert" ON public.knowledge_base;
CREATE POLICY "Insert shared knowledge or own personal docs"
  ON public.knowledge_base
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Allow service role to update" ON public.knowledge_base;
CREATE POLICY "Update shared knowledge or own personal docs"
  ON public.knowledge_base
  FOR UPDATE
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

COMMENT ON COLUMN public.knowledge_base.user_id IS 'NULL for shared/global knowledge; set for personal per-user documents (e.g. user_activity stats).';

-- Existing 'user_activity' rows predate per-user scoping and have no reliable owner
-- (they were last-write-wins across whichever user queried most recently). Drop them
-- rather than leaving stale cross-user stats readable as "global" (user_id IS NULL);
-- they are auto-regenerated the next time each user queries their own stats.
DELETE FROM public.knowledge_base WHERE metadata->>'category' = 'user_activity';
