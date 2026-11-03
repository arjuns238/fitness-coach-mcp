// Add or edit a workout, as an iOS page sheet: type, effort, duration, and exercises with sets or distance.
import { MinusCircle } from '@tamagui/lucide-icons-2/icons/MinusCircle';
import { X } from '@tamagui/lucide-icons-2/icons/X';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button, Input, Paragraph, SizableText, Theme, XStack, YStack } from 'tamagui';
import { api, type Exercise, type WeightUnit, type Workout } from '../lib/api.ts';
import { takeEntry } from '../lib/editing.ts';
import { ChoiceChips, DestructiveButton, formStyles, LinkButton, NumberField, Section, TextField, useFieldColor, WhenRow } from '../lib/forms.tsx';
import { useCardColor, WORKOUT_TYPES } from '../lib/kit.tsx';
import { HeaderButton } from '../lib/navigation.tsx';
import { useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { useToast } from '../lib/toast.tsx';
import { success, tap } from '../lib/ui.tsx';

type WorkoutType = (typeof WORKOUT_TYPES)[number]['value'];

export default function WorkoutSheet() {
  const c = useColors();
  const toast = useToast();
  const { handle } = useSession();
  const card = useCardColor();
  const field = useFieldColor();
  const params = useLocalSearchParams<{ date: string; time: string; unit: WeightUnit }>();
  const weightUnit = params.unit ?? 'lb';
  const [entry] = useState(() => takeEntry<Workout>());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [type, setType] = useState<WorkoutType>((entry?.type as WorkoutType) ?? 'strength');
  const [duration, setDuration] = useState<number | undefined>(entry?.duration_min ?? undefined);
  const [effort, setEffort] = useState<number | undefined>(entry?.effort ?? undefined);
  const [date, setDate] = useState(params.date);
  const [time, setTime] = useState(entry?.time ?? params.time);
  const [exercises, setExercises] = useState<Exercise[]>(entry?.exercises ?? []);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showSets = type !== 'cardio';
  const showDistance = type !== 'strength';

  const setExercise = (index: number, patch: Partial<Exercise>) => setExercises(exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)));

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
    if (!description.trim()) return setError('Give the workout a short name, e.g. "push day".');
    const body = {
      description: description.trim(),
      type,
      duration_min: duration,
      effort: effort === undefined ? undefined : Math.min(10, Math.max(1, Math.round(effort))),
      exercises: exercises
        .filter((exercise) => exercise.name.trim())
        .map((exercise) => ({
          ...exercise,
          name: exercise.name.trim(),
          sets: exercise.sets?.filter((set) => set.reps !== undefined || set.weight !== undefined || set.duration_sec !== undefined),
        })),
      date,
      time,
      notes,
    };
    void run(() => (entry ? api.update('workouts', entry.id, body) : api.create('workouts', body)), entry ? 'Saved' : 'Workout added');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: entry ? 'Edit workout' : 'Add workout',
          headerLeft: () => <HeaderButton label="Cancel" onPress={() => router.back()} />,
          headerRight: () => (busy ? <ActivityIndicator color={c.accent} /> : <HeaderButton label="Save" bold onPress={save} />),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Section>
            <TextField label="Workout" value={description} onChangeText={setDescription} placeholder="e.g. push day, 5k run" />
            <ChoiceChips options={WORKOUT_TYPES} value={type} onChange={(value) => value && setType(value)} />
            <XStack gap="$2">
              <NumberField compact label="Minutes" value={duration} onChange={setDuration} placeholder="—" />
              <NumberField compact integer label="Effort (1–10)" value={effort} onChange={setEffort} placeholder="—" />
            </XStack>
            <WhenRow date={date} time={time} onDate={setDate} onTime={setTime} />
          </Section>

          <SizableText size="$2" fontWeight="600" color="$color10" marginLeft="$3" marginBottom="$1.5" letterSpacing={0.6}>
            EXERCISES
          </SizableText>
          <YStack gap="$2.5">
            {exercises.map((exercise, index) => (
              <YStack key={index} backgroundColor={card} borderRadius="$6" padding="$3.5" gap="$2.5" transition="quick" enterStyle={{ opacity: 0, y: 8 }}>
                <XStack alignItems="center" gap="$2">
                  <Input flex={1} size="$4" value={exercise.name} onChangeText={(name: string) => setExercise(index, { name })} placeholder="Exercise, e.g. Bench Press" placeholderTextColor={'$color8' as never} backgroundColor={field} borderWidth={0} fontWeight="700" />
                  <Button circular size="$2" chromeless icon={<X size={16} color="$color10" />} accessibilityLabel="Remove exercise" onPress={() => setExercises(exercises.filter((_, i) => i !== index))} />
                </XStack>
                {showSets &&
                  (exercise.sets ?? []).map((set, setIndex) => {
                    const setSet = (patch: object) => setExercise(index, { sets: exercise.sets!.map((s, i) => (i === setIndex ? { ...s, ...patch } : s)) });
                    return (
                      <XStack key={setIndex} alignItems="flex-end" gap="$2">
                        <Theme name="blue">
                          <YStack width={28} height={38} borderRadius="$3" backgroundColor="$color4" alignItems="center" justifyContent="center">
                            <SizableText size="$2" fontWeight="800" color="$color11">
                              {setIndex + 1}
                            </SizableText>
                          </YStack>
                        </Theme>
                        <NumberField compact integer label="Reps" value={set.reps} onChange={(reps) => setSet({ reps })} />
                        <NumberField compact label={`Weight (${set.unit ?? weightUnit})`} value={set.weight} onChange={(weight) => setSet({ weight, unit: set.unit ?? weightUnit })} />
                        <Button
                          circular
                          size="$2.5"
                          chromeless
                          icon={<MinusCircle size={18} color="$color9" />}
                          accessibilityLabel={`Remove set ${setIndex + 1}`}
                          onPress={() => setExercise(index, { sets: exercise.sets!.filter((_, i) => i !== setIndex) })}
                        />
                      </XStack>
                    );
                  })}
                {showSets && (
                  <LinkButton
                    label="+ Add set"
                    // A new set starts as a copy of the last one; most sets repeat.
                    onPress={() => {
                      const sets = exercise.sets ?? [];
                      setExercise(index, { sets: [...sets, sets.length ? { ...sets[sets.length - 1] } : { unit: weightUnit }] });
                    }}
                  />
                )}
                {showDistance && (
                  <XStack gap="$2">
                    <NumberField compact label={`Distance (${exercise.distance_unit ?? 'mi'})`} value={exercise.distance} onChange={(distance) => setExercise(index, { distance })} />
                    <NumberField compact label="Minutes" value={exercise.duration_min} onChange={(duration_min) => setExercise(index, { duration_min })} />
                  </XStack>
                )}
              </YStack>
            ))}
          </YStack>
          <YStack marginTop="$1" marginBottom="$4">
            <LinkButton
              label="+ Add exercise"
              onPress={() => {
                tap();
                setExercises([...exercises, { name: '', ...(showSets ? { sets: [{ unit: weightUnit }] } : {}) }]);
              }}
            />
          </YStack>

          <Section>
            <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" />
          </Section>
          {error ? (
            <Theme name="red">
              <Paragraph color="$color10" marginBottom="$3">
                {error}
              </Paragraph>
            </Theme>
          ) : null}
          {entry && <DestructiveButton label="Delete workout" title="Delete this workout?" message="It will be removed from your log." onConfirm={() => run(() => api.remove('workouts', entry.id), 'Workout deleted')} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
