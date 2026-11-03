// Progress over weeks: estimated maintenance, weight, calories and protein against goals, workouts per week, and
// estimated one-rep max per lift. The same numbers as the web dashboard's Trends tab and Claude's get_trends.
import { LinearGradient } from '@tamagui/linear-gradient';
import { Activity } from '@tamagui/lucide-icons-2/icons/Activity';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Button, Paragraph, SizableText, Theme, XStack, YStack } from 'tamagui';
import { formatDay, formatDecimal, formatNumber, formatShortDate, formatSigned } from '../../../../web/src/format.ts';
import { api, type Lift, type Trends } from '../../../lib/api.ts';
import { ColumnChart, Legend, LineChart, type Column, type Tone } from '../../../lib/charts.tsx';
import { Segmented } from '../../../lib/forms.tsx';
import { ScreenTitle, useCardColor, useCountUp } from '../../../lib/kit.tsx';
import { useColors } from '../../../lib/theme.ts';
import { useLoad } from '../../../lib/ui.tsx';

const RANGES = [
  { value: '4', label: '4 weeks' },
  { value: '12', label: '12 weeks' },
  { value: '26', label: '6 months' },
] as const;
type Range = (typeof RANGES)[number]['value'];

/** Energy per unit of body weight, as on the server: turns a calorie gap into a weekly rate. */
const ENERGY_PER_UNIT = { lb: 3500, kg: 7700 };
const LIFTS_SHOWN = 4;

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
/** Day axes are labelled at week starts. */
const dayTicks = (t: Trends) => t.days.map((d) => (isSunday(d.date) ? formatShortDate(d.date) : undefined));
const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;

export default function TrendsScreen() {
  const c = useColors();
  const [range, setRange] = useState<Range>('12');
  const { data, loading, reload } = useLoad(() => api.trends(Number(range)), [range]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text3} />}
    >
      <YStack gap="$4">
        <ScreenTitle title="Trends" subtitle={data ? `${formatShortDate(data.range.start)} – ${formatShortDate(data.range.end)}` : ' '} />
        {!data ? (
          <Paragraph color="$color10">Loading…</Paragraph>
        ) : (
          <>
            {/* Above the range control: it always covers the last 28 days. */}
            <MaintenanceHero t={data} />
            <Segmented options={[...RANGES]} value={range} onChange={setRange} />
            {/* A new range remounts the cards so the charts draw in again; the old ones stay until it arrives. */}
            <YStack key={data.range.weeks} gap="$4" opacity={loading ? 0.5 : 1}>
              <WeightCard t={data} />
              <NutritionCard t={data} metric="calories" />
              <NutritionCard t={data} metric="protein" />
              <WorkoutsCard t={data} />
              <StrengthCard t={data} />
            </YStack>
          </>
        )}
      </YStack>
    </ScrollView>
  );
}

function MaintenanceHero({ t }: { t: Trends }) {
  const m = t.maintenance;
  const unit = t.unit;
  const goal = t.goals.calories;
  const shown = useCountUp(m.estimate ?? 0);
  const white = 'rgba(255,255,255,0.85)';
  return (
    <YStack borderRadius="$8" overflow="hidden" transition="lazy" enterStyle={{ opacity: 0, y: 12 }} shadowColor="$orange9" shadowOpacity={0.3} shadowRadius={18} shadowOffset={{ width: 0, height: 8 }}>
      <LinearGradient colors={['$orange9', '$pink9']} start={[0, 0]} end={[1, 1]} position="absolute" top={0} left={0} right={0} bottom={0} />
      <YStack position="relative" zIndex={1} padding="$5" gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <SizableText size="$2" fontWeight="700" letterSpacing={1.4} color={white}>
            ESTIMATED MAINTENANCE
          </SizableText>
          <SizableText size="$2" color={white}>
            Last {m.window.days} days
          </SizableText>
        </XStack>
        {m.estimate !== undefined ? (
          <>
            <XStack alignItems="baseline" gap="$2">
              <SizableText size="$12" fontWeight="800" color="white" letterSpacing={-2} lineHeight={64}>
                {formatNumber(shown)}
              </SizableText>
              <SizableText size="$6" color={white}>
                kcal a day
              </SizableText>
            </XStack>
            <SizableText size="$4" color="white">
              You averaged {formatNumber(m.avg_intake!)} kcal on {plural(m.logged_days, 'logged day')} while your weight{' '}
              {Math.abs(m.weight_change_per_week!) < 0.05 ? 'held steady' : `${m.weight_change_per_week! < 0 ? 'dropped' : 'rose'} ${formatDecimal(Math.abs(m.weight_change_per_week!))} ${unit} a week`}.
            </SizableText>
            {goal !== undefined && (
              <SizableText size="$4" fontWeight="700" color="white">
                At your {formatNumber(goal)} kcal goal: about {formatSigned(((goal - m.estimate) * 7) / ENERGY_PER_UNIT[unit])} {unit} a week.
              </SizableText>
            )}
            <SizableText size="$2" color={white} marginTop="$1">
              Calories that would keep your weight steady, from what you logged and how your weight moved. Assumes the days you logged are complete.
            </SizableText>
          </>
        ) : (
          <>
            <SizableText size="$5" fontWeight="700" color="white">
              Needs a bit more data
            </SizableText>
            <SizableText size="$3" color={white}>
              The calories that would keep your weight steady, worked out from what you log and how your weight moves.
            </SizableText>
            <YStack gap="$2" marginTop="$2">
              <Requirement label="Days with meals logged" value={m.logged_days} need={m.requirements.logged_days} />
              <Requirement label="Weigh-ins" value={m.weigh_ins} need={m.requirements.weigh_ins} />
              <Requirement label="Days from first to last weigh-in" value={m.weigh_in_span_days} need={m.requirements.weigh_in_span_days} />
            </YStack>
          </>
        )}
      </YStack>
    </YStack>
  );
}

function Requirement({ label, value, need }: { label: string; value: number; need: number }) {
  const done = value >= need;
  return (
    <YStack gap="$1">
      <XStack justifyContent="space-between">
        <SizableText size="$2" color="white" fontWeight="600">
          {label}
        </SizableText>
        <SizableText size="$2" color="white" fontWeight="700">
          {done ? '✓' : `${Math.min(value, need)} / ${need}`}
        </SizableText>
      </XStack>
      <YStack height={6} borderRadius={3} backgroundColor="rgba(255,255,255,0.25)" overflow="hidden">
        <YStack height="100%" width={`${Math.min(100, (value / need) * 100)}%`} borderRadius={3} backgroundColor="white" />
      </YStack>
    </YStack>
  );
}

function TrendCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const card = useCardColor();
  return (
    <YStack backgroundColor={card} borderRadius="$7" padding="$4" gap="$3" transition="lazy" enterStyle={{ opacity: 0, y: 10 }}>
      <XStack justifyContent="space-between" alignItems="baseline">
        <SizableText size="$6" fontWeight="700">
          {title}
        </SizableText>
        {note ? (
          <SizableText size="$2" color="$color10">
            {note}
          </SizableText>
        ) : null}
      </XStack>
      {children}
    </YStack>
  );
}

function Stats({ items, tone }: { items: { value: string; unit?: string; label: string }[]; tone: Tone }) {
  return (
    <Theme name={tone}>
      <XStack gap="$2">
        {items.map((item) => (
          <YStack key={item.label} flex={1} backgroundColor="$color3" borderRadius="$5" paddingVertical="$2.5" paddingHorizontal="$2" alignItems="center">
            <XStack alignItems="baseline" gap="$1">
              <SizableText size="$6" fontWeight="800" color="$color12">
                {item.value}
              </SizableText>
              {item.unit ? (
                <SizableText size="$2" fontWeight="700" color="$color11">
                  {item.unit}
                </SizableText>
              ) : null}
            </XStack>
            <SizableText size="$1" fontWeight="600" color="$color11" textAlign="center">
              {item.label}
            </SizableText>
          </YStack>
        ))}
      </XStack>
    </Theme>
  );
}

const Empty = ({ children }: { children: string }) => (
  <Paragraph size="$3" color="$color10">
    {children}
  </Paragraph>
);

function WeightCard({ t }: { t: Trends }) {
  const w = t.weight;
  const unit = t.unit;
  const target = t.goals.target_weight;
  return (
    <TrendCard title="Weight">
      {!w ? (
        <Empty>No weigh-ins in this range. Tell Claude your weight, or log it on Today.</Empty>
      ) : (
        <>
          <Stats
            tone="blue"
            items={[
              { value: formatDecimal(w.latest_trend), unit, label: '7-day average' },
              w.change_per_week !== undefined
                ? { value: formatSigned(w.change_per_week), unit: `${unit}/wk`, label: `since ${formatShortDate(t.days.find((d) => d.weight !== undefined)!.date)}` }
                : { value: '–', label: 'per week (needs 7+ days)' },
              w.to_target !== undefined ? { value: formatDecimal(Math.abs(w.to_target)), unit, label: 'to target' } : { value: formatNumber(w.weigh_ins), label: 'weigh-ins' },
            ]}
          />
          <LineChart
            ticks={dayTicks(t)}
            minSpan={unit === 'kg' ? 2 : 4}
            reference={target !== undefined ? { value: target, label: `Target ${formatDecimal(target)}` } : undefined}
            series={[
              { values: t.days.map((d) => d.weight), kind: 'dots', muted: true },
              { values: t.days.map((d) => d.trend), kind: 'line' },
            ]}
            tooltip={(i) => {
              const d = t.days[i];
              return {
                title: formatDay(d.date),
                rows: [
                  ...(d.trend !== undefined ? [{ value: `${formatDecimal(d.trend)} ${unit}`, label: '7-day avg' }] : []),
                  d.weight !== undefined ? { value: `${formatDecimal(d.weight)} ${unit}`, label: 'weigh-in' } : { value: 'No weigh-in' },
                ],
              };
            }}
          />
          <Legend
            items={[
              { label: '7-day average', key: 'line' },
              { label: 'Weigh-in', key: 'dot', muted: true },
            ]}
          />
        </>
      )}
    </TrendCard>
  );
}

function NutritionCard({ t, metric }: { t: Trends; metric: 'calories' | 'protein' }) {
  const calories = metric === 'calories';
  const unit = calories ? 'kcal' : 'g';
  const tone: Tone = calories ? 'blue' : 'green';
  const goal = calories ? t.goals.calories : t.goals.protein_g;
  const n = t.nutrition;
  const average = calories ? n.avg_calories : n.avg_protein_g;
  const hit = calories ? n.days_calories_within_10pct : n.days_protein_met;
  // 4 weeks fits one column per day; longer ranges show each week's daily average.
  const daily = t.range.weeks <= 4;
  const format = (v: number) => `${formatNumber(v)} ${unit}`;

  const columns: Column[] = daily
    ? t.days.map((d) => {
        const value = calories ? d.calories : d.protein_g;
        return {
          value,
          partial: d.in_progress,
          tick: isSunday(d.date) ? formatShortDate(d.date) : undefined,
          tooltip: { title: formatDay(d.date), rows: value !== undefined ? [{ value: format(value), label: d.in_progress ? 'so far today' : undefined }] : [{ value: 'Nothing logged' }] },
        };
      })
    : t.weeks.map((w) => {
        const value = calories ? w.avg_calories : w.avg_protein_g;
        return {
          value,
          partial: w.in_progress,
          tick: formatShortDate(w.start),
          tooltip: {
            title: `Week of ${formatShortDate(w.start)}`,
            rows: value !== undefined ? [{ value: `${format(value)}/day`, label: `${plural(w.logged_days, 'day')}${w.in_progress ? ' so far' : ''}` }] : [{ value: 'Nothing logged' }],
          },
        };
      });

  return (
    <TrendCard title={calories ? 'Calories' : 'Protein'} note={daily ? 'Per day' : 'Daily average by week'}>
      {!t.days.some((d) => d.meals > 0) ? (
        <Empty>No meals logged in this range.</Empty>
      ) : (
        <>
          <Stats
            tone={tone}
            items={[
              { value: average !== undefined ? formatNumber(average) : '–', unit, label: 'daily average' },
              goal !== undefined ? { value: formatNumber(goal), unit, label: 'goal' } : { value: '–', label: 'no goal set' },
              hit !== undefined ? { value: `${hit}/${n.logged_days}`, label: calories ? 'days within 10%' : 'days at goal' } : { value: formatNumber(n.logged_days), label: 'days logged' },
            ]}
          />
          <ColumnChart tone={tone} columns={columns} reference={goal !== undefined ? { value: goal, label: `Goal ${formatNumber(goal)}` } : undefined} />
          {columns.some((col) => col.partial && col.value) && <Legend tone={tone} items={[{ label: daily ? 'Today, so far' : 'This week, so far', key: 'soft' }]} />}
        </>
      )}
    </TrendCard>
  );
}

function WorkoutsCard({ t }: { t: Trends }) {
  const goal = t.goals.workouts_per_week;
  const { training } = t;
  const columns: Column[] = t.weeks.map((w) => ({
    value: w.workouts,
    partial: w.in_progress,
    tick: formatShortDate(w.start),
    tooltip: { title: `Week of ${formatShortDate(w.start)}`, rows: [{ value: plural(w.workouts, 'workout'), label: w.in_progress ? 'so far' : undefined }] },
  }));
  return (
    <TrendCard title="Workouts per week">
      {!training.workouts ? (
        <Empty>No workouts logged in this range.</Empty>
      ) : (
        <>
          <Stats
            tone="purple"
            items={[
              { value: training.avg_per_completed_week !== undefined ? formatDecimal(training.avg_per_completed_week) : '–', label: 'weekly average' },
              { value: goal !== undefined ? formatNumber(goal) : '–', label: goal !== undefined ? 'weekly goal' : 'no goal set' },
              training.weeks_meeting_goal !== undefined ? { value: `${training.weeks_meeting_goal}/${training.completed_weeks}`, label: 'weeks at goal' } : { value: formatNumber(training.workouts), label: 'workouts' },
            ]}
          />
          <ColumnChart tone="purple" columns={columns} reference={goal !== undefined ? { value: goal, label: `Goal ${formatNumber(goal)}` } : undefined} />
          {columns.some((col) => col.partial && col.value) && <Legend tone="purple" items={[{ label: 'This week, so far', key: 'soft' }]} />}
        </>
      )}
    </TrendCard>
  );
}

function StrengthCard({ t }: { t: Trends }) {
  const [showAll, setShowAll] = useState(false);
  const lifts = showAll ? t.lifts : t.lifts.slice(0, LIFTS_SHOWN);
  return (
    <TrendCard title="Strength" note="Estimated 1-rep max">
      {!t.lifts.length ? (
        <Empty>No weighted sets in this range. Log lifts with weight and reps, like "bench 3 sets of 5 at 185".</Empty>
      ) : (
        <YStack gap="$4">
          {lifts.map((lift) => (
            <LiftChart key={lift.name} lift={lift} t={t} />
          ))}
          {t.lifts.length > LIFTS_SHOWN && (
            <Theme name="blue">
              <Button size="$3" chromeless alignSelf="flex-start" color="$color10" fontWeight="700" onPress={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${t.lifts.length} lifts`}
              </Button>
            </Theme>
          )}
          <Paragraph size="$2" color="$color10">
            From your best set each session: weight × (1 + reps ÷ 30), counting sets of 1–12 reps.
          </Paragraph>
        </YStack>
      )}
    </TrendCard>
  );
}

function LiftChart({ lift, t }: { lift: Lift; t: Trends }) {
  const sessions = new Map(lift.sessions.map((s) => [s.date, s]));
  const values = t.days.map((d) => sessions.get(d.date)?.e1rm);
  const latest = lift.sessions.at(-1)!;
  const up = (lift.change ?? 0) > 0;
  return (
    <YStack gap="$1.5">
      <XStack alignItems="center" gap="$2.5">
        <Theme name="red">
          <YStack width={32} height={32} borderRadius="$3" backgroundColor="$color4" alignItems="center" justifyContent="center">
            <Activity size={16} color="$color11" />
          </YStack>
        </Theme>
        <YStack flex={1}>
          <SizableText size="$4" fontWeight="700">
            {lift.name}
          </SizableText>
          <SizableText size="$2" color="$color10">
            {formatDecimal(latest.e1rm)} {t.unit}
            {lift.change !== undefined ? (lift.change === 0 ? ` · same as ${formatShortDate(lift.sessions[0].date)}` : ` since ${formatShortDate(lift.sessions[0].date)}`) : ''}
          </SizableText>
        </YStack>
        {lift.change !== undefined && lift.change !== 0 && (
          <Theme name={up ? 'green' : 'orange'}>
            <XStack backgroundColor="$color4" borderRadius="$10" paddingHorizontal="$2" paddingVertical="$1">
              <SizableText size="$2" fontWeight="800" color="$color11">
                {up ? '▲' : '▼'} {formatDecimal(Math.abs(lift.change))} {t.unit}
              </SizableText>
            </XStack>
          </Theme>
        )}
      </XStack>
      <LineChart
        tone="red"
        height={130}
        ticks={dayTicks(t)}
        minSpan={lift.best.e1rm * 0.1}
        series={[
          { values, kind: 'line', connect: true },
          { values, kind: 'dots' },
        ]}
        tooltip={(i) => {
          const s = sessions.get(t.days[i].date)!;
          return { title: formatDay(s.date), rows: [{ value: `${formatDecimal(s.e1rm)} ${t.unit}`, label: 'est. 1RM' }, { value: `${formatDecimal(s.weight)} × ${s.reps}`, label: 'best set' }] };
        }}
      />
    </YStack>
  );
}
