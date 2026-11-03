// Header pieces shared by the tabs: iOS large titles over a blurred bar, and the Hulk mark on the left.
import type { NativeStackNavigationOptions } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useColors } from './theme.ts';

export function useTabStackOptions(): NativeStackNavigationOptions {
  const c = useColors();
  // No navigation bar on the tabs: each screen draws its own big title, and there are no bar buttons.
  return { headerShown: false, contentStyle: { backgroundColor: c.background } };
}

/** A text button for a sheet's header: Cancel on the left, Save (bold) on the right. */
export function HeaderButton({ label, onPress, bold = false, disabled = false }: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1, paddingHorizontal: 4 })}>
      <Text style={{ color: c.accent, fontSize: 17, fontWeight: bold ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

/** Header style for the add/edit sheets (iOS page sheets you can swipe down to close). */
export function useSheetOptions(): NativeStackNavigationOptions {
  const c = useColors();
  return {
    presentation: 'modal',
    headerShown: true,
    headerStyle: { backgroundColor: c.background },
    headerTitleStyle: { color: c.text },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: c.background },
  };
}
