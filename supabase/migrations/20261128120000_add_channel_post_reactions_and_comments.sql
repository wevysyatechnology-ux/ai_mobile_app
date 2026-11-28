-- Reactions and comments on channel posts.
-- Enables members to react with emojis and discuss posts in the Asks channel
-- (and any other post-based channel) directly in-app.

CREATE TABLE IF NOT EXISTS public.channel_post_reactions (
  post_id uuid NOT NULL REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_channel_post_reactions_post_id
  ON public.channel_post_reactions(post_id);

ALTER TABLE public.channel_post_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read reactions" ON public.channel_post_reactions;
CREATE POLICY "Authenticated users can read reactions"
  ON public.channel_post_reactions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can add their own reactions" ON public.channel_post_reactions;
CREATE POLICY "Users can add their own reactions"
  ON public.channel_post_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own reactions" ON public.channel_post_reactions;
CREATE POLICY "Users can remove their own reactions"
  ON public.channel_post_reactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.channel_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_post_comments_post_id
  ON public.channel_post_comments(post_id, created_at DESC);

ALTER TABLE public.channel_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read comments" ON public.channel_post_comments;
CREATE POLICY "Authenticated users can read comments"
  ON public.channel_post_comments FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can create their own comments" ON public.channel_post_comments;
CREATE POLICY "Users can create their own comments"
  ON public.channel_post_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can edit their own comments" ON public.channel_post_comments;
CREATE POLICY "Users can edit their own comments"
  ON public.channel_post_comments FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.channel_post_comments;
CREATE POLICY "Users can delete their own comments"
  ON public.channel_post_comments FOR DELETE
  USING (auth.uid() = user_id);
