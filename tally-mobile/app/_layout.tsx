import { Stack } from "expo-router";
import { registerForPushNotifications } from "../services/notifications";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications().then((result) => {
      console.log("Notification permission:", result);
    });
  }, []);
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
