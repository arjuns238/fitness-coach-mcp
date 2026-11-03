import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Button, Paragraph, XStack, YStack } from 'tamagui';
import { addDays, daysBetween, formatNumber, formatTime, setSummary, timeFromNow, todayFromNow } from '../../../../web/src/format.ts';
import { api, type DayDetail, type Meal, type WeighIn, type Workout } from '../../../lib/api.ts';
import { editEntry } from '../../../lib/editing.ts';
import { CalorieHero, EntryRow, ListSection, MACRO_TILES, MacroTile, mealIcon, ScreenTitle, useCardColor, weightIcon, workoutIcon } from '../../../lib/kit.tsx';
import { useColors } from '../../../lib/theme.ts';
import { tap, useLoad } from '../../../lib/ui.tsx';

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const longDate = (date: string) => utc(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const dayName = (date: string) => utc(date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const daysAgo = (n: number) => (n === 1 ? 'Yesterday' : `${n} days ago`);

export default function Today() {
  const c = useColors();
  const card = useCardColor();
  // undefined means "today", whatever date that is when the app is opened.
  const [date, setDate] = useState<string>();
  const [picking, setPicking] = useState(false);
  const { data: day, error, loading, reload } = useLoad(() => api.day(date), [date]);

  // Coming back from an add/edit sheet (or another tab): show the latest. The first focus is the initial load.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void reload();
      focused.current = true;
    }, [reload]),
  );

  // Claude may have logged something while the app was in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && reload());
    return () => subscription.remove();
  }, [reload]);

  const today = day ? todayFromNow(day.now) : undefined;
  const shown = date ?? today;
  const isToday = !date || date === today;
  const go = (next: string | undefined) => {
    tap();
    setPicking(false);
    setDate(next && next !== today ? next : undefined);
  };

  // Swipe right for the day before, left for the day after (not past today).
  const swipe = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onEnd((event) => {
      if (!shown) return;
      if (event.translationX > 70) go(addDays(shown, -1));
      else if (event.translationX < -70 && !isToday) go(addDays(shown, 1));
    });

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <XStack alignItems="center" gap="$3.5">
              <HeaderIcon name="calendar" label="Pick a date" onPress={() => setPicking((open) => !open)} />
              <HeaderIcon name="chevron.left" label="Previous day" onPress={() => shown && go(addDays(shown, -1))} />
              <HeaderIcon name="chevron.right" label="Next day" disabled={isToday} onPress={() => shown && go(addDays(shown, 1))} />
            </XStack>
          ),
        }}
      />
      <GestureDetector gesture={swipe}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: c.background }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={loading && !!day} onRefresh={reload} tintColor={c.text3} />}
        >
          <YStack gap="$4">
            <ScreenTitle
              title={!shown || isToday ? 'Today' : dayName(shown)}
              subtitle={shown ? (isToday ? longDate(shown) : `${daysAgo(daysBetween(shown, today!))} · ${longDate(shown)}`) : ' '}
              right={
                !isToday ? (
                  <Button size="$2.5" borderRadius="$10" theme="blue" fontWeight="700" onPress={() => go(undefined)}>
                    Today
                  </Button>
                ) : undefined
              }
            />
            {picking && shown && today && (
              <YStack backgroundColor={card} borderRadius="$6" padding="$2" transition="quick" enterStyle={{ opacity: 0, y: -6 }}>
                <DateTimePicker
                  value={new Date(`${shown}T12:00:00`)}
                  maximumDate={new Date(`${today}T12:00:00`)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  accentColor={c.accent}
                  onDismiss={() => setPicking(false)}
                  onValueChange={(_, picked) => {
                    const iso = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`;
                    go(iso);
                  }}
                />
              </YStack>
            )}
            {error && !day ? (
              <Paragraph color="$color10">{error}</Paragraph>
            ) : day ? (
              <DayContent key={day.date} day={day} isToday={isToday} />
            ) : null}
          </YStack>
        </ScrollView>
      </GestureDetector>
    </>
  );
}

function HeaderIcon({ name, label, onPress, disabled }: { name: 'calendar' | 'chevron.left' | 'chevron.right'; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityLabel={label} style={({ pressed }) => ({ padding: 4, opacity: disabled ? 0.3 : pressed ? 0.5 : 1 })}>
      <SymbolView name={name} size={20} tintColor={c.accent} fallback={<Text style={{ color: c.accent, fontSize: 20 }}>{name === 'calendar' ? '▦' : name === 'chevron.left' ? '‹' : '›'}</Text>} />
    </Pressable>
  );
}

/** How many of a meal's items use a product's label rather than an estimate. */
function labelNote(items: Meal['items']) {
  const labelled = items.filter((item) => item.source).length;
  if (!labelled) return undefined;
  return labelled === items.length ? '✓ Label data' : `✓ ${labelled} of ${items.length} from labels`;
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

function DayContent({ day, isToday }: { day: DayDetail; isToday: boolean }) {
  const { totals, goals } = day;
  // Opens an add/edit sheet for this day; new entries default to now today, or midday on a past day.
  const open = (sheet: 'meal' | 'workout' | 'weight', entry?: Meal | Workout | WeighIn) => {
    editEntry(entry);
    router.push({ pathname: `/${sheet}`, params: { date: day.date, time: isToday ? timeFromNow(day.now) : '12:00', unit: day.profile.weight_unit } });
  };

  return (
    <YStack gap="$5">
      <YStack gap="$3">
        <CalorieHero value={totals.calories} goal={goals.calories} />
        <XStack gap="$2.5">
          <MacroTile {...MACRO_TILES.protein} label="Protein" value={totals.protein_g} goal={goals.protein_g} target />
          <MacroTile {...MACRO_TILES.carbs} label="Carbs" value={totals.carbs_g} goal={goals.carbs_g} delay={80} />
          <MacroTile {...MACRO_TILES.fat} label="Fat" value={totals.fat_g} goal={goals.fat_g} delay={160} />
        </XStack>
      </YStack>

      <ListSection title="Meals" onAction={() => open('meal')} empty="Nothing logged yet. Tell Claude what you ate, or add it here.">
        {day.meals.map((meal, i) => (
          <EntryRow
            key={meal.id}
            separated={i > 0}
            tile={mealIcon(meal.meal_type)}
            title={meal.description}
            detail={`${formatTime(meal.time)}${meal.meal_type ? ` · ${capitalize(meal.meal_type)}` : ''} · ${meal.items.map((item) => item.name).join(', ')}`}
            note={labelNote(meal.items)}
            value={`${formatNumber(meal.calories)} kcal`}
            valueDetail={`P ${formatNumber(meal.protein_g)} · C ${formatNumber(meal.carbs_g)} · F ${formatNumber(meal.fat_g)}`}
            onPress={() => open('meal', meal)}
          />
        ))}
      </ListSection>

      <ListSection title="Workouts" onAction={() => open('workout')} empty="No workout logged.">
        {day.workouts.map((workout, i) => {
          const first = workout.exercises[0];
          const summary = first ? `${first.name}${first.sets?.length ? ` ${setSummary(first.sets)}` : ''}${workout.exercises.length > 1 ? ` +${workout.exercises.length - 1} more` : ''}` : capitalize(workout.type);
          return (
            <EntryRow
              key={workout.id}
              separated={i > 0}
              tile={workoutIcon(workout.type)}
              title={workout.description}
              detail={`${formatTime(workout.time)} · ${summary}`}
              value={workout.duration_min ? `${formatNumber(workout.duration_min)} min` : undefined}
              valueDetail={workout.effort ? `Effort ${workout.effort}/10` : undefined}
              onPress={() => open('workout', workout)}
            />
          );
        })}
      </ListSection>

      <ListSection title="Weight" actionLabel="Log" onAction={() => open('weight')} empty="No weigh-in.">
        {day.weigh_ins.map((weighIn, i) => (
          <EntryRow
            key={weighIn.id}
            separated={i > 0}
            tile={weightIcon}
            title={`${weighIn.weight} ${weighIn.unit}`}
            detail={`${formatTime(weighIn.time)}${weighIn.notes ? ` · ${weighIn.notes}` : ''}`}
            onPress={() => open('weight', weighIn)}
          />
        ))}
      </ListSection>
    </YStack>
  );
}
