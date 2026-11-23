-- Live message delivery in chat-detail.tsx, and live status/consent updates
-- on the connect-requests inbox and chat screen — same one-line pattern as
-- 20260302000000_enable_realtime_notifications.sql.
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.core_connections;
