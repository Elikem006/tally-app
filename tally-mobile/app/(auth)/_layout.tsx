import { Stack } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerShown: false,
      }}
    />
  );
}
