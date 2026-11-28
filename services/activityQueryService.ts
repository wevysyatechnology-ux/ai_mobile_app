/**
 * 🔍 Activity Query Service — READ-ONLY
 *
 * Fetches summary statistics for the current user's Links, Deals, and i2We records.
 * Used exclusively by Voice Assistant. No write operations are performed here.
 */
import { supabase } from '@/lib/supabase';

export interface ActivityStats {
  links: {
    total: number;
    sent: number;
    received: number;
    open: number;
    closed: number;
  };
  deals: {
    total: number;
    open: number;
    in_progress: number;
    completed: number;
    closed: number;
    as_creator: number;
    as_participant: number;
  };
  i2We: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
  };
}

const ActivityQueryService = {
  /** Fetch link stats for the current user */
  async getLinkStats(): Promise<ActivityStats['links']> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const uid = userData.user.id;

    const { data, error } = await supabase
      .from('core_links')
      .select('status, from_user_id, to_user_id')
      .or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`);

    if (error) throw error;
    const rows = data || [];

    return {
      total: rows.length,
      sent: rows.filter(r => r.from_user_id === uid).length,
      received: rows.filter(r => r.to_user_id === uid).length,
      open: rows.filter(r => r.status === 'open').length,
      closed: rows.filter(r => r.status === 'closed').length,
    };
  },

  /** Fetch deal stats for the current user */
  async getDealStats(): Promise<ActivityStats['deals']> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const uid = userData.user.id;

    // Deals where user is creator, from_member, or to_member
    const { data: ownDeals, error: ownError } = await supabase
      .from('core_deals')
      .select('id, status, creator_id')
      .or(`creator_id.eq.${uid},from_member_id.eq.${uid},to_member_id.eq.${uid}`);

    if (ownError) throw ownError;

    // Deals where user is a participant
    const { data: partDeals, error: partError } = await supabase
      .from('deal_participants')
      .select('deal_id')
      .eq('user_id', uid);

    // Merge unique deal ids
    const ownIds = new Set((ownDeals || []).map(d => d.id));
    const partCount = (partDeals || []).filter(p => !ownIds.has(p.deal_id)).length;
    const rows = ownDeals || [];

    return {
      total: rows.length + partCount,
      open: rows.filter(r => r.status === 'open').length,
      in_progress: rows.filter(r => r.status === 'in_progress').length,
      completed: rows.filter(r => r.status === 'completed').length,
      closed: rows.filter(r => r.status === 'closed').length,
      as_creator: rows.filter(r => r.creator_id === uid).length,
      as_participant: partCount,
    };
  },

  /** Fetch i2We meeting stats for the current user */
  async getI2weStats(): Promise<ActivityStats['i2We']> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const uid = userData.user.id;

    const { data, error } = await supabase
      .from('core_i2we')
      .select('status')
      .or(`member_1_id.eq.${uid},member_2_id.eq.${uid}`);

    if (error) throw error;
    const rows = data || [];

    return {
      total: rows.length,
      scheduled: rows.filter(r => r.status === 'scheduled').length,
      completed: rows.filter(r => r.status === 'completed').length,
      cancelled: rows.filter(r => r.status === 'cancelled').length,
    };
  },

  /** Fetch all stats in parallel */
  async getAllStats(): Promise<ActivityStats> {
    const [links, deals, i2We] = await Promise.all([
      this.getLinkStats(),
      this.getDealStats(),
      this.getI2weStats(),
    ]);
    return { links, deals, i2We };
  },
};

export default ActivityQueryService;
