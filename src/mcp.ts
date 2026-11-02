import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { FitnessDb } from './db.ts';
import {
  DateInput,
  EntryId,
  EntryKindInput,
  MAX_RANGE_DAYS,
  MealFields,
  ProfilePatch,
  SummaryRange,
  TrendsInput,
  WeightFields,
  WorkoutFields,
} from './schemas.ts';
import * as service from './service.ts';

const INSTRUCTIONS = `Personal nutrition and training log for one user, who you are coaching.
They usually log by voice, so messages are casual and imprecise.
- Log as soon as the user mentions food, a workout or a weigh-in, using your best estimate. Save first; don't wait for answers.
- One message can contain several things ("eggs for breakfast, then a 3 mile run"): make one log call per item.
- Then, only if the answer would change the numbers meaningfully, ask at most two short follow-up questions.
  Meals: portion size, cooking oil or butter, sauces and dressings, drinks, restaurant vs homemade.
  Workouts: missing weights, sets or reps, distance, duration, how hard it felt.
  Skip questions when the user already gave the detail or the item is standard (a protein bar, a can of soda).
- When they answer, apply it to the same entry with update_meal / update_workout / update_weight. Never log it twice.
- Keep replies short: what was saved, where the day stands against goals, then any follow-up questions.
- Don't add coaching check-ins (sleep, mood, soreness) or unsolicited suggestions. When asked for advice,
  read get_day / get_summary / get_trends and the profile's coaching_notes first.
- Name exercises the same way every time (standard names, see log_workout) so lift progress lines up.
- If something was logged by mistake, delete_entry it.
- The user can also edit entries in their web dashboard, so re-read with get_day rather than relying on earlier tool results.`;

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

export function createServer(db: FitnessDb): McpServer {
  const server = new McpServer({ name: 'fitness-coach', version: '1.3.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'log_meal',
    {
      title: 'Log meal',
      description:
        'Log food or drink the user had. Call it right away with your best estimate: break the meal into items and estimate each one\'s calories and macros. ' +
        'Afterwards, if a detail would change the numbers meaningfully (portion, oil or butter, sauce, restaurant vs homemade), ask at most two short questions ' +
        'and apply the answers with update_meal. Returns the saved entry (with its id) and the day\'s running totals against goals.',
      inputSchema: MealFields,
    },
    async (input) => json(service.logMeal(db, input)),
  );

  server.registerTool(
    'update_meal',
    {
      title: 'Update meal',
      description:
        'Change a logged meal, e.g. after the user answers a follow-up ("it was a large bowl", "cooked in butter") or corrects it. ' +
        'Only the fields you pass change. items replaces the whole list, so send every item, not just the changed one.',
      inputSchema: MealFields.partial().extend({ id: EntryId }),
    },
    async ({ id, ...patch }) => json(service.updateMeal(db, id, patch)),
  );

  server.registerTool(
    'log_workout',
    {
      title: 'Log workout',
      description:
        'Log a workout or activity the user did: lifting, a run, a class, a sport, a walk. Call it right away with what they said. ' +
        'Record exercises with sets when they give them (e.g. "bench 3x8 at 135" is three sets of 8 reps at 135). ' +
        'Afterwards, if weights, sets, reps, distance, duration or effort are missing, ask at most two short questions and apply the answers with update_workout.',
      inputSchema: WorkoutFields,
    },
    async (input) => json(service.logWorkout(db, input)),
  );

  server.registerTool(
    'update_workout',
    {
      title: 'Update workout',
      description:
        'Change a logged workout, e.g. after the user fills in missing sets, weights or effort, or corrects it. ' +
        'Only the fields you pass change. exercises replaces the whole list, so send every exercise, not just the changed one.',
      inputSchema: WorkoutFields.partial().extend({ id: EntryId }),
    },
    async ({ id, ...patch }) => json(service.updateWorkout(db, id, patch)),
  );

  server.registerTool(
    'log_weight',
    { title: 'Log body weight', description: 'Log a body-weight weigh-in.', inputSchema: WeightFields },
    async (input) => json(service.logWeight(db, input)),
  );

  server.registerTool(
    'update_weight',
    {
      title: 'Update weigh-in',
      description: 'Correct a logged weigh-in. Only the fields you pass change.',
      inputSchema: WeightFields.partial().extend({ id: EntryId }),
    },
    async ({ id, ...patch }) => json(service.updateWeight(db, id, patch)),
  );

  server.registerTool(
    'get_day',
    {
      title: 'Get day',
      description:
        "Everything logged on one day (meals with item breakdowns, workouts, weigh-ins), totals vs goals, the user's profile, and the current local time. " +
        'Use for "how am I doing today", "what did I eat yesterday", or to find an entry id to update or delete.',
      inputSchema: z.object({ date: DateInput }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => json(service.getDay(db, date)),
  );

  server.registerTool(
    'get_summary',
    {
      title: 'Get summary',
      description:
        'Day-by-day totals plus averages, goal adherence, training volume and weight trend over a date range. ' +
        `Defaults to the last 7 days including today; at most ${MAX_RANGE_DAYS} days. Use for weekly check-ins, trends and coaching.`,
      inputSchema: SummaryRange,
      annotations: { readOnlyHint: true },
    },
    async (range) => json(service.getSummary(db, range)),
  );

  server.registerTool(
    'get_trends',
    {
      title: 'Get trends',
      description:
        'Progress over whole weeks: weight 7-day average and rate of change, estimated maintenance calories (from logged intake and the weight trend ' +
        'over the last 28 days, once there is enough data), weekly calorie and protein averages and workouts against goals, and estimated one-rep max ' +
        "per lift. Use for questions about progress, maintenance calories or how a lift is going. The dashboard's Trends tab shows the same numbers.",
      inputSchema: TrendsInput,
      annotations: { readOnlyHint: true },
    },
    async ({ weeks }) => {
      // Day rows are for the dashboard's charts; weekly rows carry the same information more compactly.
      const { days: _, lifts, ...rest } = service.getTrends(db, weeks);
      return json({ ...rest, lifts: lifts.map(({ sessions, ...lift }) => ({ ...lift, sessions: sessions.length, recent: sessions.slice(-5) })) });
    },
  );

  server.registerTool(
    'update_profile',
    {
      title: 'Update goals and preferences',
      description:
        "Set the user's goals, preferences and coaching context. Only the fields you pass change; pass null to clear a field. " +
        'Call with no arguments to read the current profile.',
      inputSchema: ProfilePatch,
    },
    async (patch) => json(service.updateProfile(db, patch)),
  );

  server.registerTool(
    'delete_entry',
    {
      title: 'Delete entry',
      description: 'Delete a logged meal, workout or weigh-in that was logged by mistake. To fix details, use the update tools instead.',
      inputSchema: z.object({ kind: EntryKindInput, id: EntryId }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ kind, id }) => json(service.deleteEntry(db, kind, id)),
  );

  return server;
}
