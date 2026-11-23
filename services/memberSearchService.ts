import { supabase } from '@/lib/supabase';

export interface MemberSearchFilters {
  profession?: string;
  location?: string;
  /** Free-text search across name/category/city/capability-keywords (OR'd) — used by the search bar UI. */
  query?: string;
  /** Explicit capability-keyword filter (e.g. "Wedding") — used by AI-extracted structured search. */
  keyword?: string;
}

export interface MemberSearchResult {
  id: string;
  full_name: string;
  business_category: string | null;
  city: string | null;
  phone_number: string | null;
  profile_photo: string | null;
  /** Capability keyword(s) that matched this member's search, if any. */
  matched_keywords?: string[] | null;
}

/**
 * Search members by profession/business category, city, and/or capability
 * keywords ("What I Can Help With").
 *
 * Calls the search_eligible_members() RPC (SECURITY DEFINER — see
 * supabase/migrations/20260827120200_create_search_eligible_members_rpc.sql)
 * rather than querying users_profile directly. That RPC mirrors
 * get_house_members()'s eligibility filter (approval_status, membership_status,
 * is_suspended, mobile_app_access), so search results only ever include
 * eligible members — the previous raw table query applied none of that
 * filtering and could surface suspended/expired/unapproved members.
 *
 * Shared by the voice engine (actionEngine.searchMembers) and the
 * Discover screen's search UI so both stay in sync.
 */
export async function searchMembers(
  filters: MemberSearchFilters,
  limit: number = 20
): Promise<MemberSearchResult[]> {
  const { data, error } = await supabase.rpc('search_eligible_members', {
    p_query: filters.query ?? null,
    p_profession: filters.profession ?? null,
    p_location: filters.location ?? null,
    p_keyword: filters.keyword ?? null,
    p_limit: limit,
  });

  if (error) throw error;
  return data || [];
}
