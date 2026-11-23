import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectionsService, ConnectionSummary } from '@/services/connectionsService';

interface HouseDetails {
  name: string;
  zone: string;
  state: string;
  country: string;
}

export default function MemberProfileScreen() {
  const { profile } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    category?: string;
    location?: string;
    circle?: string;
    tier?: string;
    profile_photo?: string;
  }>();

  const name = params.name || 'Member';
  const category = params.category || 'Business';
  const location = params.location || 'Location not set';
  const circle = params.circle || 'open';
  const tier = params.tier || 'regular';
  const profilePhoto = params.profile_photo || '';
  const [houseDetails, setHouseDetails] = useState<HouseDetails | null>(null);
  const [connection, setConnection] = useState<ConnectionSummary | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadConnection = useCallback(async () => {
    if (!params.id) {
      setConnectionLoading(false);
      return;
    }
    try {
      const existing = await ConnectionsService.getConnectionWith(params.id);
      setConnection(existing);
    } catch (error) {
      console.error('Failed to load connection status:', error);
    } finally {
      setConnectionLoading(false);
    }
  }, [params.id]);

  // Refresh on every focus (e.g. returning from the chat/inbox screen after
  // the other person responded), not just once on mount.
  useFocusEffect(
    useCallback(() => {
      loadConnection();
    }, [loadConnection])
  );

  const handleConnect = async () => {
    if (!params.id) return;
    setActionLoading(true);
    try {
      const result = await ConnectionsService.sendConnectRequest(params.id);
      setConnection(result);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not send connect request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespond = async (accept: boolean) => {
    if (!connection) return;
    setActionLoading(true);
    try {
      await ConnectionsService.respondToRequest(connection.id, accept);
      await loadConnection();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not respond to this request.');
    } finally {
      setActionLoading(false);
    }
  };

  const openChat = () => {
    if (!connection) return;
    router.push({ pathname: '/chat-detail', params: { connectionId: connection.id } });
  };

  useEffect(() => {
    const loadHouseDetails = async () => {
      try {
        let houseId: string | null = null;

        if (params.id) {
          const { data: memberProfile } = await supabase
            .from('profiles')
            .select('house_id')
            .eq('id', params.id)
            .maybeSingle();

          houseId = memberProfile?.house_id || null;
        }

        if (!houseId) {
          houseId = profile?.house_id || null;
        }

        if (!houseId) {
          setHouseDetails(null);
          return;
        }

        const { data: houseRow } = await supabase
          .from('houses')
          .select('name, zone, state, country')
          .eq('id', houseId)
          .maybeSingle();

        if (!houseRow) {
          setHouseDetails(null);
          return;
        }

        setHouseDetails({
          name: houseRow.name || 'Not set',
          zone: houseRow.zone || 'Not set',
          state: houseRow.state || 'Not set',
          country: houseRow.country || 'Not set',
        });
      } catch {
        setHouseDetails(null);
      }
    };

    loadHouseDetails();
  }, [params.id, profile?.house_id]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
          Member Profile
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatarRing}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <UserIcon size={42} color={colors.text_secondary} />
              </View>
            )}
          </View>

          <Text style={styles.name}>{name}</Text>
          <Text style={styles.category}>{category}</Text>
          <Text style={styles.location}>{location}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Circle</Text>
              <Text style={styles.metaPillValue}>{circle}</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Tier</Text>
              <Text style={styles.metaPillValue}>{tier}</Text>
            </View>
          </View>

          <View style={styles.houseCard}>
            <Text style={styles.houseTitle}>House Details</Text>
            <View style={styles.houseRow}>
              <Text style={styles.houseLabel}>House</Text>
              <Text style={styles.houseValue}>{houseDetails?.name || 'Not set'}</Text>
            </View>
            <View style={styles.houseRow}>
              <Text style={styles.houseLabel}>Zone</Text>
              <Text style={styles.houseValue}>{houseDetails?.zone || 'Not set'}</Text>
            </View>
            <View style={styles.houseRow}>
              <Text style={styles.houseLabel}>State</Text>
              <Text style={styles.houseValue}>{houseDetails?.state || 'Not set'}</Text>
            </View>
            <View style={styles.houseRow}>
              <Text style={styles.houseLabel}>Country</Text>
              <Text style={styles.houseValue}>{houseDetails?.country || 'Not set'}</Text>
            </View>
          </View>

          {connectionLoading ? (
            <ActivityIndicator size="small" color={colors.accent_green_bright} />
          ) : !connection ? (
            <TouchableOpacity
              style={styles.connectButton}
              disabled={actionLoading || !params.id}
              onPress={handleConnect}
              activeOpacity={0.85}>
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.bg_primary} />
              ) : (
                <Text style={styles.connectButtonText}>Connect</Text>
              )}
            </TouchableOpacity>
          ) : connection.status === 'pending' && connection.isRequester ? (
            <View style={styles.contactNotice}>
              <Text style={styles.contactNoticeText}>Request pending — waiting for a response.</Text>
            </View>
          ) : connection.status === 'pending' && !connection.isRequester ? (
            <View style={styles.respondRow}>
              <TouchableOpacity
                style={styles.declineButton}
                disabled={actionLoading}
                onPress={() => handleRespond(false)}>
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptButton}
                disabled={actionLoading}
                onPress={() => handleRespond(true)}>
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.bg_primary} />
                ) : (
                  <Text style={styles.acceptButtonText}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : connection.status === 'accepted' ? (
            <TouchableOpacity style={styles.connectButton} onPress={openChat} activeOpacity={0.85}>
              <Text style={styles.connectButtonText}>Open Chat</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.contactNotice}>
              <Text style={styles.contactNoticeText}>
                Full contact details unlock after you connect.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg_secondary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.text_primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bg_card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg_secondary,
  },
  name: {
    fontFamily: 'Poppins-Bold',
    fontSize: 28,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  category: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.accent_green_bright,
    marginBottom: spacing.xs,
  },
  location: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.text_secondary,
    marginBottom: spacing.md,
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metaPill: {
    flex: 1,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  metaPillLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.text_muted,
    marginBottom: 2,
  },
  metaPillValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.text_primary,
    textTransform: 'capitalize',
  },
  houseCard: {
    width: '100%',
    backgroundColor: 'rgba(52, 211, 153, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  houseTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.text_primary,
    marginBottom: spacing.sm,
  },
  houseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  houseLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.text_muted,
  },
  houseValue: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: colors.text_secondary,
    maxWidth: '62%',
    textAlign: 'right',
  },
  contactNotice: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
    alignItems: 'center',
  },
  contactNoticeText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.text_muted,
    textAlign: 'center',
  },
  connectButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.accent_green_bright,
    alignItems: 'center',
  },
  connectButtonText: {
    fontFamily: 'Poppins-SemiBold',
    color: colors.bg_primary,
    fontSize: 15,
  },
  respondRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  declineButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  declineButtonText: {
    fontFamily: 'Poppins-Medium',
    color: colors.text_secondary,
    fontSize: 14,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.accent_green_bright,
  },
  acceptButtonText: {
    fontFamily: 'Poppins-Medium',
    color: colors.bg_primary,
    fontSize: 14,
  },
});
