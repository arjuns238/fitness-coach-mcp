// Targets Claude coaches toward (and the dashboard measures against), plus units, timezone and sign-out.
import { Beef } from '@tamagui/lucide-icons-2/icons/Beef';
import { Droplet } from '@tamagui/lucide-icons-2/icons/Droplet';
import { Dumbbell } from '@tamagui/lucide-icons-2/icons/Dumbbell';
import { Flame } from '@tamagui/lucide-icons-2/icons/Flame';
import { Globe } from '@tamagui/lucide-icons-2/icons/Globe';
import { Goal } from '@tamagui/lucide-icons-2/icons/Goal';
import { Wheat } from '@tamagui/lucide-icons-2/icons/Wheat';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Paragraph, SizableText, Theme, XStack, YStack, type ThemeName } from 'tamagui';
import { api, type Profile, type WeightUnit } from '../../../lib/api.ts';
import { DestructiveButton, NumberField, PrimaryButton, Section, Segmented, TextField } from '../../../lib/forms.tsx';
import { IconTile, ScreenTitle } from '../../../lib/kit.tsx';
import { useSession } from '../../../lib/session.tsx';
import { useColors } from '../../../lib/theme.ts';
import { useToast } from '../../../lib/toast.tsx';
import { success, useLoad } from '../../../lib/ui.tsx';

type Icon = typeof Flame;
const TARGETS: { key: 'daily_calories' | 'daily_protein_g' | 'daily_carbs_g' | 'daily_fat_g' | 'workouts_per_week'; label: string; suffix: string; theme: ThemeName; icon: Icon; integer?: boolean }[] = [
  { key: 'daily_calories', label: 'Calories', suffix: 'kcal', theme: 'blue', icon: Flame },
  { key: 'daily_protein_g', label: 'Protein', suffix: 'g', theme: 'green', icon: Beef },
  { key: 'daily_carbs_g', label: 'Carbs', suffix: 'g', theme: 'orange', icon: Wheat },
  { key: 'daily_fat_g', label: 'Fat', suffix: 'g', theme: 'purple', icon: Droplet },
  { key: 'workouts_per_week', label: 'Workouts a week', suffix: '', theme: 'red', icon: Dumbbell, integer: true },
];

export default function Goals() {
  const c = useColors();
  const { data: profile } = useLoad(() => api.profile(), []);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: c.background }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <YStack gap="$4">
          <ScreenTitle title="Goals" subtitle="What Claude coaches you toward" />
          {profile ? <GoalsForm key={JSON.stringify(profile)} profile={profile} /> : <Paragraph color="$color10">Loading…</Paragraph>}
        </YStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TargetRow({ theme, icon, label, suffix, value, onChange, integer }: { theme: ThemeName; icon: Icon; label: string; suffix: string; value: number | undefined; onChange: (value: number | undefined) => void; integer?: boolean }) {
  return (
    <XStack alignItems="center" gap="$3">
      <IconTile theme={theme} icon={icon} />
      <SizableText flex={1} size="$4" fontWeight="600">
        {label}
      </SizableText>
      <YStack width={128}>
        <NumberField value={value} onChange={onChange} placeholder="—" suffix={suffix || undefined} integer={integer} />
      </YStack>
    </XStack>
  );
}

function GoalsForm({ profile }: { profile: Profile }) {
  const toast = useToast();
  const { handle, signOut } = useSession();
  const [goals, setGoals] = useState(() => ({
    daily_calories: profile.daily_calories,
    daily_protein_g: profile.daily_protein_g,
    daily_carbs_g: profile.daily_carbs_g,
    daily_fat_g: profile.daily_fat_g,
    workouts_per_week: profile.workouts_per_week,
    target_weight: profile.target_weight,
  }));
  const [unit, setUnit] = useState<WeightUnit>(profile.weight_unit);
  const [notes, setNotes] = useState(profile.coaching_notes ?? '');
  const [timezone, setTimezone] = useState(profile.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setError(''), [goals, unit, notes, timezone]);

  const save = async () => {
    setBusy(true);
    try {
      // Blank fields clear their goal (null), like the web dashboard.
      const patch: Record<string, unknown> = { weight_unit: unit, timezone: timezone.trim(), coaching_notes: notes.trim() || null };
      for (const [key, value] of Object.entries(goals)) patch[key] = value || null;
      await api.updateProfile(patch);
      success();
      toast('Goals saved');
    } catch (e) {
      handle(e);
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <YStack>
      <Section title="Daily targets">
        {TARGETS.map(({ key, ...target }) => (
          <TargetRow key={key} {...target} value={goals[key]} onChange={(value) => setGoals({ ...goals, [key]: value })} />
        ))}
      </Section>

      <Section title="Body weight" footer={unit !== profile.weight_unit && goals.target_weight ? `Remember to convert your target to ${unit}.` : undefined}>
        <Segmented
          options={[
            { value: 'lb', label: 'Pounds' },
            { value: 'kg', label: 'Kilograms' },
          ]}
          value={unit}
          onChange={setUnit}
        />
        <TargetRow theme="gray" icon={Goal} label="Target weight" suffix={unit} value={goals.target_weight} onChange={(value) => setGoals({ ...goals, target_weight: value })} />
      </Section>

      <Section title="Coaching notes" footer="Claude reads these every time, and updates them when you tell it something worth remembering.">
        <TextField multiline value={notes} onChangeText={setNotes} placeholder="e.g. Cutting until March. Lifting 4x a week. Lactose intolerant." />
      </Section>

      <Section title="Timezone" footer="Decides which day a late-night snack counts toward.">
        <XStack alignItems="center" gap="$3">
          <IconTile theme="gray" icon={Globe} />
          <YStack flex={1}>
            <TextField value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} placeholder="e.g. America/Chicago" />
          </YStack>
        </XStack>
      </Section>

      {error ? (
        <Theme name="red">
          <Paragraph color="$color10" marginBottom="$3">
            {error}
          </Paragraph>
        </Theme>
      ) : null}
      <YStack gap="$3">
        <PrimaryButton label={busy ? 'Saving…' : 'Save goals'} disabled={busy} onPress={save} />
        <DestructiveButton label="Sign out of this iPhone" title="Sign out?" message="You'll need your API key to sign back in. Your log stays on the server." onConfirm={() => void signOut()} />
      </YStack>
    </YStack>
  );
}
