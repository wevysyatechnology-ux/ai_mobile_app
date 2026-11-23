import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { format } from 'date-fns';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ConnectionsService } from '@/services/connectionsService';
import { CallSession, CallTranscript } from '@/types/database';

interface TranscriptRow extends CallTranscript {
  speakerName: string;
}

export default function CallTranscriptScreen() {
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ callId?: string }>();
  const callId = params.callId || '';

  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!callId) {
      setIsLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: call, error: callError } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('id', callId)
          .maybeSingle<CallSession>();
        if (callError) throw callError;
        if (!call) {
          if (!cancelled) setNotFound(true);
          return;
        }

        const [{ data: transcripts, error: transcriptError }, counterpartProfiles] = await Promise.all([
          supabase
            .from('call_transcripts')
            .select('*')
            .eq('call_id', callId)
            .order('created_at', { ascending: true }),
          ConnectionsService.getCounterpartProfiles([call.connection_id]),
        ]);
        if (transcriptError) throw transcriptError;
        if (cancelled) return;

        const counterpartName = counterpartProfiles[call.connection_id]?.full_name || 'Member';
        const myName = profile?.full_name || 'You';

        const merged: TranscriptRow[] = (transcripts || []).map((t: CallTranscript) => ({
          ...t,
          speakerName: t.speaker_id === profile?.id ? myName : counterpartName,
        }));
        setRows(merged);
      } catch (err) {
        console.error('Failed to load call transcript:', err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callId, profile?.id, profile?.full_name]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call Transcript</Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent_green_bright} />
        </View>
      ) : notFound ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This call could not be found.</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            No transcript is available for this call — it may have been too short, or transcription
            didn't complete on either device.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {rows.map((row) => (
            <View key={row.id} style={styles.segment}>
              <View style={styles.segmentHeader}>
                <Text style={styles.speakerName}>{row.speakerName}</Text>
                <Text style={styles.timestamp}>{format(new Date(row.created_at), 'h:mm a')}</Text>
              </View>
              <Text style={styles.segmentText}>{row.text}</Text>
            </View>
          ))}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.text_muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md },
  segment: {
    backgroundColor: colors.bg_card,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.1)',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  speakerName: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.accent_green_bright,
  },
  timestamp: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.text_muted },
  segmentText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text_primary, lineHeight: 21 },
});
