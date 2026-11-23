-- The previous REVOKE ... FROM PUBLIC (20260827120300) didn't actually close
-- the gap: Supabase's default schema setup runs
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role`
-- for every new function, which grants EXECUTE directly to the `anon` role —
-- separate from (and not covered by) a PUBLIC revoke. Confirmed live: the
-- anon key could still call search_eligible_members() and get back full
-- member data including phone numbers after the PUBLIC-only revoke.
REVOKE EXECUTE ON FUNCTION public.search_eligible_members(TEXT, TEXT, TEXT, TEXT, INT) FROM anon;
