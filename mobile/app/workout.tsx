// Add or edit a workout, as an iOS page sheet: type, effort, duration, and exercises with sets or distance.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Input } from 'tamagui';
import { api, type Exercise, type WeightUnit, type Workout } from '../lib/api.ts';
import { takeEntry } from '../lib/editing.ts';
import { DestructiveButton, formStyles, LinkButton, NumberField, Section, Segmented, TextField, WhenRow } from '../lib/forms.tsx';
import { HeaderButton } from '../lib/navigation.tsx';
import { useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { useToast } from '../lib/toast.tsx';
import { success, tap } from '../lib/ui.tsx';

const TYPES = ['strength', 'cardio', 'sport', 'mobility', 'other'] as const;
type WorkoutType = (typeof TYPES)[number];

export default function WorkoutSheet() {
  const c = useColors();
  const toast = useToast();
  const { handle } = useSession();
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
            <Segmented options={TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} value={type} onChange={setType} />
            <View style={styles.row}>
              <NumberField compact label="Minutes" value={duration} onChange={setDuration} placeholder="—" />
              <NumberField compact integer label="Effort (1–10)" value={effort} onChange={setEffort} placeholder="—" />
            </View>
            <WhenRow date={date} time={time} onDate={setDate} onTime={setTime} />
          </Section>

          <Text style={[styles.heading, { color: c.text2 }]}>EXERCISES</Text>
          {exercises.map((exercise, index) => (
            <View key={index} style={[styles.exercise, { backgroundColor: c.surface }]}>
              <View style={styles.exerciseHead}>
                <Input
                  flex={1}
                  size="$4"
                  value={exercise.name}
                  onChangeText={(name: string) => setExercise(index, { name })}
                  placeholder="Exercise, e.g. Bench Press"
                  placeholderTextColor={c.text3 as never}
                  backgroundColor={c.fill}
                  borderWidth={0}
                  color={c.text}
                  fontWeight="600"
                />
                <Pressable onPress={() => setExercises(exercises.filter((_, i) => i !== index))} hitSlop={10} accessibilityLabel="Remove exercise">
                  <SymbolView name="xmark.circle.fill" size={22} tintColor={c.text3} fallback={<Text style={{ color: c.text3, fontSize: 20 }}>×</Text>} />
                </Pressable>
              </View>
              {showSets &&
                (exercise.sets ?? []).map((set, setIndex) => {
                  const setSet = (patch: object) => setExercise(index, { sets: exercise.sets!.map((s, i) => (i === setIndex ? { ...s, ...patch } : s)) });
                  return (
                    <View key={setIndex} style={styles.setRow}>
                      <Text style={[styles.setLabel, { color: c.text3 }]}>{setIndex + 1}</Text>
                      <NumberField compact integer label="Reps" value={set.reps} onChange={(reps) => setSet({ reps })} />
                      <NumberField compact label={`Weight (${set.unit ?? weightUnit})`} value={set.weight} onChange={(weight) => setSet({ weight, unit: set.unit ?? weightUnit })} />
                      <Pressable
                        onPress={() => setExercise(index, { sets: exercise.sets!.filter((_, i) => i !== setIndex) })}
                        hitSlop={8}
                        accessibilityLabel={`Remove set ${setIndex + 1}`}
                        style={styles.removeSet}
                      >
                        <SymbolView name="minus.circle" size={20} tintColor={c.text3} fallback={<Text style={{ color: c.text3 }}>−</Text>} />
                      </Pressable>
                    </View>
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
                <View style={styles.row}>
                  <NumberField compact label={`Distance (${exercise.distance_unit ?? 'mi'})`} value={exercise.distance} onChange={(distance) => setExercise(index, { distance })} />
                  <NumberField compact label="Minutes" value={exercise.duration_min} onChange={(duration_min) => setExercise(index, { duration_min })} />
                </View>
              )}
            </View>
          ))}
          <LinkButton
            label="+ Add exercise"
            onPress={() => {
              tap();
              setExercises([...exercises, { name: '', ...(showSets ? { sets: [{ unit: weightUnit }] } : {}) }]);
            }}
          />

          <View style={{ height: 16 }} />
          <Section>
            <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" />
          </Section>
          {error ? <Text style={[styles.error, { color: c.critical }]}>{error}</Text> : null}
          {entry && (
            <DestructiveButton label="Delete workout" title="Delete this workout?" message="It will be removed from your log." onConfirm={() => run(() => api.remove('workouts', entry.id), 'Workout deleted')} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  heading: { fontSize: 13, marginLeft: 16, marginBottom: 6 },
  exercise: { borderRadius: 12, padding: 12, gap: 10, marginBottom: 10 },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, minHeight: 42, borderRadius: 9, paddingHorizontal: 10, fontSize: 16, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  setLabel: { width: 18, fontSize: 15, paddingBottom: 10, textAlign: 'center' },
  removeSet: { paddingBottom: 9 },
  error: { fontSize: 15, marginBottom: 12 },
});
