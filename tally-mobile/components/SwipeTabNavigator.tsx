import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationOptions,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabBarProps,
} from "@react-navigation/material-top-tabs";
import { ParamListBase, TabNavigationState } from "@react-navigation/native";
import { withLayoutContext } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

/**
 * Expo-router-compatible Material Top Tabs navigator.
 *
 * Material top tabs render screens inside react-native-pager-view, which is a
 * real native pager: pages track the finger in real time, snap with native
 * physics (velocity-aware), and disambiguate horizontal page swipes from
 * vertical ScrollView scrolling at the native gesture level.
 */
const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

/** Titles, tab labels and icons for every tab, in swipe order. */
export const TAB_META: Record<string, { title: string; label: string; emoji: string }> = {
  "index":           { title: "Home",            label: "Home",      emoji: "🏠" },
  "add":             { title: "Add Expense",     label: "Add",       emoji: "➕" },
  "history":         { title: "History",         label: "History",   emoji: "📋" },
  "budget":          { title: "Budget",          label: "Budget",    emoji: "💰" },
  "budget-overview": { title: "Budget Overview", label: "Overview",  emoji: "📊" },
  "report":          { title: "Report",          label: "Report",    emoji: "📈" },
  "groups":          { title: "Groups",          label: "Groups",    emoji: "👥" },
  "reminders":       { title: "Reminders",       label: "Reminders", emoji: "🔔" },
  "profile":         { title: "Profile",         label: "Profile",   emoji: "👤" },
};

/**
 * Bottom tab bar for the swipeable pager.
 *
 * `position` is the pager's live scroll position (page index + drag offset),
 * so the indicator glides under the finger in real time while swiping and
 * animates smoothly when a tab is tapped.
 */
export function SwipeTabBar({ state, navigation, position }: MaterialTopTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabCount = state.routes.length;
  const tabWidth = width / tabCount;

  // Light haptic tap each time a page snaps into place (index change = snap)
  const prevIndex = useRef(state.index);
  useEffect(() => {
    if (prevIndex.current !== state.index) {
      prevIndex.current = state.index;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Haptics unavailable (e.g. web/simulator) — ignore
      });
    }
  }, [state.index]);

  const maxIndex = Math.max(tabCount - 1, 1);
  const indicatorTranslateX = position.interpolate({
    inputRange: [0, maxIndex],
    outputRange: [0, maxIndex * tabWidth],
  });

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <Animated.View
        style={[
          styles.indicator,
          { width: tabWidth - 12, transform: [{ translateX: Animated.add(indicatorTranslateX, new Animated.Value(6)) }] },
        ]}
      />
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name] ?? { title: route.name, label: route.name, emoji: "•" };
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            // navigate() animates the pager smoothly to the target page
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={meta.title}
          >
            <Text style={[styles.emoji, { opacity: focused ? 1 : 0.5 }]}>{meta.emoji}</Text>
            <Text
              style={[styles.label, { color: focused ? "#00C896" : "#8890A0" }]}
              numberOfLines={1}
            >
              {meta.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#0F1117",
    borderTopWidth: 1,
    borderTopColor: "#ffffff15",
    paddingTop: 6,
  },
  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#00C896",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  emoji: {
    fontSize: 18,
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
  },
});
