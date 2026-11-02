// Shared by the server and the web app (web/ imports these as types only).

export type WeightUnit = 'lb' | 'kg';
export type EntryKind = 'meal' | 'workout' | 'weigh_in';

/** Where an item's numbers came from when they're a product's label rather than an estimate. */
export interface FoodSource {
  db: 'usda' | 'off';
  id: string;
  product: string;
}

export interface FoodItem {
  name: string;
  quantity?: string;
  /** Packaged or branded foods: the brand, which triggers a label lookup. */
  brand?: string;
  /** Label servings eaten (default 1); label numbers are per serving times this. */
  servings?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Set when the numbers are label data; absent means an estimate. */
  source?: FoodSource;
}

/** A product from a food database, with its label numbers for one serving. */
export interface FoodMatch {
  source: FoodSource;
  brand?: string;
  /** e.g. "1 bar (60 g)" */
  serving: string;
  per_serving: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}

export interface ExerciseSet {
  reps?: number;
  weight?: number;
  unit?: WeightUnit;
  duration_sec?: number;
}

export interface Exercise {
  name: string;
  sets?: ExerciseSet[];
  distance?: number;
  distance_unit?: 'mi' | 'km';
  duration_min?: number;
  notes?: string;
}

export interface Profile {
  daily_calories?: number;
  daily_protein_g?: number;
  daily_carbs_g?: number;
  daily_fat_g?: number;
  workouts_per_week?: number;
  target_weight?: number;
  weight_unit: WeightUnit;
  timezone: string;
  coaching_notes?: string;
}

export interface MealRow {
  id: number;
  local_date: string;
  local_time: string;
  meal_type: string | null;
  description: string;
  items: FoodItem[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
}

export interface WorkoutRow {
  id: number;
  local_date: string;
  local_time: string;
  type: string;
  description: string;
  duration_min: number | null;
  effort: number | null;
  exercises: Exercise[];
  notes: string | null;
}

export interface WeighInRow {
  id: number;
  local_date: string;
  local_time: string;
  weight: number;
  unit: WeightUnit;
  notes: string | null;
}

export interface Entries {
  meals: MealRow[];
  workouts: WorkoutRow[];
  weigh_ins: WeighInRow[];
}

// ---------- Trends (get_trends and the dashboard's Trends tab) ----------

export interface TrendDay {
  date: string;
  in_progress?: true;
  meals: number;
  calories?: number;
  protein_g?: number;
  workouts: number;
  /** First weigh-in of the day, in the profile's unit. */
  weight?: number;
  /** Average of the weigh-ins in the 7 days ending here. */
  trend?: number;
}

/** Sunday-to-Saturday weeks, like the history calendar. Averages skip unlogged days and today. */
export interface TrendWeek {
  start: string;
  end: string;
  in_progress?: true;
  logged_days: number;
  avg_calories?: number;
  avg_protein_g?: number;
  workouts: number;
}

export interface Maintenance {
  window: { start: string; end: string; days: number };
  logged_days: number;
  weigh_ins: number;
  weigh_in_span_days: number;
  /** The minimums before an estimate is given. */
  requirements: { logged_days: number; weigh_ins: number; weigh_in_span_days: number };
  /** Calories per day that would hold weight steady: average intake minus the energy in the weight change. */
  estimate?: number;
  avg_intake?: number;
  weight_change_per_week?: number;
}

export interface LiftSession {
  date: string;
  /** Estimated one-rep max (Epley) from the best set, in the profile's unit. */
  e1rm: number;
  weight: number;
  reps: number;
}

export interface Lift {
  name: string;
  sessions: LiftSession[];
  best: LiftSession;
  /** Last session's e1RM minus the first's, when there are two or more. */
  change?: number;
}

export interface Trends {
  now: string;
  range: { start: string; end: string; weeks: number };
  unit: WeightUnit;
  goals: { calories?: number; protein_g?: number; workouts_per_week?: number; target_weight?: number };
  nutrition: {
    logged_days: number;
    avg_calories?: number;
    avg_protein_g?: number;
    days_calories_within_10pct?: number;
    days_protein_met?: number;
  };
  training: { workouts: number; completed_weeks: number; avg_per_completed_week?: number; weeks_meeting_goal?: number };
  weight?: { latest_trend: number; weigh_ins: number; change_per_week?: number; to_target?: number };
  maintenance: Maintenance;
  lifts: Lift[];
  weeks: TrendWeek[];
  days: TrendDay[];
}
