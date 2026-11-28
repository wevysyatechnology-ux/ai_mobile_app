import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import { ChevronLeft, User, Flame, ChevronDown } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { LinksService } from '@/services/linksService';
import { UserProfile } from '@/types/database';
import { sendLinkReceivedNotification, sendLinkSentNotification } from '@/utils/notificationHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useFormFields, keyboardDismissProps } from '@/hooks/useFormFields';
import SelfToggle from '@/components/shared/SelfToggle';
import SuccessModal from '@/components/shared/SuccessModal';
import ShareReceiptCard, { ReceiptData, receiptToText } from '@/components/shared/ShareReceiptCard';
import { maskName, maskPhone } from '@/utils/mask';
import DevelopedByFooter from '@/components/shared/DevelopedByFooter';
import { format } from 'date-fns';

type ScopeMode = 'in' | 'out';
type CascadeLevel = 'country' | 'state' | 'zone' | 'house';

interface HouseOption {
  id: string;
  name: string;
  country: string;
  state: string;
  zone: string;
}

export default function LinksForm() {
  const { profile, user } = useAuth();
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<any>(null);
  const [houseMembers, setHouseMembers] = useState<UserProfile[]>([]);
  const [houses, setHouses] = useState<any[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  // "Self": the member's own lead. They still choose who receives it, but there is no customer to enter:
  // the receiver gets the sender's own name / phone / email as the contact.
  const [isSelf, setIsSelf] = useState(false);
  const [success, setSuccess] = useState<null | { title: string; message: string; details: [string, string][]; receipt?: ReceiptData }>(null);
  const { field, toolbar } = useFormFields(
    isSelf ? ['title', 'description'] : ['title', 'description', 'contact_name', 'contact_phone', 'contact_email']
  );

  // Out-of-house lookup: browse every house in the network by
  // country -> state -> zone -> house, then pick a member from there.
  // `houses` table has no RLS restricting reads (verified directly), and
  // get_house_members() (see services/linksService.ts) already works for any
  // house id, not just the caller's own — so no new backend access is needed.
  const [scopeMode, setScopeMode] = useState<ScopeMode>('in');
  const [allHouses, setAllHouses] = useState<HouseOption[]>([]);
  const [outCountry, setOutCountry] = useState<string | null>(null);
  const [outState, setOutState] = useState<string | null>(null);
  const [outZone, setOutZone] = useState<string | null>(null);
  const [outHouse, setOutHouse] = useState<HouseOption | null>(null);
  const [openCascade, setOpenCascade] = useState<CascadeLevel | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    urgency: 1,
  });

  useEffect(() => {
    loadUserHouses();
    loadAllHouses();
  }, []);

  // Whichever house is active for the current scope (own house for "In House",
  // the drilled-down selection for "Out House") drives the member list.
  const activeHouseId = scopeMode === 'in' ? selectedHouse?.id : outHouse?.id;

  useEffect(() => {
    if (activeHouseId) {
      loadHouseMembersFor(activeHouseId);
    } else {
      setHouseMembers([]);
    }
  }, [activeHouseId]);

  const loadUserHouses = async () => {
    try {
      const data = await LinksService.getUserHouses();
      setHouses(data);
      if (data.length > 0) {
        setSelectedHouse(data[0]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load houses');
    }
  };

  const loadAllHouses = async () => {
    try {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, country, state, zone')
        .order('country')
        .order('state')
        .order('zone')
        .order('name');
      if (error) throw error;
      setAllHouses(data || []);
    } catch (error) {
      console.error('Error loading houses directory:', error);
    }
  };

  const loadHouseMembersFor = async (houseId: string) => {
    try {
      console.log('Loading members for house:', houseId);
      const members = await LinksService.getHouseMembers(houseId);
      console.log('Loaded members:', members.length);
      setHouseMembers(members);

      if (members.length === 0) {
        Alert.alert(
          'No Members Found',
          'There are no other members in this house to send a link to.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('Error loading house members:', error);
      Alert.alert('Error', `Failed to load members: ${error.message || 'Unknown error'}`);
    }
  };

  const countryOptions = useMemo(
    () => Array.from(new Set(allHouses.map((h) => h.country))).sort(),
    [allHouses]
  );
  const stateOptions = useMemo(
    () =>
      outCountry
        ? Array.from(new Set(allHouses.filter((h) => h.country === outCountry).map((h) => h.state))).sort()
        : [],
    [allHouses, outCountry]
  );
  const zoneOptions = useMemo(
    () =>
      outCountry && outState
        ? Array.from(
            new Set(
              allHouses
                .filter((h) => h.country === outCountry && h.state === outState)
                .map((h) => h.zone)
            )
          ).sort()
        : [],
    [allHouses, outCountry, outState]
  );
  const houseOptions = useMemo(
    () =>
      outCountry && outState && outZone
        ? allHouses.filter(
            (h) => h.country === outCountry && h.state === outState && h.zone === outZone
          )
        : [],
    [allHouses, outCountry, outState, outZone]
  );

  const handleSubmit = async () => {
    console.log('Submit button clicked');
    console.log('Selected member:', selectedMember);
    console.log('Form data:', formData);

    if (!selectedMember) {
      Alert.alert('Error', 'Please select a house member');
      return;
    }
    if (isSelf && !profile) {
      Alert.alert('Error', 'Your profile is not loaded yet. Please try again.');
      return;
    }
    const recipient = { id: selectedMember.id, full_name: selectedMember.full_name };

    if (!formData.title || (!isSelf && (!formData.contact_name || !formData.contact_phone))) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      console.log('Creating link...');
      const result = await LinksService.createLink({
        to_user_id: recipient.id,
        title: formData.title,
        description: formData.description,
        // Self: the sender is the contact, so the receiver sees who to get in touch with.
        contact_name: isSelf ? profile!.full_name || 'Member' : formData.contact_name,
        contact_phone: isSelf ? profile!.phone_number || '' : formData.contact_phone,
        contact_email: isSelf ? user?.email || '' : formData.contact_email,
        urgency: formData.urgency,
      });
      console.log('Link created successfully:', result);

      // Notifications reference the recipient's house — for "In House" that's
      // the same as the sender's own house (selectedHouse); for "Out House"
      // it's whichever house was drilled down to (outHouse).
      const recipientHouseName =
        scopeMode === 'out' ? outHouse?.name : selectedHouse?.house_name;
      const recipientHouseId = scopeMode === 'out' ? outHouse?.id : selectedHouse?.id;

      if (profile && recipientHouseId) {
        // Notify Receiver
        await sendLinkReceivedNotification({
          recipientId: recipient.id,
          linkId: result?.id || '',
          senderName: profile.full_name || 'A member',
          senderId: profile.id,
          houseName: recipientHouseName || 'Your House',
          houseId: recipientHouseId,
          linkType: 'business',
        });

        // Notify Sender
        await sendLinkSentNotification({
          senderId: profile.id,
          linkId: result?.id || '',
          recipientName: recipient.full_name || 'A member',
          recipientId: recipient.id,
          houseName: recipientHouseName || 'Your House',
          houseId: recipientHouseId,
          linkType: 'business',
        });
      }

      const sentTitle = formData.title;
      const sentContact = formData.contact_name;
      const sentPhone = formData.contact_phone;

      // Clear form
      setFormData({
        title: '',
        description: '',
        contact_name: '',
        contact_phone: '',
        contact_email: '',
        urgency: 1,
      });
      setSelectedMember(null);
      setIsSelf(false);
      setScopeMode('in');
      setOutCountry(null);
      setOutState(null);
      setOutZone(null);
      setOutHouse(null);

      setSuccess({
        title: 'Link sent',
        message: `Your link has been sent to ${recipient.full_name}.`,
        // Shareable receipt: customer name and phone are masked before they can leave the app.
        receipt: {
          kind: 'link',
          headline: sentTitle,
          subline: isSelf ? 'Own business (Self)' : undefined,
          rows: (isSelf
            ? ([
                ['Passed to', recipient.full_name || 'Member'],
                ['Contact', 'Self (own business)'],
              ] as [string, string][])
            : ([
                ['Passed to', recipient.full_name || 'Member'],
                ['Customer', maskName(sentContact)],
                ['Phone', maskPhone(sentPhone)],
              ] as [string, string][])
          ).filter(([, value]) => !!value),
          senderName: profile?.full_name || 'WeVysya member',
          dateText: format(new Date(), 'dd MMM yyyy, h:mm a'),
        },
        details: [
          ['Link', sentTitle],
          ['To', recipient.full_name || 'Member'],
          ...(isSelf ? [] : ([['Contact', sentContact]] as [string, string][])),
        ],
      });
    } catch (error: any) {
      console.error('Error creating link:', error);
      Alert.alert('Error', `Failed to create link: ${error.message || 'Unknown error'}`);
    }
  };

  const filteredMembers = houseMembers.filter((member) =>
    member.full_name?.toLowerCase().includes(memberSearchQuery.trim().toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text_primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
          Link Form
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        {...keyboardDismissProps}>
        <Text style={styles.label}>
          Send to <Text style={styles.required}>*</Text>
        </Text>

        <View style={styles.scopeToggleRow}>
          <TouchableOpacity
            style={[styles.scopeToggleBtn, scopeMode === 'in' && styles.scopeToggleBtnActive]}
            onPress={() => {
              setScopeMode('in');
              setSelectedMember(null);
              setShowMemberPicker(false);
            }}>
            <Text
              style={[
                styles.scopeToggleText,
                scopeMode === 'in' && styles.scopeToggleTextActive,
              ]}>
              In House
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeToggleBtn, scopeMode === 'out' && styles.scopeToggleBtnActive]}
            onPress={() => {
              setScopeMode('out');
              setSelectedMember(null);
              setShowMemberPicker(false);
            }}>
            <Text
              style={[
                styles.scopeToggleText,
                scopeMode === 'out' && styles.scopeToggleTextActive,
              ]}>
              Out House
            </Text>
          </TouchableOpacity>
        </View>

        {scopeMode === 'out' && (
          <View style={styles.cascadeGroup}>
            <View style={styles.cascadeRow}>
              <TouchableOpacity
                style={styles.cascadePicker}
                onPress={() => setOpenCascade(openCascade === 'country' ? null : 'country')}>
                <Text style={[styles.cascadePickerText, !outCountry && styles.cascadePickerPlaceholder]}>
                  {outCountry || 'Select Country'}
                </Text>
                <ChevronDown size={16} color={colors.text_tertiary} />
              </TouchableOpacity>
              {openCascade === 'country' && (
                <ScrollView style={styles.cascadeOptionList} nestedScrollEnabled>
                  {countryOptions.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={styles.cascadeOptionItem}
                      onPress={() => {
                        setOutCountry(c);
                        setOutState(null);
                        setOutZone(null);
                        setOutHouse(null);
                        setSelectedMember(null);
                        setOpenCascade(null);
                      }}>
                      <Text style={styles.cascadeOptionText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {outCountry && (
              <View style={styles.cascadeRow}>
                <TouchableOpacity
                  style={styles.cascadePicker}
                  onPress={() => setOpenCascade(openCascade === 'state' ? null : 'state')}>
                  <Text style={[styles.cascadePickerText, !outState && styles.cascadePickerPlaceholder]}>
                    {outState || 'Select State'}
                  </Text>
                  <ChevronDown size={16} color={colors.text_tertiary} />
                </TouchableOpacity>
                {openCascade === 'state' && (
                  <ScrollView style={styles.cascadeOptionList} nestedScrollEnabled>
                    {stateOptions.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={styles.cascadeOptionItem}
                        onPress={() => {
                          setOutState(s);
                          setOutZone(null);
                          setOutHouse(null);
                          setSelectedMember(null);
                          setOpenCascade(null);
                        }}>
                        <Text style={styles.cascadeOptionText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {outState && (
              <View style={styles.cascadeRow}>
                <TouchableOpacity
                  style={styles.cascadePicker}
                  onPress={() => setOpenCascade(openCascade === 'zone' ? null : 'zone')}>
                  <Text style={[styles.cascadePickerText, !outZone && styles.cascadePickerPlaceholder]}>
                    {outZone || 'Select Zone'}
                  </Text>
                  <ChevronDown size={16} color={colors.text_tertiary} />
                </TouchableOpacity>
                {openCascade === 'zone' && (
                  <ScrollView style={styles.cascadeOptionList} nestedScrollEnabled>
                    {zoneOptions.map((z) => (
                      <TouchableOpacity
                        key={z}
                        style={styles.cascadeOptionItem}
                        onPress={() => {
                          setOutZone(z);
                          setOutHouse(null);
                          setSelectedMember(null);
                          setOpenCascade(null);
                        }}>
                        <Text style={styles.cascadeOptionText}>{z}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {outZone && (
              <View style={styles.cascadeRow}>
                <TouchableOpacity
                  style={styles.cascadePicker}
                  onPress={() => setOpenCascade(openCascade === 'house' ? null : 'house')}>
                  <Text style={[styles.cascadePickerText, !outHouse && styles.cascadePickerPlaceholder]}>
                    {outHouse?.name || 'Select House'}
                  </Text>
                  <ChevronDown size={16} color={colors.text_tertiary} />
                </TouchableOpacity>
                {openCascade === 'house' && (
                  <ScrollView style={styles.cascadeOptionList} nestedScrollEnabled>
                    {houseOptions.map((h) => (
                      <TouchableOpacity
                        key={h.id}
                        style={styles.cascadeOptionItem}
                        onPress={() => {
                          setOutHouse(h);
                          setSelectedMember(null);
                          setOpenCascade(null);
                        }}>
                        <Text style={styles.cascadeOptionText}>{h.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        )}

        {!!activeHouseId && (
          <TouchableOpacity
            style={styles.picker}
            onPress={() => {
              setShowMemberPicker(!showMemberPicker);
              setMemberSearchQuery('');
            }}>
            <User size={20} color={colors.text_secondary} />
            <Text style={styles.pickerText}>
              {selectedMember ? selectedMember.full_name : 'Choose Member'}
            </Text>
          </TouchableOpacity>
        )}

        {showMemberPicker && (
          <ScrollView
            style={styles.memberList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.memberSearchInput}
              placeholder="Search member by name"
              placeholderTextColor={colors.text_tertiary}
              value={memberSearchQuery}
              onChangeText={setMemberSearchQuery}
              returnKeyType="search"
            />
            {houseMembers.length === 0 ? (
              <View style={styles.emptyMemberList}>
                <Text style={styles.emptyMemberText}>
                  No other members found in this house
                </Text>
              </View>
            ) : filteredMembers.length === 0 ? (
              <View style={styles.emptyMemberList}>
                <Text style={styles.emptyMemberText}>No members match your search</Text>
              </View>
            ) : (
              filteredMembers.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.memberItem}
                  onPress={() => {
                    setSelectedMember(member);
                    setShowMemberPicker(false);
                    setMemberSearchQuery('');
                  }}>
                  <Text style={styles.memberName}>{member.full_name}</Text>
                  <Text style={styles.memberDetails}>
                    {member.business_category} • {member.city}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}

        <Text style={styles.label}>
          Title <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          {...field('title')}
          placeholder="Task Header"
          placeholderTextColor={colors.text_tertiary}
          value={formData.title}
          onChangeText={(text) => setFormData({ ...formData, title: text })}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          {...field('description', { multiline: true })}
          placeholder="Task Description"
          placeholderTextColor={colors.text_tertiary}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          multiline
          maxLength={500}
        />
        <Text style={styles.charCount}>{formData.description.length}/500</Text>

        {/* Whose link this is: either the member's own (Self) or a customer's details, grouped in one box. */}
        <View style={styles.contactCard}>
        <Text style={styles.contactCardTitle}>Whose link is this?</Text>
        <SelfToggle
          value={isSelf}
          onChange={setIsSelf}
          hint="Your own lead: the receiver gets your name and number, no customer details needed"
        />

        {!isSelf && (
          <>
        <Text style={styles.label}>
          Contact's Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          {...field('contact_name')}
          placeholder="Contact's Name"
          placeholderTextColor={colors.text_tertiary}
          value={formData.contact_name}
          onChangeText={(text) => setFormData({ ...formData, contact_name: text })}
        />

        <Text style={styles.label}>
          Contact's Phone Number <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          {...field('contact_phone')}
          placeholder="Contact's Phone Number"
          placeholderTextColor={colors.text_tertiary}
          value={formData.contact_phone}
          onChangeText={(text) => setFormData({ ...formData, contact_phone: text })}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Contact's Email</Text>
        <TextInput
          style={styles.input}
          {...field('contact_email')}
          placeholder="Contact's Email"
          placeholderTextColor={colors.text_tertiary}
          value={formData.contact_email}
          onChangeText={(text) => setFormData({ ...formData, contact_email: text })}
          keyboardType="email-address"
          autoCapitalize="none"
        />

          </>
        )}
        </View>

        <Text style={styles.label}>
          Urgency of Requirement <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.urgencyContainer}>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <TouchableOpacity
              key={level}
              onPress={() => setFormData({ ...formData, urgency: level })}
              style={[
                styles.urgencyButton,
                formData.urgency >= level && styles.urgencyButtonActive,
              ]}>
              <Flame
                size={24}
                color={formData.urgency >= level ? colors.accent_red : colors.text_tertiary}
                fill={formData.urgency >= level ? colors.accent_red : 'transparent'}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      <DevelopedByFooter />
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
  contactCard: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    backgroundColor: 'rgba(13, 57, 52, 0.25)',
  },
  contactCardTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.accent_green_bright,
    marginBottom: spacing.md,
  },
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
    fontFamily: 'Poppins-Bold',
    fontSize: 24,
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
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.text_secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  required: {
    color: colors.accent_red,
  },
  input: {
    backgroundColor: colors.card_background,
    borderRadius: 16,
    padding: spacing.md,
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.text_primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: colors.text_tertiary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  scopeToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  scopeToggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.card_background,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scopeToggleBtnActive: {
    backgroundColor: colors.accent_green_bright,
    borderColor: colors.accent_green_bright,
  },
  scopeToggleText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.text_secondary,
  },
  scopeToggleTextActive: {
    color: colors.bg_primary,
  },
  cascadeGroup: {
    marginBottom: spacing.sm,
  },
  cascadeRow: {
    marginTop: spacing.sm,
  },
  cascadePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card_background,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cascadePickerText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_primary,
  },
  cascadePickerPlaceholder: {
    color: colors.text_tertiary,
  },
  cascadeOptionList: {
    backgroundColor: colors.card_background,
    borderRadius: 12,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: 180,
  },
  cascadeOptionItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  cascadeOptionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_primary,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card_background,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.text_secondary,
    marginLeft: spacing.md,
  },
  memberList: {
    backgroundColor: colors.card_background,
    borderRadius: 16,
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
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  memberItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  memberName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  memberDetails: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_tertiary,
  },
  urgencyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  urgencyButton: {
    padding: spacing.sm,
  },
  urgencyButtonActive: {
    opacity: 1,
  },
  submitButton: {
    backgroundColor: colors.accent_green_bright,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  submitButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 18,
    color: colors.bg_primary,
  },
  emptyMemberList: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyMemberText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.text_tertiary,
    textAlign: 'center',
  },
});
