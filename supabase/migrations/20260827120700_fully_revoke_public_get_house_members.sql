-- 20260827120500 only revoked EXECUTE from the `anon` role, but the
-- diagnostic in 20260827120600 confirmed PUBLIC still separately holds
-- EXECUTE on get_house_members(uuid) — and every role's effective privilege
-- set is the union of its own grants plus PUBLIC's, so anon could still call
-- it through the PUBLIC grant alone. Revoke both explicitly this time.
REVOKE EXECUTE ON FUNCTION public.get_house_members(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_house_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_house_members(uuid) TO authenticated;
