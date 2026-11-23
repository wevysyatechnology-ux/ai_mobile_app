-- Documents `users_profile.mobile_app_access` in migration history. This column
-- already exists on the live database (added directly, outside any tracked
-- migration — same drift pattern already seen elsewhere in this project) but
-- had never been captured here, so a fresh DB provisioned from migrations
-- alone would be missing it. IF NOT EXISTS makes this a no-op against the
-- live database.
--
-- Default true: every existing member currently has no explicit access
-- restriction, so defaulting new/uncaptured rows to true preserves current
-- visibility until a GHM admin explicitly revokes access, rather than
-- silently hiding the whole membership on rollout.
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS mobile_app_access boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users_profile.mobile_app_access IS
  'GHM-admin-controlled: whether this member is eligible to appear in Discover/AI search and use Discover-related features. Set via the GHM admin portal.';
