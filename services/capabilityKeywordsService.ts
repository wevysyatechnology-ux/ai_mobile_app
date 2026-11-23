import { supabase } from '@/lib/supabase';

export interface CapabilityKeyword {
  id: string;
  member_id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const MAX_ACTIVE_KEYWORDS = 6;

/**
 * "What I Can Help With" capability keywords, backed by
 * member_capability_keywords (RLS-scoped to the caller's own rows — no RPC
 * needed for reading/writing your own keywords). The 6-active-keyword cap is
 * enforced server-side by a DB trigger
 * (supabase/migrations/20260827120100_create_member_capability_keywords.sql);
 * this service just surfaces that error in a friendly way.
 */
export const CapabilityKeywordsService = {
  MAX_ACTIVE_KEYWORDS,

  async getMyKeywords(): Promise<CapabilityKeyword[]> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('member_capability_keywords')
      .select('*')
      .eq('member_id', userData.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addKeyword(keyword: string): Promise<CapabilityKeyword> {
    const trimmed = keyword.trim();
    if (!trimmed) throw new Error('Keyword cannot be empty');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('member_capability_keywords')
      .insert({ member_id: userData.user.id, keyword: trimmed })
      .select()
      .single();

    if (error) {
      if (error.message?.includes('6 active capability keywords')) {
        throw new Error(`You've reached the limit of ${MAX_ACTIVE_KEYWORDS} keywords. Remove one to add another.`);
      }
      throw error;
    }
    return data;
  },

  async deactivateKeyword(id: string): Promise<void> {
    const { error } = await supabase
      .from('member_capability_keywords')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
  },
};
