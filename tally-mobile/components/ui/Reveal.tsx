import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { duration, easing, reveal, type RevealBeat } from '../../theme';

interface RevealProps {
  /**
   * Which beat of the screen's opening sequence this belongs to. Named rather
   * than numeric so a screen's choreography stays legible and every screen
   * shares one timeline — see `reveal` in theme/motion.ts.
   */
  beat?: RevealBeat;
  /** Extra offset on top of the beat, for ordering siblings within one beat. */
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades and lifts its children in at a named beat. Entering animations only
 * fire on mount, so a pull-to-refresh re-render does not replay the whole
 * opening sequence — which would be seasick on every refresh.
 */
export function Reveal({ beat = 'primary', delay = 0, children, style }: RevealProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(duration.slow)
        .delay(reveal[beat] + delay)
        .easing(easing.decelerate)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
