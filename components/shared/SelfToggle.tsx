import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, UserCheck } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/constants/theme';

interface SelfToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  hint: string;
}

/** "Self" switch for the Link and Deal forms: the member's own business, so no one else's details are needed. */
export default function SelfToggle({ value, onChange, hint }: SelfToggleProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[styles.container, value && styles.containerActive]}>
      <View style={[styles.iconCircle, value && styles.iconCircleActive]}>
        <UserCheck size={18} color={value ? colors.bg_primary : colors.accent_green_bright} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>Self</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <View style={[styles.check, value && styles.checkActive]}>
        {value ? <Check size={14} color={colors.bg_primary} strokeWidth={3} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    backgroundColor: colors.bg_card,
    marginBottom: spacing.lg,
  },
  containerActive: {
    borderColor: colors.accent_green_bright,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  iconCircleActive: {
    backgroundColor: colors.accent_green_bright,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    color: colors.text_primary,
  },
  hint: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.text_secondary,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.text_muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    borderColor: colors.accent_green_bright,
    backgroundColor: colors.accent_green_bright,
  },
});
