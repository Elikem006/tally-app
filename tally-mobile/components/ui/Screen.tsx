import { ReactNode } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
  RefreshControlProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { spacing } from '../../theme/spacing';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. Off for screens that manage their own scrolling (e.g. FlatList-driven). */
  scroll?: boolean;
  /** Wrap in KeyboardAvoidingView — screens with a text input at the bottom. */
  keyboardAvoiding?: boolean;
  /** Apply the standard horizontal content padding. Off for edge-to-edge layouts. */
  padded?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Replaces the `View > ScrollView > insets` boilerplate repeated across every
 * screen. Handles safe-area top/bottom, standard horizontal padding, optional
 * scroll + keyboard avoidance, and reads background color from the theme so
 * no screen needs to set it manually.
 */
export function Screen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  padded = true,
  refreshControl,
  contentStyle,
  style,
}: ScreenProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const insets = useSafeAreaInsets();

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        {
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingBottom: insets.bottom + spacing.xxl,
          paddingHorizontal: padded ? spacing.lg : 0,
        },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flex,
        {
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingBottom: insets.bottom,
          paddingHorizontal: padded ? spacing.lg : 0,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  const withBackground = (
    <View style={[styles.flex, { backgroundColor: colors.background }, style]}>{content}</View>
  );

  if (!keyboardAvoiding) return withBackground;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {withBackground}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
