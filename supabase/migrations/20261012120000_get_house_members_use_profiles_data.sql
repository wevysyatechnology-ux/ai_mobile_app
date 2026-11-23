-- get_house_members() feeds the member dropdown on the Link / Deal / I2WE forms
-- (plus Discover, Activity and Channel detail). It used to take the category
-- from users_profile.business_category, but the GHM portal edits profiles
-- (industry, business, city, state) and never touches that mobile column, so
-- the app showed stale values (e.g. "Jewellery" for a Wealth Management
-- member). Read what the portal shows instead; signature and the eligibility
-- filters are unchanged.
CREATE OR REPLACE FUNCTION public.get_house_members(p_house_id uuid)
 RETURNS TABLE(id uuid, full_name text, phone_number text, business_category text, city text, state text, vertical_type text, membership_status text, is_suspended boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    up.phone_number,
    -- GHM "Industry", falling back to GHM "Company" (profiles.business)
    COALESCE(NULLIF(btrim(p.industry), ''), NULLIF(btrim(p.business), '')) AS business_category,
    COALESCE(NULLIF(btrim(p.city), ''), NULLIF(btrim(up.city), ''), NULLIF(btrim(p.zone), '')) AS city,
    COALESCE(NULLIF(btrim(p.state), ''), NULLIF(btrim(up.state), '')) AS state,
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
$function$;
