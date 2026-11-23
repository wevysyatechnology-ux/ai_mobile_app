import { StyleSheet, ViewStyle } from 'react-native';
import { Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import PressableScale from '@/components/shared/PressableScale';

interface AddButtonProps {
  onPress: () => void;
  /** Outer diameter in px. Header slots are 40 wide, so 40 keeps titles centred. */
  size?: number;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * Primary "add / create" action used in screen headers: a solid mint circle with a bold dark "+".
 * The old outline "+" used the deep forest green on a black header and was nearly invisible.
 */
export default function AddButton({ onPress, size = 40, accessibilityLabel = 'Add', style }: AddButtonProps) {
  return (
    <PressableScale onPress={onPress} scaleValue={0.9} style={{ width: size, height: size, ...style }}>
      <LinearGradient
        colors={[colors.accent_green_glow, colors.accent_green_bright]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Plus size={size * 0.55} color={colors.bg_primary} strokeWidth={3} />
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent_green_bright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
  },
});
