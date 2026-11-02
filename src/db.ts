import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Entries, EntryKind, FoodItem, MealRow, Profile, WeighInRow, WorkoutRow } from './types.ts';

export type * from './types.ts';

const TABLES: Record<EntryKind, string> = { meal: 'meals', workout: 'workouts', weigh_in: 'weigh_ins' };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meals (
    id          INTEGER PRIMARY KEY,
    local_date  TEXT NOT NULL,
    local_time  TEXT NOT NULL,
    meal_type   TEXT,
    description TEXT NOT NULL,
    items       TEXT NOT NULL, -- JSON FoodItem[]; macros are model estimates
    calories    REAL NOT NULL,
    protein_g   REAL NOT NULL,
    carbs_g     REAL NOT NULL,
    fat_g       REAL NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meals_by_date ON meals (local_date);

  CREATE TABLE IF NOT EXISTS workouts (
    id           INTEGER PRIMARY KEY,
    local_date   TEXT NOT NULL,
    local_time   TEXT NOT NULL,
    type         TEXT NOT NULL,
    description  TEXT NOT NULL,
    duration_min REAL,
    effort       INTEGER,
    exercises    TEXT NOT NULL, -- JSON Exercise[]
    notes        TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS workouts_by_date ON workouts (local_date);

  CREATE TABLE IF NOT EXISTS weigh_ins (
    id         INTEGER PRIMARY KEY,
    local_date TEXT NOT NULL,
    local_time TEXT NOT NULL,
    weight     REAL NOT NULL,
    unit       TEXT NOT NULL,
    notes      TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS weigh_ins_by_date ON weigh_ins (local_date);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL -- JSON
  );
`;

const round1 = (n: number) => Math.round(n * 10) / 10;

function itemTotals(items: FoodItem[]) {
  const sum = (key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g') => round1(items.reduce((total, item) => total + item[key], 0));
  return { calories: Math.round(sum('calories')), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') };
}

type NewMeal = Omit<MealRow, 'id' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>;
type NewWorkout = Omit<WorkoutRow, 'id'>;
type NewWeighIn = Omit<WeighInRow, 'id'>;

// Columns an update may touch; keys come from callers, so never interpolate anything else into SQL.
const UPDATABLE: Record<EntryKind, string[]> = {
  meal: ['local_date', 'local_time', 'meal_type', 'description', 'items', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'notes'],
  workout: ['local_date', 'local_time', 'type', 'description', 'duration_min', 'effort', 'exercises', 'notes'],
  weigh_in: ['local_date', 'local_time', 'weight', 'unit', 'notes'],
};

export class FitnessDb {
  private db: DatabaseSync;
  private defaultTimezone: string;

  constructor(path: string, defaultTimezone: string) {
    this.defaultTimezone = defaultTimezone;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  getProfile(): Profile {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'profile'`).get() as { value: string } | undefined;
    const stored = row ? (JSON.parse(row.value) as Partial<Profile>) : {};
    return { weight_unit: 'lb', timezone: this.defaultTimezone, ...stored };
  }

  /** Merges the patch into the stored profile; a null value clears that field. */
  updateProfile(patch: Record<string, unknown>): Profile {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'profile'`).get() as { value: string } | undefined;
    const stored: Record<string, unknown> = row ? JSON.parse(row.value) : {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === null) delete stored[key];
      else stored[key] = value;
    }
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES ('profile', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
      .run(JSON.stringify(stored));
    return this.getProfile();
  }

  addMeal(meal: NewMeal): MealRow {
    const totals = itemTotals(meal.items);
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO meals (local_date, local_time, meal_type, description, items, calories, protein_g, carbs_g, fat_g, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meal.local_date,
        meal.local_time,
        meal.meal_type,
        meal.description,
        JSON.stringify(meal.items),
        totals.calories,
        totals.protein_g,
        totals.carbs_g,
        totals.fat_g,
        meal.notes,
        new Date().toISOString(),
      );
    return { id: Number(lastInsertRowid), ...meal, ...totals };
  }

  addWorkout(workout: NewWorkout): WorkoutRow {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO workouts (local_date, local_time, type, description, duration_min, effort, exercises, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workout.local_date,
        workout.local_time,
        workout.type,
        workout.description,
        workout.duration_min,
        workout.effort,
        JSON.stringify(workout.exercises),
        workout.notes,
        new Date().toISOString(),
      );
    return { id: Number(lastInsertRowid), ...workout };
  }

  addWeighIn(weighIn: NewWeighIn): WeighInRow {
    const { lastInsertRowid } = this.db
      .prepare(`INSERT INTO weigh_ins (local_date, local_time, weight, unit, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(weighIn.local_date, weighIn.local_time, weighIn.weight, weighIn.unit, weighIn.notes, new Date().toISOString());
    return { id: Number(lastInsertRowid), ...weighIn };
  }

  /** Changes only the fields present in the patch; replacing items recomputes the meal's totals. */
  updateMeal(id: number, patch: Partial<NewMeal>): MealRow | undefined {
    const fields: Record<string, unknown> = { ...patch };
    if (patch.items) Object.assign(fields, itemTotals(patch.items), { items: JSON.stringify(patch.items) });
    return this.update('meal', id, fields) as MealRow | undefined;
  }

  updateWorkout(id: number, patch: Partial<NewWorkout>): WorkoutRow | undefined {
    const fields: Record<string, unknown> = { ...patch };
    if (patch.exercises) fields.exercises = JSON.stringify(patch.exercises);
    return this.update('workout', id, fields) as WorkoutRow | undefined;
  }

  updateWeighIn(id: number, patch: Partial<NewWeighIn>): WeighInRow | undefined {
    return this.update('weigh_in', id, { ...patch }) as WeighInRow | undefined;
  }

  /** Returns the deleted entry, or undefined if no entry has that id. */
  deleteEntry(kind: EntryKind, id: number): MealRow | WorkoutRow | WeighInRow | undefined {
    const table = TABLES[kind];
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return undefined;
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return this.parseRow(kind, row);
  }

  /** All entries with start <= local_date <= end, oldest first. */
  entries(start: string, end: string): Entries {
    const select = (kind: EntryKind) =>
      this.db
        .prepare(`SELECT * FROM ${TABLES[kind]} WHERE local_date BETWEEN ? AND ? ORDER BY local_date, local_time, id`)
        .all(start, end)
        .map((row) => this.parseRow(kind, row));
    return {
      meals: select('meal') as MealRow[],
      workouts: select('workout') as WorkoutRow[],
      weigh_ins: select('weigh_in') as WeighInRow[],
    };
  }

  /** The most recent distinct meals (by description), for "repeat a past meal". */
  recentMeals(limit: number): MealRow[] {
    return this.db
      .prepare(
        `SELECT * FROM meals WHERE id IN (SELECT MAX(id) FROM meals GROUP BY lower(trim(description))) ORDER BY id DESC LIMIT ?`,
      )
      .all(limit)
      .map((row) => this.parseRow('meal', row) as MealRow);
  }

  close() {
    this.db.close();
  }

  private update(kind: EntryKind, id: number, fields: Record<string, unknown>) {
    const table = TABLES[kind];
    const changes = Object.entries(fields).filter(([key, value]) => value !== undefined && UPDATABLE[kind].includes(key));
    if (changes.length) {
      this.db
        .prepare(`UPDATE ${table} SET ${changes.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`)
        .run(...(changes.map(([, value]) => value) as SQLInputValue[]), id);
    }
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    return row ? this.parseRow(kind, row) : undefined;
  }

  private parseRow(kind: EntryKind, row: Record<string, unknown>) {
    const { created_at: _, ...rest } = row;
    if (kind === 'meal') return { ...rest, items: JSON.parse(rest.items as string) } as MealRow;
    if (kind === 'workout') return { ...rest, exercises: JSON.parse(rest.exercises as string) } as WorkoutRow;
    return rest as unknown as WeighInRow;
  }
}
