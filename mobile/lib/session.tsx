// The API key, kept in the iPhone Keychain (SecureStore). Signing in checks it against the server first.
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, AuthError, setApiKey } from './api.ts';

const STORE_KEY = 'hulk.apiKey';

// SecureStore has no web implementation; the browser preview keeps the key in localStorage instead.
const store =
  Platform.OS === 'web'
    ? {
        get: async () => localStorage.getItem(STORE_KEY),
        set: async (value: string) => localStorage.setItem(STORE_KEY, value),
        remove: async () => localStorage.removeItem(STORE_KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(STORE_KEY),
        set: (value: string) => SecureStore.setItemAsync(STORE_KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
        remove: () => SecureStore.deleteItemAsync(STORE_KEY),
      };

interface Session {
  status: 'loading' | 'in' | 'out';
  /** Checks the key with the server, then remembers it. Throws if the server rejects it. */
  signIn: (key: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** For errors from any request: an AuthError signs out. */
  handle: (error: unknown) => void;
}

const SessionContext = createContext<Session>(null!);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');

  useEffect(() => {
    store
      .get()
      .then((key) => {
        setApiKey(key ?? undefined);
        setStatus(key ? 'in' : 'out');
      })
      .catch(() => setStatus('out'));
  }, []);

  const signOut = useCallback(async () => {
    await store.remove();
    setApiKey(undefined);
    setStatus('out');
  }, []);

  const value = useMemo<Session>(
    () => ({
      status,
      signIn: async (key) => {
        setApiKey(key);
        try {
          await api.profile();
        } catch (error) {
          setApiKey(undefined);
          throw error;
        }
        await store.set(key);
        setStatus('in');
      },
      signOut,
      handle: (error) => {
        if (error instanceof AuthError) void signOut();
      },
    }),
    [status, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
