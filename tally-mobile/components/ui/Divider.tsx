import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';

export function Divider({ subtle = false, style }: { subtle?: boolean; style?: ViewStyle }) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  return <View style={[{ height: 1, backgroundColor: subtle ? colors.borderSubtle : colors.border }, style]} />;
}
