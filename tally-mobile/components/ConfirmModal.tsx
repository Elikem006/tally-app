import { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: string;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = '#E05C5C',
  onConfirm,
  onCancel,
  icon,
}: ConfirmModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset to starting values then spring in
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 120,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  /** Fade out then call callback (cancel or confirm). */
  function dismiss(callback: () => void) {
    Animated.timing(opacityAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => callback());
  }

  const cardBg = isDark ? '#1A1F2E' : '#FFFFFF';
  const overlayBg = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';
  const titleColor = isDark ? '#FFFFFF' : '#111111';
  const cancelBorderColor = isDark ? '#ffffff20' : '#EAEBEF';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss(onCancel)}
    >
      <View style={[styles.overlay, { backgroundColor: overlayBg }]}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: cardBg },
            { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {!!icon && <Text style={styles.icon}>{icon}</Text>}

          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: cancelBorderColor }]}
              onPress={() => dismiss(onCancel)}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: confirmColor }]}
              onPress={() => dismiss(onConfirm)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
  },
  icon: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#8890A0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#8890A0',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
