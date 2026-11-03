import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { addDays, daysBetween, formatDay, formatNumber, formatTime, setSummary, todayFromNow } from '../../../../web/src/format.ts';
import { api, type DayDetail, type Meal } from '../../../lib/api.ts';
import { useColors } from '../../../lib/theme.ts';
import { Card, CardHeader, Empty, Meter, Row, tap, useLoad } from '../../../lib/ui.tsx';

const daysAgo = (n: number) => (n === 1 ? 'Yesterday' : `${n} days ago`);

export default function Today() {
  const c = useColors();
  // undefined means "today", whatever date that is when the app is opened.
  const [date, setDate] = useState<string>();
  const [picking, setPicking] = useState(false);
  const { data: day, error, loading, reload } = useLoad(() => api.day(date), [date]);

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
          title: isToday || !shown ? 'Today' : formatDay(shown),
          headerRight: () => (
            <View style={styles.nav}>
              <HeaderIcon name="calendar" label="Pick a date" onPress={() => setPicking((open) => !open)} />
              <HeaderIcon name="chevron.left" label="Previous day" onPress={() => shown && go(addDays(shown, -1))} />
              <HeaderIcon name="chevron.right" label="Next day" disabled={isToday} onPress={() => shown && go(addDays(shown, 1))} />
            </View>
          ),
        }}
      />
      <GestureDetector gesture={swipe}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: c.background }}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading && !!day} onRefresh={reload} tintColor={c.text3} />}
        >
          <View style={styles.subtitleRow}>
            <Text style={[styles.subtitle, { color: c.text2 }]}>
              {shown ? (isToday ? formatDay(shown) : daysAgo(daysBetween(shown, today!))) : ' '}
            </Text>
            {!isToday && (
              <Pressable onPress={() => go(undefined)} hitSlop={8}>
                <Text style={[styles.link, { color: c.accentStrong }]}>Back to today</Text>
              </Pressable>
            )}
          </View>
          {picking && shown && today && (
            <Card>
              <DateTimePicker
                value={new Date(`${shown}T12:00:00`)}
                maximumDate={new Date(`${today}T12:00:00`)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                accentColor={c.accent}
                onChange={(_, picked) => {
                  if (!picked) return setPicking(false);
                  const iso = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`;
                  go(iso);
                }}
              />
            </Card>
          )}
          {error && !day ? <Empty>{error}</Empty> : day ? <DayContent day={day} /> : null}
        </ScrollView>
      </GestureDetector>
    </>
  );
}

function HeaderIcon({ name, label, onPress, disabled }: { name: 'calendar' | 'chevron.left' | 'chevron.right'; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityLabel={label} style={({ pressed }) => [styles.headerIcon, { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 }]}>
      <SymbolView name={name} size={20} tintColor={c.accent} fallback={<Text style={{ color: c.accent, fontSize: 20 }}>{name === 'calendar' ? '▦' : name === 'chevron.left' ? '‹' : '›'}</Text>} />
    </Pressable>
  );
}

function DayContent({ day }: { day: DayDetail }) {
  const c = useColors();
  const { totals, goals } = day;
  return (
    <>
      <Card>
        <Meter hero label="Calories" value={totals.calories} goal={goals.calories} unit="kcal" kind="limit" />
        <View style={styles.macros}>
          <View style={styles.macro}>
            <Meter label="Protein" value={totals.protein_g} goal={goals.protein_g} unit="g" kind="target" />
          </View>
          <View style={styles.macro}>
            <Meter label="Carbs" value={totals.carbs_g} goal={goals.carbs_g} unit="g" />
          </View>
          <View style={styles.macro}>
            <Meter label="Fat" value={totals.fat_g} goal={goals.fat_g} unit="g" />
          </View>
        </View>
      </Card>

      <Card>
        <CardHeader title="Meals" action="+ Add" />
        {!day.meals.length && <Empty>Nothing logged yet. Tell Claude what you ate, or add it here.</Empty>}
        {day.meals.map((meal, i) => (
          <Row key={meal.id} first={i === 0}>
            <View style={styles.main}>
              <Text style={[styles.meta, { color: c.text2 }]}>
                {formatTime(meal.time)}
                {meal.meal_type ? ` · ${meal.meal_type[0].toUpperCase()}${meal.meal_type.slice(1)}` : ''}
              </Text>
              <Text style={[styles.title, { color: c.text }]}>{meal.description}</Text>
              <Text style={[styles.meta, { color: c.text2 }]} numberOfLines={1}>
                {meal.items.map((item) => item.name).join(', ')}
              </Text>
              <LabelNote items={meal.items} />
            </View>
            <View style={styles.side}>
              <Text style={[styles.sideValue, { color: c.text }]}>{formatNumber(meal.calories)} kcal</Text>
              <Text style={[styles.meta, { color: c.text2 }]}>
                P {formatNumber(meal.protein_g)} · C {formatNumber(meal.carbs_g)} · F {formatNumber(meal.fat_g)}
              </Text>
            </View>
          </Row>
        ))}
      </Card>

      <Card>
        <CardHeader title="Workouts" action="+ Add" />
        {!day.workouts.length && <Empty>No workout logged.</Empty>}
        {day.workouts.map((workout, i) => (
          <Row key={workout.id} first={i === 0}>
            <View style={styles.main}>
              <Text style={[styles.meta, { color: c.text2 }]}>
                {formatTime(workout.time)} · {workout.type[0].toUpperCase() + workout.type.slice(1)}
              </Text>
              <Text style={[styles.title, { color: c.text }]}>{workout.description}</Text>
              {workout.exercises.map((exercise, j) => (
                <Text key={j} style={[styles.meta, { color: c.text2 }]}>
                  {exercise.name}
                  {exercise.sets?.length ? ` · ${setSummary(exercise.sets)}` : ''}
                  {exercise.distance ? ` · ${exercise.distance} ${exercise.distance_unit ?? 'mi'}` : ''}
                </Text>
              ))}
            </View>
            <View style={styles.side}>
              {workout.duration_min ? <Text style={[styles.sideValue, { color: c.text }]}>{formatNumber(workout.duration_min)} min</Text> : null}
              {workout.effort ? <Text style={[styles.meta, { color: c.text2 }]}>Effort {workout.effort}/10</Text> : null}
            </View>
          </Row>
        ))}
      </Card>

      <Card>
        <CardHeader title="Weight" action="+ Log" />
        {!day.weigh_ins.length && <Empty>No weigh-in.</Empty>}
        {day.weigh_ins.map((weighIn, i) => (
          <Row key={weighIn.id} first={i === 0}>
            <View style={styles.main}>
              <Text style={[styles.title, { color: c.text }]}>
                {weighIn.weight} {weighIn.unit}
              </Text>
              {weighIn.notes ? <Text style={[styles.meta, { color: c.text2 }]}>{weighIn.notes}</Text> : null}
            </View>
            <Text style={[styles.meta, { color: c.text2 }]}>{formatTime(weighIn.time)}</Text>
          </Row>
        ))}
      </Card>
    </>
  );
}

/** How many of a meal's items use a product's label rather than an estimate. */
function LabelNote({ items }: { items: Meal['items'] }) {
  const c = useColors();
  const labelled = items.filter((item) => item.source).length;
  if (!labelled) return null;
  return (
    <Text style={[styles.meta, { color: c.text2 }]}>✓ {labelled === items.length ? 'Label data' : `${labelled} of ${items.length} items from labels`}</Text>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIcon: { padding: 4 },
  subtitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, marginTop: 2 },
  subtitle: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600' },
  macros: { flexDirection: 'row', gap: 12, marginTop: 16 },
  macro: { flex: 1 },
  main: { flex: 1, minWidth: 0, gap: 1 },
  side: { alignItems: 'flex-end', gap: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13 },
  sideValue: { fontSize: 16, fontWeight: '600' },
});
