// Header pieces shared by the tabs: iOS large titles over a blurred bar, and the Hulk mark on the left.
import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useColors } from './theme.ts';

export function useTabStackOptions(): NativeStackNavigationOptions {
  const c = useColors();
  return {
    // Screens draw their own big title in the content (ScreenTitle), so the bar itself stays empty and glassy.
    headerLargeTitle: false,
    title: '',
    // iOS draws its own scroll-edge effect under a transparent header; adding a blur on top doubles it.
    headerTransparent: Platform.OS === 'ios',
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : c.background },
    headerLargeStyle: { backgroundColor: c.background },
    headerTitleStyle: { color: c.text },
    headerLargeTitleStyle: { color: c.text },
    headerTintColor: c.accent,
    contentStyle: { backgroundColor: c.background },
    headerLeft: () => <Brand />,
  };
}

/** The app's name and mark, small, at the top of every tab. */
export function Brand() {
  const c = useColors();
  return (
    <View style={styles.brand} accessibilityRole="header" accessibilityLabel="Hulk">
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Rect width={24} height={24} rx={6} fill={c.accent} />
        <Path d="M12 4.8a7.2 7.2 0 1 1-7.2 7.2" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
      <Text style={[styles.brandText, { color: c.text }]}>Hulk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 17, fontWeight: '800' },
});

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
