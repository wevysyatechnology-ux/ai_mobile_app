-- Eligibility-aware member search for AI Discover. Mirrors get_house_members()'s
-- proven eligibility WHERE clause (supabase/migrations/20260403000000_get_house_members_add_status_fields.sql)
-- but searches across ALL houses (Discover isn't house-scoped) and adds
-- mobile_app_access + capability-keyword matching.
--
-- This closes a real gap: services/memberSearchService.ts and the Vapi
-- search-members edge function both currently query users_profile directly
-- with zero eligibility filtering, so suspended/expired/unapproved members
-- can surface in search today. Both should be switched to call this RPC so
-- the eligibility rule lives in exactly one place.
CREATE OR REPLACE FUNCTION public.search_eligible_members(
  p_query TEXT DEFAULT NULL,
  p_profession TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_keyword TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  business_category TEXT,
  city TEXT,
  phone_number TEXT,
  profile_photo TEXT,
  matched_keywords TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id,
    p.full_name,
    up.business_category,
    COALESCE(up.city, p.zone) AS city,
    up.phone_number,
    up.profile_photo,
    ARRAY_AGG(mck.keyword) FILTER (WHERE mck.keyword IS NOT NULL) AS matched_keywords
  FROM public.users_profile up
  LEFT JOIN public.profiles p ON p.id = up.id OR p.auth_user_id = up.id
  LEFT JOIN public.member_capability_keywords mck
    ON mck.member_id = up.id AND mck.is_active = true
  WHERE
    (p.approval_status = 'approved' OR p.approval_status IS NULL)
    AND COALESCE(up.membership_status::text, 'active') NOT IN ('expired', 'resigned', 'terminated', 'inactive', 'suspended')
    AND COALESCE(up.is_suspended, false) = false
    AND COALESCE(up.mobile_app_access, true) = true
    AND (
      p_query IS NULL OR (
        up.full_name ILIKE '%' || p_query || '%'
        OR up.business_category ILIKE '%' || p_query || '%'
        OR up.city ILIKE '%' || p_query || '%'
        OR EXISTS (
          SELECT 1 FROM public.member_capability_keywords k
          WHERE k.member_id = up.id AND k.is_active = true AND k.keyword ILIKE '%' || p_query || '%'
        )
      )
    )
    AND (p_profession IS NULL OR up.business_category ILIKE '%' || p_profession || '%')
    AND (p_location IS NULL OR up.city ILIKE '%' || p_location || '%')
    AND (p_keyword IS NULL OR EXISTS (
      SELECT 1 FROM public.member_capability_keywords k
      WHERE k.member_id = up.id AND k.is_active = true AND k.keyword ILIKE '%' || p_keyword || '%'
    ))
  GROUP BY up.id, p.full_name, up.business_category, up.city, p.zone, up.phone_number, up.profile_photo
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_eligible_members(TEXT, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;
