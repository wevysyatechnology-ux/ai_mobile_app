import { ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Download, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppVersionConfig, AppVersionService } from '@/services/appVersionService';
import { compareVersions, getAppVersion } from '@/utils/appVersion';

const dismissedKey = (version: string) => `update_prompt_dismissed_${version}`;

/**
 * Tells members a newer version is available. It never blocks anything: a small dismissible card
 * sits above the tab bar until the member updates or closes it (closing hides it for that
 * version only). If the version config can't be loaded, nothing is shown. Also records the
 * running version on the signed-in member's profile so support (and the update announcement)
 * know who is on what.
 */
export default function UpdateGate({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<AppVersionConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    const next = await AppVersionService.getConfig();
    if (!next) return;
    setConfig(next);
    try {
      setDismissed((await AsyncStorage.getItem(dismissedKey(next.latest_version))) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Check at launch and whenever the app returns to the foreground.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (userId) AppVersionService.reportVersion(userId);
  }, [userId]);

  const updateAvailable = !!config && compareVersions(getAppVersion(), config.latest_version) < 0;
  const showCard = updateAvailable && !dismissed && !!userId;

  const close = async () => {
    setDismissed(true);
    if (config) AsyncStorage.setItem(dismissedKey(config.latest_version), '1').catch(() => {});
  };

  return (
    <>
      {children}
      {showCard && config ? (
        <View pointerEvents="box-none" style={[styles.wrapper, { bottom: 76 + Math.max(insets.bottom, 8) }]}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Download size={18} color={colors.accent_green_bright} />
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.title}>Update available</Text>
              <Text style={styles.subtitle}>Version {config.latest_version} is ready</Text>
            </View>
            <TouchableOpacity
              style={styles.updateButton}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(config.store_url).catch(() => {})}>
              <Text style={styles.updateText}>Update</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel="Dismiss update notice">
              <X size={18} color={colors.text_muted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg_card,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderRadius: borderRadius.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fontSize.sm,
    color: colors.text_primary,
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.text_secondary,
  },
  updateButton: {
    backgroundColor: colors.accent_green_bright,
    borderRadius: borderRadius.button,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  updateText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fontSize.sm,
    color: colors.bg_primary,
  },
});
