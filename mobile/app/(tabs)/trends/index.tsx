import { ScrollView } from 'react-native';
import { useColors } from '../../../lib/theme.ts';
import { ScreenTitle } from '../../../lib/kit.tsx';
import { Card, Empty } from '../../../lib/ui.tsx';

export default function Screen() {
  const c = useColors();
  return (
    <>
      
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: 16 }}>
        <ScreenTitle title="Trends" />
        <Card marginTop="$3">
          <Empty>Coming in the next update.</Empty>
        </Card>
      </ScrollView>
    </>
  );
}
