// Log or edit a weigh-in, as an iOS page sheet: one big number, its unit, and when.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Paragraph, Theme, YStack } from 'tamagui';
import { api, type WeighIn, type WeightUnit } from '../lib/api.ts';
import { takeEntry } from '../lib/editing.ts';
import { DestructiveButton, formStyles, NumberField, Section, Segmented, TextField, WhenRow } from '../lib/forms.tsx';
import { IconTile, weightIcon } from '../lib/kit.tsx';
import { HeaderButton } from '../lib/navigation.tsx';
import { useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { useToast } from '../lib/toast.tsx';
import { success } from '../lib/ui.tsx';

export default function WeightSheet() {
  const c = useColors();
  const toast = useToast();
  const { handle } = useSession();
  const params = useLocalSearchParams<{ date: string; time: string; unit: WeightUnit }>();
  const [entry] = useState(() => takeEntry<WeighIn>());
  const [weight, setWeight] = useState<number | undefined>(entry?.weight);
  const [unit, setUnit] = useState<WeightUnit>(entry?.unit ?? params.unit ?? 'lb');
  const [date, setDate] = useState(params.date);
  const [time, setTime] = useState(entry?.time ?? params.time);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      success();
      toast(message);
      router.back();
    } catch (e) {
      handle(e);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };
  const save = () => {
    if (!weight) return setError('Enter a weight.');
    const body = { weight, unit, date, time, notes };
    void run(() => (entry ? api.update('weigh-ins', entry.id, body) : api.create('weigh-ins', body)), entry ? 'Saved' : 'Weight logged');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: entry ? 'Edit weigh-in' : 'Log weight',
          headerLeft: () => <HeaderButton label="Cancel" onPress={() => router.back()} />,
          headerRight: () => (busy ? <ActivityIndicator color={c.accent} /> : <HeaderButton label="Save" bold onPress={save} />),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
          <YStack alignItems="center" marginVertical="$3">
            <IconTile {...weightIcon} />
          </YStack>
          <Section>
            <NumberField large value={weight} onChange={setWeight} autoFocus={!entry} placeholder={unit === 'kg' ? '80.5' : '177.4'} suffix={unit} />
            <Segmented
              options={[
                { value: 'lb', label: 'Pounds' },
                { value: 'kg', label: 'Kilograms' },
              ]}
              value={unit}
              onChange={setUnit}
            />
            <WhenRow date={date} time={time} onDate={setDate} onTime={setTime} />
          </Section>
          <Section>
            <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional, e.g. after a run" />
          </Section>
          {error ? (
            <Theme name="red">
              <Paragraph color="$color10" marginBottom="$3">
                {error}
              </Paragraph>
            </Theme>
          ) : null}
          {entry && <DestructiveButton label="Delete weigh-in" title="Delete this weigh-in?" message="It will be removed from your log." onConfirm={() => run(() => api.remove('weigh-ins', entry.id), 'Weigh-in deleted')} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
