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
    <Stack screenOptions={{ headerShown: false, headerStyle: { backgroundColor: "#0F1117" }, headerTintColor: "#ffffff" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="group-detail"
        options={{ headerShown: true, title: "Group Detail" }}
      />
      <Stack.Screen
        name="create-group"
        options={{ headerShown: true, title: "Create Group" }}
      />
      <Stack.Screen
        name="avatar-builder"
        options={{ headerShown: true, title: "Edit Avatar" }}
      />
    </Stack>
  );
}
