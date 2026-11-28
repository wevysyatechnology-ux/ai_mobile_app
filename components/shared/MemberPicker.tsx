import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronDown, User } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import { LinksService } from '@/services/linksService';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types/database';

type Scope = 'in' | 'out';
type CascadeLevel = 'country' | 'state' | 'zone' | 'house';

interface HouseOption {
  id: string;
  name: string;
  country: string;
  state: string;
  zone: string;
}

export type PickedMember = Pick<UserProfile, 'id' | 'full_name'> & Partial<UserProfile>;

interface MemberPickerProps {
  label: string;
  value: PickedMember | null;
  onChange: (member: PickedMember | null) => void;
  /** An extra, non-member choice shown at the end of the list (e.g. "WeVysya" for deals). */
  extraOption?: { id: string; full_name: string; description: string };
}

/**
 * Member chooser for the Link / Deal / I2We forms: "In House" lists the member's own house;
 * "Out House" lets them drill down country -> state -> zone -> house to reach members of any other
 * house. Both have a name search. Members come from the get_house_members RPC, which works for any
 * house id (and already hides ineligible/suspended members and the signed-in member).
 */
export default function MemberPicker({ label, value, onChange, extraOption }: MemberPickerProps) {
  const [scope, setScope] = useState<Scope>('in');
  const [ownHouse, setOwnHouse] = useState<any>(null);
  const [allHouses, setAllHouses] = useState<HouseOption[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [outHouse, setOutHouse] = useState<HouseOption | null>(null);
  const [openCascade, setOpenCascade] = useState<CascadeLevel | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showList, setShowList] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const own = await LinksService.getUserHouses();
        if (own.length > 0) setOwnHouse(own[0]);
      } catch {
        Alert.alert('Error', 'Failed to load houses');
      }
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
    })();
  }, []);

  const activeHouseId: string | undefined = scope === 'in' ? ownHouse?.id : outHouse?.id;

  useEffect(() => {
    if (!activeHouseId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    LinksService.getHouseMembers(activeHouseId)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((error: any) => {
        if (!cancelled) Alert.alert('Error', `Failed to load members: ${error?.message || 'Unknown error'}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeHouseId]);

  const countries = useMemo(() => Array.from(new Set(allHouses.map((h) => h.country))).sort(), [allHouses]);
  const states = useMemo(
    () => (country ? Array.from(new Set(allHouses.filter((h) => h.country === country).map((h) => h.state))).sort() : []),
    [allHouses, country]
  );
  const zones = useMemo(
    () =>
      country && stateName
        ? Array.from(new Set(allHouses.filter((h) => h.country === country && h.state === stateName).map((h) => h.zone))).sort()
        : [],
    [allHouses, country, stateName]
  );
  const houseOptions = useMemo(
    () =>
      country && stateName && zone
        ? allHouses.filter((h) => h.country === country && h.state === stateName && h.zone === zone)
        : [],
    [allHouses, country, stateName, zone]
  );

  const filtered = members.filter((m) => m.full_name?.toLowerCase().includes(query.trim().toLowerCase()));

  const switchScope = (next: Scope) => {
    setScope(next);
    onChange(null);
    setShowList(false);
    setOpenCascade(null);
  };

  const pick = (member: PickedMember) => {
    onChange(member);
    setShowList(false);
    setQuery('');
  };

  const cascade = (
    level: CascadeLevel,
    selected: string | null,
    placeholder: string,
    options: { key: string; label: string; onSelect: () => void }[]
  ) => (
    <View style={styles.cascadeRow}>
      <TouchableOpacity style={styles.cascadePicker} onPress={() => setOpenCascade(openCascade === level ? null : level)}>
        <Text style={[styles.cascadePickerText, !selected && styles.placeholder]}>{selected || placeholder}</Text>
        <ChevronDown size={16} color={colors.text_tertiary} />
      </TouchableOpacity>
      {openCascade === level && (
        <ScrollView style={styles.optionList} nestedScrollEnabled>
          {options.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={styles.optionItem}
              onPress={() => {
                o.onSelect();
                onChange(null);
                setOpenCascade(null);
              }}>
              <Text style={styles.optionText}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View>
      <Text style={styles.label}>
        {label} <Text style={styles.required}>*</Text>
      </Text>

      <View style={styles.scopeRow}>
        {(['in', 'out'] as Scope[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.scopeBtn, scope === s && styles.scopeBtnActive]}
            onPress={() => switchScope(s)}>
            <Text style={[styles.scopeText, scope === s && styles.scopeTextActive]}>
              {s === 'in' ? 'In House' : 'Out House'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {scope === 'out' && (
        <View style={styles.cascadeGroup}>
          {cascade(
            'country',
            country,
            'Select Country',
            countries.map((c) => ({
              key: c,
              label: c,
              onSelect: () => {
                setCountry(c);
                setStateName(null);
                setZone(null);
                setOutHouse(null);
              },
            }))
          )}
          {country &&
            cascade(
              'state',
              stateName,
              'Select State',
              states.map((s) => ({
                key: s,
                label: s,
                onSelect: () => {
                  setStateName(s);
                  setZone(null);
                  setOutHouse(null);
                },
              }))
            )}
          {stateName &&
            cascade(
              'zone',
              zone,
              'Select Zone',
              zones.map((z) => ({
                key: z,
                label: z,
                onSelect: () => {
                  setZone(z);
                  setOutHouse(null);
                },
              }))
            )}
          {zone &&
            cascade(
              'house',
              outHouse?.name || null,
              'Select House',
              houseOptions.map((h) => ({ key: h.id, label: h.name, onSelect: () => setOutHouse(h) }))
            )}
        </View>
      )}

      {(!!activeHouseId || !!extraOption) && (
        <TouchableOpacity
          style={styles.picker}
          onPress={() => {
            setShowList(!showList);
            setQuery('');
          }}>
          <User size={20} color={colors.text_secondary} />
          <Text style={styles.pickerText}>{value ? value.full_name : 'Choose Member'}</Text>
        </TouchableOpacity>
      )}

      {showList && (
        <ScrollView style={styles.memberList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.searchInput}
            placeholder="Search member by name"
            placeholderTextColor={colors.text_tertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {loadingMembers ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Loading members…</Text>
            </View>
          ) : members.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No other members found in this house</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No members match your search</Text>
            </View>
          ) : (
            filtered.map((member) => (
              <TouchableOpacity key={member.id} style={styles.memberItem} onPress={() => pick(member)}>
                <Text style={styles.memberName}>{member.full_name}</Text>
                <Text style={styles.memberDetails}>
                  {[member.business_category, member.city].filter(Boolean).join(' • ')}
                </Text>
              </TouchableOpacity>
            ))
          )}
          {extraOption ? (
            <TouchableOpacity
              style={styles.memberItem}
              onPress={() => pick({ id: extraOption.id, full_name: extraOption.full_name })}>
              <Text style={styles.memberName}>{extraOption.full_name}</Text>
              <Text style={styles.memberDetails}>{extraOption.description}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.text_secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  required: { color: colors.accent_red },
  scopeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  scopeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.card_background,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scopeBtnActive: { backgroundColor: colors.accent_green_bright, borderColor: colors.accent_green_bright },
  scopeText: { fontFamily: 'Poppins-Medium', fontSize: 14, color: colors.text_secondary },
  scopeTextActive: { color: colors.bg_primary },
  cascadeGroup: { marginBottom: spacing.sm },
  cascadeRow: { marginTop: spacing.sm },
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
  cascadePickerText: { fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text_primary },
  placeholder: { color: colors.text_tertiary },
  optionList: {
    backgroundColor: colors.card_background,
    borderRadius: 12,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: 180,
  },
  optionItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionText: { fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text_primary },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card_background,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerText: { fontFamily: 'Poppins-Regular', fontSize: 16, color: colors.text_secondary, marginLeft: spacing.md },
  memberList: {
    backgroundColor: colors.card_background,
    borderRadius: 16,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: 240,
  },
  searchInput: {
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
  memberItem: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
  memberName: { fontFamily: 'Poppins-Medium', fontSize: 16, color: colors.text_primary, marginBottom: spacing.xs },
  memberDetails: { fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text_tertiary },
  empty: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text_tertiary, textAlign: 'center' },
});
