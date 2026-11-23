import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Share2 } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface SuccessModalProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Small summary rows shown under the message, e.g. [['Sent to', 'Suman'], ['Title', 'Water filter']] */
  details?: [string, string][];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Receipt card to show and offer for sharing (shared as an image, like a payment receipt). */
  receipt?: ReactNode;
  /** Same details as plain (masked) text; shared if the image can't be shared on this device. */
  shareText?: string;
  shareLabel?: string;
}

/** Confirmation shown after a link / deal is recorded: animated tick, short summary and clear next actions. */
export default function SuccessModal({
  visible,
  title,
  message,
  details,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  receipt,
  shareText,
  shareLabel = 'Share in group',
}: SuccessModalProps) {
  const { height } = useWindowDimensions();
  const receiptRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const scale = useSharedValue(0.6);
  const tick = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    scale.value = 0.6;
    tick.value = 0;
    ring.value = 0;
    scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    tick.value = withDelay(150, withSequence(withTiming(1.25, { duration: 180 }), withTiming(1, { duration: 140 })));
    ring.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.ease) });
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: Math.min(1, scale.value + 0.2) }));
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: tick.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring.value * 0.55 }],
    opacity: 0.45 * (1 - ring.value),
  }));

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const target = receiptRef.current;
      if (!target) throw new Error('Receipt is not ready yet');
      console.log('[share] capturing receipt');
      const raw = await captureRef(target, { format: 'png', quality: 1, result: 'tmpfile' });
      // expo-sharing only accepts file:// URLs; some capture results come back as a bare path.
      const uri = raw.startsWith('file://') ? raw : `file://${raw}`;
      console.log('[share] captured', uri);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: shareLabel });
    } catch (error: any) {
      console.warn('[share] image share failed:', error?.message || error);
      // Fall back to sharing the same masked details as text so the button never does nothing.
      if (shareText) {
        try {
          await Share.share({ message: shareText });
          return;
        } catch (textError: any) {
          console.warn('[share] text share failed:', textError?.message || textError);
        }
      }
      Alert.alert('Could not share', error?.message || 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onPrimary} statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, cardStyle, { maxHeight: height * 0.92 }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}>
          <View style={[styles.badgeWrap, receipt ? styles.badgeWrapCompact : null]}>
            <Animated.View style={[styles.ring, ringStyle]} />
            <View style={styles.badge}>
              <Animated.View style={tickStyle}>
                <Check size={40} color={colors.bg_primary} strokeWidth={3.5} />
              </Animated.View>
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {receipt ? (
            // collapsable={false} keeps the view real on Android so it can be captured as an image.
            <View ref={receiptRef} collapsable={false} style={styles.receiptWrap}>
              {receipt}
            </View>
          ) : null}

          {!receipt && details && details.length > 0 ? (
            <View style={styles.details}>
              {details.map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {receipt ? (
            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={handleShare} disabled={sharing}>
              {sharing ? (
                <ActivityIndicator color={colors.bg_primary} />
              ) : (
                <View style={styles.buttonRow}>
                  <Share2 size={18} color={colors.bg_primary} />
                  <Text style={styles.primaryText}>{shareLabel}</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={receipt ? styles.outlineButton : styles.primaryButton}
            activeOpacity={0.85}
            onPress={onPrimary}>
            <Text style={receipt ? styles.outlineText : styles.primaryText}>{primaryLabel}</Text>
          </TouchableOpacity>
          {secondaryLabel && onSecondary ? (
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.7} onPress={onSecondary}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: colors.bg_card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    shadowColor: colors.accent_green_bright,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  scroll: {
    alignSelf: 'stretch',
  },
  scrollContent: {
    alignItems: 'center',
  },
  badgeWrapCompact: {
    transform: [{ scale: 0.7 }],
    marginVertical: -12,
  },
  receiptWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    borderRadius: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  outlineButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.button,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
    marginTop: spacing.sm,
  },
  outlineText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fontSize.md,
    color: colors.accent_green_bright,
  },
  badgeWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  ring: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.accent_green_bright,
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent_green_bright,
  },
  title: {
    fontFamily: 'Poppins-Bold',
    fontSize: fontSize.xxl,
    color: colors.text_primary,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.md,
    color: colors.text_secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  details: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.card,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_muted,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.sm,
    color: colors.text_primary,
  },
  primaryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.accent_green_bright,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.button,
    marginTop: spacing.xl,
  },
  primaryText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fontSize.md,
    color: colors.bg_primary,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  secondaryText: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.md,
    color: colors.accent_green_bright,
  },
});
