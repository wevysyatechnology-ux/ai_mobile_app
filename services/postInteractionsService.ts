import { supabase } from '@/lib/supabase';
import {
  ChannelPostComment,
  PostAuthor,
  ReactionSummary,
} from '@/types/database';

export const REACTION_EMOJIS = ['❤️', '👍', '🎉', '💡', '🤝'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

const AUTHOR_SELECT =
  'id, full_name, avatar_url, membership_code, city, state, business_category';

function mapAuthor(row: any): PostAuthor | null {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name ?? null,
    avatar_url: row.avatar_url ?? null,
    membership_code: row.membership_code ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    business_category: row.business_category ?? null,
  };
}

export const postInteractionsService = {
  async getReactionSummary(
    postId: string,
    currentUserId: string | null
  ): Promise<ReactionSummary[]> {
    try {
      const { data, error } = await supabase
        .from('channel_post_reactions')
        .select('emoji, user_id')
        .eq('post_id', postId);

      if (error) {
        console.error('Error fetching reactions:', error);
        return [];
      }

      const counts = new Map<string, { count: number; reactedByMe: boolean }>();
      (data || []).forEach((row: any) => {
        const existing = counts.get(row.emoji) ?? { count: 0, reactedByMe: false };
        existing.count += 1;
        if (currentUserId && row.user_id === currentUserId) {
          existing.reactedByMe = true;
        }
        counts.set(row.emoji, existing);
      });

      return Array.from(counts.entries()).map(([emoji, v]) => ({
        emoji,
        count: v.count,
        reacted_by_me: v.reactedByMe,
      }));
    } catch (error) {
      console.error('Error fetching reactions:', error);
      return [];
    }
  },

  async toggleReaction(
    postId: string,
    userId: string,
    emoji: string
  ): Promise<boolean> {
    try {
      const { data: existing } = await supabase
        .from('channel_post_reactions')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('channel_post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId)
          .eq('emoji', emoji);
        if (error) throw error;
        return false;
      }

      const { error } = await supabase
        .from('channel_post_reactions')
        .insert({ post_id: postId, user_id: userId, emoji });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error toggling reaction:', error);
      return false;
    }
  },

  async getComments(postId: string): Promise<ChannelPostComment[]> {
    try {
      const { data: raw, error } = await supabase
        .from('channel_post_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching comments:', error);
        return [];
      }
      if (!raw || raw.length === 0) return [];

      const userIds = Array.from(new Set(raw.map((c: any) => c.user_id)));
      const { data: authors } = await supabase
        .from('users_profile')
        .select(AUTHOR_SELECT)
        .in('id', userIds);

      const authorMap = new Map<string, PostAuthor>();
      (authors || []).forEach((a: any) => {
        const m = mapAuthor(a);
        if (m) authorMap.set(m.id, m);
      });

      return raw.map((c: any) => ({ ...c, author: authorMap.get(c.user_id) ?? null }));
    } catch (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
  },

  async addComment(
    postId: string,
    userId: string,
    content: string
  ): Promise<ChannelPostComment | null> {
    try {
      const trimmed = content.trim();
      if (!trimmed) return null;

      const { data, error } = await supabase
        .from('channel_post_comments')
        .insert({ post_id: postId, user_id: userId, content: trimmed })
        .select('*')
        .single();

      if (error || !data) {
        console.error('Error adding comment:', error);
        return null;
      }

      const { data: authorRow } = await supabase
        .from('users_profile')
        .select(AUTHOR_SELECT)
        .eq('id', userId)
        .maybeSingle();

      return { ...(data as any), author: mapAuthor(authorRow) };
    } catch (error) {
      console.error('Error adding comment:', error);
      return null;
    }
  },

  async deleteComment(commentId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('channel_post_comments')
        .delete()
        .eq('id', commentId);
      if (error) {
        console.error('Error deleting comment:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      return false;
    }
  },
};
