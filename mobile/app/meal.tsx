// Add or edit a meal, as an iOS page sheet. Packaged foods can be searched or scanned for their label data.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Input, SizableText, XStack, YStack } from 'tamagui';
import { formatDecimal, formatNumber } from '../../web/src/format.ts';
import { itemFromMatch, withServings } from '../../web/src/meal-items.ts';
import { api, type FoodItem, type FoodMatch, type Meal } from '../lib/api.ts';
import { onScanned, takeEntry } from '../lib/editing.ts';
import { DestructiveButton, formStyles, LinkButton, NumberField, Section, Segmented, TextField, WhenRow } from '../lib/forms.tsx';
import { HeaderButton } from '../lib/navigation.tsx';
import { useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { useToast } from '../lib/toast.tsx';
import { success, tap } from '../lib/ui.tsx';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;
const MACROS = [
  ['calories', 'kcal'],
  ['protein_g', 'Protein g'],
  ['carbs_g', 'Carbs g'],
  ['fat_g', 'Fat g'],
] as const;
const SOURCE_NAMES = { usda: 'USDA', off: 'Open Food Facts' };
const blankItem = (): FoodItem => ({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

export default function MealSheet() {
  const c = useColors();
  const toast = useToast();
  const { handle } = useSession();
  const params = useLocalSearchParams<{ date: string; time: string }>();
  const [entry] = useState(() => takeEntry<Meal>());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [mealType, setMealType] = useState(entry?.meal_type ?? '');
  const [date, setDate] = useState(params.date);
  const [time, setTime] = useState(entry?.time ?? params.time);
  const [items, setItems] = useState<FoodItem[]>(entry?.items ?? [blankItem()]);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [recent, setRecent] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A picked or scanned product replaces the empty starter row, if that's all there is.
  const addItem = (item: FoodItem) => setItems((current) => [...current.filter((i) => i.name.trim() || i.calories), item]);

  useEffect(() => {
    onScanned((match) => {
      addItem(itemFromMatch(match));
      success();
      toast(`Added ${match.source.product}`);
    });
    return () => onScanned(undefined);
  }, [toast]);

  useEffect(() => {
    if (!entry) api.recentMeals().then((meals) => setRecent(meals.slice(0, 10) as unknown as Meal[]), () => {});
  }, [entry]);

  const setItem = (index: number, patch: Partial<FoodItem>) => setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const total = (key: (typeof MACROS)[number][0]) => items.reduce((sum, item) => sum + (item[key] || 0), 0);

  const save = async () => {
    const named = items.filter((item) => item.name.trim());
    if (!named.length) return setError('Add at least one food.');
    setBusy(true);
    setError('');
    const body = {
      description: description.trim() || named.map((item) => item.name).join(', '),
      items: named.map((item) => ({ ...item, name: item.name.trim(), quantity: item.quantity?.trim() || undefined })),
      meal_type: mealType || undefined,
      date,
      time,
      notes,
    };
    try {
      if (entry) await api.update('meals', entry.id, body);
      else await api.create('meals', body);
      success();
      toast(entry ? 'Saved' : 'Meal added');
      router.back();
    } catch (e) {
      handle(e);
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.remove('meals', entry!.id);
      success();
      toast('Meal deleted');
      router.back();
    } catch (e) {
      handle(e);
      setError(e instanceof Error ? e.message : "Couldn't delete.");
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: entry ? 'Edit meal' : 'Add meal',
          headerLeft: () => <HeaderButton label="Cancel" onPress={() => router.back()} />,
          headerRight: () => (busy ? <ActivityIndicator color={c.accent} /> : <HeaderButton label="Save" bold onPress={save} />),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {recent.length > 0 && (
            <Section title="Repeat a recent meal">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recent}>
                {recent.map((meal) => (
                  <YStack
                    key={meal.id}
                    backgroundColor={c.fill}
                    borderRadius="$4"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    maxWidth={220}
                    pressStyle={{ opacity: 0.6, scale: 0.97 }}
                    onPress={() => {
                      tap();
                      setDescription(meal.description);
                      setMealType(meal.meal_type ?? mealType);
                      setItems(meal.items.map((item) => ({ ...item })));
                    }}
                  >
                    <SizableText size="$4" fontWeight="600" numberOfLines={1} color={c.text}>
                      {meal.description}
                    </SizableText>
                    <SizableText size="$2" color={c.text2}>
                      {formatNumber(meal.calories)} kcal
                    </SizableText>
                  </YStack>
                ))}
              </ScrollView>
            </Section>
          )}

          <Section>
            <TextField label="What was it?" value={description} onChangeText={setDescription} placeholder="e.g. chicken burrito bowl" />
            <Segmented allowNone options={MEAL_TYPES.map((type) => ({ value: type, label: capitalize(type) }))} value={(mealType as (typeof MEAL_TYPES)[number]) || ''} onChange={setMealType} />
            <WhenRow date={date} time={time} onDate={setDate} onTime={setTime} />
          </Section>

          <Section title="Foods" footer="Search or scan packaged foods to use their label. Everything else is an estimate you can adjust.">
            <FoodFinder onAdd={(match) => {
              addItem(itemFromMatch(match));
              toast(`Added ${match.source.product}`);
            }} />
          </Section>

          {items.map((item, index) => (
            <View key={index} style={[styles.item, { backgroundColor: c.surface }]}>
              <View style={styles.itemHead}>
                {item.source ? (
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: c.text }]}>{item.name}</Text>
                    {item.quantity ? <Text style={[styles.small, { color: c.text2 }]}>{item.quantity}</Text> : null}
                  </View>
                ) : (
                  <>
                    <Input
                      flex={1}
                      size="$3"
                      value={item.name}
                      onChangeText={(name: string) => setItem(index, { name })}
                      placeholder="Food"
                      placeholderTextColor={c.text3 as never}
                      backgroundColor={c.fill}
                      borderWidth={0}
                      color={c.text}
                      fontWeight="600"
                    />
                    <Input
                      width={110}
                      size="$3"
                      value={item.quantity ?? ''}
                      onChangeText={(quantity: string) => setItem(index, { quantity })}
                      placeholder="Amount"
                      placeholderTextColor={c.text3 as never}
                      backgroundColor={c.fill}
                      borderWidth={0}
                      color={c.text}
                    />
                  </>
                )}
                {items.length > 1 && (
                  <Pressable onPress={() => setItems(items.filter((_, i) => i !== index))} hitSlop={10} accessibilityLabel="Remove food">
                    <SymbolView name="xmark.circle.fill" size={22} tintColor={c.text3} fallback={<Text style={{ color: c.text3, fontSize: 20 }}>×</Text>} />
                  </Pressable>
                )}
              </View>
              <View style={styles.macroRow}>
                {MACROS.map(([key, label]) => (
                  <NumberField
                    key={key}
                    compact
                    label={label}
                    value={item[key] || undefined}
                    placeholder="0"
                    // Typing over label numbers makes them your own (and stops the server looking the label up again).
                    onChange={(value) => setItem(index, { [key]: value ?? 0, ...(item.source ? { source: undefined, brand: undefined } : {}) })}
                  />
                ))}
              </View>
              {item.source ? (
                <View style={styles.sourceRow}>
                  <Text style={[styles.badge, { backgroundColor: c.accentTrack, color: c.text }]}>✓ Label · {SOURCE_NAMES[item.source.db]}</Text>
                  <View style={styles.stepper}>
                    <StepButton label="−" disabled={(item.servings ?? 1) <= 0.5} onPress={() => setItems(items.map((it, i) => (i === index ? withServings(it, (it.servings ?? 1) - 0.5) : it)))} />
                    <Text style={[styles.small, { color: c.text2, minWidth: 74, textAlign: 'center' }]}>
                      {formatDecimal(item.servings ?? 1)} serving{(item.servings ?? 1) === 1 ? '' : 's'}
                    </Text>
                    <StepButton label="+" onPress={() => setItems(items.map((it, i) => (i === index ? withServings(it, (it.servings ?? 1) + 0.5) : it)))} />
                  </View>
                </View>
              ) : item.name.trim() ? (
                <Text style={[styles.badge, { backgroundColor: c.fill, color: c.text2, alignSelf: 'flex-start' }]}>Estimate</Text>
              ) : null}
            </View>
          ))}
          <LinkButton label="+ Add food" onPress={() => setItems([...items, blankItem()])} />

          <View style={styles.totals}>
            <Text style={[styles.totalsText, { color: c.text2 }]}>
              Total <Text style={{ color: c.text, fontWeight: '700' }}>{formatNumber(total('calories'))} kcal</Text>
            </Text>
            <Text style={[styles.totalsText, { color: c.text2 }]}>
              P {formatNumber(total('protein_g'))} · C {formatNumber(total('carbs_g'))} · F {formatNumber(total('fat_g'))}
            </Text>
          </View>

          <Section>
            <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" />
          </Section>
          {error ? <Text style={[styles.error, { color: c.critical }]}>{error}</Text> : null}
          {entry && <DestructiveButton label="Delete meal" title="Delete this meal?" message="It will be removed from your log." onConfirm={remove} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Button
      circular
      size="$2.5"
      disabled={disabled}
      opacity={disabled ? 0.35 : 1}
      backgroundColor={c.fill}
      color={c.text}
      fontSize={18}
      pressStyle={{ scale: 0.92, backgroundColor: c.fill }}
      onPress={() => {
        tap();
        onPress();
      }}
    >
      {label}
    </Button>
  );
}

/** Search packaged foods, or scan a barcode; a pick becomes an item with its label numbers. No Claude involved. */
function FoodFinder({ onAdd }: { onAdd: (match: FoodMatch) => void }) {
  const c = useColors();
  const { handle } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults(null);
    let current = true;
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .searchFoods(q)
        .then((found) => current && setResults(found.results))
        .catch(handle)
        .finally(() => current && setSearching(false));
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, handle]);

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.finderRow}>
        <XStack flex={1} alignItems="center" gap="$2" backgroundColor={c.fill} borderRadius="$4" paddingLeft="$3">
          <SymbolView name="magnifyingglass" size={16} tintColor={c.text3} fallback={<Text style={{ color: c.text3 }}>⌕</Text>} />
          <Input
            flex={1}
            size="$4"
            unstyled
            value={query}
            onChangeText={setQuery}
            placeholder="Search packaged foods"
            placeholderTextColor={c.text3 as never}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            color={c.text}
          />
          {searching && <ActivityIndicator size="small" color={c.text3} style={{ marginRight: 10 }} />}
        </XStack>
        <Button
          size="$4"
          backgroundColor={c.accent}
          pressStyle={{ opacity: 0.85, backgroundColor: c.accent }}
          accessibilityLabel="Scan a barcode"
          icon={<SymbolView name="barcode.viewfinder" size={20} tintColor={c.onAccent} fallback={<Text style={{ color: c.onAccent }}>▥</Text>} />}
          color={c.onAccent}
          fontWeight="600"
          onPress={() => {
            tap();
            router.push('/scan');
          }}
        >
          Scan
        </Button>
      </View>
      {results && !results.length && !searching && <Text style={[styles.small, { color: c.text3 }]}>No products with label data. Add it by hand below.</Text>}
      {results?.map((match, i) => (
        <YStack
          key={`${match.source.db}:${match.source.id}`}
          paddingVertical="$2"
          gap="$0.5"
          borderTopWidth={i > 0 ? StyleSheet.hairlineWidth : 0}
          borderTopColor={c.separator}
          pressStyle={{ opacity: 0.55 }}
          onPress={() => {
            tap();
            onAdd(match);
            setQuery('');
            setResults(null);
          }}
        >
          <SizableText size="$4" fontWeight="600" color={c.text}>
            {match.source.product}
          </SizableText>
          <SizableText size="$2" color={c.text2}>
            {match.serving} · {formatNumber(match.per_serving.calories)} kcal · P {formatNumber(match.per_serving.protein_g)} · C {formatNumber(match.per_serving.carbs_g)} · F{' '}
            {formatNumber(match.per_serving.fat_g)}
          </SizableText>
        </YStack>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  recent: { gap: 8 },
  recentChip: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, maxWidth: 220 },
  recentName: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  chipText: { fontSize: 15 },
  item: { borderRadius: 12, padding: 12, gap: 10, marginBottom: 10 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemInput: { minHeight: 40, borderRadius: 9, paddingHorizontal: 10, fontSize: 16 },
  macroRow: { flexDirection: 'row', gap: 6 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  totals: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 14, paddingHorizontal: 4 },
  totalsText: { fontSize: 15 },
  error: { fontSize: 15, marginBottom: 12 },
  finderRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, minHeight: 42 },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 8 },
  scan: { width: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  result: { paddingVertical: 9, gap: 2 },
  resultName: { fontSize: 15, fontWeight: '600' },
});
