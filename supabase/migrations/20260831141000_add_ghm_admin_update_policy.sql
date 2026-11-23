-- Root cause of the Ajay.N bug: users_profile only ever had a self-row
-- UPDATE policy (20260223132526_fix_users_profile_rls_and_policies.sql —
-- auth.uid() = id). Confirmed live: toggling Mobile App Access off in a GHM
-- admin UI never actually persisted — a fresh direct query showed
-- users_profile.mobile_app_access still true for that member afterwards.
-- Whatever GHM app performed the toggle authenticates as a normal Supabase
-- Auth user (this repo's ghm/ portal confirmed to use the anon key, same
-- tier as the mobile app), so the UPDATE silently matched zero rows — RLS
-- filtered it out — instead of erroring.
--
-- The actual admin marker in this schema is profiles.role (NOT
-- users_profile.admin_role, which doesn't exist as a column at all — that
-- field in ghm/src's local TypeScript types is stale/aspirational, a
-- separate drift issue from this fix). Confirmed live values: 'super_admin'
-- (1 row), 'house_admin' (16 rows), 'member' (1706 rows), 'collaborator'
-- (2 rows, unclear purpose — excluded here as not clearly an admin role).
CREATE OR REPLACE FUNCTION public.is_ghm_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR auth_user_id = p_user_id)
      AND role IN ('super_admin', 'house_admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_ghm_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ghm_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_ghm_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "GHM admins can update any member" ON public.users_profile;
CREATE POLICY "GHM admins can update any member"
  ON public.users_profile
  FOR UPDATE
  TO authenticated
  USING (public.is_ghm_admin(auth.uid()))
  WITH CHECK (public.is_ghm_admin(auth.uid()));

-- Matching SELECT policy so admin reads no longer depend on undocumented
-- drift (GHM already reads all members successfully today via some
-- broader, untracked policy — this makes that explicit and tracked).
DROP POLICY IF EXISTS "GHM admins can read any member" ON public.users_profile;
CREATE POLICY "GHM admins can read any member"
  ON public.users_profile
  FOR SELECT
  TO authenticated
  USING (public.is_ghm_admin(auth.uid()));
