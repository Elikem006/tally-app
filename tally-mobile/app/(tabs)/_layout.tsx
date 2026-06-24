import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { currentUser } from "../(auth)/login";

export default function TabLayout() {
  const isLoggedIn = currentUser.token !== "";

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#00C896",
        tabBarInactiveTintColor: "#8890A0",
        tabBarStyle: {
          backgroundColor: "#0F1117",
          borderTopColor: "#ffffff15",
        },
        headerStyle: {
          backgroundColor: "#0F1117",
        },
        headerTintColor: "#ffffff",
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: "Add Expense",
          tabBarLabel: "Add",
          tabBarIcon: ({ color }) => <TabIcon emoji="➕" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarLabel: "History",
          tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: "Budget",
          tabBarLabel: "Budget",
          tabBarIcon: ({ color }) => <TabIcon emoji="💰" color={color} />,
        }}
      />
      <Tabs.Screen
        name="budget-overview"
        options={{
          title: "Overview",
          tabBarLabel: "Overview",
          tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarLabel: "Groups",
          tabBarIcon: ({ color }) => <TabIcon emoji="👥" color={color} />,
        }}
      />
      <Tabs.Screen name="group-detail" options={{ href: null }} />
      <Tabs.Screen name="create-group" options={{ href: null }} />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require("react-native");
  return (
    <Text style={{ fontSize: 20, opacity: color === "#00C896" ? 1 : 0.5 }}>
      {emoji}
    </Text>
  );
}
