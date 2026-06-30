import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  visible: boolean;
  onHide: () => void;
}

const CONFIGS: Record<ToastType, { bg: string; textColor: string; emoji: string }> = {
  success: { bg: '#00C896', textColor: '#ffffff', emoji: '✅' },
  error:   { bg: '#E05C5C', textColor: '#ffffff', emoji: '❌' },
  warning: { bg: '#F7A84F', textColor: '#1A1F2E', emoji: '⚠️' },
  info:    { bg: '#1A1F2E', textColor: '#ffffff', emoji: 'ℹ️' },
};

export default function Toast({ message, type, visible, onHide }: ToastProps) {
  const translateY = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto-hide after 3 seconds
      const timer = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: 100,
          duration: 250,
          useNativeDriver: true,
        }).start(() => onHide());
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      translateY.setValue(100);
    }
  }, [visible]);

  if (!visible) return null;

  const { bg, textColor, emoji } = CONFIGS[type];

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bg, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.message, { color: textColor }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 9999,
  },
  emoji: {
    fontSize: 18,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
