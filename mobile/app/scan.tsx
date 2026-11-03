// Full-screen barcode scanner. A product with label data goes straight into the open meal sheet.
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api.ts';
import { deliverScan } from '../lib/editing.ts';
import { useSession } from '../lib/session.tsx';

export default function Scan() {
  const insets = useSafeAreaInsets();
  const { handle } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState('Point the camera at the barcode');
  // One lookup at a time; the camera reports the same code many times a second.
  const busy = useRef(false);

  const onCode = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessage('Looking it up…');
    try {
      const { result } = await api.barcode(code);
      if (result) {
        deliverScan(result);
        router.back();
        return;
      }
      setMessage(`No label data for ${code}. Add it by hand, or try another side of the pack.`);
    } catch (e) {
      handle(e);
      setMessage("Couldn't look that up. Check your connection and try again.");
    }
    setTimeout(() => (busy.current = false), 2000);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {permission?.granted ? (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data }) => void onCode(data)}
          />
          <View style={styles.frame} pointerEvents="none" />
          <Text style={[styles.message, { top: insets.top + 24 }]}>{message}</Text>
        </>
      ) : (
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>Scan food barcodes</Text>
          <Text style={styles.permissionText}>Hulk needs the camera to read barcodes. Nothing is recorded or stored.</Text>
          <Pressable
            onPress={() => (permission && !permission.canAskAgain ? Linking.openSettings() : requestPermission())}
            style={({ pressed }) => [styles.button, { backgroundColor: '#2a78d6', opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.buttonText}>{permission && !permission.canAskAgain ? 'Open Settings' : 'Allow camera'}</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.cancel, { bottom: insets.bottom + 24, opacity: pressed ? 0.6 : 1 }]}>
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  // The dimmed surround is the frame's own huge border.
  frame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 300,
    height: 150,
    marginLeft: -150,
    marginTop: -75,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  message: { position: 'absolute', left: 24, right: 24, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '600' },
  permission: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  permissionTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  permissionText: { color: 'rgba(255,255,255,0.75)', fontSize: 16 },
  button: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancel: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
});
