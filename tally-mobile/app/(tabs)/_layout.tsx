import { Tabs } from 'expo-router';
import { Redirect } from 'expo-router';

export default function TabLayout() {
  const isLoggedIn = true;

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#00C896',
        tabBarInactiveTintColor: '#8890A0',
        tabBarStyle: {
          backgroundColor: '#0F1117',
          borderTopColor: '#ffffff15',
        },
        headerStyle: {
          backgroundColor: '#0F1117',
        },
        headerTintColor: '#ffffff',
        headerShown: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="add" options={{ title: 'Add Expense', tabBarLabel: 'Add' }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarLabel: 'History' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
    </Tabs>
  );
}