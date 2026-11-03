// A short confirmation ("Saved", "Added Quest bar") that floats above the tab bar and fades away.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme.ts';

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(), 2200);
    },
    [opacity],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <Animated.View
        pointerEvents="none"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { bottom: insets.bottom + 70, backgroundColor: c.text, opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
        ]}
      >
        <Text style={[styles.text, { color: c.background }]}>{message}</Text>
      </Animated.View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  text: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
