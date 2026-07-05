import { memo } from "react";
import { View, Text, Image, StyleProp, ViewStyle, ImageStyle } from "react-native";

const AVATAR_COLORS = [
  "#00C896", "#2563EB", "#7C3AED", "#DB2777",
  "#EA580C", "#65A30D", "#0891B2", "#9333EA",
];

interface AvatarProps {
  userId: number | string;
  name: string;
  size?: number;
  avatarData?: string | null;
  style?: StyleProp<ViewStyle & ImageStyle>;
}

function Avatar({ userId, name, size = 40, avatarData, style }: AvatarProps) {
  const radius = size / 2;

  if (avatarData && avatarData.startsWith("data:image")) {
    return (
      <Image
        source={{ uri: avatarData }}
        style={[{ width: size, height: size, borderRadius: radius }, style]}
      />
    );
  }

  const colorIndex = (Number(userId) || 0) % AVATAR_COLORS.length;
  const initial    = (name || "?").charAt(0).toUpperCase();

  return (
    <View style={[{
      width: size, height: size, borderRadius: radius,
      backgroundColor: AVATAR_COLORS[colorIndex],
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }, style]}>
      <Text style={{ color: "#ffffff", fontWeight: "bold", fontSize: size * 0.38 }}>
        {initial}
      </Text>
    </View>
  );
}

// Memoized — avatars render inside long lists and their props rarely change
export default memo(Avatar);
