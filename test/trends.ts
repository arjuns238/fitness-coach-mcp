// The trend math on an in-memory database with a fixed "today", so every expected number is exact.
import assert from 'node:assert/strict';
import { FitnessDb } from '../src/db.ts';
import * as service from '../src/service.ts';
import { addDays } from '../src/time.ts';
import { estimateOneRepMax, exerciseKey, trends } from '../src/trends.ts';

const TODAY = '2026-11-04'; // a Wednesday; its week starts Sunday 2026-11-01
const YESTERDAY = addDays(TODAY, -1);
const meal = (date: string, calories: number, protein_g = 150) => ({
  description: 'meal',
  date,
  time: '12:00',
  items: [{ name: 'food', calories, protein_g, carbs_g: 0, fat_g: 0 }],
});

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log('Trends');

check('exercise names group by a loose key and a few aliases', () => {
  assert.equal(exerciseKey('Pull-ups'), 'pull up');
  assert.equal(exerciseKey('pullups'), 'pull up');
  assert.equal(exerciseKey('Flat Bench'), 'bench press');
  assert.equal(exerciseKey('bench'), 'bench press');
  assert.equal(exerciseKey('Back Squats'), 'squat');
  assert.equal(exerciseKey('Dumbbell Bench Press'), 'dumbbell bench press');
  assert.equal(estimateOneRepMax(200, 1), 200);
  assert.equal(estimateOneRepMax(150, 10), 200);
});

check('weeks run Sunday to Saturday and end with the current, in-progress week', () => {
  const db = new FitnessDb(':memory:', 'America/Chicago');
  const t = trends(db, 4, db.getProfile(), TODAY);
  assert.equal(t.range.start, '2026-10-11');
  assert.equal(t.days.length, 25);
  assert.deepEqual(
    t.weeks.map((w) => [w.start, Boolean(w.in_progress)]),
    [
      ['2026-10-11', false],
      ['2026-10-18', false],
      ['2026-10-25', false],
      ['2026-11-01', true],
    ],
  );
  assert.equal(t.maintenance.estimate, undefined);
  assert.equal(t.weight, undefined);
  assert.deepEqual(t.lifts, []);
});

check('maintenance = average intake minus the energy in the weight trend', () => {
  const db = new FitnessDb(':memory:', 'America/Chicago');
  db.updateProfile({ weight_unit: 'lb', target_weight: 170 });
  // 20 days at 2,000 kcal while losing 0.1 lb a day: 2,000 + 0.1 * 3,500 = 2,350.
  const windowStart = addDays(YESTERDAY, -27);
  for (let i = 3; i < 23; i++) service.logMeal(db, meal(addDays(windowStart, i), 2000));
  for (let i = 0; i < 28; i += 3) service.logWeight(db, { weight: 190 - 0.1 * i, date: addDays(windowStart, i), time: '07:00' });
  // Today's meal is in progress and must not count.
  service.logMeal(db, meal(TODAY, 500));

  const t = trends(db, 4, db.getProfile(), TODAY);
  assert.equal(t.maintenance.window.start, windowStart);
  assert.equal(t.maintenance.window.end, YESTERDAY);
  assert.equal(t.maintenance.logged_days, 20);
  assert.equal(t.maintenance.avg_intake, 2000);
  assert.equal(t.maintenance.weight_change_per_week, -0.7);
  assert.equal(t.maintenance.estimate, 2350);
  // The selected range doesn't move the maintenance window.
  assert.equal(trends(db, 26, db.getProfile(), TODAY).maintenance.estimate, 2350);
  assert.equal(t.days.at(-1)!.in_progress, true);
  assert.equal(t.days.find((d) => d.date === TODAY)!.calories, 500);
  assert.equal(t.nutrition.avg_calories, 2000);
});

check('maintenance waits for enough data and says how much it has', () => {
  const db = new FitnessDb(':memory:', 'America/Chicago');
  for (let i = 1; i <= 5; i++) service.logMeal(db, meal(addDays(TODAY, -i), 2100));
  service.logWeight(db, { weight: 180, date: addDays(TODAY, -2), time: '07:00' });
  const m = trends(db, 4, db.getProfile(), TODAY).maintenance;
  assert.equal(m.estimate, undefined);
  assert.equal(m.logged_days, 5);
  assert.equal(m.weigh_ins, 1);
  assert.deepEqual(m.requirements, { logged_days: 14, weigh_ins: 4, weigh_in_span_days: 14 });
});

check('weight: first weigh-in of the day, 7-day average, unit conversion, rate and distance to target', () => {
  const db = new FitnessDb(':memory:', 'America/Chicago');
  db.updateProfile({ weight_unit: 'lb', target_weight: 175 });
  service.logWeight(db, { weight: 182, date: '2026-10-20', time: '07:00' });
  service.logWeight(db, { weight: 185, date: '2026-10-20', time: '21:00' }); // evening weigh-in ignored
  service.logWeight(db, { weight: 82, unit: 'kg', date: '2026-10-22', time: '07:00' }); // 180.8 lb
  service.logWeight(db, { weight: 180, date: '2026-10-27', time: '07:00' });
  const t = trends(db, 4, db.getProfile(), TODAY);
  const day = (date: string) => t.days.find((d) => d.date === date)!;
  assert.equal(day('2026-10-20').weight, 182);
  assert.equal(day('2026-10-22').weight, 180.8);
  assert.equal(day('2026-10-22').trend, 181.4); // mean of 182 and 180.8
  assert.equal(day('2026-10-27').trend, 180.4); // 10-20 has dropped out of the window
  assert.equal(day('2026-10-21').weight, undefined);
  assert.equal(t.weight!.latest_trend, 180);
  assert.equal(t.weight!.weigh_ins, 3);
  assert.equal(t.weight!.to_target, 5);
  assert.ok(t.weight!.change_per_week! < 0);
});

check('weekly nutrition, goal adherence and workouts per week', () => {
  const db = new FitnessDb(':memory:', 'America/Chicago');
  db.updateProfile({ daily_calories: 2000, daily_protein_g: 150, workouts_per_week: 2 });
  service.logMeal(db, meal('2026-10-25', 2100, 160)); // within 10%, protein met
  service.logMeal(db, meal('2026-10-26', 2500, 120)); // over, protein missed
  const workout = (date: string) => service.logWorkout(db, { description: 'lift', type: 'strength', date, time: '18:00' });
  workout('2026-10-25');
  workout('2026-10-27');
  workout('2026-10-19');
  workout(TODAY);
  const t = trends(db, 4, db.getProfile(), TODAY);
  const week = t.weeks.find((w) => w.start === '2026-10-25')!;
  assert.equal(week.logged_days, 2);
  assert.equal(week.avg_calories, 2300);
  assert.equal(week.avg_protein_g, 140);
  assert.equal(week.workouts, 2);
  assert.equal(t.nutrition.days_calories_within_10pct, 1);
  assert.equal(t.nutrition.days_protein_met, 1);
  assert.equal(t.training.workouts, 4);
  assert.equal(t.training.completed_weeks, 3);
  assert.equal(t.training.weeks_meeting_goal, 1);
  assert.equal(t.training.avg_per_completed_week, 1);
});

check('lifts: best estimated 1RM per day, grouped across spellings and units', () => {
  const db = new FitnessDb(':memory:', 'America/Chicago');
  const lift = (date: string, name: string, sets: { reps?: number; weight?: number; unit?: 'lb' | 'kg' }[]) =>
    service.logWorkout(db, { description: 'lift', type: 'strength', date, time: '18:00', exercises: [{ name, sets }] });
  lift('2026-10-20', 'Bench Press', [
    { reps: 5, weight: 185 },
    { reps: 5, weight: 175 },
  ]);
  lift('2026-10-24', 'bench', [{ reps: 3, weight: 195 }]);
  lift('2026-10-24', 'Bench Press', [{ reps: 15, weight: 135 }]); // too many reps to count
  lift('2026-10-28', 'Bench Press', [{ reps: 1, weight: 100, unit: 'kg' }]); // 220.5 lb
  lift('2026-10-28', 'Pull-ups', [{ reps: 10 }]); // bodyweight: no 1RM
  const [bench, ...others] = trends(db, 4, db.getProfile(), TODAY).lifts;
  assert.equal(others.length, 0);
  assert.equal(bench.name, 'Bench Press');
  assert.deepEqual(
    bench.sessions.map((s) => [s.date, s.e1rm, s.weight, s.reps]),
    [
      ['2026-10-20', 215.8, 185, 5],
      ['2026-10-24', 214.5, 195, 3],
      ['2026-10-28', 220.5, 220.5, 1],
    ],
  );
  assert.equal(bench.best.date, '2026-10-28');
  assert.equal(bench.change, 4.7);
});

console.log(`\n${passed} checks passed`);
