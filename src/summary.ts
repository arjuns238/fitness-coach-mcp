import type { FitnessDb } from './db.ts';
import type { Entries, MealRow, Profile, WeightUnit } from './types.ts';
import { addDays, daysBetween, nowLocal, weekday } from './time.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight;
  return round1(from === 'kg' ? weight * 2.20462 : weight / 2.20462);
}

function mealTotals(meals: MealRow[]) {
  const sum = (key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g') => round1(meals.reduce((t, m) => t + m[key], 0));
  return { calories: Math.round(sum('calories')), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') };
}

function goals(profile: Profile) {
  return {
    calories: profile.daily_calories,
    protein_g: profile.daily_protein_g,
    carbs_g: profile.daily_carbs_g,
    fat_g: profile.daily_fat_g,
  };
}

function remaining(totals: ReturnType<typeof mealTotals>, profile: Profile) {
  const out: Record<string, number> = {};
  for (const [key, goal] of Object.entries(goals(profile))) {
    if (goal !== undefined) out[key] = round1(goal - totals[key as keyof typeof totals]);
  }
  return Object.keys(out).length ? out : undefined;
}

export function nowString(profile: Profile): string {
  const now = nowLocal(profile.timezone);
  return `${now.date} (${weekday(now.date)}) ${now.time} ${profile.timezone}`;
}

/** Compact running totals for one day — returned after every log so Claude can confirm progress in one line. */
export function dayTotals(db: FitnessDb, date: string, profile: Profile) {
  const { meals, workouts } = db.entries(date, date);
  const totals = mealTotals(meals);
  return {
    date,
    timezone: profile.timezone,
    meals_logged: meals.length,
    workouts_logged: workouts.length,
    totals,
    remaining_vs_goals: remaining(totals, profile),
  };
}

export function dayDetail(db: FitnessDb, date: string, profile: Profile) {
  const { meals, workouts, weigh_ins } = db.entries(date, date);
  const totals = mealTotals(meals);
  return {
    now: nowString(profile),
    date,
    weekday: weekday(date),
    totals,
    goals: goals(profile),
    remaining_vs_goals: remaining(totals, profile),
    meals: meals.map(({ local_date: _, local_time, ...m }) => ({ time: local_time, ...m })),
    workouts: workouts.map(({ local_date: _, local_time, ...w }) => ({ time: local_time, ...w })),
    weigh_ins: weigh_ins.map(({ local_date: _, local_time, ...w }) => ({ time: local_time, ...w })),
    profile,
  };
}

export function rangeSummary(db: FitnessDb, start: string, end: string, profile: Profile) {
  const entries: Entries = db.entries(start, end);
  const today = nowLocal(profile.timezone).date;
  const unit = profile.weight_unit;

  const days = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const meals = entries.meals.filter((m) => m.local_date === date);
    const workouts = entries.workouts.filter((w) => w.local_date === date);
    const weighIn = entries.weigh_ins.findLast((w) => w.local_date === date);
    days.push({
      date,
      wd: weekday(date),
      ...(date === today ? { in_progress: true } : {}),
      meals: meals.length,
      ...(meals.length ? mealTotals(meals) : {}),
      ...(workouts.length
        ? { workouts: workouts.map((w) => `${w.type}${w.duration_min ? ` ${w.duration_min}min` : ''}: ${w.description}`) }
        : {}),
      ...(weighIn ? { weight: convertWeight(weighIn.weight, weighIn.unit, unit) } : {}),
    });
  }

  // Averages use completed days with at least one meal, so an unfinished today or a skipped day doesn't drag them down.
  const loggedDays = days.filter((d) => d.meals > 0 && !d.in_progress) as Array<(typeof days)[number] & ReturnType<typeof mealTotals>>;
  const avg = (key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g') =>
    loggedDays.length ? round1(loggedDays.reduce((t, d) => t + d[key], 0) / loggedDays.length) : undefined;

  const dayCount = daysBetween(start, end) + 1;
  const byType: Record<string, number> = {};
  for (const w of entries.workouts) byType[w.type] = (byType[w.type] ?? 0) + 1;

  const weights = entries.weigh_ins.map((w) => ({ date: w.local_date, weight: convertWeight(w.weight, w.unit, unit) }));
  const first = weights[0];
  const last = weights.at(-1);

  return {
    now: nowString(profile),
    range: { start, end, days: dayCount },
    goals: { ...goals(profile), workouts_per_week: profile.workouts_per_week, target_weight: profile.target_weight, weight_unit: unit },
    nutrition: {
      days_with_meals_logged: days.filter((d) => d.meals > 0).length,
      averages_per_logged_day: loggedDays.length
        ? { calories: avg('calories'), protein_g: avg('protein_g'), carbs_g: avg('carbs_g'), fat_g: avg('fat_g') }
        : undefined,
      days_protein_goal_met:
        profile.daily_protein_g !== undefined ? loggedDays.filter((d) => d.protein_g >= profile.daily_protein_g!).length : undefined,
      days_calories_within_10pct:
        profile.daily_calories !== undefined
          ? loggedDays.filter((d) => Math.abs(d.calories - profile.daily_calories!) <= profile.daily_calories! * 0.1).length
          : undefined,
    },
    training: {
      workouts: entries.workouts.length,
      total_minutes: Math.round(entries.workouts.reduce((t, w) => t + (w.duration_min ?? 0), 0)),
      by_type: byType,
      per_week: round1(entries.workouts.length / (dayCount / 7)),
    },
    weight:
      first && last
        ? { first, last, change: round1(last.weight - first.weight), unit, weigh_ins: weights.length }
        : undefined,
    days,
  };
}
