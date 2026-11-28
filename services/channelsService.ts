import { supabase } from '@/lib/supabase';
import {
  Channel,
  ChannelPost,
  ChannelPostWithAuthor,
  PostAuthor,
} from '@/types/database';

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

export interface ChannelPostInput {
  channel_id: string;
  title: string;
  content: string;
  post_type: string;
  metadata?: Record<string, any>;
}

export const channelsService = {
  async getAllChannels(): Promise<Channel[]> {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching channels:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching channels:', error);
      return [];
    }
  },

  async getChannelBySlug(slug: string): Promise<Channel | null> {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching channel:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching channel:', error);
      return null;
    }
  },

  async getChannelPosts(channelId: string): Promise<ChannelPost[]> {
    try {
      const { data, error } = await supabase
        .from('channel_posts')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching channel posts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching channel posts:', error);
      return [];
    }
  },

  async getChannelPostsWithAuthor(
    channelId: string
  ): Promise<ChannelPostWithAuthor[]> {
    try {
      const posts = await this.getChannelPosts(channelId);
      if (posts.length === 0) return [];

      const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
      const { data: authors } = await supabase
        .from('users_profile')
        .select(AUTHOR_SELECT)
        .in('id', userIds);

      const authorMap = new Map<string, PostAuthor>();
      (authors || []).forEach((a: any) => {
        const mapped = mapAuthor(a);
        if (mapped) authorMap.set(mapped.id, mapped);
      });

      return posts.map((p) => ({ ...p, author: authorMap.get(p.user_id) ?? null }));
    } catch (error) {
      console.error('Error fetching channel posts with author:', error);
      return [];
    }
  },

  async createPost(userId: string, post: ChannelPostInput): Promise<ChannelPost | null> {
    try {
      const { data, error } = await supabase
        .from('channel_posts')
        .insert({
          user_id: userId,
          channel_id: post.channel_id,
          title: post.title,
          content: post.content,
          post_type: post.post_type,
          metadata: post.metadata || {},
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating post:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating post:', error);
      return null;
    }
  },

  async updatePost(
    postId: string,
    updates: Partial<Pick<ChannelPost, 'title' | 'content' | 'status' | 'metadata'>>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('channel_posts')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      if (error) {
        console.error('Error updating post:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating post:', error);
      return false;
    }
  },

  async deletePost(postId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('channel_posts').delete().eq('id', postId);

      if (error) {
        console.error('Error deleting post:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting post:', error);
      return false;
    }
  },

  async getUserPosts(userId: string): Promise<ChannelPost[]> {
    try {
      const { data, error } = await supabase
        .from('channel_posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user posts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching user posts:', error);
      return [];
    }
  },
};
