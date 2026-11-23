-- House of the signed-in member, found by their login e-mail.
--
-- 26 profiles were created by a bulk import with e-mail typos (e.g. "ayyappa.nani.123@gmail.co"), which
-- also created a throw-away auth user per profile. The member's REAL login (created in the app) has a
-- different auth id than profiles.id / profiles.auth_user_id, so the app's lookup by id (and the existing
-- get_my_house_id(), which matches id / auth_user_id) finds nothing and the Link/Deal/I2WE member pickers
-- never appear. The profile e-mail was corrected afterwards, so matching the login e-mail finds the right
-- row. Read-only; returns only the caller's own house id.
CREATE OR REPLACE FUNCTION public.get_my_house_id_by_login()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT p.house_id FROM public.profiles p
      WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
      LIMIT 1),
    (SELECT p.house_id FROM public.profiles p
       JOIN auth.users a ON lower(btrim(a.email)) = lower(btrim(p.email))
      WHERE a.id = auth.uid()
      LIMIT 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_house_id_by_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_house_id_by_login() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_house_id_by_login() TO authenticated;
