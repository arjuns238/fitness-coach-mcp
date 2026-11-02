import type { Exercise, FoodItem, MealRow, Profile, Trends, WeighInRow, WorkoutRow } from '../../src/types.ts';

export type { Exercise, ExerciseSet, FoodItem, Lift, Profile, Trends, WeightUnit } from '../../src/types.ts';

export interface Totals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

type Timed<T> = Omit<T, 'local_date' | 'local_time'> & { time: string };
export type Meal = Timed<MealRow>;
export type Workout = Timed<WorkoutRow>;
export type WeighIn = Timed<WeighInRow>;

export interface DayDetail {
  now: string;
  date: string;
  weekday: string;
  totals: Totals;
  goals: Partial<Totals>;
  remaining_vs_goals?: Partial<Totals>;
  meals: Meal[];
  workouts: Workout[];
  weigh_ins: WeighIn[];
  profile: Profile;
}

export interface SummaryDay extends Partial<Totals> {
  date: string;
  wd: string;
  in_progress?: true;
  meals: number;
  workouts?: string[];
  weight?: number;
}

export interface MonthSummary {
  now: string;
  range: { start: string; end: string; days: number };
  goals: Partial<Totals> & { workouts_per_week?: number; target_weight?: number; weight_unit: string };
  training: { workouts: number };
  days: SummaryDay[];
}

export type MealDraft = Pick<MealRow, 'description'> & {
  items: FoodItem[];
  meal_type?: string;
  date: string;
  time: string;
  notes?: string;
};
export type WorkoutDraft = Pick<WorkoutRow, 'description' | 'type'> & {
  duration_min?: number;
  effort?: number;
  exercises: Exercise[];
  date: string;
  time: string;
  notes?: string;
};
export type WeightDraft = { weight: number; unit: 'lb' | 'kg'; date: string; time: string; notes?: string };

export type Collection = 'meals' | 'workouts' | 'weigh-ins';

/** The server says we're signed out; the app shows the sign-in screen. */
export class AuthError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') throw new AuthError(data.error ?? 'Not signed in');
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  session: () => request<{ auth_required: boolean; authenticated: boolean }>('GET', '/session'),
  login: (key: string) => request<{ authenticated: boolean }>('POST', '/login', { key }),
  logout: () => request<{ authenticated: boolean }>('POST', '/logout', {}),
  day: (date?: string) => request<DayDetail>('GET', `/day${date ? `?date=${date}` : ''}`),
  month: (month: string) => request<MonthSummary>('GET', `/month?month=${month}`),
  trends: (weeks: number) => request<Trends>('GET', `/trends?weeks=${weeks}`),
  profile: () => request<Profile>('GET', '/profile'),
  updateProfile: (patch: Record<string, unknown>) => request<Profile>('PATCH', '/profile', patch),
  recentMeals: () => request<MealRow[]>('GET', '/recent-meals'),
  create: (collection: Collection, body: unknown) => request<unknown>('POST', `/${collection}`, body),
  update: (collection: Collection, id: number, body: unknown) => request<unknown>('PATCH', `/${collection}/${id}`, body),
  remove: (collection: Collection, id: number) => request<unknown>('DELETE', `/${collection}/${id}`),
};
