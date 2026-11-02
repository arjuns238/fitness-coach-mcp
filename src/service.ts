// What the MCP tools and the REST API both do. Inputs arrive already validated by the schemas in schemas.ts.
import type { FitnessDb } from './db.ts';
import { InputError, NotFoundError } from './errors.ts';
import {
  MAX_RANGE_DAYS,
  MAX_TREND_WEEKS,
  type MealInput,
  type ProfilePatchInput,
  type SummaryRangeInput,
  type WeightInput,
  type WorkoutInput,
} from './schemas.ts';
import { dayDetail, dayTotals, rangeSummary } from './summary.ts';
import { addDays, daysBetween, isValidTimeZone, nowLocal, resolveDate } from './time.ts';
import { trends } from './trends.ts';
import type { EntryKind, Exercise, Profile } from './types.ts';

const MEAL_TIMES: Record<string, string> = { breakfast: '08:00', lunch: '12:30', dinner: '19:00', snack: '15:00' };

function resolveWhen(profile: Profile, date: string | undefined, time: string | undefined, fallbackTime = '12:00') {
  const local_date = resolveDate(date, profile.timezone);
  const now = nowLocal(profile.timezone);
  const local_time = time ?? (local_date === now.date ? now.time : fallbackTime);
  return { local_date, local_time };
}

/** For updates: only the date/time fields that were actually passed. */
function changedWhen(profile: Profile, date: string | undefined, time: string | undefined) {
  return {
    ...(date !== undefined ? { local_date: resolveDate(date, profile.timezone) } : {}),
    ...(time !== undefined ? { local_time: time } : {}),
  };
}

function withDefaultUnits(exercises: Exercise[], profile: Profile): Exercise[] {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets?.map((set) => (set.weight !== undefined ? { ...set, unit: set.unit ?? profile.weight_unit } : set)),
  }));
}

export function logMeal(db: FitnessDb, { description, items, meal_type, date, time, notes }: MealInput) {
  const profile = db.getProfile();
  const when = resolveWhen(profile, date, time, meal_type ? MEAL_TIMES[meal_type] : undefined);
  const logged = db.addMeal({ ...when, meal_type: meal_type ?? null, description, items, notes: notes ?? null });
  return { logged, day: dayTotals(db, when.local_date, profile) };
}

export function updateMeal(db: FitnessDb, id: number, { date, time, ...rest }: Partial<MealInput>) {
  const profile = db.getProfile();
  const updated = db.updateMeal(id, { ...rest, ...changedWhen(profile, date, time) });
  if (!updated) throw new NotFoundError(`No meal with id ${id}.`);
  return { updated, day: dayTotals(db, updated.local_date, profile) };
}

export function logWorkout(db: FitnessDb, { description, type, duration_min, effort, exercises = [], date, time, notes }: WorkoutInput) {
  const profile = db.getProfile();
  const when = resolveWhen(profile, date, time);
  const logged = db.addWorkout({
    ...when,
    type,
    description,
    duration_min: duration_min ?? null,
    effort: effort ?? null,
    exercises: withDefaultUnits(exercises, profile),
    notes: notes ?? null,
  });
  return { logged, day: dayTotals(db, when.local_date, profile) };
}

export function updateWorkout(db: FitnessDb, id: number, { date, time, exercises, ...rest }: Partial<WorkoutInput>) {
  const profile = db.getProfile();
  const updated = db.updateWorkout(id, {
    ...rest,
    ...changedWhen(profile, date, time),
    exercises: exercises && withDefaultUnits(exercises, profile),
  });
  if (!updated) throw new NotFoundError(`No workout with id ${id}.`);
  return { updated, day: dayTotals(db, updated.local_date, profile) };
}

export function logWeight(db: FitnessDb, { weight, unit, date, time, notes }: WeightInput) {
  const profile = db.getProfile();
  const when = resolveWhen(profile, date, time, '08:00');
  const logged = db.addWeighIn({ ...when, weight, unit: unit ?? profile.weight_unit, notes: notes ?? null });
  return { logged, target_weight: profile.target_weight };
}

export function updateWeight(db: FitnessDb, id: number, { date, time, ...rest }: Partial<WeightInput>) {
  const profile = db.getProfile();
  const updated = db.updateWeighIn(id, { ...rest, ...changedWhen(profile, date, time) });
  if (!updated) throw new NotFoundError(`No weigh-in with id ${id}.`);
  return { updated, target_weight: profile.target_weight };
}

export function deleteEntry(db: FitnessDb, kind: EntryKind, id: number) {
  const deleted = db.deleteEntry(kind, id);
  if (!deleted) throw new NotFoundError(`No ${kind} with id ${id}.`);
  return { deleted, kind };
}

export function getDay(db: FitnessDb, date: string | undefined) {
  const profile = db.getProfile();
  return dayDetail(db, resolveDate(date, profile.timezone), profile);
}

export function getSummary(db: FitnessDb, { start_date, end_date, days }: SummaryRangeInput) {
  const profile = db.getProfile();
  const end = resolveDate(end_date, profile.timezone);
  const start = start_date ? resolveDate(start_date, profile.timezone) : addDays(end, -((days ?? 7) - 1));
  if (start > end) throw new InputError(`start_date ${start} is after end_date ${end}.`);
  if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) throw new InputError(`Range is longer than ${MAX_RANGE_DAYS} days.`);
  return rangeSummary(db, start, end, profile);
}

/** Day-by-day summary of one calendar month (YYYY-MM), for the history calendar. */
export function getMonth(db: FitnessDb, month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new InputError(`Invalid month "${month}". Use YYYY-MM.`);
  const [year, m] = [Number(match[1]), Number(match[2])];
  const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;
  return rangeSummary(db, `${month}-01`, addDays(next, -1), db.getProfile());
}

export function getTrends(db: FitnessDb, weeks = 12) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_TREND_WEEKS) {
    throw new InputError(`weeks must be a whole number from 1 to ${MAX_TREND_WEEKS}.`);
  }
  return trends(db, weeks, db.getProfile());
}

export function updateProfile(db: FitnessDb, patch: ProfilePatchInput) {
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
    throw new InputError(`Unknown timezone "${patch.timezone}". Use an IANA name like "America/New_York".`);
  }
  return db.updateProfile(patch);
}

export function recentMeals(db: FitnessDb, limit = 20) {
  return db.recentMeals(limit);
}
