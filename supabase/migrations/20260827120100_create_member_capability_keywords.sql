-- "What I Can Help With" capability keywords for the AI Discover feature.
-- A member can list up to 6 ACTIVE keywords describing what they offer
-- (e.g. "Wedding", "Corporate Events"), searchable by Discover/AI search.
--
-- Supersedes the dormant `profiles.keywords text[]` column, which is never
-- read or written anywhere in the app today (confirmed via repo-wide grep) —
-- that column can't carry is_active/per-keyword timestamps or a clean
-- DB-enforced cap, and lives on the house-roster table rather than
-- users_profile (the table eligibility/is_suspended/membership_status
-- already live on). Leave `profiles.keywords` untouched; do not backfill it.
CREATE TABLE IF NOT EXISTS public.member_capability_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capability_keywords_member
  ON public.member_capability_keywords(member_id);
CREATE INDEX IF NOT EXISTS idx_capability_keywords_active_keyword
  ON public.member_capability_keywords(keyword) WHERE is_active;

-- Server-enforced cap of 6 ACTIVE keywords per member. The spec explicitly
-- requires this be enforced server-side, not merely hidden in the UI (a
-- modified client or a direct API call could otherwise bypass a UI-only
-- cap). A CHECK constraint can't count sibling rows, so a trigger is used.
CREATE OR REPLACE FUNCTION public.enforce_max_active_capability_keywords()
RETURNS TRIGGER AS $$
DECLARE
  active_count INT;
BEGIN
  IF NEW.is_active THEN
    SELECT COUNT(*) INTO active_count
    FROM public.member_capability_keywords
    WHERE member_id = NEW.member_id
      AND is_active = true
      AND id <> NEW.id;
    IF active_count >= 6 THEN
      RAISE EXCEPTION 'Member already has 6 active capability keywords (max allowed)';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_max_active_capability_keywords ON public.member_capability_keywords;
CREATE TRIGGER trg_enforce_max_active_capability_keywords
  BEFORE INSERT OR UPDATE ON public.member_capability_keywords
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_active_capability_keywords();

ALTER TABLE public.member_capability_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage own capability keywords" ON public.member_capability_keywords;
CREATE POLICY "Members manage own capability keywords"
  ON public.member_capability_keywords FOR ALL TO authenticated
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_capability_keywords TO authenticated;
