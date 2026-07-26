import { View, Text, StyleProp, ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, getCategoryColor } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';

// Single source of truth for category → icon. Retires the 204 emoji used
// as category markers across index.tsx / history.tsx / budget.tsx /
// ExpenseDetailModal's separately-maintained, drifted copy of this map.
const CATEGORY_ICON_NAMES: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Food: 'food-fork-drink',
  Transport: 'car',
  Entertainment: 'movie-open-outline',
  Utilities: 'lightning-bolt-outline',
  Other: 'shape-outline',
  Shared: 'account-group-outline',
  Settlement: 'handshake-outline',
};

const DEFAULT_ICON: keyof typeof MaterialCommunityIcons.glyphMap = 'tag-outline';

export function getCategoryIconName(categoryName: string | null | undefined) {
  return CATEGORY_ICON_NAMES[categoryName || 'Other'] ?? DEFAULT_ICON;
}

interface CategoryIconProps {
  category: string;
  /** User-chosen emoji for a custom category. Ignored for built-ins, which always render the vector glyph. */
  customEmoji?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** A circular, category-colored icon chip — no text. */
export function CategoryIcon({ category, customEmoji, size = 40, style }: CategoryIconProps) {
  const color = getCategoryColor(category);
  const iconName = getCategoryIconName(category);
  const showCustomEmoji = !CATEGORY_ICON_NAMES[category] && customEmoji;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}22`,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${category} category`}
    >
      {showCustomEmoji ? (
        <Text style={{ fontSize: size * 0.45 }}>{customEmoji}</Text>
      ) : (
        <MaterialCommunityIcons name={iconName} size={size * 0.5} color={color} />
      )}
    </View>
  );
}

interface CategoryBadgeProps {
  category: string;
  customEmoji?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Icon + label pill — category filter chips, expense list rows. */
export function CategoryBadge({ category, customEmoji, style }: CategoryBadgeProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const color = getCategoryColor(category);
  const iconName = getCategoryIconName(category);
  const showCustomEmoji = !CATEGORY_ICON_NAMES[category] && customEmoji;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingVertical: 6,
          paddingHorizontal: spacing.sm + 2,
          borderRadius: radius.pill,
          backgroundColor: `${color}1F`,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${category} category`}
    >
      {showCustomEmoji ? (
        <Text style={{ fontSize: 14 }}>{customEmoji}</Text>
      ) : (
        <MaterialCommunityIcons name={iconName} size={14} color={color} />
      )}
      <Text style={[typography.label, { color }]}>{category}</Text>
    </View>
  );
}
