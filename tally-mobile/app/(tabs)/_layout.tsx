import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { currentUser } from "../../services/storage";
import { TouchableOpacity, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { radius } from "../../theme";

export default function TabLayout() {
  const isLoggedIn = currentUser.token !== "";
  const { colors } = useTheme();

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarShowLabel: false, // Hide labels for clean modern look
        tabBarStyle: {
          backgroundColor: colors.cardBg,
          borderTopColor: colors.border,
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
                accessibilityRole={props.accessibilityRole ?? 'button'}
                accessibilityLabel="Add"
                style={[styles.customAddButton, { backgroundColor: colors.primary, borderColor: colors.cardBg }]}
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
      
      {/* Hidden Screens accessible via navigation links in the app */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, focused }: { name: keyof typeof Feather.glyphMap; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.iconContainer}>
      <Feather 
        name={name} 
        size={22} 
        color={focused ? colors.text : colors.textSecondary} 
      />
      {focused && <View style={[styles.activeDot, { backgroundColor: colors.text }]} />}
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
    borderRadius: radius.pill,
    borderWidth: 3,
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
    position: 'absolute',
    bottom: 0,
  },
});
