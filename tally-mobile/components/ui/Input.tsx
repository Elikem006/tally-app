import { useState, forwardRef } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rightElement?: React.ReactNode;
}

/**
 * Persistent label (always visible above the field, not a floating label
 * that collapses in), accent-colored focus ring, inline error text below.
 * `keyboardType` should be passed per use — this component doesn't guess it.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, containerStyle, rightElement, onFocus, onBlur, style, ...textInputProps },
  ref,
) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.negative : focused ? colors.primary : colors.border;

  return (
    <View style={containerStyle}>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.inputBg,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      >
        <TextInput
          ref={ref}
          style={[typography.body, styles.input, { color: colors.text }, style]}
          placeholderTextColor={colors.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          {...textInputProps}
        />
        {rightElement}
      </View>
      {!!error && (
        <Text style={[typography.caption, { color: colors.negative, marginTop: spacing.xs }]}>
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
  },
});
