// A month at a glance: which days were logged, which met the goals, and which had a workout. Tap a day to open it.
import { CalendarCheck } from '@tamagui/lucide-icons-2/icons/CalendarCheck';
import { ChevronLeft } from '@tamagui/lucide-icons-2/icons/ChevronLeft';
import { ChevronRight } from '@tamagui/lucide-icons-2/icons/ChevronRight';
import { Dumbbell } from '@tamagui/lucide-icons-2/icons/Dumbbell';
import { Target } from '@tamagui/lucide-icons-2/icons/Target';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, useColorScheme } from 'react-native';
import { Button, Circle, Paragraph, SizableText, Theme, XStack, YStack, type ThemeName } from 'tamagui';
import { formatMonth, shiftMonth, todayFromNow } from '../../../../web/src/format.ts';
import { api, type MonthSummary, type SummaryDay } from '../../../lib/api.ts';
import { ScreenTitle, useCardColor } from '../../../lib/kit.tsx';
import { useColors } from '../../../lib/theme.ts';
import { tap, useLoad } from '../../../lib/ui.tsx';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const thisMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);

/**
 * A day "meets goals" when calories land within 10% of the goal and protein reaches its goal (whichever of the
 * two are set), the same rule as the web calendar. Undefined when neither goal is set.
 */
function metGoals(day: SummaryDay, goals: MonthSummary['goals']): boolean | undefined {
  if (goals.calories === undefined && goals.protein_g === undefined) return undefined;
  if (!day.meals || day.in_progress) return false;
  const caloriesOk = goals.calories === undefined || Math.abs((day.calories ?? 0) - goals.calories) <= goals.calories * 0.1;
  const proteinOk = goals.protein_g === undefined || (day.protein_g ?? 0) >= goals.protein_g;
  return caloriesOk && proteinOk;
}

export default function History() {
  const c = useColors();
  const [month, setMonth] = useState(thisMonth);
  const { data, loading, reload } = useLoad(() => api.month(month), [month]);
  const isCurrent = month >= thisMonth();
  const go = (next: string) => {
    tap();
    setMonth(next);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text3} />}
    >
      <YStack gap="$4">
        <ScreenTitle
          title="History"
          subtitle={formatMonth(month)}
          right={
            <XStack gap="$2" alignItems="center">
              {!isCurrent && (
                <Button size="$2.5" borderRadius="$10" theme="blue" fontWeight="700" onPress={() => go(thisMonth())}>
                  This month
                </Button>
              )}
              <NavButton label="Previous month" onPress={() => go(shiftMonth(month, -1))} icon={<ChevronLeft size={18} />} />
              <NavButton label="Next month" disabled={isCurrent} onPress={() => go(shiftMonth(month, 1))} icon={<ChevronRight size={18} />} />
            </XStack>
          }
        />
        {data ? <Month key={month} data={data} /> : <Paragraph color="$color10">Loading…</Paragraph>}
      </YStack>
    </ScrollView>
  );
}

function NavButton({ label, icon, onPress, disabled }: { label: string; icon: React.ReactElement; onPress: () => void; disabled?: boolean }) {
  const card = useCardColor();
  return <Button circular size="$3" backgroundColor={card} icon={icon} disabled={disabled} opacity={disabled ? 0.35 : 1} aria-label={label} pressStyle={{ scale: 0.92 }} onPress={onPress} />;
}

function StatTile({ theme, icon: Icon, value, label }: { theme: ThemeName; icon: typeof Target; value: number; label: string }) {
  return (
    <Theme name={theme}>
      <YStack flex={1} backgroundColor="$color3" borderRadius="$6" padding="$3" gap="$1" transition="lazy" enterStyle={{ opacity: 0, y: 10 }}>
        <Circle size="$2.5" backgroundColor="$color5">
          <Icon size={14} color="$color11" />
        </Circle>
        <SizableText size="$8" fontWeight="800" color="$color12" marginTop="$1">
          {value}
        </SizableText>
        <SizableText size="$2" fontWeight="600" color="$color11">
          {label}
        </SizableText>
      </YStack>
    </Theme>
  );
}

function Month({ data }: { data: MonthSummary }) {
  const card = useCardColor();
  const dark = useColorScheme() === 'dark';
  const today = todayFromNow(data.now);
  const first = new Date(`${data.range.start}T00:00:00Z`).getUTCDay();
  const cells: (SummaryDay | null)[] = [...Array(first).fill(null), ...data.days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const hasGoals = data.goals.calories !== undefined || data.goals.protein_g !== undefined;
  const logged = data.days.filter((d) => d.meals > 0).length;
  const goalDays = data.days.filter((d) => metGoals(d, data.goals)).length;

  return (
    <YStack gap="$4">
      <XStack gap="$2.5">
        <StatTile theme="blue" icon={CalendarCheck} value={logged} label="days logged" />
        <StatTile theme="green" icon={Target} value={goalDays} label="goal days" />
        <StatTile theme="purple" icon={Dumbbell} value={data.training.workouts} label="workouts" />
      </XStack>

      <YStack backgroundColor={card} borderRadius="$7" padding="$3" gap="$1.5" transition="lazy" enterStyle={{ opacity: 0, y: 10 }}>
        <XStack>
          {WEEKDAYS.map((d, i) => (
            <SizableText key={i} flex={1} textAlign="center" size="$1" fontWeight="700" color="$color9" paddingBottom="$1">
              {d}
            </SizableText>
          ))}
        </XStack>
        {weeks.map((week, w) => (
          <XStack key={w} gap="$1.5">
            {week.map((day, i) =>
              day ? (
                <DayCell key={day.date} day={day} today={today} met={metGoals(day, data.goals)} dark={dark} />
              ) : (
                <YStack key={`blank-${w}-${i}`} flex={1} aspectRatio={1} />
              ),
            )}
          </XStack>
        ))}
        <XStack flexWrap="wrap" gap="$3" paddingTop="$2" paddingHorizontal="$1">
          <Legend swatch={<YStack width={12} height={12} borderRadius={4} backgroundColor="$color4" />} label="Not logged" />
          <Legend
            swatch={
              <Theme name="blue">
                <YStack width={12} height={12} borderRadius={4} backgroundColor="$color5" />
              </Theme>
            }
            label="Logged"
          />
          {hasGoals && (
            <Legend
              swatch={
                <Theme name="blue">
                  <YStack width={12} height={12} borderRadius={4} backgroundColor="$color9" />
                </Theme>
              }
              label="Goals met ✓"
            />
          )}
          <Legend swatch={<Circle size={6} backgroundColor="$color10" />} label="Workout" />
        </XStack>
      </YStack>
    </YStack>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <XStack alignItems="center" gap="$1.5">
      {swatch}
      <SizableText size="$2" color="$color10">
        {label}
      </SizableText>
    </XStack>
  );
}

function DayCell({ day, today, met, dark }: { day: SummaryDay; today: string; met: boolean | undefined; dark: boolean }) {
  const future = day.date > today;
  const isToday = day.date === today;
  const logged = day.meals > 0;
  const number = Number(day.date.slice(8));
  const label = `${day.date}${logged ? ', logged' : ''}${met ? ', goals met' : ''}${day.workouts?.length ? ', workout' : ''}`;

  const cell = (
    <YStack
      position="relative"
      flex={1}
      aspectRatio={1}
      borderRadius="$4"
      alignItems="center"
      justifyContent="center"
      backgroundColor={future ? 'transparent' : met ? '$color9' : logged ? '$color5' : dark ? '$color4' : '$color3'}
      borderWidth={isToday ? 2 : 0}
      borderColor="$color12"
      opacity={future ? 0.35 : 1}
      pressStyle={future ? undefined : { scale: 0.92 }}
      accessibilityRole="button"
      aria-label={label}
      onPress={
        future
          ? undefined
          : () => {
              tap();
              router.navigate({ pathname: '/', params: { date: day.date } });
            }
      }
    >
      <SizableText size="$4" fontWeight="700" color={met ? 'white' : '$color12'}>
        {number}
      </SizableText>
      {met && (
        <SizableText position="absolute" top={2} right={5} size="$1" fontWeight="800" color="white">
          ✓
        </SizableText>
      )}
      {day.workouts?.length ? <Circle position="absolute" bottom={5} size={5} backgroundColor={met ? 'white' : '$color11'} /> : null}
    </YStack>
  );
  return logged || met ? <Theme name="blue">{cell}</Theme> : cell;
}
