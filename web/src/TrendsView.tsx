import { useState, type CSSProperties } from 'react';
import { api, type Lift, type Trends } from './api.ts';
import { ColumnChart, DataTable, Legend, LineChart, type Column, type Key } from './charts.tsx';
import { formatDay, formatDecimal, formatNumber, formatShortDate, formatSigned } from './format.ts';
import { Meter, useAsync, useCountUp } from './ui.tsx';

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <strong>
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      <span>{label}</span>
    </div>
  );
}

export const TREND_RANGES = [
  { weeks: 4, label: '4 weeks' },
  { weeks: 12, label: '12 weeks' },
  { weeks: 26, label: '6 months' },
];

/** Energy per unit of body weight, as on the server: turns a calorie gap into a weekly rate. */
const ENERGY_PER_UNIT = { lb: 3500, kg: 7700 };
/** The latest lifts shown before "Show all". */
const LIFTS_SHOWN = 4;

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
/** Day axes are labelled at week starts. */
const dayTicks = (t: Trends) => t.days.map((d) => (isSunday(d.date) ? formatShortDate(d.date) : undefined));
const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;

export function TrendsView({ weeks }: { weeks: number }) {
  const { data, loading } = useAsync(() => api.trends(weeks), [weeks]);

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <h1>Trends</h1>
          {data && (
            <div className="subtitle">
              {formatShortDate(data.range.start)} – {formatShortDate(data.range.end)}
            </div>
          )}
        </div>
      </header>
      {!data ? (
        <p className="loading">Loading…</p>
      ) : (
        <div className={`trends${loading ? ' reloading' : ''}`}>
          {/* Above the range control: it always covers the last 28 days. */}
          <MaintenanceCard t={data} />
          <div className="filter-row">
            <div className="segmented sliding" role="group" aria-label="Range" style={{ '--count': TREND_RANGES.length } as CSSProperties}>
              <span
                className="segmented-indicator"
                aria-hidden
                style={{ transform: `translateX(${Math.max(0, TREND_RANGES.findIndex((r) => r.weeks === weeks)) * 100}%)` }}
              />
              {TREND_RANGES.map((range) => (
                <button key={range.weeks} type="button" aria-pressed={range.weeks === weeks} onClick={() => (location.hash = `#/trends/${range.weeks}`)}>
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          {/* A new range remounts the cards so the charts draw in again. */}
          <div className="trend-cards" key={data.range.weeks}>
            <WeightCard t={data} />
            <NutritionCard t={data} metric="calories" />
            <NutritionCard t={data} metric="protein" />
            <WorkoutsCard t={data} />
            <StrengthCard t={data} />
          </div>
        </div>
      )}
    </>
  );
}

function CountUp({ value }: { value: number }) {
  return <>{formatNumber(useCountUp(value))}</>;
}

function MaintenanceCard({ t }: { t: Trends }) {
  const m = t.maintenance;
  const unit = t.unit;
  const goal = t.goals.calories;
  return (
    <section className="card">
      <div className="card-header">
        <h2>Estimated maintenance</h2>
        <span className="card-note">Last {m.window.days} days</span>
      </div>
      {m.estimate !== undefined ? (
        <>
          <div className="hero">
            <span className="hero-value">
              <CountUp value={m.estimate} />
            </span>
            <span className="hero-of">kcal a day</span>
          </div>
          <p className="card-text">
            Over the last {m.window.days} days you averaged {formatNumber(m.avg_intake!)} kcal on {plural(m.logged_days, 'logged day')} while your weight{' '}
            {Math.abs(m.weight_change_per_week!) < 0.05
              ? 'held steady'
              : `${m.weight_change_per_week! < 0 ? 'dropped' : 'rose'} ${formatDecimal(Math.abs(m.weight_change_per_week!))} ${unit} a week`}
            .
          </p>
          {goal !== undefined && (
            <p className="card-text">
              At your {formatNumber(goal)} kcal goal, expect about {formatSigned(((goal - m.estimate) * 7) / ENERGY_PER_UNIT[unit])} {unit} a week.
            </p>
          )}
          <p className="fine-print">The calories that would keep your weight steady, from what you logged and how your weight moved. Assumes the days you logged are complete.</p>
        </>
      ) : (
        <>
          <p className="card-text">The calories that would keep your weight steady, worked out from what you log and how your weight moves. It needs a bit more from the last {m.window.days} days:</p>
          <div className="requirements">
            <Meter label="Days with meals logged" value={m.logged_days} goal={m.requirements.logged_days} unit="days" kind="target" />
            <Meter label="Weigh-ins" value={m.weigh_ins} goal={m.requirements.weigh_ins} unit="weigh-ins" kind="target" />
            <Meter label="Days from first to last weigh-in" value={m.weigh_in_span_days} goal={m.requirements.weigh_in_span_days} unit="days" kind="target" />
          </div>
        </>
      )}
    </section>
  );
}

function WeightCard({ t }: { t: Trends }) {
  const w = t.weight;
  const unit = t.unit;
  const target = t.goals.target_weight;
  return (
    <section className="card">
      <div className="card-header">
        <h2>Weight</h2>
      </div>
      {!w ? (
        <p className="empty">No weigh-ins in this range. Tell Claude your weight, or add it on the Today tab.</p>
      ) : (
        <>
          <div className="stats">
            <Stat value={formatDecimal(w.latest_trend)} unit={unit} label="7-day average" />
            {w.change_per_week !== undefined ? (
              <Stat value={formatSigned(w.change_per_week)} unit={`${unit}/wk`} label={`since ${formatShortDate(t.days.find((d) => d.weight !== undefined)!.date)}`} />
            ) : (
              <Stat value="–" label="per week (needs 7+ days)" />
            )}
            {w.to_target !== undefined ? (
              <Stat value={formatDecimal(Math.abs(w.to_target))} unit={unit} label="to target" />
            ) : (
              <Stat value={formatNumber(w.weigh_ins)} label="weigh-ins" />
            )}
          </div>
          <LineChart
            label="Weight: weigh-ins and 7-day average"
            ticks={dayTicks(t)}
            series={[
              { values: t.days.map((d) => d.weight), kind: 'dots', tone: 'muted', label: 'Weigh-in' },
              { values: t.days.map((d) => d.trend), kind: 'line', tone: 'accent', label: '7-day average' },
            ]}
            reference={target !== undefined ? { value: target, label: `Target ${formatDecimal(target)}` } : undefined}
            minSpan={unit === 'kg' ? 2 : 4}
            tooltip={(i) => {
              const d = t.days[i];
              return {
                title: formatDay(d.date),
                rows: [
                  ...(d.trend !== undefined ? [{ value: `${formatDecimal(d.trend)} ${unit}`, label: '7-day average', key: 'line' as const }] : []),
                  d.weight !== undefined
                    ? { value: `${formatDecimal(d.weight)} ${unit}`, label: 'weigh-in', key: 'dot-muted' as const }
                    : { value: 'No weigh-in', label: 'this day' },
                ],
              };
            }}
          />
          <Legend
            items={[
              { label: '7-day average', key: 'line' },
              { label: 'Weigh-in', key: 'dot-muted' },
            ]}
          />
          <DataTable
            columns={['Date', `Weigh-in (${unit})`, '7-day avg']}
            rows={t.days.filter((d) => d.weight !== undefined).map((d) => [formatShortDate(d.date), formatDecimal(d.weight!), d.trend !== undefined ? formatDecimal(d.trend) : ''])}
          />
        </>
      )}
    </section>
  );
}

function NutritionCard({ t, metric }: { t: Trends; metric: 'calories' | 'protein' }) {
  const calories = metric === 'calories';
  const unit = calories ? 'kcal' : 'g';
  const goal = calories ? t.goals.calories : t.goals.protein_g;
  const n = t.nutrition;
  const average = calories ? n.avg_calories : n.avg_protein_g;
  const hit = calories ? n.days_calories_within_10pct : n.days_protein_met;
  // 4 weeks fits one column per day; longer ranges show each week's daily average.
  const daily = t.range.weeks <= 4;
  const format = (v: number) => `${formatNumber(v)} ${unit}`;
  const key = (partial?: boolean): Key => (partial ? 'soft' : 'bar');

  const columns: Column[] = daily
    ? t.days.map((d) => {
        const value = calories ? d.calories : d.protein_g;
        return {
          value,
          partial: d.in_progress,
          tick: isSunday(d.date) ? formatShortDate(d.date) : undefined,
          tooltip: {
            title: formatDay(d.date),
            rows: value !== undefined ? [{ value: format(value), label: d.in_progress ? 'so far today' : undefined, key: key(d.in_progress) }] : [{ value: 'Nothing logged' }],
          },
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
            rows:
              value !== undefined
                ? [{ value: `${format(value)} a day`, label: `${plural(w.logged_days, 'logged day')}${w.in_progress ? ' so far' : ''}`, key: key(w.in_progress) }]
                : [{ value: 'Nothing logged' }],
          },
        };
      });
  const hasPartial = columns.some((c) => c.partial && c.value);

  return (
    <section className="card">
      <div className="card-header">
        <h2>{calories ? 'Calories' : 'Protein'}</h2>
        <span className="card-note">{daily ? 'Per day' : 'Daily average by week'}</span>
      </div>
      {!t.days.some((d) => d.meals > 0) ? (
        <p className="empty">No meals logged in this range.</p>
      ) : (
        <>
          <div className="stats">
            <Stat value={average !== undefined ? formatNumber(average) : '–'} unit={unit} label="daily average" />
            <Stat value={goal !== undefined ? formatNumber(goal) : '–'} unit={goal !== undefined ? unit : undefined} label={goal !== undefined ? 'goal' : 'no goal set'} />
            {hit !== undefined ? (
              <Stat value={`${hit}/${n.logged_days}`} label={calories ? 'days within 10%' : 'days at goal'} />
            ) : (
              <Stat value={formatNumber(n.logged_days)} label="days logged" />
            )}
          </div>
          <ColumnChart
            label={`${calories ? 'Calories' : 'Protein'} ${daily ? 'per day' : 'daily average by week'}`}
            columns={columns}
            reference={goal !== undefined ? { value: goal, label: `Goal ${formatNumber(goal)}` } : undefined}
          />
          {hasPartial && <Legend items={[{ label: daily ? 'Today, so far' : 'This week, so far', key: 'soft' }]} />}
          <DataTable
            columns={daily ? ['Date', unit] : ['Week of', `${unit} a day`, 'Days logged']}
            rows={
              daily
                ? t.days.filter((d) => d.meals > 0).map((d) => [formatShortDate(d.date), formatNumber((calories ? d.calories : d.protein_g)!)])
                : t.weeks
                    .filter((w) => w.logged_days > 0)
                    .map((w) => [formatShortDate(w.start), formatNumber((calories ? w.avg_calories : w.avg_protein_g)!), w.logged_days])
            }
          />
        </>
      )}
    </section>
  );
}

function WorkoutsCard({ t }: { t: Trends }) {
  const goal = t.goals.workouts_per_week;
  const { training } = t;
  const columns: Column[] = t.weeks.map((w) => ({
    value: w.workouts,
    partial: w.in_progress,
    tick: formatShortDate(w.start),
    tooltip: {
      title: `Week of ${formatShortDate(w.start)}`,
      rows: [{ value: plural(w.workouts, 'workout'), label: w.in_progress ? 'so far' : undefined, key: w.in_progress ? 'soft' : 'bar' }],
    },
  }));

  return (
    <section className="card">
      <div className="card-header">
        <h2>Workouts per week</h2>
      </div>
      {!training.workouts ? (
        <p className="empty">No workouts logged in this range.</p>
      ) : (
        <>
          <div className="stats">
            <Stat value={training.avg_per_completed_week !== undefined ? formatDecimal(training.avg_per_completed_week) : '–'} label="weekly average" />
            <Stat value={goal !== undefined ? formatNumber(goal) : '–'} label={goal !== undefined ? 'weekly goal' : 'no goal set'} />
            {training.weeks_meeting_goal !== undefined ? (
              <Stat value={`${training.weeks_meeting_goal}/${training.completed_weeks}`} label="weeks at goal" />
            ) : (
              <Stat value={formatNumber(training.workouts)} label="workouts" />
            )}
          </div>
          <ColumnChart label="Workouts per week" columns={columns} reference={goal !== undefined ? { value: goal, label: `Goal ${formatNumber(goal)}` } : undefined} />
          {columns.some((c) => c.partial && c.value) && <Legend items={[{ label: 'This week, so far', key: 'soft' }]} />}
          <DataTable columns={['Week of', 'Workouts']} rows={t.weeks.map((w) => [formatShortDate(w.start), w.workouts])} />
        </>
      )}
    </section>
  );
}

function StrengthCard({ t }: { t: Trends }) {
  const [showAll, setShowAll] = useState(false);
  const lifts = showAll ? t.lifts : t.lifts.slice(0, LIFTS_SHOWN);
  return (
    <section className="card">
      <div className="card-header">
        <h2>Strength</h2>
        <span className="card-note">Estimated 1-rep max</span>
      </div>
      {!t.lifts.length ? (
        <p className="empty">No weighted sets in this range. Log lifts with weight and reps, like "bench 3 sets of 5 at 185".</p>
      ) : (
        <>
          {lifts.map((lift) => (
            <LiftChart key={lift.name} lift={lift} t={t} />
          ))}
          {t.lifts.length > LIFTS_SHOWN && (
            <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${t.lifts.length} lifts`}
            </button>
          )}
          <p className="fine-print">From your best set each session: weight × (1 + reps ÷ 30), counting sets of 1–12 reps.</p>
          <DataTable
            columns={['Lift', 'Date', 'Best set', `1RM (${t.unit})`]}
            rows={t.lifts.flatMap((lift) => lift.sessions.map((s) => [lift.name, formatShortDate(s.date), `${formatDecimal(s.weight)} × ${s.reps}`, formatDecimal(s.e1rm)]))}
          />
        </>
      )}
    </section>
  );
}

function LiftChart({ lift, t }: { lift: Lift; t: Trends }) {
  const sessions = new Map(lift.sessions.map((s) => [s.date, s]));
  const values = t.days.map((d) => sessions.get(d.date)?.e1rm);
  const latest = lift.sessions.at(-1)!;
  return (
    <div className="lift">
      <div className="lift-head">
        <strong>{lift.name}</strong>
        <span>
          {formatDecimal(latest.e1rm)} {t.unit}
          {lift.change !== undefined &&
            ` · ${lift.change === 0 ? 'same as' : `${formatSigned(lift.change)} since`} ${formatShortDate(lift.sessions[0].date)}`}
        </span>
      </div>
      <LineChart
        label={`${lift.name}, estimated one-rep max`}
        height={128}
        ticks={dayTicks(t)}
        minSpan={lift.best.e1rm * 0.1}
        series={[
          { values, kind: 'line', tone: 'accent', label: 'Estimated 1RM', connect: true },
          { values, kind: 'dots', tone: 'accent', label: 'Session' },
        ]}
        tooltip={(i) => {
          const s = sessions.get(t.days[i].date)!;
          return {
            title: formatDay(s.date),
            rows: [
              { value: `${formatDecimal(s.e1rm)} ${t.unit}`, label: 'estimated 1RM', key: 'dot' },
              { value: `${formatDecimal(s.weight)} × ${s.reps}`, label: 'best set' },
            ],
          };
        }}
      />
    </div>
  );
}
