import { useCallback, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';

const ACCESSORY_ID = 'formKeyboardToolbar';

/**
 * Keyboard handling for a form with several TextInputs.
 *
 * - Return key goes to the next field ("Next"), and closes the keyboard on the last one ("Done").
 * - iOS: a toolbar above the keyboard with previous / next arrows and Done. This also covers the
 *   number/phone/decimal pads (no return key) and multiline fields (return inserts a newline).
 * - Pair with `keyboardDismissProps` on the form's ScrollView so dragging the form closes the keyboard.
 *
 * `order` lists the field names top-to-bottom. Spread `field(name)` onto each TextInput and render
 * `toolbar` once anywhere in the screen.
 */
export function useFormFields(order: string[]) {
  const refs = useRef<Record<string, TextInput | null>>({});
  const [focused, setFocused] = useState<string | null>(null);

  const focusAt = useCallback(
    (index: number) => {
      const name = order[index];
      if (name) refs.current[name]?.focus();
    },
    [order]
  );

  const field = (name: string, options?: { multiline?: boolean }) => {
    const index = order.indexOf(name);
    const isLast = index === order.length - 1;
    return {
      ref: (input: TextInput | null) => {
        refs.current[name] = input;
      },
      onFocus: () => setFocused(name),
      inputAccessoryViewID: ACCESSORY_ID,
      returnKeyType: (isLast ? 'done' : 'next') as 'done' | 'next',
      // Keep the keyboard up while moving to the next field; close it on the last one.
      blurOnSubmit: isLast,
      // Multiline fields use return for a new line, so they rely on the toolbar instead.
      onSubmitEditing: options?.multiline
        ? undefined
        : () => (isLast ? Keyboard.dismiss() : focusAt(index + 1)),
    };
  };

  const index = focused ? order.indexOf(focused) : -1;

  const toolbar =
    Platform.OS === 'ios' ? (
      <InputAccessoryView nativeID={ACCESSORY_ID}>
        <View style={styles.toolbar}>
          <View style={styles.arrows}>
            <TouchableOpacity
              onPress={() => focusAt(index - 1)}
              disabled={index <= 0}
              style={styles.arrowButton}
              accessibilityLabel="Previous field">
              <ChevronUp size={22} color={index <= 0 ? colors.text_muted : colors.accent_green_bright} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => focusAt(index + 1)}
              disabled={index < 0 || index >= order.length - 1}
              style={styles.arrowButton}
              accessibilityLabel="Next field">
              <ChevronDown
                size={22}
                color={index < 0 || index >= order.length - 1 ? colors.text_muted : colors.accent_green_bright}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => Keyboard.dismiss()} accessibilityLabel="Close keyboard">
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
      </InputAccessoryView>
    ) : null;

  return { field, toolbar };
}

/** Spread onto the form's ScrollView: drag to close the keyboard, taps on buttons still work. */
export const keyboardDismissProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: (Platform.OS === 'ios' ? 'interactive' : 'on-drag') as 'interactive' | 'on-drag',
  automaticallyAdjustKeyboardInsets: true,
};

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg_card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(52, 211, 153, 0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  arrows: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  arrowButton: {
    padding: spacing.sm,
  },
  done: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.accent_green_bright,
    padding: spacing.sm,
  },
});
