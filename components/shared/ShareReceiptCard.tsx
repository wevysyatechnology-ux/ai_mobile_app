import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '@/constants/theme';

export interface ReceiptData {
  kind: 'link' | 'deal';
  /** Big line: the link title, or the deal amount. */
  headline: string;
  /** Smaller line under the headline (e.g. the deal title). */
  subline?: string;
  /** Label / value rows. Customer name and phone must already be masked. */
  rows: [string, string][];
  senderName: string;
  dateText: string;
}

/** Plain-text version of the receipt (already masked), used when the image can't be shared. */
export function receiptToText(r: ReceiptData): string {
  const lines = [BADGE_TEXT[r.kind] + ': ' + r.headline];
  if (r.subline) lines.push(r.subline);
  r.rows.forEach(([label, value]) => lines.push(`${label}: ${value}`));
  lines.push(`Shared by ${r.senderName} on ${r.dateText}`, 'Shared via WeVysya');
  return lines.join('\n');
}

const BADGE_TEXT: Record<ReceiptData['kind'], string> = { link: 'Link passed', deal: 'Deal closed' };
const BADGE: Record<ReceiptData['kind'], string> = { link: 'LINK PASSED', deal: 'DEAL CLOSED' };

/**
 * The "payment receipt" style card a member shares to their group after recording a link or deal.
 * This exact view is captured as an image, so it must be self-contained and never show raw customer details.
 */
export default function ShareReceiptCard({ kind, headline, subline, rows, senderName, dateText }: ReceiptData) {
  return (
    <LinearGradient
      colors={['#0f4a43', '#082b27', '#04100f']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      collapsable={false}>
      <View style={styles.topRow}>
        <Image source={require('@/assets/images/wevysya_logo_r.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{BADGE[kind]}</Text>
        </View>
      </View>

      <Text style={styles.headline} numberOfLines={2}>
        {headline}
      </Text>
      {subline ? (
        <Text style={styles.subline} numberOfLines={2}>
          {subline}
        </Text>
      ) : null}

      {rows.length > 0 ? <View style={styles.divider} /> : null}
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}

      <View style={styles.divider} />
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerLabel}>Shared by</Text>
          <Text style={styles.footerValue} numberOfLines={1}>
            {senderName}
          </Text>
        </View>
        <Text style={styles.footerDate}>{dateText}</Text>
      </View>
      <Text style={styles.brand}>Shared via WeVysya</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    padding: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  logo: {
    width: 96,
    height: 30,
  },
  badge: {
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: colors.accent_green_glow,
  },
  headline: {
    fontFamily: 'Poppins-Bold',
    fontSize: 24,
    color: colors.text_primary,
    marginTop: spacing.xs,
  },
  subline: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_secondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 3,
  },
  rowLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.text_muted,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.text_primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerLeft: {
    flex: 1,
  },
  footerLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: colors.text_muted,
  },
  footerValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.text_primary,
  },
  footerDate: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: colors.text_muted,
  },
  brand: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontFamily: 'Poppins-Regular',
    fontSize: 10,
    letterSpacing: 0.5,
    color: 'rgba(110, 231, 183, 0.7)',
  },
});
