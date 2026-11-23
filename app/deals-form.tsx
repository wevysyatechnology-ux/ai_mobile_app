import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { DealsService } from '@/services/dealsService';
import { sendDealRecordedNotification } from '@/utils/notificationHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { useFormFields, keyboardDismissProps } from '@/hooks/useFormFields';
import MemberPicker, { PickedMember } from '@/components/shared/MemberPicker';
import SuccessModal from '@/components/shared/SuccessModal';
import ShareReceiptCard, { ReceiptData, receiptToText } from '@/components/shared/ShareReceiptCard';
import { format } from 'date-fns';

export default function DealsForm() {
  const { field, toolbar } = useFormFields(['title', 'description', 'amount']);
  const { profile } = useAuth();
  const [selectedMember, setSelectedMember] = useState<PickedMember | null>(null);
  const [success, setSuccess] = useState<null | { title: string; message: string; details: [string, string][]; receipt?: ReceiptData }>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
  });

  const handleSubmit = async () => {
    if (!selectedMember) {
      Alert.alert('Error', 'Please select a member or WeVysya');
      return;
    }

    if (!formData.title || !formData.amount) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const isWeVysyaDeal = selectedMember.id === 'wevysya';
    const fromMemberId = isWeVysyaDeal ? null : selectedMember.id;
    const sourceName = selectedMember.full_name;

    try {
      const result = await DealsService.createDeal({
        title: formData.title,
        description: formData.description,
        amount: parseFloat(formData.amount),
        deal_type: isWeVysyaDeal ? 'wevysya_deal' : 'house_deal',
        from_member_id: fromMemberId,
      });

      // Send notification to the member (if not WeVysya deal)
      if (!isWeVysyaDeal && profile) {
        await sendDealRecordedNotification({
          recipientId: selectedMember.id,
          dealId: result?.id || '',
          memberName: profile.full_name || 'A member',
          memberId: profile.id,
          amount: parseFloat(formData.amount),
          currency: '₹',
          dealType: 'house_deal',
        });
      }

      const recordedTitle = formData.title;
      const recordedAmount = parseFloat(formData.amount);

      // Clear form
      setFormData({
        title: '',
        description: '',
        amount: '',
      });
      setSelectedMember(null);

      setSuccess({
        title: 'Deal recorded',
        message: 'Your deal has been recorded successfully.',
        receipt: {
          kind: 'deal',
          headline: `₹${recordedAmount.toLocaleString('en-IN')}`,
          subline: recordedTitle,
          rows: [['Received from', sourceName || 'Member']],
          senderName: profile?.full_name || 'WeVysya member',
          dateText: format(new Date(), 'dd MMM yyyy, h:mm a'),
        },
        details: [
          ['Deal', recordedTitle],
          ['Amount', `₹${recordedAmount.toLocaleString('en-IN')}`],
          ['Received from', sourceName || 'Member'],
        ],
      });
    } catch (error: any) {
      console.error('Error creating deal:', error);
      Alert.alert('Error', `Failed to create deal: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
          Create Deal
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        {...keyboardDismissProps}>
        <MemberPicker
          label="Received from"
          value={selectedMember}
          onChange={setSelectedMember}
          extraOption={{ id: 'wevysya', full_name: 'WeVysya', description: 'Open to all WeVysya members' }}
        />

        <Text style={styles.label}>
          Title <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          {...field('title')}
          placeholder="Deal Title"
          placeholderTextColor={colors.text_tertiary}
          value={formData.title}
          onChangeText={(text) => setFormData({ ...formData, title: text })}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          {...field('description', { multiline: true })}
          placeholder="Deal Description"
          placeholderTextColor={colors.text_tertiary}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          multiline
          maxLength={500}
        />

        <Text style={styles.label}>
          Amount <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          {...field('amount')}
          placeholder="Deal Amount"
          placeholderTextColor={colors.text_tertiary}
          value={formData.amount}
          onChangeText={(text) => setFormData({ ...formData, amount: text })}
          keyboardType="decimal-pad"
        />

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Create Deal</Text>
        </TouchableOpacity>
      </ScrollView>
      <SuccessModal
        visible={!!success}
        title={success?.title || ''}
        message={success?.message}
        details={success?.details}
        receipt={success?.receipt ? <ShareReceiptCard {...success.receipt} /> : undefined}
        shareText={success?.receipt ? receiptToText(success.receipt) : undefined}
        primaryLabel="Done"
        onPrimary={() => {
          setSuccess(null);
          router.replace('/(tabs)');
        }}
        secondaryLabel="Add another"
        onSecondary={() => setSuccess(null)}
      />
      {toolbar}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    backgroundColor: colors.card_background,
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.text_primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: 100,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text_secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  required: {
    color: colors.accent_red,
  },
  input: {
    backgroundColor: colors.card_background,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text_primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card_background,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerText: {
    fontSize: 16,
    color: colors.text_secondary,
    marginLeft: spacing.md,
  },
  memberList: {
    backgroundColor: colors.card_background,
    borderRadius: 12,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: 200,
  },
  memberSearchInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    margin: spacing.sm,
    marginBottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text_primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyMemberList: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyMemberText: {
    fontSize: 14,
    color: colors.text_tertiary,
    textAlign: 'center',
  },
  memberItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  memberDetails: {
    fontSize: 14,
    color: colors.text_tertiary,
  },
  submitButton: {
    backgroundColor: colors.accent_green_bright,
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
});
