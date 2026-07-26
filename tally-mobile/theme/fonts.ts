import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

/**
 * Loads exactly the 4 static Inter weights the type scale uses. Returns
 * [fontsLoaded, fontError] like the underlying useFonts — callers are
 * responsible for holding the splash screen open until fontsLoaded (or
 * fontError) is true; see _layout.tsx. Loading fewer weights than the
 * scale needs would silently fall back to a nearby weight via font
 * matching, so this list must stay in sync with theme/typography.ts's
 * FONT_FAMILY map.
 */
export function useAppFonts() {
  return useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
}
