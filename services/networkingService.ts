import { supabase } from '@/lib/supabase';

export interface NetworkingSuggestion {
  id: string;
  full_name: string;
  business_category: string | null;
  city: string | null;
  phone_number: string | null;
  profile_photo: string | null;
  reason: string;
}

/**
 * v1 rule-based networking suggestions: same house, complementary business
 * category (i.e. not the same profession — different professions are more
 * useful referral partners), and not already linked to the current user.
 */
export async function getSuggestedConnections(limit: number = 10): Promise<NetworkingSuggestion[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myProfile } = await supabase
    .from('users_profile')
    .select('house_id, business_category')
    .eq('id', user.id)
    .single();

  if (!myProfile) return [];

  // Already-linked user ids (either direction) — never suggest an existing connection.
  const { data: links } = await supabase
    .from('core_links')
    .select('from_user_id, to_user_id')
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);

  const excludedIds = new Set<string>([user.id]);
  (links || []).forEach((link) => {
    excludedIds.add(link.from_user_id === user.id ? link.to_user_id : link.from_user_id);
  });

  let query = supabase
    .from('users_profile')
    .select('id, full_name, business_category, city, phone_number, profile_photo')
    .neq('id', user.id)
    .limit(limit * 3); // overfetch so filtering below still leaves enough results

  if (myProfile.house_id) {
    query = query.eq('house_id', myProfile.house_id);
  }

  const { data: candidates, error } = await query;
  if (error) throw error;

  return (candidates || [])
    .filter((c) => !excludedIds.has(c.id))
    .filter((c) => !myProfile.business_category || c.business_category !== myProfile.business_category)
    .slice(0, limit)
    .map((c) => ({
      ...c,
      reason: myProfile.house_id
        ? 'Same house, complementary profession'
        : 'Complementary profession',
    }));
}
