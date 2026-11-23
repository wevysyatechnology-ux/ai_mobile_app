import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Sparkles, Plus, X } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { CapabilityKeywordsService, CapabilityKeyword } from '@/services/capabilityKeywordsService';

/**
 * "What I Can Help With" — up to 6 searchable capability keywords members can
 * add to their profile (e.g. "Wedding", "Corporate Events"), used by
 * Discover/AI search to match member requests. The 6-keyword cap shown here
 * is a UX guard only; the real enforcement is a DB trigger on
 * member_capability_keywords, so a race condition just surfaces that error.
 */
export default function CapabilityKeywordsCard() {
  const [keywords, setKeywords] = useState<CapabilityKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadKeywords = async () => {
    try {
      const data = await CapabilityKeywordsService.getMyKeywords();
      setKeywords(data);
    } catch (error) {
      console.error('Failed to load capability keywords:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeywords();
  }, []);

  const atLimit = keywords.length >= CapabilityKeywordsService.MAX_ACTIVE_KEYWORDS;

  const handleAdd = async () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const created = await CapabilityKeywordsService.addKeyword(trimmed);
      setKeywords((prev) => [...prev, created]);
      setNewKeyword('');
    } catch (error: any) {
      Alert.alert('Could not add keyword', error?.message || 'Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await CapabilityKeywordsService.deactivateKeyword(id);
      setKeywords((prev) => prev.filter((k) => k.id !== id));
    } catch (error: any) {
      Alert.alert('Could not remove keyword', error?.message || 'Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What I Can Help With</Text>

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Sparkles size={24} color={colors.accent_green} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.subtitle}>
              Add up to {CapabilityKeywordsService.MAX_ACTIVE_KEYWORDS} keywords describing what you offer
            </Text>
            <Text style={styles.hint}>Members find you in Discover by these — e.g. "Wedding", "Corporate Events"</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {loading ? (
          <ActivityIndicator size="small" color={colors.accent_green} />
        ) : (
          <>
            {keywords.length > 0 && (
              <View style={styles.chipList}>
                {keywords.map((k) => (
                  <View key={k.id} style={styles.chip}>
                    <Text style={styles.chipText}>{k.keyword}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemove(k.id)}
                      disabled={removingId === k.id}
                      hitSlop={8}>
                      {removingId === k.id ? (
                        <ActivityIndicator size="small" color={colors.text_secondary} />
                      ) : (
                        <X size={14} color={colors.text_secondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {atLimit ? (
              <Text style={styles.limitText}>
                You've reached the {CapabilityKeywordsService.MAX_ACTIVE_KEYWORDS} keyword limit. Remove one to add another.
              </Text>
            ) : (
              <View style={styles.addRow}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Wedding Photography"
                  placeholderTextColor={colors.text_secondary}
                  value={newKeyword}
                  onChangeText={setNewKeyword}
                  onSubmitEditing={handleAdd}
                  returnKeyType="done"
                  maxLength={40}
                />
                <TouchableOpacity
                  style={[styles.addButton, (!newKeyword.trim() || adding) && styles.addButtonDisabled]}
                  onPress={handleAdd}
                  disabled={!newKeyword.trim() || adding}
                  activeOpacity={0.7}>
                  {adding ? (
                    <ActivityIndicator size="small" color={colors.bg_primary} />
                  ) : (
                    <Plus size={18} color={colors.bg_primary} />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.lg,
    color: colors.text_primary,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: '#1A1F1E',
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#2A2F2E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent_green + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.sm,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.xs,
    color: colors.text_secondary,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2F2E',
    marginVertical: spacing.md,
  },
  chipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent_green + '15',
    borderWidth: 1,
    borderColor: colors.accent_green + '30',
    borderRadius: borderRadius.button,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  chipText: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_primary,
  },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: '#141817',
    borderWidth: 1,
    borderColor: '#2A2F2E',
    borderRadius: borderRadius.button,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.text_primary,
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.button,
    backgroundColor: colors.accent_green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: colors.bg_secondary,
  },
  limitText: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.xs,
    color: colors.text_secondary,
  },
});
