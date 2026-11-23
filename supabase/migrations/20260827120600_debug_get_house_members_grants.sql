-- Diagnostic: the previous REVOKE (20260827120500) targeting
-- get_house_members(uuid) did not close anon access — verified live via
-- curl after the push. This raises a NOTICE listing every function named
-- get_house_members (in case an extra overload exists) and every role that
-- currently holds EXECUTE on each, so the real grant path can be found.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS signature, p.proowner::regrole AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_house_members'
  LOOP
    RAISE NOTICE 'FOUND FUNCTION: % (owner: %)', rec.signature, rec.owner;
    RAISE NOTICE '  anon has EXECUTE: %', has_function_privilege('anon', rec.signature, 'EXECUTE');
    RAISE NOTICE '  authenticated has EXECUTE: %', has_function_privilege('authenticated', rec.signature, 'EXECUTE');
    RAISE NOTICE '  PUBLIC has EXECUTE: %', has_function_privilege('public', rec.signature, 'EXECUTE');
  END LOOP;
END $$;
