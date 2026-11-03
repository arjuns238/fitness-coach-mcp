import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { Button, Input } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthError } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { success, tap } from '../lib/ui.tsx';

export default function Login() {
  const c = useColors();
  const { signIn } = useSession();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!key.trim() || busy) return;
    tap();
    setBusy(true);
    setError('');
    try {
      await signIn(key.trim());
      success();
    } catch (e) {
      setError(e instanceof AuthError ? "That key didn't work." : "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <Image source={require('../assets/images/icon.png')} style={styles.icon} />
        <Text style={[styles.title, { color: c.text }]}>Hulk</Text>
        <Text style={[styles.subtitle, { color: c.text2 }]}>Sign in with your server's API key. It's kept in this iPhone's Keychain.</Text>
        <Input
          size="$5"
          value={key}
          onChangeText={setKey}
          placeholder="API key"
          placeholderTextColor={c.text3 as never}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
          backgroundColor={c.surface}
          borderWidth={0}
          color={c.text}
        />
        {error ? <Text style={[styles.error, { color: c.critical }]}>{error}</Text> : null}
        <Button
          size="$5"
          marginTop="$1"
          backgroundColor={c.accent}
          color={c.onAccent}
          fontWeight="600"
          disabled={!key.trim() || busy}
          opacity={!key.trim() ? 0.5 : 1}
          pressStyle={{ opacity: 0.85, backgroundColor: c.accent }}
          icon={busy ? <ActivityIndicator color={c.onAccent} /> : undefined}
          onPress={submit}
        >
          {busy ? '' : 'Sign in'}
        </Button>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  icon: { width: 72, height: 72, borderRadius: 16, marginBottom: 8 },
  title: { fontSize: 34, fontWeight: '700' },
  subtitle: { fontSize: 15, marginBottom: 12 },
  error: { fontSize: 15 },
});
