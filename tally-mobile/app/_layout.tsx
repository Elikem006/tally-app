import { Stack } from "expo-router";
import { registerForPushNotifications } from "../services/notifications";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications().then((result) => {
      console.log("Notification permission:", result);
    });
  }, []);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
