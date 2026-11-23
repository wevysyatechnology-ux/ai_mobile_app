import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { ConnectionsService, ConnectionWithCounterpart } from '@/services/connectionsService';

type Tab = 'received' | 'sent';

export default function ConnectRequestsScreen() {
  const [tab, setTab] = useState<Tab>('received');
  const [connections, setConnections] = useState<ConnectionWithCounterpart[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const data = await ConnectionsService.getMyConnectionsWithProfiles();
      setConnections(data);
    } catch (error) {
      console.error('Failed to load connections:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh every time the screen comes back into focus (e.g. after
  // accepting/declining and returning from a chat), not just on mount.
  useFocusEffect(
    useCallback(() => {
      loadConnections();
    }, [loadConnections])
  );

  const receivedConnections = connections.filter((c) => !c.isRequester);
  const sentConnections = connections.filter((c) => c.isRequester);
  const visibleConnections = tab === 'received' ? receivedConnections : sentConnections;

  const handleRespond = async (connectionId: string, accept: boolean) => {
    setRespondingId(connectionId);
    try {
      await ConnectionsService.respondToRequest(connectionId, accept);
      await loadConnections();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not respond to this request.');
    } finally {
      setRespondingId(null);
    }
  };

  const openChat = (connectionId: string) => {
    router.push({ pathname: '/chat-detail', params: { connectionId } });
  };

  const statusChipStyle = (status: string) => {
    if (status === 'accepted') return [styles.chip, styles.chipAccepted];
    if (status === 'declined') return [styles.chip, styles.chipDeclined];
    return [styles.chip, styles.chipPending];
  };

  const statusChipText = (status: string) => {
    if (status === 'accepted') return 'Accepted';
    if (status === 'declined') return 'Declined';
    return 'Pending';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
          Connect Requests
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]}
          onPress={() => setTab('received')}>
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>Received</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'sent' && styles.tabBtnActive]}
          onPress={() => setTab('sent')}>
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>Sent</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.accent_green_bright} style={styles.loader} />
      ) : visibleConnections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {tab === 'received' ? 'No connection requests yet' : "You haven't sent any requests yet"}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visibleConnections.map((c) => (
            <View key={c.id} style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.cardRow}
                activeOpacity={c.status === 'accepted' ? 0.7 : 1}
                onPress={() => c.status === 'accepted' && openChat(c.id)}>
                {c.counterpart?.profile_photo ? (
                  <Image source={{ uri: c.counterpart.profile_photo }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <UserIcon size={22} color={colors.text_secondary} />
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.name}>{c.counterpart?.full_name || 'Member'}</Text>
                  <Text style={styles.subText}>
                    {c.counterpart?.business_category || 'Business'}
                    {c.counterpart?.city ? ` · ${c.counterpart.city}` : ''}
                  </Text>
                </View>
                <View style={statusChipStyle(c.status) as any}>
                  <Text style={styles.chipText}>{statusChipText(c.status)}</Text>
                </View>
              </TouchableOpacity>

              {tab === 'received' && c.status === 'pending' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.declineButton}
                    disabled={respondingId === c.id}
                    onPress={() => handleRespond(c.id, false)}>
                    {respondingId === c.id ? (
                      <ActivityIndicator size="small" color={colors.text_secondary} />
                    ) : (
                      <Text style={styles.declineButtonText}>Decline</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    disabled={respondingId === c.id}
                    onPress={() => handleRespond(c.id, true)}>
                    {respondingId === c.id ? (
                      <ActivityIndicator size="small" color={colors.bg_primary} />
                    ) : (
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {c.status === 'accepted' && (
                <TouchableOpacity style={styles.chatButton} onPress={() => openChat(c.id)}>
                  <Text style={styles.chatButtonText}>Open Chat</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg_secondary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.text_primary,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.bg_card,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabBtnActive: {
    backgroundColor: colors.accent_green_bright,
    borderColor: colors.accent_green_bright,
  },
  tabText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.text_secondary,
  },
  tabTextActive: {
    color: colors.bg_primary,
  },
  loader: {
    marginTop: spacing.xxl,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_secondary,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.bg_card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg_secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  name: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    color: colors.text_primary,
    marginBottom: 2,
  },
  subText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.text_secondary,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipPending: {
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
  },
  chipAccepted: {
    backgroundColor: colors.accent_green_bright + '20',
  },
  chipDeclined: {
    backgroundColor: colors.bg_secondary,
  },
  chipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: colors.text_primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  declineButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  declineButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: colors.text_secondary,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.accent_green_bright,
  },
  acceptButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: colors.bg_primary,
  },
  chatButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.accent_green_bright,
  },
  chatButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: colors.bg_primary,
  },
});
