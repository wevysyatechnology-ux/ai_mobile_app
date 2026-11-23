import { supabase } from '@/lib/supabase';
import { CallSession, CallIceCandidate, RTCSessionDescriptionInitLike } from '@/types/database';
import { sendIncomingCallNotification } from '@/utils/notificationHelpers';
import { ConnectionsService } from '@/services/connectionsService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const TURN_CREDENTIALS_ENDPOINT = `${SUPABASE_URL}/functions/v1/get-turn-credentials`;

export interface IceServersResponse {
  iceServers: RTCIceServer[];
}

async function getMyName(userId: string): Promise<string> {
  const { data } = await supabase
    .from('users_profile')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return data?.full_name || 'A member';
}

export const CallService = {
  /**
   * Fresh STUN+TURN server list for a new RTCPeerConnection. Calls the
   * get-turn-credentials edge function (which keeps the Metered.ca secret
   * key server-side) using the caller's own session — same
   * getSession()-then-fetch pattern already used by
   * utils/notificationHelpers.ts's sendNotification().
   */
  async getIceServers(): Promise<RTCIceServer[]> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(TURN_CREDENTIALS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ICE servers (${response.status})`);
    }

    const data: IceServersResponse = await response.json();
    return data.iceServers;
  },

  /**
   * Creates the call_sessions row and notifies the callee. Does NOT touch
   * RTCPeerConnection at all — the offer_sdp is written by the call screen
   * once its own peer connection has created it, right after this resolves.
   * Keeping peer-connection lifecycle out of this service is deliberate: see
   * app/call.tsx for why it belongs to the component instead.
   */
  async startCall(connectionId: string): Promise<CallSession> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    const connection = await ConnectionsService.getConnectionById(connectionId);
    if (!connection || connection.status !== 'accepted') {
      throw new Error('You can only call a member you are connected with');
    }

    const { data, error } = await supabase
      .from('call_sessions')
      .insert({ connection_id: connectionId, caller_id: myId, callee_id: connection.counterpartId })
      .select()
      .single();

    if (error) throw error;

    const myName = await getMyName(myId);
    sendIncomingCallNotification({
      recipientId: connection.counterpartId,
      callId: data.id,
      connectionId,
      callerName: myName,
      callerId: myId,
    }).catch((err: any) => console.warn('Failed to send incoming_call notification:', err));

    return data;
  },

  async setOffer(callId: string, offer: RTCSessionDescriptionInitLike): Promise<void> {
    const { error } = await supabase.from('call_sessions').update({ offer_sdp: offer }).eq('id', callId);
    if (error) throw error;
  },

  async setAnswer(callId: string, answer: RTCSessionDescriptionInitLike): Promise<void> {
    const { error } = await supabase
      .from('call_sessions')
      .update({ answer_sdp: answer, status: 'active', started_at: new Date().toISOString() })
      .eq('id', callId)
      .eq('status', 'ringing');
    if (error) throw error;
  },

  async declineCall(callId: string): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('call_sessions')
      .update({ status: 'declined', ended_at: new Date().toISOString() })
      .eq('id', callId)
      .eq('callee_id', userData.user.id)
      .eq('status', 'ringing');
    if (error) throw error;
  },

  /**
   * Called by the caller's 45s no-connection timeout. Guards against
   * 'ringing' AND 'active': setAnswer() flips status to 'active' the moment
   * the callee's answer SDP is written, well before the actual ICE/media
   * handshake succeeds (that's tracked only in each screen's local phase
   * state, not the DB row). If the real connection never completes, the DB
   * can already say 'active' even though nothing is actually connected —
   * excluding 'active' here would silently no-op this write (0 rows
   * matched) and the callee's screen would never learn the call failed,
   * leaving it stuck on "Connecting…" forever.
   */
  async markMissed(callId: string): Promise<void> {
    const { error } = await supabase
      .from('call_sessions')
      .update({ status: 'missed', ended_at: new Date().toISOString() })
      .eq('id', callId)
      .in('status', ['ringing', 'active']);
    if (error) throw error;
  },

  /**
   * Ends an active or still-ringing call. The status guard makes a
   * near-simultaneous hangup from both sides a no-op on the second write
   * rather than an error — same idiom as ConnectionsService.
   */
  async endCall(callId: string): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const myId = userData.user.id;

    const { error } = await supabase
      .from('call_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId)
      .or(`caller_id.eq.${myId},callee_id.eq.${myId}`)
      .in('status', ['ringing', 'active']);
    if (error) throw error;
  },

  async getCallById(callId: string): Promise<CallSession | null> {
    const { data, error } = await supabase.from('call_sessions').select('*').eq('id', callId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async sendIceCandidate(callId: string, candidate: Record<string, any>): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('call_ice_candidates')
      .insert({ call_id: callId, sender_id: userData.user.id, candidate });
    if (error) throw error;
  },

  /** Cleanup-safe Realtime pattern, identical shape to ConnectionsService.subscribeToConnection. */
  subscribeToCallSession(callId: string, onUpdate: (row: CallSession) => void): () => void {
    const channel = supabase
      .channel(`call-sessions-${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: `id=eq.${callId}` },
        (payload) => onUpdate(payload.new as CallSession)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /** Cleanup-safe Realtime pattern, identical shape to ChatService.subscribeToMessages. */
  subscribeToIceCandidates(callId: string, onCandidate: (row: CallIceCandidate) => void): () => void {
    const channel = supabase
      .channel(`call-ice-candidates-${callId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_ice_candidates', filter: `call_id=eq.${callId}` },
        (payload) => onCandidate(payload.new as CallIceCandidate)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Global incoming-call feed for a user — powers the always-mounted
   * IncomingCallBanner. Realtime filters only support simple equality, so
   * this can't also filter on status='ringing' server-side; the caller
   * checks that on the delivered row.
   */
  subscribeToIncomingCalls(myUserId: string, onRow: (row: CallSession) => void): () => void {
    const channel = supabase
      .channel(`incoming-calls-${myUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${myUserId}` },
        (payload) => onRow(payload.new as CallSession)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
