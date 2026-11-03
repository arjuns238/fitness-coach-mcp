import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="API key"
          placeholderTextColor={c.text3}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
          style={[styles.input, { backgroundColor: c.surface, color: c.text }]}
        />
        {error ? <Text style={[styles.error, { color: c.critical }]}>{error}</Text> : null}
        <Pressable
          onPress={submit}
          disabled={!key.trim() || busy}
          style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: !key.trim() ? 0.5 : pressed ? 0.8 : 1 }]}
        >
          {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={[styles.buttonText, { color: c.onAccent }]}>Sign in</Text>}
        </Pressable>
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
  input: { height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  error: { fontSize: 15 },
  button: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
