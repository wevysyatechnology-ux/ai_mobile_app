import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Trash2, CheckSquare } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '@/constants/theme';
import { voiceNotesService, VoiceNote } from '@/services/voiceNotesService';
import { format } from 'date-fns';

export default function VoiceNoteDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    voiceNotesService
      .getVoiceNoteById(params.id)
      .then(setNote)
      .catch((err) => console.error('Failed to load voice note:', err))
      .finally(() => setIsLoading(false));
  }, [params.id]);

  const handleDelete = () => {
    if (!note) return;
    Alert.alert('Delete voice note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await voiceNotesService.deleteVoiceNote(note.id);
            router.back();
          } catch (err) {
            console.error('Failed to delete voice note:', err);
            Alert.alert('Error', 'Could not delete this voice note.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {note?.type === 'meeting_summary' ? 'Meeting Summary' : 'Voice Note'}
        </Text>
        <TouchableOpacity style={styles.iconBtn} onPress={handleDelete}>
          <Trash2 size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent_green_bright} />
        </View>
      ) : !note ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Voice note not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{note.title}</Text>
          <Text style={styles.date}>{format(new Date(note.created_at), 'MMM d, yyyy · h:mm a')}</Text>

          {note.summary ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Summary</Text>
              <Text style={styles.sectionText}>{note.summary}</Text>
            </View>
          ) : null}

          {note.action_items && note.action_items.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Action Items</Text>
              {note.action_items.map((item, idx) => (
                <View key={idx} style={styles.actionItemRow}>
                  <CheckSquare size={16} color={colors.accent_green_bright} />
                  <Text style={styles.actionItemText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Full Transcript</Text>
            <Text style={styles.transcriptText}>{note.transcript}</Text>
          </View>
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
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text_muted },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text_primary, marginBottom: 4 },
  date: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.text_muted, marginBottom: spacing.lg },
  section: {
    backgroundColor: colors.bg_card,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.1)',
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.accent_green_bright,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text_primary, lineHeight: 22 },
  actionItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  actionItemText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text_primary, lineHeight: 20 },
  transcriptText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text_secondary, lineHeight: 20 },
});
