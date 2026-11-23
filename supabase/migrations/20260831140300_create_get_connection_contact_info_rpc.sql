-- Reveals the counterpart's phone number ONLY once both parties on a
-- connection have consented to contact exchange. Same SECURITY DEFINER
-- shape as search_eligible_members. Returns zero rows (never a null-but-
-- present row) for "not found", "not a participant", or "not yet mutual" —
-- callers treat all three identically, so there's no way to leak which case
-- occurred.
CREATE OR REPLACE FUNCTION public.get_connection_contact_info(p_connection_id UUID)
RETURNS TABLE (phone_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id UUID;
  v_recipient_id UUID;
  v_requester_consent BOOLEAN;
  v_recipient_consent BOOLEAN;
  v_caller UUID := auth.uid();
  v_counterpart UUID;
BEGIN
  SELECT c.requester_id, c.recipient_id, c.requester_contact_consent, c.recipient_contact_consent
  INTO v_requester_id, v_recipient_id, v_requester_consent, v_recipient_consent
  FROM public.core_connections c
  WHERE c.id = p_connection_id
    AND (c.requester_id = v_caller OR c.recipient_id = v_caller);

  IF v_requester_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (v_requester_consent AND v_recipient_consent) THEN
    RETURN;
  END IF;

  v_counterpart := CASE WHEN v_caller = v_requester_id THEN v_recipient_id ELSE v_requester_id END;

  RETURN QUERY
  SELECT up.phone_number FROM public.users_profile up WHERE up.id = v_counterpart;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_connection_contact_info(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_connection_contact_info(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_connection_contact_info(UUID) TO authenticated;
