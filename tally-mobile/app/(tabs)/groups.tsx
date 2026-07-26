import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupAPI } from '../../services/api';
import { getUserId } from '../../services/storage';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Button, EmptyState, ListRow, Skeleton } from '../../components/ui';

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupSummaries, setGroupSummaries] = useState<{ [key: string]: { total: number; memberCount: number } }>({});

  useFocusEffect(
    useCallback(() => {
      fetchGroups(true);
    }, [])
  );

  async function fetchGroups(showLoading = true) {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const response = await groupAPI.getUserGroups(userId);
      const groupsData = response.data || [];
      setGroups(groupsData);

      // Fetch details for each group to get totals and member counts
      for (const group of groupsData) {
        try {
          const detailRes = await groupAPI.getGroupDetails(String(group.id));
          const details = detailRes.data;
          const total = (details.expenses || []).reduce(
            (sum: number, e: any) => sum + parseFloat(e.amount),
            0,
          );
          const summary = { total, memberCount: (details.members || []).length };
          setGroupSummaries((prev) => ({
            ...prev,
            [String(group.id)]: summary,
          }));
        } catch {
          // Non-critical — that group card just shows without totals
        }
      }
    } catch (err: any) {
      setError('Failed to load groups. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchGroups(false);
    setRefreshing(false);
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: Math.max(insets.top, spacing.xl) }]}>
        <Skeleton width="45%" height={26} borderRadius={radius.sm} style={{ marginBottom: spacing.xl }} />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} height={92} borderRadius={radius.xl} style={{ marginBottom: spacing.sm }} />
        ))}
      </View>
    );
  }

  if (error && groups.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Feather name="alert-triangle" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.lg }} />
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>{error}</Text>
        <Button title="Retry" onPress={() => fetchGroups(true)} fullWidth={false} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <View style={[styles.mainCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
        <Text style={[typography.display, { color: colors.text, marginBottom: spacing.lg }]}>My Groups</Text>

        {groups.length === 0 ? (
          <EmptyState
            icon="users"
            title="No groups yet"
            body="Create a group to start splitting and tracking shared expenses with friends"
          />
        ) : (
          <View style={{ marginBottom: spacing.md }}>
            {groups.map((item) => {
              const summary = groupSummaries[String(item.id)];
              return (
                <View key={item.id} style={[styles.groupCardWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <ListRow
                    leading={
                      <View style={[styles.groupAvatar, { backgroundColor: colors.neutralBg, borderColor: colors.borderSubtle }]}>
                        <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    }
                    title={item.name}
                    subtitle={
                      summary
                        ? `👥 ${summary.memberCount} members • GHS ${summary.total.toFixed(2)} total`
                        : 'Loading details...'
                    }
                    trailing={<Feather name="chevron-right" size={18} color={colors.textSecondary} />}
                    onPress={() =>
                      router.push({
                        pathname: '/group-detail',
                        params: { groupId: String(item.id), groupName: item.name },
                      })
                    }
                    style={{ paddingHorizontal: spacing.sm }}
                  />
                </View>
              );
            })}
          </View>
        )}

        <Button title="+ Create Group" onPress={() => router.push('/create-group')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  mainCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  groupCardWrap: {
    borderRadius: radius.xl,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
