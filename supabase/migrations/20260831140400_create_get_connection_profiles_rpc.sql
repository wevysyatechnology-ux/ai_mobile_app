-- Connections can be with any member, not just someone in the caller's own
-- house — and users_profile RLS restricts SELECT to auth.uid() = id, so a
-- plain client query can't resolve a counterpart's name/photo for the
-- Connect Requests inbox or member-profile's connection state. This RPC
-- exposes only non-sensitive directory fields (name, business, city, photo —
-- NOT phone_number, which stays gated behind mutual consent via
-- get_connection_contact_info) for the counterpart of connections the
-- caller actually participates in.
CREATE OR REPLACE FUNCTION public.get_connection_counterpart_profiles(p_connection_ids UUID[])
RETURNS TABLE (
  connection_id UUID,
  counterpart_id UUID,
  full_name TEXT,
  business_category TEXT,
  city TEXT,
  profile_photo TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    c.id AS connection_id,
    CASE WHEN v_caller = c.requester_id THEN c.recipient_id ELSE c.requester_id END AS counterpart_id,
    up.full_name,
    up.business_category,
    up.city,
    up.profile_photo
  FROM public.core_connections c
  JOIN public.users_profile up
    ON up.id = CASE WHEN v_caller = c.requester_id THEN c.recipient_id ELSE c.requester_id END
  WHERE c.id = ANY(p_connection_ids)
    AND (c.requester_id = v_caller OR c.recipient_id = v_caller);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_connection_counterpart_profiles(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_connection_counterpart_profiles(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_connection_counterpart_profiles(UUID[]) TO authenticated;
