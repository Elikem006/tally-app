import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { groupAPI } from "../../services/api";
import { getUserId } from "../../services/storage";

export default function GroupsScreen() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupSummaries, setGroupSummaries] = useState<{ [key: number]: { total: number; memberCount: number } }>({});

  useFocusEffect(
    useCallback(() => {
      fetchGroups();
    }, []),
  );

  async function fetchGroups() {
    try {
      const userId = getUserId();
      const response = await groupAPI.getUserGroups(userId);
      setGroups(response.data);
      setError(null);

      // Fetch details for each group to get totals and member counts
      for (const group of response.data) {
        try {
          const detailRes = await groupAPI.getGroupDetails(String(group.id));
          const details = detailRes.data;
          const total = (details.expenses || []).reduce(
            (sum: number, e: any) => sum + parseFloat(e.amount),
            0,
          );
          const summary = { total, memberCount: (details.members || []).length };
          console.log(`Group ${group.id} summary:`, summary);
          setGroupSummaries((prev) => ({
            ...prev,
            [String(group.id)]: summary,
          }));
        } catch {
          // silently skip — card will show "Loading..."
        }
      }
    } catch (err) {
      setError("Something went wrong. Pull down to refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchGroups();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (error && groups.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {groups.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
        >
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No groups yet</Text>
          <Text style={styles.emptySubtext}>
            Create a group to split expenses with friends
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push("/create-group")}
          >
            <Text style={styles.createButtonText}>Create Your First Group</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <FlatList
            data={groups}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            extraData={groupSummaries}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.groupCard}
                onPress={() =>
                  router.push({
                    pathname: "/group-detail",
                    params: { groupId: String(item.id), groupName: item.name },
                  })
                }
              >
                <View style={styles.groupAvatar}>
                  <Text style={styles.groupAvatarText}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  {groupSummaries[String(item.id)] ? (
                    <View style={styles.groupMeta}>
                      <Text style={styles.groupMetaText}>
                        👥 {groupSummaries[String(item.id)].memberCount} members
                      </Text>
                      <Text style={styles.groupMetaAmount}>
                        GHS {groupSummaries[String(item.id)].total.toFixed(2)} total
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.groupSub}>Loading...</Text>
                  )}
                </View>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push("/create-group")}
          >
            <Text style={styles.createButtonText}>+ Create Group</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#E05C5C",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#8890A0",
    textAlign: "center",
    marginBottom: 32,
  },
  list: {
    padding: 16,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  groupAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#00C89620",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    borderWidth: 1,
    borderColor: "#00C89640",
  },
  groupAvatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#00C896",
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 3,
  },
  groupSub: {
    fontSize: 12,
    color: "#8890A0",
  },
  groupMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  groupMetaText: {
    fontSize: 12,
    color: "#8890A0",
  },
  groupMetaAmount: {
    fontSize: 12,
    color: "#00C896",
    fontWeight: "600",
  },
  arrow: {
    fontSize: 22,
    color: "#8890A0",
  },
  createButton: {
    margin: 16,
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  createButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
});
