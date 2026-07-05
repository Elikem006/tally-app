import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupAPI } from '../../services/api';
import { getUserId } from '../../services/storage';
import { useTheme } from '../../hooks/useTheme';

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
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
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
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
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchGroups(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {/* Card container */}
      <View style={[styles.mainCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>My Groups</Text>

        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.neutralBg }]}>
              <Text style={styles.emptyIcon}>👥</Text>
            </View>
            <Text style={[styles.emptyText, { color: colors.text }]}>No groups yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Create a group to start splitting and tracking shared expenses with friends
            </Text>
          </View>
        ) : (
          <View style={styles.groupList}>
            {groups.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.groupCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: "/group-detail",
                    params: { groupId: String(item.id), groupName: item.name },
                  })
                }
                activeOpacity={0.8}
              >
                <View style={styles.groupLeft}>
                  <View style={[styles.groupAvatar, { backgroundColor: colors.neutralBg }]}>
                    <Text style={[styles.groupAvatarText, { color: colors.textSecondary }]}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={[styles.groupName, { color: colors.text }]}>{item.name}</Text>
                    {groupSummaries[String(item.id)] ? (
                      <Text style={[styles.groupSub, { color: colors.textSecondary }]}>
                        👥 {groupSummaries[String(item.id)].memberCount} members • GHS {groupSummaries[String(item.id)].total.toFixed(2)} total
                      </Text>
                    ) : (
                      <Text style={[styles.groupSub, { color: colors.textSecondary }]}>Loading details...</Text>
                    )}
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textSecondary} style={styles.arrow} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/create-group')}
          activeOpacity={0.85}
        >
          <Text style={styles.createButtonText}>+ Create Group</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
  },
  centered: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // Main card container
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E9AA6',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  groupList: {
    marginBottom: 16,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  groupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  groupAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 3,
  },
  groupSub: {
    fontSize: 12,
    color: '#8E9AA6',
  },
  arrow: {
    marginLeft: 8,
  },
  createButton: {
    backgroundColor: '#111111', // Black rounded button
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#8E9AA6',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
