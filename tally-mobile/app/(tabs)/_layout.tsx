import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { currentUser } from "../(auth)/login";
import { TouchableOpacity, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

export default function TabLayout() {
  const isLoggedIn = currentUser.token !== "";

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#111111',
        tabBarInactiveTintColor: '#8E9AA6',
        tabBarShowLabel: false, // Hide labels for clean modern look
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#EAEBEF',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ focused }) => <TabIcon name="users" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarButton: (props) => {
            return (
              <TouchableOpacity
                onPress={props.onPress || undefined}
                onLongPress={props.onLongPress || undefined}
                accessibilityState={props.accessibilityState || undefined}
                accessibilityRole={props.accessibilityRole}
                style={styles.customAddButton}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={24} color="#ffffff" />
              </TouchableOpacity>
            );
          },
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: ({ focused }) => <TabIcon name="pie-chart" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => <TabIcon name="list" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, focused }: { name: keyof typeof Feather.glyphMap; focused: boolean }) {
  return (
    <View style={styles.iconContainer}>
      <Feather 
        name={name} 
        size={22} 
        color={focused ? '#111111' : '#8E9AA6'} 
      />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  customAddButton: {
    top: -15,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111111',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    width: 40,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111111',
    position: 'absolute',
    bottom: 0,
  },
});
