import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// This tells Expo how to show notifications when the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Ask the user for permission and get their push token
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("Push notifications only work on real devices");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Permission not granted for push notifications");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return "granted";
}

// Send a local notification immediately
export async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: null, // null means show immediately
  });
}

// Notification helpers for specific Tally events
export async function notifyNewSharedExpense(
  groupName: string,
  amount: string,
  paidBy: string,
) {
  await sendLocalNotification(
    "💸 New Shared Expense",
    `${paidBy} added GHS ${amount} to ${groupName}`,
  );
}

export async function notifyBudgetWarning(
  category: string,
  percentage: number,
) {
  await sendLocalNotification(
    "⚠️ Budget Warning",
    `You've used ${percentage.toFixed(0)}% of your ${category} budget`,
  );
}

export async function notifySettleUp(userName: string, amount: string) {
  await sendLocalNotification(
    "✅ Settled Up",
    `${userName} has settled GHS ${amount} with you`,
  );
}
