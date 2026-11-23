import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Phone, PhoneMissed, FileText } from 'lucide-react-native';
import { format } from 'date-fns';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { CallSession } from '@/types/database';

export default function CallHistory() {
  const params = useLocalSearchParams<{ connectionId?: string }>();
  const connectionId = params.connectionId || '';

  const [calls, setCalls] = useState<CallSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadCalls = useCallback(async () => {
    if (!connectionId) return;
    const { data, error } = await supabase
      .from('call_sessions')
      .select('*')
      .eq('connection_id', connectionId)
      .in('status', ['ended', 'missed', 'declined'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load call history:', error);
      return;
    }
    setCalls(data || []);
  }, [connectionId]);

  useEffect(() => {
    setIsLoading(true);
    loadCalls().finally(() => setIsLoading(false));
  }, [loadCalls]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadCalls();
    setIsRefreshing(false);
  };

  const formatDuration = (call: CallSession) => {
    if (!call.started_at || !call.ended_at) return null;
    const seconds = Math.max(
      0,
      Math.round((new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000)
    );
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call History</Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent_green_bright} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent_green_bright}
              colors={[colors.accent_green_bright]}
            />
          }>
          {calls.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Phone size={48} color={colors.text_muted} style={{ marginBottom: spacing.md }} />
              <Text style={styles.emptyTitle}>No calls yet</Text>
              <Text style={styles.emptySubtitle}>Past calls with this member will show up here.</Text>
            </View>
          ) : (
            calls.map((call) => {
              const duration = formatDuration(call);
              const missed = call.status === 'missed' || call.status === 'declined';
              return (
                <TouchableOpacity
                  key={call.id}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/call-transcript', params: { callId: call.id } })}>
                  <View style={styles.cardIconContainer}>
                    {missed ? (
                      <PhoneMissed size={20} color={colors.danger_red} />
                    ) : (
                      <Phone size={20} color={colors.accent_green_bright} />
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>
                      {missed ? (call.status === 'declined' ? 'Declined' : 'Missed call') : `Call · ${duration || '—'}`}
                    </Text>
                    <Text style={styles.cardDate}>
                      {format(new Date(call.created_at), 'MMM d, yyyy · h:mm a')}
                    </Text>
                  </View>
                  {!missed && <FileText size={18} color={colors.text_muted} />}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg_primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(52,211,153,0.12)',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(52,211,153,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text_primary,
    textAlign: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.text_secondary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.text_muted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_card,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.1)',
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(52,211,153,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text_primary },
  cardDate: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.text_muted, marginTop: 2 },
});
