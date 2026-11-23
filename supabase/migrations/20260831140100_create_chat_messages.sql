-- 1:1 chat messages, gated on an accepted core_connections row.
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.core_connections(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_connection_id ON public.chat_messages(connection_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Subquery-in-policy rather than a SECURITY DEFINER gate: the caller already
-- has SELECT rights on their own core_connections rows, so this is a single
-- indexed EXISTS lookup, not a cross-table eligibility computation like
-- get_house_members/search_eligible_members (which need SECURITY DEFINER
-- specifically to read rows the caller can't see directly).
DROP POLICY IF EXISTS "Participants of an accepted connection can read messages" ON public.chat_messages;
CREATE POLICY "Participants of an accepted connection can read messages"
    ON public.chat_messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.core_connections c
            WHERE c.id = chat_messages.connection_id
              AND c.status = 'accepted'
              AND (auth.uid() = c.requester_id OR auth.uid() = c.recipient_id)
        )
    );

DROP POLICY IF EXISTS "Participants of an accepted connection can send messages" ON public.chat_messages;
CREATE POLICY "Participants of an accepted connection can send messages"
    ON public.chat_messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.core_connections c
            WHERE c.id = chat_messages.connection_id
              AND c.status = 'accepted'
              AND (auth.uid() = c.requester_id OR auth.uid() = c.recipient_id)
        )
    );

-- Allows either participant to set read_at on messages in their own accepted
-- connection (e.g. marking the other person's messages as read).
DROP POLICY IF EXISTS "Participants of an accepted connection can update read_at" ON public.chat_messages;
CREATE POLICY "Participants of an accepted connection can update read_at"
    ON public.chat_messages FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.core_connections c
            WHERE c.id = chat_messages.connection_id
              AND c.status = 'accepted'
              AND (auth.uid() = c.requester_id OR auth.uid() = c.recipient_id)
        )
    )
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
