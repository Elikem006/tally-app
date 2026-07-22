import { Stack, useRouter } from "expo-router";
import { registerForPushNotifications } from "../services/notifications";
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Notifications from "expo-notifications";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeProvider } from "../hooks/useTheme";

/** Red banner pinned to the top whenever the device loses connectivity. */
function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;
  return (
    <View style={[styles.offlineBanner, { paddingTop: Math.max(insets.top, 8) }]}>
      <Text style={styles.offlineText}>📡 No internet connection — showing cached data</Text>
    </View>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const responseListener = useRef<any>(null);
  const navigationReady = useRef(false);

  // Mark navigation as ready after first render
  useEffect(() => {
    navigationReady.current = true;
  }, []);

  // Register for push notifications
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Handle notification tap — navigate to correct screen
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (!data || !navigationReady.current) return;

      // Small delay to ensure navigation stack is mounted
      setTimeout(() => {
        if (data.screen === "group-detail" && data.groupId) {
          router.push({ pathname: "/group-detail", params: { groupId: String(data.groupId) } });
        } else if (data.screen === "budget-overview" || data.screen === "budget") {
          router.push("/(tabs)/budget");
        } else if (data.screen === "reminders") {
          router.push("/(tabs)/reminders");
        } else if (data.screen === "report") {
          router.push("/(tabs)/report");
        } else if (data.screen === "groups") {
          router.push("/(tabs)/groups");
        } else if (data.screen === "history") {
          router.push("/(tabs)/history");
        }
      }, 500);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            // Dark header to match the app's dark theme (used by the few
            // screens with headerShown: true, e.g. Manage Categories).
            headerStyle: { backgroundColor: "#0F1117" },
            headerTintColor: "#FFFFFF",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="group-detail"
            options={{ headerShown: false, title: "Group Detail" }}
          />
          <Stack.Screen
            name="create-group"
            options={{ headerShown: false, title: "Create Group" }}
          />
          <Stack.Screen
            name="avatar-builder"
            options={{ headerShown: true, title: "Edit Avatar" }}
          />
          <Stack.Screen
            name="help"
            options={{ headerShown: false, title: "Help & Support" }}
          />
          <Stack.Screen
            name="manage-categories"
            options={{ headerShown: true, title: "Manage Categories" }}
          />
          <Stack.Screen
            name="pay-vendor"
            options={{ headerShown: false, title: "Pay Vendor" }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, title: "Welcome" }}
          />
        </Stack>
        <OfflineBanner />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#E05C5C",
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  offlineText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
