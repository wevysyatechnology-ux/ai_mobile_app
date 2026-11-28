import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Link, Handshake, Users, Grid, CalendarClock, Search, X, MessageCircle } from 'lucide-react-native';
import { colors, spacing } from '@/constants/theme';
import DiscoverSection from '@/components/discover/DiscoverSection';
import MemberSearchResults from '@/components/discover/MemberSearchResults';
import FloatingLogo from '@/components/shared/FloatingLogo';
import { useAuth } from '@/contexts/AuthContext';
import { LinksService } from '@/services/linksService';
import type { User } from '@/types';

import { keyboardDismissProps } from '@/hooks/useFormFields';
export default function Discover() {
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ q?: string; category?: string; city?: string; keyword?: string }>();
  const [houseMembers, setHouseMembers] = useState<User[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchFilters, setSearchFilters] = useState<{ profession?: string; location?: string; query?: string; keyword?: string } | null>(null);

  // Seed the search box from voice-driven navigation (?q=&category=&city=&keyword=)
  useEffect(() => {
    if (params.category || params.city || params.keyword || params.q) {
      cancelPendingSearch();
      setSearchText(params.q || params.category || params.keyword || params.city || '');
      setSearchFilters({ profession: params.category, location: params.city, keyword: params.keyword });
    }
  }, [params.q, params.category, params.city, params.keyword]);

  // Debounce: wait until typing pauses before querying, so "ramesh" is one search, not six.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingSearch = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };
  useEffect(() => cancelPendingSearch, []);

  const runSearch = (text: string) => {
    setSearchText(text);
    cancelPendingSearch();
    const trimmed = text.trim();
    if (!trimmed) {
      setSearchFilters(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setSearchFilters({ query: trimmed });
      searchTimer.current = null;
    }, 400);
  };

  const clearSearch = () => {
    cancelPendingSearch();
    setSearchText('');
    setSearchFilters(null);
  };

  useEffect(() => {
    const loadHouseMembers = async () => {
      if (!profile?.house_id) {
        setHouseMembers([]);
        setMembersLoading(false);
        return;
      }

      try {
        setMembersLoading(true);
        const members = await LinksService.getHouseMembers(profile.house_id);

        const mappedMembers: User[] = members.map((member) => ({
          id: member.id,
          name: member.full_name || 'Member',
          email: '',
          phone_number: member.phone_number,
          category: member.business_category || 'Business',
          location: [member.city, member.state].filter(Boolean).join(', ') || 'Location not set',
          circle: member.vertical_type === 'inner_circle' ? 'inner' : 'open',
          tier: 'regular',
          profile_photo: undefined,
          is_online: false,
          created_at: member.created_at,
        }));

        setHouseMembers(mappedMembers);
      } catch (error) {
        console.error('Error loading house members for Discover:', error);
        setHouseMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    loadHouseMembers();
  }, [profile?.house_id]);

  const quickChannels = [
    {
      slug: 'links',
      icon: Link,
      title: 'Links',
      subtitle: 'Share business links and opportunities',
      color: colors.accent_green_bright,
      route: '/links-form' as const,
    },
    {
      slug: 'deals',
      icon: Handshake,
      title: 'Deals',
      subtitle: 'Share and close transactions',
      color: colors.accent_green_bright,
      route: '/deals-form' as const,
    },
    {
      slug: 'i2we-meetings',
      icon: Users,
      title: 'i2We Meetings',
      subtitle: 'Connect with house members',
      color: colors.accent_green_bright,
      route: '/i2we-form' as const,
    },
    {
      slug: 'event-meetings',
      icon: CalendarClock,
      title: 'Event Meetings',
      subtitle: 'Upcoming & completed house events',
      color: colors.accent_green_bright,
      route: '/event-meetings' as const,
    },
    {
      slug: 'connect-requests',
      icon: MessageCircle,
      title: 'Connect Requests',
      subtitle: 'Manage connection requests & chats',
      color: colors.accent_green_bright,
      route: '/connect-requests' as const,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        {...keyboardDismissProps}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerContainer}>
          <FloatingLogo size="medium" />
          <Text style={styles.header}>Discover</Text>
        </View>

        <View style={styles.searchBarContainer}>
          <Search size={18} color={colors.text_muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, profession or city"
            numberOfLines={1}
            placeholderTextColor={colors.text_muted}
            value={searchText}
            onChangeText={runSearch}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch} hitSlop={8}>
              <X size={18} color={colors.text_muted} />
            </TouchableOpacity>
          )}
        </View>

        {searchFilters ? (
          <MemberSearchResults filters={searchFilters} />
        ) : (
        <>
        <View style={styles.quickChannelsContainer}>
          {quickChannels.map((channel) => {
            const IconComponent = channel.icon;
            return (
              <TouchableOpacity
                key={channel.slug}
                style={styles.quickChannelCard}
                onPress={() => router.push(channel.route)}
                activeOpacity={0.8}
              >
                <View style={styles.quickChannelIconContainer}>
                  <IconComponent size={24} color={channel.color} strokeWidth={2.5} />
                </View>
                <Text style={styles.quickChannelTitle}>{channel.title}</Text>
                <Text style={styles.quickChannelSubtitle}>{channel.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.channelsButton}
          onPress={() => router.push('/channels')}
          activeOpacity={0.7}
        >
          <View style={styles.channelsBadge}>
            <Grid size={24} color="#fff" />
          </View>
          <View style={styles.channelsContent}>
            <Text style={styles.channelsTitle}>All Channels</Text>
            <Text style={styles.channelsSubtitle}>
              Browse all collaboration channels
            </Text>
          </View>
        </TouchableOpacity>

        <DiscoverSection
          title="Members Near You"
          members={houseMembers}
          isLoading={membersLoading}
        />
        <DiscoverSection
          title="Top Professionals"
          members={houseMembers}
          isLoading={membersLoading}
        />
        <DiscoverSection
          title="Recommended for You"
          members={houseMembers}
          isLoading={membersLoading}
        />
        </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_primary,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 160,
  },
  headerContainer: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  header: {
    textAlign: 'center',
    fontSize: 42,
    fontWeight: '900',
    color: colors.text_primary,
    letterSpacing: -1,
    marginTop: spacing.lg,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_secondary,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border_secondary,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text_primary,
    paddingVertical: spacing.sm,
  },
  quickChannelsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  quickChannelCard: {
    width: '47%',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    alignItems: 'center',
  },
  quickChannelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  quickChannelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  quickChannelSubtitle: {
    fontSize: 11,
    color: colors.text_muted,
    textAlign: 'center',
    lineHeight: 14,
  },
  channelsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_secondary,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border_secondary,
  },
  channelsBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  channelsContent: {
    flex: 1,
  },
  channelsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: 4,
  },
  channelsSubtitle: {
    fontSize: 14,
    color: colors.text_secondary,
    lineHeight: 18,
  },
});
