-- Member's date of joining (from the official members sheet), shown in the app as
-- "Member since <year>". Kept separate from created_at: that is when the app/portal
-- record was created (many members were bulk-imported later), not when they joined.
-- Stored on both member tables like membership_code: profiles (GHM admin portal) and
-- users_profile (mobile app); both are keyed by the same id.
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS member_since date;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS member_since date;
