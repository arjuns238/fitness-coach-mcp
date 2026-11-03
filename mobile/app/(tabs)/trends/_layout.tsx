import { Stack } from 'expo-router';
import { useTabStackOptions } from '../../../lib/navigation.tsx';

export default function Layout() {
  return <Stack screenOptions={useTabStackOptions()} />;
}
