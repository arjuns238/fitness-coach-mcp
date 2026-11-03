// The same REST API the web dashboard uses, on the same server; this app signs requests with the API key.
import { Platform } from 'react-native';
import type { DayDetail, MonthSummary } from '../../web/src/api.ts';
import type { FoodMatch, MealRow, Profile, Trends } from '../../src/types.ts';

export type { DayDetail, Meal, MonthSummary, SummaryDay, WeighIn, Workout } from '../../web/src/api.ts';
export type { Exercise, FoodItem, FoodMatch, Lift, Profile, Trends, WeightUnit } from '../../src/types.ts';

const PRODUCTION = 'https://fitness-coach.bluegrass-99f7602c.westus3.azurecontainerapps.io';
/** The browser preview is served next to the API, so it uses relative URLs. */
export const API_URL = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_API_URL ?? PRODUCTION);

let apiKey: string | undefined;
export const setApiKey = (key: string | undefined) => {
  apiKey = key;
};

/** The server rejected the key: the app goes back to sign-in. */
export class AuthError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError(data.error ?? 'Not signed in');
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export type Collection = 'meals' | 'workouts' | 'weigh-ins';

export const api = {
  day: (date?: string) => request<DayDetail>('GET', `/day${date ? `?date=${date}` : ''}`),
  month: (month: string) => request<MonthSummary>('GET', `/month?month=${month}`),
  trends: (weeks: number) => request<Trends>('GET', `/trends?weeks=${weeks}`),
  profile: () => request<Profile>('GET', '/profile'),
  updateProfile: (patch: Record<string, unknown>) => request<Profile>('PATCH', '/profile', patch),
  recentMeals: () => request<MealRow[]>('GET', '/recent-meals'),
  searchFoods: (q: string) => request<{ results: FoodMatch[] }>('GET', `/foods/search?q=${encodeURIComponent(q)}`),
  barcode: (code: string) => request<{ result: FoodMatch | null }>('GET', `/foods/barcode/${encodeURIComponent(code)}`),
  create: (collection: Collection, body: unknown) => request<unknown>('POST', `/${collection}`, body),
  update: (collection: Collection, id: number, body: unknown) => request<unknown>('PATCH', `/${collection}/${id}`, body),
  remove: (collection: Collection, id: number) => request<unknown>('DELETE', `/${collection}/${id}`),
};
