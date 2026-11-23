-- Membership code (e.g. "B0001") issued by the organisation, imported from the
-- official "Membership Id number" sheet and matched to members by email.
-- Stored on both member tables: profiles (GHM admin portal, has email) and
-- users_profile (mobile app). Both are keyed by the same id (profiles.id =
-- users_profile.id = auth user id).
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS membership_code text;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS membership_code text;

-- A code identifies exactly one member. Partial index so members without a
-- code yet (NULL) don't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_membership_code
    ON public.profiles (membership_code) WHERE membership_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_profile_membership_code
    ON public.users_profile (membership_code) WHERE membership_code IS NOT NULL;

-- users_profile has a "Users can update own profile" policy, and profiles has
-- "Users and admins can update profiles" -- without this, a member could edit
-- their own membership_code straight from the app. Only GHM admins (or a
-- context with no end-user JWT: migrations, service role, SQL editor) may set
-- or change it.
CREATE OR REPLACE FUNCTION public.protect_membership_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.membership_code IS NOT NULL AND NOT public.is_ghm_admin(auth.uid()) THEN
      RAISE EXCEPTION 'membership_code can only be set by an administrator'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.membership_code IS DISTINCT FROM OLD.membership_code
        AND NOT public.is_ghm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'membership_code can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_membership_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_membership_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_membership_code() FROM authenticated;

DROP TRIGGER IF EXISTS trg_protect_membership_code ON public.profiles;
CREATE TRIGGER trg_protect_membership_code
    BEFORE INSERT OR UPDATE OF membership_code ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_membership_code();

DROP TRIGGER IF EXISTS trg_protect_membership_code ON public.users_profile;
CREATE TRIGGER trg_protect_membership_code
    BEFORE INSERT OR UPDATE OF membership_code ON public.users_profile
    FOR EACH ROW EXECUTE FUNCTION public.protect_membership_code();
