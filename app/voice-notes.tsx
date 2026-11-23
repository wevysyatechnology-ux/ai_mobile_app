import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Mic, Square, FileText, Users } from 'lucide-react-native';
import AddButton from '@/components/shared/AddButton';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '@/constants/theme';
import { voiceNotesService, VoiceNote } from '@/services/voiceNotesService';
import { format } from 'date-fns';

export default function VoiceNotes() {
  const params = useLocalSearchParams<{ type?: string; title?: string }>();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const noteType = params.type === 'meeting_summary' ? 'meeting_summary' : 'note';

  const loadNotes = useCallback(async () => {
    try {
      const data = await voiceNotesService.getMyVoiceNotes();
      setNotes(data);
    } catch (err) {
      console.error('Failed to load voice notes:', err);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadNotes().finally(() => setIsLoading(false));
  }, [loadNotes]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadNotes();
    setIsRefreshing(false);
  }, [loadNotes]);

  const handleStartRecording = async () => {
    setShowRecorder(true);
    try {
      await voiceNotesService.startRecording();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Microphone unavailable', 'Could not start recording. Please check mic permissions.');
      setShowRecorder(false);
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    setIsSaving(true);
    try {
      const note = await voiceNotesService.stopRecordingAndSave({
        title: params.title || `Voice Note — ${format(new Date(), 'MMM d, h:mm a')}`,
        type: noteType,
      });
      setShowRecorder(false);
      setIsSaving(false);
      await loadNotes();
      router.push({ pathname: '/voice-note-detail', params: { id: note.id } });
    } catch (err) {
      console.error('Failed to save voice note:', err);
      setIsSaving(false);
      setShowRecorder(false);
      Alert.alert('Save failed', 'Could not save your voice note. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Notes</Text>
        <AddButton onPress={handleStartRecording} size={36} accessibilityLabel="New voice note" />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent_green_bright} />
          <Text style={styles.loadingText}>Loading voice notes…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
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
          {notes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Mic size={48} color={colors.text_muted} style={{ marginBottom: spacing.md }} />
              <Text style={styles.emptyTitle}>No voice notes yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the + button to record a note or meeting summary.
              </Text>
            </View>
          ) : (
            notes.map((note) => <VoiceNoteCard key={note.id} note={note} />)
          )}
        </ScrollView>
      )}

      <Modal visible={showRecorder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {isSaving ? (
              <>
                <ActivityIndicator size="large" color={colors.accent_green_bright} />
                <Text style={styles.modalStatus}>Transcribing & summarizing…</Text>
              </>
            ) : (
              <>
                <View style={[styles.recordDot, isRecording && styles.recordDotActive]} />
                <Text style={styles.modalStatus}>
                  {isRecording ? 'Recording…' : 'Preparing microphone…'}
                </Text>
                <TouchableOpacity
                  style={styles.stopBtn}
                  onPress={handleStopRecording}
                  disabled={!isRecording}
                  activeOpacity={0.85}>
                  <Square size={18} color={colors.bg_primary} fill={colors.bg_primary} />
                  <Text style={styles.stopBtnText}>Stop & Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowRecorder(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function VoiceNoteCard({ note }: { note: VoiceNote }) {
  const isMeeting = note.type === 'meeting_summary';
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/voice-note-detail', params: { id: note.id } })}>
      <View style={styles.cardIconContainer}>
        {isMeeting ? (
          <Users size={20} color={colors.accent_green_bright} />
        ) : (
          <FileText size={20} color={colors.accent_green_bright} />
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{note.title}</Text>
        <Text style={styles.cardSummary} numberOfLines={2}>
          {note.summary || note.transcript}
        </Text>
        <Text style={styles.cardDate}>
          {format(new Date(note.created_at), 'MMM d, yyyy · h:mm a')}
        </Text>
      </View>
    </TouchableOpacity>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text_muted },
  scroll: { flex: 1 },
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
  cardSummary: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text_secondary, lineHeight: 18 },
  cardDate: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.text_muted, marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.bg_card,
    borderRadius: borderRadius.card,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  recordDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text_muted,
  },
  recordDotActive: {
    backgroundColor: '#ef4444',
  },
  modalStatus: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text_primary },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent_green_bright,
    borderRadius: borderRadius.button,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  stopBtnText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.bg_primary },
  cancelText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text_muted },
});
