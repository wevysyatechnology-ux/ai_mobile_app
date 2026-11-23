-- CRITICAL: get_house_members() has been callable by the anon role (i.e.
-- anyone holding just the app's public anon key, no login required) since it
-- was created — same missing-anon-revoke gap just found and fixed on
-- search_eligible_members(). Confirmed live: an unauthenticated request
-- with the anon key successfully returned full_name + phone_number for
-- every member of an arbitrary house_id. Combined with the `houses` table
-- being fully open to anon (no RLS), this meant anyone could enumerate all
-- house ids and dump the full membership directory's names and phone
-- numbers with zero authentication.
REVOKE EXECUTE ON FUNCTION public.get_house_members(uuid) FROM anon;
