-- Names for the members attached to links / deals / meetings.
--
-- profiles is RLS-scoped (a normal member can only read their own row), so the app showed "Unknown"
-- for anyone outside the member's own house, e.g. who gave them a deal or link from another house.
-- This returns ONLY id and full_name (nothing else about the member), for ids the caller already has,
-- and only to signed-in members.
CREATE OR REPLACE FUNCTION public.get_member_names(p_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.id = ANY (p_ids[1:200]);
$$;

REVOKE EXECUTE ON FUNCTION public.get_member_names(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_member_names(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_names(uuid[]) TO authenticated;
