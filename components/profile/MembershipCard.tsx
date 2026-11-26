import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Award, Calendar, ArrowUpRight } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import type { User } from '@/types';

const PRIVILEGED_BADGE = require('@/assets/images/badges/privileged-member.png');

interface MembershipCardProps {
  user: User;
}

export default function MembershipCard({ user }: MembershipCardProps) {
  const circleText =
    user.circle === 'inner' ? 'Inner Circle' : 'Open Circle';
  const tierText = user.tier.charAt(0).toUpperCase() + user.tier.slice(1);
  const isPrivileged = user.tier === 'privileged';

  const canUpgrade = !isPrivileged && (user.circle === 'open' || user.tier === 'regular');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Membership</Text>

      <View style={[styles.card, isPrivileged && styles.cardPrivileged]}>
        {isPrivileged && (
          <View style={styles.badgeCenter}>
            <Image source={PRIVILEGED_BADGE} style={styles.badgeLarge} />
            <Text style={styles.privilegedLabel}>PRIVILEGED MEMBER</Text>
          </View>
        )}

        <View style={styles.header}>
          <View style={[styles.iconContainer, isPrivileged && styles.iconContainerGold]}>
            <Award size={24} color={isPrivileged ? '#FFD700' : colors.accent_green} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.circle}>{circleText}</Text>
            <Text style={[styles.tier, isPrivileged && styles.tierGold]}>{tierText} Member</Text>
          </View>
        </View>

        <View style={[styles.divider, isPrivileged && styles.dividerGold]} />

        <View style={styles.infoRow}>
          <Calendar size={16} color={isPrivileged ? '#FFD700' : colors.text_secondary} />
          <Text style={styles.infoText}>
            Member since {new Date(user.created_at).getFullYear()}
          </Text>
        </View>

        {isPrivileged && (
          <>
            <View style={[styles.divider, styles.dividerGold]} />
            <View style={styles.benefitsSection}>
              <Text style={styles.benefitsTitle}>Benefits</Text>
              {['Priority event access', 'Exclusive networking', 'VIP business links', 'Premium badge display'].map((benefit, index) => (
                <View key={index} style={styles.benefitRow}>
                  <Text style={styles.benefitDot}>•</Text>
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {canUpgrade && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.upgradeButton} activeOpacity={0.7}>
              <Text style={styles.upgradeButtonText}>Upgrade Membership</Text>
              <ArrowUpRight size={16} color={colors.bg_primary} />
            </TouchableOpacity>
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
  cardPrivileged: {
    borderColor: 'rgba(255, 215, 0, 0.3)',
    backgroundColor: '#1A1D1A',
  },
  badgeCenter: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  badgeLarge: {
    width: 52,
    height: 52,
    resizeMode: 'contain',
    marginBottom: spacing.sm,
  },
  privilegedLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: '#FFD700',
    letterSpacing: 1.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  iconContainerGold: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
  },
  headerText: {
    flex: 1,
  },
  circle: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.lg,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  tier: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_secondary,
  },
  tierGold: {
    color: '#FFD700',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2F2E',
    marginVertical: spacing.md,
  },
  dividerGold: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
  },
  benefitsSection: {
    gap: 6,
  },
  benefitsTitle: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.sm,
    color: colors.text_primary,
    marginBottom: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitDot: {
    fontSize: 14,
    color: '#FFD700',
  },
  benefitText: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_secondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_secondary,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent_green,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.button,
    gap: spacing.xs,
  },
  upgradeButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: fontSize.md,
    color: colors.bg_primary,
  },
});
