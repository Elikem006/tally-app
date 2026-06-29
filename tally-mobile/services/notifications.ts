import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { addHistoryItem } from "./notificationHistory";

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

// Send a local notification immediately with optional navigation data
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: data ?? {},
    },
    trigger: null, // null means show immediately
  });
}

// Notification helpers for specific Tally events

export async function notifyNewSharedExpense(
  groupId: string,
  payerName: string,
  amount: string,
  description?: string,
) {
  const body = description
    ? `${payerName} added GHS ${amount} for "${description}"`
    : `${payerName} added GHS ${amount} to the group`;
  await sendLocalNotification("💸 New Shared Expense", body, {
    screen: "group-detail",
    groupId: String(groupId),
  });
  await addHistoryItem({
    type: "shared_expense",
    title: "💸 New Shared Expense",
    body,
    data: { screen: "group-detail", groupId: String(groupId) },
  });
}

export async function notifyBudgetWarning(
  category: string,
  percentage: number,
) {
  await sendLocalNotification(
    "⚠️ Budget Warning",
    `You've used ${percentage.toFixed(0)}% of your ${category} budget`,
    { screen: "budget-overview" },
  );
}

export async function notifySettleUp(groupName: string, payerName: string) {
  const body = `${payerName} has settled up in ${groupName}`;
  await sendLocalNotification("✅ Settled Up", body, { screen: "groups" });
  await addHistoryItem({
    type: "settle_up",
    title: "✅ Settled Up",
    body,
    data: { screen: "groups" },
  });
}

export async function notifyReminderDue(title: string, dueDate: string) {
  await sendLocalNotification(
    "🔔 Reminder Due",
    `"${title}" is due on ${dueDate}`,
    { screen: "reminders" },
  );
}

export async function notifyMonthlyReport(month: string, totalSpent: string) {
  const body = `Your ${month} spending report is ready — GHS ${totalSpent} total`;
  await sendLocalNotification("📊 Monthly Report Ready", body, { screen: "report" });
  await addHistoryItem({
    type: "monthly_report",
    title: "📊 Monthly Report Ready",
    body,
    data: { screen: "report" },
  });
}
