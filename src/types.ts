// Shared by the server and the web app (web/ imports these as types only).

export type WeightUnit = 'lb' | 'kg';
export type EntryKind = 'meal' | 'workout' | 'weigh_in';

export interface FoodItem {
  name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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
