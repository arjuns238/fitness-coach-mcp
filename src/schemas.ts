// Input schemas shared by the MCP tools and the dashboard's REST API.
import * as z from 'zod/v4';

export const MAX_RANGE_DAYS = 92;

export const DateInput = z
  .string()
  .describe('Local date: YYYY-MM-DD, "today" or "yesterday". Defaults to today in the user\'s timezone.')
  .optional();
export const TimeInput = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM')
  .describe('Local time, 24h HH:MM. Defaults to now if the date is today.')
  .optional();
const NotesInput = z.string().optional();
export const UnitInput = z.enum(['lb', 'kg']);
export const EntryKindInput = z.enum(['meal', 'workout', 'weigh_in']);
export const EntryId = z.number().int().positive().describe('Entry id from a log response or get_day');

export const MealFields = z.object({
  description: z.string().min(1).describe('What they ate, in their words, e.g. "chicken burrito bowl and a diet coke"'),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.string().optional().describe('Portion as described or assumed, e.g. "2 eggs", "1 cup", "large bowl"'),
        calories: z.number().nonnegative(),
        protein_g: z.number().nonnegative(),
        carbs_g: z.number().nonnegative(),
        fat_g: z.number().nonnegative(),
      }),
    )
    .min(1)
    .describe('Each food with your best calorie and macro estimate for the portion'),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']).optional(),
  date: DateInput,
  time: TimeInput,
  notes: NotesInput,
});

export const WorkoutFields = z.object({
  description: z.string().min(1).describe('Short summary in their words, e.g. "push day", "5k run", "pickup basketball"'),
  type: z.enum(['strength', 'cardio', 'sport', 'mobility', 'other']),
  duration_min: z.number().positive().optional(),
  effort: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Perceived effort 1-10, only if they indicated it ("brutal" is about 9, "easy" about 4)'),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1),
        sets: z
          .array(
            z.object({
              reps: z.number().int().positive().optional(),
              weight: z.number().nonnegative().optional(),
              unit: UnitInput.optional().describe("Defaults to the profile's weight_unit"),
              duration_sec: z.number().positive().optional(),
            }),
          )
          .optional(),
        distance: z.number().positive().optional(),
        distance_unit: z.enum(['mi', 'km']).optional(),
        duration_min: z.number().positive().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
  date: DateInput,
  time: TimeInput,
  notes: NotesInput,
});

export const WeightFields = z.object({
  weight: z.number().positive(),
  unit: UnitInput.optional().describe("Defaults to the profile's weight_unit"),
  date: DateInput,
  time: TimeInput,
  notes: NotesInput,
});

export const SummaryRange = z.object({
  start_date: DateInput,
  end_date: DateInput,
  days: z.number().int().min(1).max(MAX_RANGE_DAYS).optional().describe('Range length ending at end_date, if start_date is not given'),
});

const goal = z.number().positive().nullable().optional();
export const ProfilePatch = z.object({
  daily_calories: goal,
  daily_protein_g: goal,
  daily_carbs_g: goal,
  daily_fat_g: goal,
  workouts_per_week: goal,
  target_weight: goal.describe("In the profile's weight_unit. If you change weight_unit, convert and resend this too."),
  weight_unit: UnitInput.optional(),
  timezone: z.string().optional().describe('IANA timezone, e.g. "America/Chicago". Update it when the user travels.'),
  coaching_notes: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Free-text context to remember: goal phase (cut/bulk/maintain), diet, injuries, schedule, what motivates them. ' +
        'Replaces the existing notes, so carry over anything still relevant.',
    ),
});

export type MealInput = z.infer<typeof MealFields>;
export type WorkoutInput = z.infer<typeof WorkoutFields>;
export type WeightInput = z.infer<typeof WeightFields>;
export type SummaryRangeInput = z.infer<typeof SummaryRange>;
export type ProfilePatchInput = z.infer<typeof ProfilePatch>;
