import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../lib/theme.ts';

export default function NotFound() {
  const c = useColors();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <Text style={[styles.text, { color: c.text }]}>This screen doesn't exist.</Text>
        <Link href="/" style={[styles.text, { color: c.accentStrong }]}>
          Go to Today
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { fontSize: 17 },
});
