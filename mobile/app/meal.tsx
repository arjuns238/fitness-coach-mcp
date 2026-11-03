// Add or edit a meal, as an iOS page sheet. Packaged foods can be searched or scanned for their label data.
import { Minus } from '@tamagui/lucide-icons-2/icons/Minus';
import { Plus } from '@tamagui/lucide-icons-2/icons/Plus';
import { ScanBarcode } from '@tamagui/lucide-icons-2/icons/ScanBarcode';
import { Search } from '@tamagui/lucide-icons-2/icons/Search';
import { X } from '@tamagui/lucide-icons-2/icons/X';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button, Input, Paragraph, SizableText, Theme, XStack, YStack } from 'tamagui';
import { formatDecimal, formatNumber } from '../../web/src/format.ts';
import { itemFromMatch, withServings } from '../../web/src/meal-items.ts';
import { api, type FoodItem, type FoodMatch, type Meal } from '../lib/api.ts';
import { onScanned, takeEntry } from '../lib/editing.ts';
import { ChoiceChips, DestructiveButton, formStyles, LinkButton, NumberField, Section, TextField, useFieldColor, WhenRow } from '../lib/forms.tsx';
import { IconTile, MEAL_TYPES, mealIcon, useCardColor } from '../lib/kit.tsx';
import { HeaderButton } from '../lib/navigation.tsx';
import { useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { useToast } from '../lib/toast.tsx';
import { success, tap } from '../lib/ui.tsx';

const MACROS = [
  ['calories', 'kcal'],
  ['protein_g', 'Protein'],
  ['carbs_g', 'Carbs'],
  ['fat_g', 'Fat'],
] as const;
const SOURCE_NAMES = { usda: 'USDA', off: 'Open Food Facts' };
const blankItem = (): FoodItem => ({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

export default function MealSheet() {
  const c = useColors();
  const toast = useToast();
  const { handle } = useSession();
  const card = useCardColor();
  const field = useFieldColor();
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
            <YStack marginBottom="$5" gap="$2">
              <SizableText size="$2" fontWeight="600" color="$color10" marginLeft="$3" letterSpacing={0.6}>
                REPEAT A RECENT MEAL
              </SizableText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {recent.map((meal) => (
                  <XStack
                    key={meal.id}
                    backgroundColor={card}
                    borderRadius="$5"
                    padding="$2.5"
                    gap="$2.5"
                    alignItems="center"
                    maxWidth={240}
                    pressStyle={{ scale: 0.97, opacity: 0.8 }}
                    onPress={() => {
                      tap();
                      setDescription(meal.description);
                      setMealType(meal.meal_type ?? mealType);
                      setItems(meal.items.map((item) => ({ ...item })));
                    }}
                  >
                    <IconTile {...mealIcon(meal.meal_type)} />
                    <YStack flexShrink={1}>
                      <SizableText size="$3" fontWeight="700" numberOfLines={1}>
                        {meal.description}
                      </SizableText>
                      <SizableText size="$2" color="$color10">
                        {formatNumber(meal.calories)} kcal
                      </SizableText>
                    </YStack>
                  </XStack>
                ))}
              </ScrollView>
            </YStack>
          )}

          <Section>
            <TextField label="What was it?" value={description} onChangeText={setDescription} placeholder="e.g. chicken burrito bowl" />
            <ChoiceChips allowNone options={MEAL_TYPES} value={(mealType as (typeof MEAL_TYPES)[number]['value']) || ''} onChange={setMealType} />
            <WhenRow date={date} time={time} onDate={setDate} onTime={setTime} />
          </Section>

          <Section title="Foods" footer="Search or scan packaged foods to use their label. Everything else is an estimate you can adjust.">
            <FoodFinder
              onAdd={(match) => {
                addItem(itemFromMatch(match));
                toast(`Added ${match.source.product}`);
              }}
            />
          </Section>

          <YStack gap="$2.5" marginBottom="$2">
            {items.map((item, index) => (
              <YStack key={index} backgroundColor={card} borderRadius="$6" padding="$3.5" gap="$3" transition="quick" enterStyle={{ opacity: 0, y: 8 }}>
                <XStack alignItems="center" gap="$2">
                  {item.source ? (
                    <YStack flex={1}>
                      <SizableText size="$5" fontWeight="700">
                        {item.name}
                      </SizableText>
                      {item.quantity ? (
                        <SizableText size="$2" color="$color10">
                          {item.quantity}
                        </SizableText>
                      ) : null}
                    </YStack>
                  ) : (
                    <>
                      <Input flex={1} size="$3" value={item.name} onChangeText={(name: string) => setItem(index, { name })} placeholder="Food" placeholderTextColor={'$color8' as never} backgroundColor={field} borderWidth={0} fontWeight="700" />
                      <Input width={110} size="$3" value={item.quantity ?? ''} onChangeText={(quantity: string) => setItem(index, { quantity })} placeholder="Amount" placeholderTextColor={'$color8' as never} backgroundColor={field} borderWidth={0} />
                    </>
                  )}
                  {items.length > 1 && (
                    <Button circular size="$2" chromeless icon={<X size={16} color="$color10" />} accessibilityLabel="Remove food" onPress={() => setItems(items.filter((_, i) => i !== index))} />
                  )}
                </XStack>
                <XStack gap="$2">
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
                </XStack>
                {item.source ? (
                  <XStack alignItems="center" justifyContent="space-between">
                    <Theme name="green">
                      <XStack backgroundColor="$color4" borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
                        <SizableText size="$1" fontWeight="700" color="$color11">
                          ✓ Label · {SOURCE_NAMES[item.source.db]}
                        </SizableText>
                      </XStack>
                    </Theme>
                    <XStack alignItems="center" gap="$2">
                      <Button
                        circular
                        size="$2.5"
                        backgroundColor={field}
                        icon={<Minus size={14} />}
                        disabled={(item.servings ?? 1) <= 0.5}
                        opacity={(item.servings ?? 1) <= 0.5 ? 0.35 : 1}
                        accessibilityLabel="Fewer servings"
                        onPress={() => {
                          tap();
                          setItems(items.map((it, i) => (i === index ? withServings(it, (it.servings ?? 1) - 0.5) : it)));
                        }}
                      />
                      <SizableText size="$2" fontWeight="600" minWidth={74} textAlign="center">
                        {formatDecimal(item.servings ?? 1)} serving{(item.servings ?? 1) === 1 ? '' : 's'}
                      </SizableText>
                      <Button
                        circular
                        size="$2.5"
                        backgroundColor={field}
                        icon={<Plus size={14} />}
                        accessibilityLabel="More servings"
                        onPress={() => {
                          tap();
                          setItems(items.map((it, i) => (i === index ? withServings(it, (it.servings ?? 1) + 0.5) : it)));
                        }}
                      />
                    </XStack>
                  </XStack>
                ) : item.name.trim() ? (
                  <XStack backgroundColor={field} borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1" alignSelf="flex-start">
                    <SizableText size="$1" fontWeight="700" color="$color10">
                      Estimate
                    </SizableText>
                  </XStack>
                ) : null}
              </YStack>
            ))}
          </YStack>
          <LinkButton label="+ Add food" onPress={() => setItems([...items, blankItem()])} />

          <Theme name="blue">
            <XStack backgroundColor="$color3" borderRadius="$6" padding="$3.5" marginVertical="$4" alignItems="center" justifyContent="space-between">
              <YStack>
                <SizableText size="$2" fontWeight="600" color="$color11">
                  TOTAL
                </SizableText>
                <SizableText size="$7" fontWeight="800" color="$color12">
                  {formatNumber(total('calories'))} kcal
                </SizableText>
              </YStack>
              <SizableText size="$3" fontWeight="600" color="$color11">
                P {formatNumber(total('protein_g'))} · C {formatNumber(total('carbs_g'))} · F {formatNumber(total('fat_g'))}
              </SizableText>
            </XStack>
          </Theme>

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
          {entry && <DestructiveButton label="Delete meal" title="Delete this meal?" message="It will be removed from your log." onConfirm={remove} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

/** Search packaged foods, or scan a barcode; a pick becomes an item with its label numbers. No Claude involved. */
function FoodFinder({ onAdd }: { onAdd: (match: FoodMatch) => void }) {
  const { handle } = useSession();
  const field = useFieldColor();
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
    <YStack gap="$2.5">
      <XStack gap="$2">
        <XStack flex={1} alignItems="center" gap="$2" backgroundColor={field} borderRadius="$4" paddingLeft="$3">
          <Search size={16} color="$color10" />
          <Input flex={1} unstyled size="$4" height={44} value={query} onChangeText={setQuery} placeholder="Search packaged foods" placeholderTextColor={'$color8' as never} returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false} color="$color" />
          {searching && <ActivityIndicator size="small" style={{ marginRight: 10 }} />}
        </XStack>
        <Theme name="blue">
          <Button
            size="$4"
            backgroundColor="$color9"
            color="white"
            fontWeight="700"
            icon={<ScanBarcode size={18} color="white" />}
            pressStyle={{ backgroundColor: '$color10', scale: 0.97 }}
            accessibilityLabel="Scan a barcode"
            onPress={() => {
              tap();
              router.push('/scan');
            }}
          >
            Scan
          </Button>
        </Theme>
      </XStack>
      {results && !results.length && !searching && (
        <Paragraph size="$2" color="$color10">
          No products with label data. Add it by hand below.
        </Paragraph>
      )}
      {results?.map((match, i) => (
        <YStack
          key={`${match.source.db}:${match.source.id}`}
          paddingVertical="$2"
          gap="$0.5"
          borderTopWidth={i > 0 ? 0.5 : 0}
          borderTopColor="$borderColor"
          pressStyle={{ opacity: 0.55 }}
          onPress={() => {
            tap();
            onAdd(match);
            setQuery('');
            setResults(null);
          }}
        >
          <SizableText size="$4" fontWeight="700">
            {match.source.product}
          </SizableText>
          <SizableText size="$2" color="$color10">
            {match.serving} · {formatNumber(match.per_serving.calories)} kcal · P {formatNumber(match.per_serving.protein_g)} · C {formatNumber(match.per_serving.carbs_g)} · F{' '}
            {formatNumber(match.per_serving.fat_g)}
          </SizableText>
        </YStack>
      ))}
    </YStack>
  );
}

