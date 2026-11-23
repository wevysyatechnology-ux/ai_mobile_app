-- "Connect" requests between any two members, reachable from Discover.
-- House-agnostic by design (Discover itself is already cross-house).
CREATE TABLE IF NOT EXISTS public.core_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    requester_contact_consent BOOLEAN NOT NULL DEFAULT false,
    recipient_contact_consent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT core_connections_no_self CHECK (requester_id <> recipient_id)
);

-- Prevent duplicate requests in either direction between the same pair.
-- A generated, order-independent pair key + unique index is simpler and more
-- atomic than a trigger (a CHECK constraint alone can't see sibling rows).
-- Note: this also means a declined connection permanently occupies the pair
-- (no re-request) — a deliberate simplification; nothing in the spec asks
-- for resend-after-decline.
ALTER TABLE public.core_connections ADD COLUMN IF NOT EXISTS pair_key UUID[] GENERATED ALWAYS AS
    (ARRAY[LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id)]) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS core_connections_unique_pair ON public.core_connections(pair_key);
CREATE INDEX IF NOT EXISTS idx_core_connections_requester ON public.core_connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_core_connections_recipient ON public.core_connections(recipient_id);

ALTER TABLE public.core_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their connections" ON public.core_connections;
CREATE POLICY "Participants can view their connections"
    ON public.core_connections FOR SELECT TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send a connection request" ON public.core_connections;
CREATE POLICY "Users can send a connection request"
    ON public.core_connections FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = requester_id);

-- Permissive at the RLS layer (either participant may update any column);
-- services/connectionsService.ts enforces the finer-grained business rules
-- (only the recipient flips status from pending, only your own consent
-- column) on top of this, matching how other tables in this codebase push
-- nuanced rules into the service layer rather than fully into RLS.
DROP POLICY IF EXISTS "Participants can update their connection" ON public.core_connections;
CREATE POLICY "Participants can update their connection"
    ON public.core_connections FOR UPDATE TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = recipient_id)
    WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);

GRANT SELECT, INSERT, UPDATE ON public.core_connections TO authenticated;

CREATE OR REPLACE FUNCTION public.set_core_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_core_connections_updated_at ON public.core_connections;
CREATE TRIGGER trg_core_connections_updated_at
    BEFORE UPDATE ON public.core_connections
    FOR EACH ROW EXECUTE FUNCTION public.set_core_connections_updated_at();
