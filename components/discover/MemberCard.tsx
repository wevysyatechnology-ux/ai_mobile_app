import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { User as UserIcon, UserPlus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { ConnectionsService } from '@/services/connectionsService';
import type { User } from '@/types';

interface MemberCardProps {
  member: User;
}

export default function MemberCard({ member }: MemberCardProps) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);

  const handleViewProfile = () => {
    router.push({
      pathname: '/member-profile',
      params: {
        id: member.id,
        name: member.name,
        category: member.category,
        location: member.location,
        circle: member.circle,
        tier: member.tier,
        profile_photo: member.profile_photo || '',
      },
    });
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const connection = await ConnectionsService.sendConnectRequest(member.id);
      if (connection.status === 'accepted') {
        Alert.alert("You're already connected", `You're already connected with ${member.name}.`);
      } else if (connection.status === 'declined') {
        Alert.alert('Not connected', `A connection with ${member.name} was previously declined.`);
      } else {
        Alert.alert('Request sent', `Connect request sent to ${member.name}.`);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not send connect request.');
    } finally {
      setConnecting(false);
    }
  };

  const getBadgeColor = () => {
    if (member.tier === 'privileged') return '#FFD700';
    if (member.tier === 'regular') return colors.accent_green;
    return colors.text_secondary;
  };

  const getTierLabel = () => {
    return member.tier.charAt(0).toUpperCase() + member.tier.slice(1);
  };

  return (
    <View style={styles.card}>
      <View style={styles.avatarContainer}>
        {member.profile_photo ? (
          <Image
            source={{ uri: member.profile_photo }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <UserIcon size={32} color={colors.text_secondary} />
          </View>
        )}
        {member.is_online && <View style={styles.onlineIndicator} />}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={styles.category} numberOfLines={1}>
          {member.category}
        </Text>
        <Text style={styles.location} numberOfLines={1}>
          {member.location}
        </Text>
        <View
          style={[styles.badge, { backgroundColor: getBadgeColor() + '20' }]}>
          <Text style={[styles.badgeText, { color: getBadgeColor() }]}>
            {getTierLabel()}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.viewButton}
          onPress={handleViewProfile}
          activeOpacity={0.7}>
          <Text style={styles.viewButtonText}>View Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.connectButton}
          onPress={handleConnect}
          disabled={connecting}
          activeOpacity={0.7}>
          {connecting ? (
            <ActivityIndicator size="small" color={colors.bg_primary} />
          ) : (
            <UserPlus size={16} color={colors.bg_primary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    backgroundColor: colors.bg_card,
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.15)',
  },
  avatarContainer: {
    position: 'relative',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bg_secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent_green_bright,
    borderWidth: 2,
    borderColor: colors.bg_card,
  },
  info: {
    marginBottom: spacing.md,
  },
  name: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.lg,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  category: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_secondary,
    marginBottom: spacing.xs,
  },
  location: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.xs,
    color: colors.text_secondary,
    marginBottom: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.button,
  },
  badgeText: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  viewButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.button,
    backgroundColor: colors.accent_green_bright,
    alignItems: 'center',
  },
  viewButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.sm,
    color: colors.bg_primary,
  },
  connectButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.button,
    backgroundColor: colors.accent_green_bright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
