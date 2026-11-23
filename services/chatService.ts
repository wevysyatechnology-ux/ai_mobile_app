import { supabase } from '@/lib/supabase';
import { ChatMessage } from '@/types/database';
import { sendNewMessageNotification } from '@/utils/notificationHelpers';

export const ChatService = {
  async getMessages(connectionId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * recipientId/senderName are passed in by the caller (chat-detail.tsx
   * already has both loaded from the connection/profile) rather than looked
   * up here, keeping this a plain insert + notify with no extra queries.
   */
  async sendMessage(
    connectionId: string,
    body: string,
    recipientId: string,
    senderName: string
  ): Promise<ChatMessage> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error('Message cannot be empty');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ connection_id: connectionId, sender_id: userData.user.id, body: trimmed })
      .select()
      .single();

    if (error) throw error;

    // Best-effort — a failed push shouldn't fail the send.
    sendNewMessageNotification({
      recipientId,
      connectionId,
      senderName,
      senderId: userData.user.id,
      preview: trimmed,
    }).catch((err) => console.warn('Failed to send new_message notification:', err));

    return data;
  },

  /**
   * Live message delivery via Supabase Realtime. Mirrors the cleanup-safe
   * subscribe pattern in app/channel-detail.tsx (return an unsubscribe
   * function and call supabase.removeChannel) — NOT the leaky pattern in
   * components/shared/NotificationBell.tsx, which never captures/returns
   * its cleanup closure and never actually unsubscribes.
   */
  subscribeToMessages(connectionId: string, onMessage: (message: ChatMessage) => void): () => void {
    const channel = supabase
      .channel(`chat-messages-${connectionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `connection_id=eq.${connectionId}` },
        (payload) => onMessage(payload.new as ChatMessage)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
