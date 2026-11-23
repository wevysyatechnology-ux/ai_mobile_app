-- get_house_members() powers "Members Near You"/"Top Professionals" on the
-- Discover tab (via LinksService.getHouseMembers) — a separate code path
-- from the search bar, which already goes through search_eligible_members().
-- That RPC got the mobile_app_access check when it was introduced
-- (20260827120200_create_search_eligible_members_rpc.sql), but this older
-- RPC — which get_connection eligibility was modeled on — never did, so a
-- member with mobile_app_access disabled via the GHM portal still showed up
-- in these Discover sections. Confirmed live: GHM showed "Ajay.N" as
-- App: Disabled, yet the member still appeared under "Members Near You".
DROP FUNCTION IF EXISTS public.get_house_members(uuid);

CREATE OR REPLACE FUNCTION public.get_house_members(p_house_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  phone_number text,
  business_category text,
  city text,
  state text,
  vertical_type text,
  membership_status text,
  is_suspended boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    up.phone_number,
    up.business_category,
    COALESCE(up.city, p.zone) AS city,
    up.state,
    up.vertical_type::text,
    COALESCE(up.membership_status::text, 'active') AS membership_status,
    COALESCE(up.is_suspended, false) AS is_suspended,
    up.created_at
  FROM public.profiles p
  LEFT JOIN public.users_profile up ON up.id = p.id
     OR up.id = p.auth_user_id
  WHERE p.house_id = p_house_id
    AND (p.approval_status = 'approved' OR p.approval_status IS NULL)
    -- Exclude members with explicitly inactive membership status
    AND COALESCE(up.membership_status::text, 'active') NOT IN ('expired', 'resigned', 'terminated', 'inactive', 'suspended')
    -- Exclude suspended members
    AND COALESCE(up.is_suspended, false) = false
    -- Exclude members whose GHM-controlled mobile app access is off
    AND COALESCE(up.mobile_app_access, true) = true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_house_members(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_house_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_house_members(uuid) TO authenticated;
