import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0F1117',
        },
        headerTintColor: '#ffffff',
        headerShown: false,
      }}
    />
  );
}