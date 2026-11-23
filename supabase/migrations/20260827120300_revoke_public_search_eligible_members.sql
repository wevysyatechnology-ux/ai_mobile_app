-- Postgres grants EXECUTE on a new function to PUBLIC by default unless
-- explicitly revoked. The GRANT in 20260827120200 only added authenticated +
-- service_role — it never revoked the default PUBLIC grant, so the anon role
-- (i.e. anyone with just the publishable anon key, no login) could call
-- search_eligible_members() and get back full member rows including phone
-- numbers. Confirmed live via a plain curl with the anon key before this fix.
REVOKE EXECUTE ON FUNCTION public.search_eligible_members(TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_eligible_members(TEXT, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;
