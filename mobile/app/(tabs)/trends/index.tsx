import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useColors } from '../../../lib/theme.ts';
import { Card, Empty } from '../../../lib/ui.tsx';

export default function Screen() {
  const c = useColors();
  return (
    <>
      <Stack.Screen options={{ title: 'Trends' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Empty>Coming in the next update.</Empty>
        </Card>
      </ScrollView>
    </>
  );
}
