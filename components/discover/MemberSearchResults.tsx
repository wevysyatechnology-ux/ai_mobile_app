import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '@/constants/theme';
import MemberCard from './MemberCard';
import { searchMembers, type MemberSearchFilters } from '@/services/memberSearchService';
import type { User } from '@/types';

interface MemberSearchResultsProps {
  filters: MemberSearchFilters;
}

export default function MemberSearchResults({ filters }: MemberSearchResultsProps) {
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const runSearch = async () => {
      setIsLoading(true);
      setError(false);
      try {
        const results = await searchMembers(filters);
        if (cancelled) return;

        setMembers(
          results.map((member) => ({
            id: member.id,
            name: member.full_name || 'Member',
            email: '',
            phone_number: member.phone_number,
            category: member.business_category || 'Business',
            location: member.city || 'Location not set',
            circle: 'open',
            tier: 'regular',
            profile_photo: member.profile_photo || undefined,
            is_online: false,
            created_at: '',
          }))
        );
      } catch (err) {
        console.error('Member search failed:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    runSearch();
    return () => {
      cancelled = true;
    };
  }, [filters.profession, filters.location, filters.query, filters.keyword]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search Results</Text>
      {isLoading ? (
        <Text style={styles.emptyText}>Searching members...</Text>
      ) : error ? (
        <Text style={styles.emptyText}>Something went wrong while searching. Please try again.</Text>
      ) : members.length === 0 ? (
        <Text style={styles.emptyText}>No members found matching your search.</Text>
      ) : (
        <View style={styles.list}>
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </View>
      )}
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
    paddingHorizontal: spacing.lg,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: 'Poppins-Regular',
    fontSize: fontSize.sm,
    color: colors.text_muted,
    paddingHorizontal: spacing.lg,
  },
});
