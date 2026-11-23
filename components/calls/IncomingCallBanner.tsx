import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Phone, PhoneOff, User as UserIcon } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { CallService } from '@/services/callService';
import { ConnectionsService, CounterpartProfile } from '@/services/connectionsService';
import { CallSession } from '@/types/database';

/**
 * Always-mounted, foreground-only incoming-call overlay — shown over
 * whatever screen is currently active when a `call_sessions` row arrives
 * with the current user as callee. This is the universal fallback across
 * iOS/Android/web; Android additionally gets a native CallKeep lock-screen
 * UI for the backgrounded/killed case (separate, later piece), and iOS
 * relies on the regular push-notification tap-through when backgrounded.
 */
export default function IncomingCallBanner() {
  const { user } = useAuth();
  const [ringingCall, setRingingCall] = useState<CallSession | null>(null);
  const [caller, setCaller] = useState<CounterpartProfile | null>(null);
  const sessionUnsubRef = useRef<(() => void) | null>(null);

  const dismiss = useCallback(() => {
    sessionUnsubRef.current?.();
    sessionUnsubRef.current = null;
    setRingingCall(null);
    setCaller(null);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribeIncoming = CallService.subscribeToIncomingCalls(user.id, async (row) => {
      if (row.status !== 'ringing') return;

      try {
        const profiles = await ConnectionsService.getCounterpartProfiles([row.connection_id]);
        setCaller(profiles[row.connection_id] || null);
      } catch (err) {
        console.warn('Failed to load caller profile for incoming call:', err);
      }
      setRingingCall(row);

      // Auto-dismiss if the call is resolved (declined elsewhere, missed,
      // ended) before this device answers.
      sessionUnsubRef.current = CallService.subscribeToCallSession(row.id, (updated) => {
        if (updated.status !== 'ringing') dismiss();
      });
    });

    return () => {
      unsubscribeIncoming();
      sessionUnsubRef.current?.();
      sessionUnsubRef.current = null;
    };
  }, [user?.id, dismiss]);

  if (!ringingCall) return null;

  const handleAccept = () => {
    const callId = ringingCall.id;
    const connectionId = ringingCall.connection_id;
    dismiss();
    router.push({ pathname: '/call', params: { callId, connectionId, role: 'callee' } });
  };

  const handleDecline = () => {
    const callId = ringingCall.id;
    dismiss();
    CallService.declineCall(callId).catch((err) => console.warn('Failed to decline call:', err));
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.banner}>
        {caller?.profile_photo ? (
          <Image source={{ uri: caller.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <UserIcon size={22} color={colors.text_secondary} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {caller?.full_name || 'Someone'}
          </Text>
          <Text style={styles.subtitle}>Incoming call…</Text>
        </View>
        <TouchableOpacity style={[styles.actionButton, styles.declineButton]} onPress={handleDecline}>
          <PhoneOff size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={handleAccept}>
          <Phone size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: 56,
    paddingHorizontal: spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg_card,
    borderRadius: 16,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg_secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.text_primary,
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.text_secondary,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: colors.danger_red,
  },
  acceptButton: {
    backgroundColor: colors.accent_green_bright,
  },
});
