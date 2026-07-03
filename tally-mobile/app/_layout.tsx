import { Stack, useRouter } from "expo-router";
import { registerForPushNotifications } from "../services/notifications";
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../hooks/useTheme";

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
    registerForPushNotifications().then((result) => {
      console.log("Notification permission:", result);
    });
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
            headerStyle: { backgroundColor: "#ffffff" },
            headerTintColor: "#1E293B",
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
            options={{ headerShown: true, title: "Help & Support" }}
          />
        </Stack>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
