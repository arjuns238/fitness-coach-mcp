// Progress over whole weeks: weight with a 7-day average, estimated maintenance calories, weekly nutrition and
// training against goals, and estimated one-rep maxes per lift. Shared by get_trends and the dashboard.
import type { FitnessDb } from './db.ts';
import { convertWeight, mealTotals, nowString, round1 } from './summary.ts';
import { addDays, daysBetween, nowLocal } from './time.ts';
import type { Lift, LiftSession, Maintenance, MealRow, Profile, TrendDay, Trends, TrendWeek, WeightUnit, WorkoutRow } from './types.ts';

/** The maintenance estimate looks at the last 28 completed days and needs at least this much data in them. */
export const MAINTENANCE = { days: 28, logged_days: 14, weigh_ins: 4, weigh_in_span_days: 14 };

/** Energy per unit of body weight change, the usual approximation for turning a weight trend into calories. */
const ENERGY_PER_UNIT: Record<WeightUnit, number> = { lb: 3500, kg: 7700 };

/** Sets above this many reps say little about a one-rep max. */
const MAX_E1RM_REPS = 12;

// Voice logs name the same lift several ways. Grouping uses a loose key plus these aliases; the log_workout
// schema asks Claude for standard names so new entries line up anyway.
const ALIASES: Record<string, string> = {
  bench: 'bench press',
  'flat bench': 'bench press',
  'flat bench press': 'bench press',
  'barbell bench press': 'bench press',
  'back squat': 'squat',
  'barbell squat': 'squat',
  'barbell back squat': 'squat',
  'barbell deadlift': 'deadlift',
  'conventional deadlift': 'deadlift',
  ohp: 'overhead press',
  'military press': 'overhead press',
  rdl: 'romanian deadlift',
  pullup: 'pull up',
  chinup: 'chin up',
};

/** "Pull-ups", "pull ups" and "Pullup" all become "pull up". */
export function exerciseKey(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word.length >= 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
  return ALIASES[key] ?? key;
}

/** Epley's formula; a single rep is its own max. */
export const estimateOneRepMax = (weight: number, reps: number) => (reps === 1 ? weight : weight * (1 + reps / 30));

const weekStart = (date: string) => addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
const mean = (values: number[]) => values.reduce((total, v) => total + v, 0) / values.length;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Least-squares slope of y per unit of x. */
function slope(points: { x: number; y: number }[]): number {
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let covariance = 0;
  let variance = 0;
  for (const p of points) {
    covariance += (p.x - mx) * (p.y - my);
    variance += (p.x - mx) ** 2;
  }
  return variance ? covariance / variance : 0;
}

function groupByDate<T extends { local_date: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.local_date, [...(map.get(row.local_date) ?? []), row]);
  return map;
}

export function trends(db: FitnessDb, weeks: number, profile: Profile, today = nowLocal(profile.timezone).date): Trends {
  const unit = profile.weight_unit;
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const maintenanceEnd = addDays(today, -1);
  const maintenanceStart = addDays(maintenanceEnd, -(MAINTENANCE.days - 1));
  // Six extra days so the 7-day average is complete at the start of the range.
  const entries = db.entries([addDays(start, -6), maintenanceStart].sort()[0], today);

  const mealsOn = groupByDate(entries.meals);
  const workoutsOn = groupByDate(entries.workouts);
  // The first weigh-in of each day (entries come oldest first), usually the morning one.
  const weightOn = new Map<string, number>();
  for (const w of entries.weigh_ins) {
    if (!weightOn.has(w.local_date)) weightOn.set(w.local_date, convertWeight(w.weight, w.unit, unit));
  }
  const trendOn = (date: string) => {
    const recent = [0, 1, 2, 3, 4, 5, 6].map((i) => weightOn.get(addDays(date, -i))).filter((w) => w !== undefined);
    return recent.length ? round1(mean(recent)) : undefined;
  };

  const days: TrendDay[] = [];
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const meals = mealsOn.get(date) ?? [];
    const totals = meals.length ? mealTotals(meals) : undefined;
    const trend = trendOn(date);
    days.push({
      date,
      ...(date === today ? { in_progress: true as const } : {}),
      meals: meals.length,
      ...(totals ? { calories: totals.calories, protein_g: totals.protein_g } : {}),
      workouts: workoutsOn.get(date)?.length ?? 0,
      ...(weightOn.has(date) ? { weight: weightOn.get(date) } : {}),
      ...(trend !== undefined ? { trend } : {}),
    });
  }

  // Averages use completed days with at least one meal, like get_summary: a skipped day or an unfinished
  // today would drag them down.
  const isLogged = (d: TrendDay) => d.meals > 0 && !d.in_progress;
  const logged = days.filter(isLogged);

  const weekRows: TrendWeek[] = [];
  for (let ws = start; ws <= today; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const inWeek = days.filter((d) => d.date >= ws && d.date <= we);
    const loggedInWeek = inWeek.filter(isLogged);
    weekRows.push({
      start: ws,
      end: we,
      ...(we >= today ? { in_progress: true as const } : {}),
      logged_days: loggedInWeek.length,
      ...(loggedInWeek.length
        ? {
            avg_calories: Math.round(mean(loggedInWeek.map((d) => d.calories!))),
            avg_protein_g: round1(mean(loggedInWeek.map((d) => d.protein_g!))),
          }
        : {}),
      workouts: inWeek.reduce((total, d) => total + d.workouts, 0),
    });
  }
  const completedWeeks = weekRows.filter((w) => !w.in_progress);

  const { daily_calories: calorieGoal, daily_protein_g: proteinGoal, workouts_per_week: workoutGoal } = profile;
  const weighIns = days.filter((d) => d.weight !== undefined);
  const latestTrend = days.findLast((d) => d.trend !== undefined)?.trend;
  const weighInSpan = weighIns.length ? daysBetween(weighIns[0].date, weighIns.at(-1)!.date) : 0;

  return {
    now: nowString(profile),
    range: { start, end: today, weeks },
    unit,
    goals: { calories: calorieGoal, protein_g: proteinGoal, workouts_per_week: workoutGoal, target_weight: profile.target_weight },
    nutrition: {
      logged_days: logged.length,
      avg_calories: logged.length ? Math.round(mean(logged.map((d) => d.calories!))) : undefined,
      avg_protein_g: logged.length ? round1(mean(logged.map((d) => d.protein_g!))) : undefined,
      days_calories_within_10pct:
        calorieGoal !== undefined ? logged.filter((d) => Math.abs(d.calories! - calorieGoal) <= calorieGoal * 0.1).length : undefined,
      days_protein_met: proteinGoal !== undefined ? logged.filter((d) => d.protein_g! >= proteinGoal).length : undefined,
    },
    training: {
      workouts: days.reduce((total, d) => total + d.workouts, 0),
      completed_weeks: completedWeeks.length,
      avg_per_completed_week: completedWeeks.length ? round1(mean(completedWeeks.map((w) => w.workouts))) : undefined,
      weeks_meeting_goal: workoutGoal !== undefined ? completedWeeks.filter((w) => w.workouts >= workoutGoal).length : undefined,
    },
    weight:
      latestTrend !== undefined && weighIns.length
        ? {
            latest_trend: latestTrend,
            weigh_ins: weighIns.length,
            change_per_week:
              weighIns.length >= 2 && weighInSpan >= 7
                ? round2(slope(weighIns.map((d) => ({ x: daysBetween(start, d.date), y: d.weight! }))) * 7)
                : undefined,
            to_target: profile.target_weight !== undefined ? round1(latestTrend - profile.target_weight) : undefined,
          }
        : undefined,
    maintenance: maintenance(maintenanceStart, maintenanceEnd, mealsOn, weightOn, unit),
    lifts: lifts(
      entries.workouts.filter((w) => w.local_date >= start),
      unit,
    ),
    weeks: weekRows,
    days,
  };
}

/**
 * Calories that would hold weight steady: average logged intake minus the energy in the weight trend's slope.
 * Losing 0.5 lb a week on 2,000 kcal means maintenance is about 2,250. Consistent over- or under-estimates in
 * the logged calories cancel out, because the estimate is relative to what was logged.
 */
function maintenance(
  start: string,
  end: string,
  mealsOn: Map<string, MealRow[]>,
  weightOn: Map<string, number>,
  unit: WeightUnit,
): Maintenance {
  const intake: number[] = [];
  const weights: { x: number; y: number }[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const meals = mealsOn.get(date);
    if (meals?.length) intake.push(mealTotals(meals).calories);
    const weight = weightOn.get(date);
    if (weight !== undefined) weights.push({ x: daysBetween(start, date), y: weight });
  }
  const span = weights.length ? weights.at(-1)!.x - weights[0].x : 0;
  const { days, ...requirements } = MAINTENANCE;
  const base = { window: { start, end, days }, logged_days: intake.length, weigh_ins: weights.length, weigh_in_span_days: span, requirements };
  if (intake.length < requirements.logged_days || weights.length < requirements.weigh_ins || span < requirements.weigh_in_span_days) {
    return base;
  }
  const perDay = slope(weights);
  const avgIntake = mean(intake);
  return {
    ...base,
    estimate: Math.round((avgIntake - perDay * ENERGY_PER_UNIT[unit]) / 10) * 10,
    avg_intake: Math.round(avgIntake),
    weight_change_per_week: round2(perDay * 7),
  };
}

/** Best estimated one-rep max per lift per day, from weighted sets of 1-12 reps. */
function lifts(workouts: WorkoutRow[], unit: WeightUnit): Lift[] {
  const groups = new Map<string, { names: Map<string, number>; sessions: Map<string, LiftSession> }>();
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      let best: LiftSession | undefined;
      for (const set of exercise.sets ?? []) {
        if (!set.weight || !set.reps || set.reps > MAX_E1RM_REPS) continue;
        const weight = convertWeight(set.weight, set.unit ?? unit, unit);
        const e1rm = round1(estimateOneRepMax(weight, set.reps));
        if (!best || e1rm > best.e1rm) best = { date: workout.local_date, e1rm, weight, reps: set.reps };
      }
      if (!best) continue;
      const key = exerciseKey(exercise.name);
      const group = groups.get(key) ?? { names: new Map(), sessions: new Map() };
      groups.set(key, group);
      const name = exercise.name.trim();
      group.names.set(name, (group.names.get(name) ?? 0) + 1);
      const sameDay = group.sessions.get(best.date);
      if (!sameDay || best.e1rm > sameDay.e1rm) group.sessions.set(best.date, best);
    }
  }
  return [...groups.values()]
    .map(({ names, sessions }) => {
      const list = [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
      return {
        // The spelling used most often.
        name: [...names].sort((a, b) => b[1] - a[1])[0][0],
        sessions: list,
        best: list.reduce((a, b) => (b.e1rm > a.e1rm ? b : a)),
        ...(list.length > 1 ? { change: round1(list.at(-1)!.e1rm - list[0].e1rm) } : {}),
      };
    })
    .sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name));
}
