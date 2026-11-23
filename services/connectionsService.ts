import { supabase } from '@/lib/supabase';
import { CoreConnection } from '@/types/database';
import {
  sendConnectRequestNotification,
  sendConnectAcceptedNotification,
  sendConnectDeclinedNotification,
} from '@/utils/notificationHelpers';

export interface ConnectionSummary extends CoreConnection {
  isRequester: boolean;
  counterpartId: string;
}

export interface CounterpartProfile {
  counterpart_id: string;
  full_name: string | null;
  business_category: string | null;
  city: string | null;
  profile_photo: string | null;
}

export interface ConnectionWithCounterpart extends ConnectionSummary {
  counterpart: CounterpartProfile | null;
}

const UNIQUE_VIOLATION = '23505';

async function getMyName(userId: string): Promise<string> {
  const { data } = await supabase
    .from('users_profile')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return data?.full_name || 'A member';
}

export const ConnectionsService = {
  /**
   * Sends a Connect request. Relies on the DB's unique pair-key index
   * (core_connections_unique_pair) to reject a duplicate rather than doing a
   * read-then-decide round trip first — avoids a race between two
   * simultaneous requests. A duplicate insert is treated as "already
   * connected" and resolved by fetching the existing row instead of erroring.
   */
  async sendConnectRequest(recipientId: string): Promise<ConnectionSummary> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    if (myId === recipientId) throw new Error('You cannot connect with yourself');

    const { data, error } = await supabase
      .from('core_connections')
      .insert({ requester_id: myId, recipient_id: recipientId })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const existing = await this.getConnectionWith(recipientId);
        if (existing) return existing;
      }
      throw error;
    }

    const myName = await getMyName(myId);
    sendConnectRequestNotification({
      recipientId,
      connectionId: data.id,
      requesterName: myName,
      requesterId: myId,
    }).catch((err) => console.warn('Failed to send connect_request notification:', err));

    return { ...data, isRequester: true, counterpartId: recipientId };
  },

  /**
   * Only the recipient of a pending request may accept/decline it — enforced
   * here on top of the DB's more permissive RLS (either participant can
   * update the row), matching how nuanced business rules already live in
   * this codebase's service layer rather than fully in RLS.
   */
  async respondToRequest(connectionId: string, accept: boolean): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    const { data, error } = await supabase
      .from('core_connections')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', connectionId)
      .eq('recipient_id', myId)
      .eq('status', 'pending')
      .select('requester_id')
      .single();

    if (error) throw error;

    const myName = await getMyName(myId);
    const notify = accept ? sendConnectAcceptedNotification : sendConnectDeclinedNotification;
    (notify as any)({
      recipientId: data.requester_id,
      connectionId,
      ...(accept ? { accepterName: myName, accepterId: myId } : { declinerName: myName }),
    }).catch((err: any) => console.warn('Failed to send connect response notification:', err));
  },

  async getMyConnections(): Promise<ConnectionSummary[]> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    const { data, error } = await supabase
      .from('core_connections')
      .select('*')
      .or(`requester_id.eq.${myId},recipient_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: CoreConnection) => ({
      ...row,
      isRequester: row.requester_id === myId,
      counterpartId: row.requester_id === myId ? row.recipient_id : row.requester_id,
    }));
  },

  async getConnectionWith(memberId: string): Promise<ConnectionSummary | null> {
    const connections = await this.getMyConnections();
    return connections.find((c) => c.counterpartId === memberId) || null;
  },

  async getConnectionById(connectionId: string): Promise<ConnectionSummary | null> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    const { data, error } = await supabase
      .from('core_connections')
      .select('*')
      .eq('id', connectionId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      isRequester: data.requester_id === myId,
      counterpartId: data.requester_id === myId ? data.recipient_id : data.requester_id,
    };
  },

  /**
   * Updates only the caller's own consent column — the recipient/requester
   * side is determined server-side by matching auth.uid() against both
   * possible columns in one statement, so a caller can never accidentally
   * (or maliciously) flip the counterpart's consent instead of their own.
   */
  async setContactConsent(connectionId: string, consent: boolean): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    const { error: requesterError } = await supabase
      .from('core_connections')
      .update({ requester_contact_consent: consent })
      .eq('id', connectionId)
      .eq('requester_id', myId);
    if (requesterError) throw requesterError;

    const { error: recipientError } = await supabase
      .from('core_connections')
      .update({ recipient_contact_consent: consent })
      .eq('id', connectionId)
      .eq('recipient_id', myId);
    if (recipientError) throw recipientError;
  },

  async getContactInfo(connectionId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_connection_contact_info', {
      p_connection_id: connectionId,
    });
    if (error) throw error;
    return data && data.length > 0 ? data[0].phone_number : null;
  },

  /**
   * Counterpart name/business/city/photo for one or more connections, keyed
   * by connection_id. Goes through get_connection_counterpart_profiles()
   * because a connection can be with any member (not just someone in the
   * caller's own house), and users_profile RLS blocks a plain client query
   * for another user's row.
   */
  async getCounterpartProfiles(connectionIds: string[]): Promise<Record<string, CounterpartProfile>> {
    if (connectionIds.length === 0) return {};

    const { data, error } = await supabase.rpc('get_connection_counterpart_profiles', {
      p_connection_ids: connectionIds,
    });
    if (error) throw error;

    const byConnectionId: Record<string, CounterpartProfile> = {};
    for (const row of data || []) {
      byConnectionId[row.connection_id] = {
        counterpart_id: row.counterpart_id,
        full_name: row.full_name,
        business_category: row.business_category,
        city: row.city,
        profile_photo: row.profile_photo,
      };
    }
    return byConnectionId;
  },

  async getMyConnectionsWithProfiles(): Promise<ConnectionWithCounterpart[]> {
    const connections = await this.getMyConnections();
    const profiles = await this.getCounterpartProfiles(connections.map((c) => c.id));
    return connections.map((c) => ({ ...c, counterpart: profiles[c.id] || null }));
  },

  /**
   * Live status/consent updates for one connection (e.g. the other person
   * flipping their contact-consent toggle) — same cleanup-safe Realtime
   * pattern as chatService.subscribeToMessages / app/channel-detail.tsx.
   */
  subscribeToConnection(connectionId: string, onUpdate: (row: CoreConnection) => void): () => void {
    const channel = supabase
      .channel(`core-connections-${connectionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'core_connections', filter: `id=eq.${connectionId}` },
        (payload) => onUpdate(payload.new as CoreConnection)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
