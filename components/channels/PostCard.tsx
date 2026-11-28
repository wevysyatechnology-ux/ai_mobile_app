import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { MessageCircle, Trash2 } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '@/constants/theme';
import type {
  ChannelPostComment,
  ChannelPostWithAuthor,
  PostAuthor,
  ReactionSummary,
} from '@/types/database';
import {
  postInteractionsService,
  REACTION_EMOJIS,
} from '@/services/postInteractionsService';

interface Props {
  post: ChannelPostWithAuthor;
  currentUserId: string | null;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function AuthorRow({ author }: { author: PostAuthor | null }) {
  const name = author?.full_name ?? 'Member';
  const location = [author?.city, author?.state].filter(Boolean).join(', ');
  const meta = [author?.membership_code, author?.business_category]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={styles.authorRow}>
      {author?.avatar_url ? (
        <Image source={{ uri: author.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initials(name)}</Text>
        </View>
      )}
      <View style={styles.authorInfo}>
        <Text style={styles.authorName} numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.authorMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {location ? (
          <Text style={styles.authorLocation} numberOfLines={1}>
            {location}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function PostCard({ post, currentUserId }: Props) {
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);
  const [comments, setComments] = useState<ChannelPostComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    let cancelled = false;
    postInteractionsService
      .getReactionSummary(post.id, currentUserId)
      .then((r) => {
        if (!cancelled) setReactions(r);
      });
    return () => {
      cancelled = true;
    };
  }, [post.id, currentUserId]);

  const loadComments = async () => {
    const data = await postInteractionsService.getComments(post.id);
    setComments(data);
    setCommentsLoaded(true);
  };

  const toggleShowComments = () => {
    const next = !showComments;
    setShowComments(next);
    if (next && !commentsLoaded) {
      loadComments();
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!currentUserId || reactionBusy) return;
    setReactionBusy(emoji);
    const added = await postInteractionsService.toggleReaction(
      post.id,
      currentUserId,
      emoji
    );
    setReactions((prev) => {
      const next = [...prev];
      const idx = next.findIndex((r) => r.emoji === emoji);
      if (idx >= 0) {
        const current = next[idx];
        const newCount = added ? current.count + 1 : current.count - 1;
        if (newCount <= 0) {
          next.splice(idx, 1);
        } else {
          next[idx] = { ...current, count: newCount, reacted_by_me: added };
        }
      } else if (added) {
        next.push({ emoji, count: 1, reacted_by_me: true });
      }
      return next;
    });
    setReactionBusy(null);
  };

  const submitComment = async () => {
    if (!currentUserId || !commentInput.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    const created = await postInteractionsService.addComment(
      post.id,
      currentUserId,
      commentInput
    );
    if (created) {
      setComments((prev) => [...prev, created]);
      setCommentInput('');
    }
    setCommentSubmitting(false);
  };

  const deleteComment = async (commentId: string) => {
    const ok = await postInteractionsService.deleteComment(commentId);
    if (ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  const reactionLookup = new Map(reactions.map((r) => [r.emoji, r]));
  const commentCount = commentsLoaded ? comments.length : null;

  return (
    <View style={styles.card}>
      <AuthorRow author={post.author} />
      <Text style={styles.title}>{post.title}</Text>
      {post.content ? <Text style={styles.content}>{post.content}</Text> : null}
      <Text style={styles.date}>{new Date(post.created_at).toLocaleDateString()}</Text>

      <View style={styles.reactionRow}>
        {REACTION_EMOJIS.map((emoji) => {
          const summary = reactionLookup.get(emoji);
          const active = summary?.reacted_by_me ?? false;
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionChip, active && styles.reactionChipActive]}
              onPress={() => handleReaction(emoji)}
              disabled={!currentUserId}
              activeOpacity={0.7}>
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {summary?.count ? (
                <Text style={[styles.reactionCount, active && styles.reactionCountActive]}>
                  {summary.count}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.commentToggle}
          onPress={toggleShowComments}
          activeOpacity={0.7}>
          <MessageCircle size={16} color={COLORS.textSecondary} />
          <Text style={styles.commentToggleText}>
            {commentCount === null ? 'Comments' : `${commentCount}`}
          </Text>
        </TouchableOpacity>
      </View>

      {showComments ? (
        <View style={styles.commentsBlock}>
          {!commentsLoaded ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : comments.length === 0 ? (
            <Text style={styles.noCommentsText}>No comments yet. Be the first.</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentItem}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor} numberOfLines={1}>
                    {c.author?.full_name ?? 'Member'}
                  </Text>
                  <Text style={styles.commentDate}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.commentBody}>{c.content}</Text>
                {c.user_id === currentUserId ? (
                  <TouchableOpacity
                    style={styles.commentDelete}
                    onPress={() => deleteComment(c.id)}>
                    <Trash2 size={14} color={COLORS.textTertiary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}

          {currentUserId ? (
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment…"
                placeholderTextColor={COLORS.textTertiary}
                value={commentInput}
                onChangeText={setCommentInput}
                multiline
                editable={!commentSubmitting}
              />
              <TouchableOpacity
                style={[
                  styles.commentSubmit,
                  (!commentInput.trim() || commentSubmitting) && styles.commentSubmitDisabled,
                ]}
                onPress={submitComment}
                disabled={!commentInput.trim() || commentSubmitting}>
                <Text style={styles.commentSubmitText}>
                  {commentSubmitting ? '…' : 'Post'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: SPACING.sm,
  },
  avatarFallback: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: COLORS.onPrimary,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
  },
  authorMeta: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.sizes.xs,
    marginTop: 2,
  },
  authorLocation: {
    color: COLORS.textTertiary,
    fontSize: TYPOGRAPHY.sizes.xs,
    marginTop: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sizes.md,
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  content: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.sm,
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  date: {
    color: COLORS.textTertiary,
    fontSize: TYPOGRAPHY.sizes.xs,
    marginTop: SPACING.sm,
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionCount: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.xs,
    marginLeft: 4,
    fontWeight: '600',
  },
  reactionCountActive: {
    color: COLORS.primary,
  },
  commentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 4,
  },
  commentToggleText: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.xs,
    marginLeft: 4,
    fontWeight: '600',
  },
  commentsBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  noCommentsText: {
    color: COLORS.textTertiary,
    fontSize: TYPOGRAPHY.sizes.sm,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
  },
  commentItem: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    position: 'relative',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  commentAuthor: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
    flex: 1,
  },
  commentDate: {
    color: COLORS.textTertiary,
    fontSize: TYPOGRAPHY.sizes.xs,
    marginLeft: SPACING.sm,
  },
  commentBody: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.sm,
    lineHeight: 20,
  },
  commentDelete: {
    position: 'absolute',
    right: 0,
    bottom: SPACING.xs,
    padding: 4,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  commentInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    maxHeight: 120,
    fontSize: TYPOGRAPHY.sizes.sm,
  },
  commentSubmit: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
  },
  commentSubmitDisabled: {
    opacity: 0.4,
  },
  commentSubmitText: {
    color: COLORS.onPrimary,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
  },
});
