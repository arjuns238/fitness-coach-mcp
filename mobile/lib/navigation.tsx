// Header pieces shared by the tabs: iOS large titles over a blurred bar, and the Hulk mark on the left.
import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useColors } from './theme.ts';

export function useTabStackOptions(): NativeStackNavigationOptions {
  const c = useColors();
  return {
    headerLargeTitle: true,
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
