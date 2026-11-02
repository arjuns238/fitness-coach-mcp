import { useEffect, useState } from 'react';
import { api, type Meal, type WeighIn, type Workout } from './api.ts';
import { addDays, daysBetween, formatDay, formatNumber, formatTime, setSummary, timeFromNow, todayFromNow } from './format.ts';
import { MealSheet, WeightSheet, WorkoutSheet } from './sheets.tsx';
import { Meter, NavArrow, useAsync } from './ui.tsx';

const daysAgo = (n: number) => (n === 1 ? 'Yesterday' : n > 1 ? `${n} days ago` : `In ${-n} days`);

type Editing = { kind: 'meal'; entry?: Meal } | { kind: 'workout'; entry?: Workout } | { kind: 'weight'; entry?: WeighIn } | null;

export function DayView({ date }: { date?: string }) {
  const { data: day, reload } = useAsync(() => api.day(date), [date]);
  const [editing, setEditing] = useState<Editing>(null);

  // Claude may have logged something while the app was in the background.
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  });

  if (!day) return <p className="loading">Loading…</p>;

  const today = todayFromNow(day.now);
  const isToday = day.date === today;
  const { totals, goals } = day;
  const sheetProps = {
    date: day.date,
    defaultTime: isToday ? timeFromNow(day.now) : '12:00',
    weightUnit: day.profile.weight_unit,
    onClose: () => setEditing(null),
    onSaved: () => {
      setEditing(null);
      reload();
    },
  };

  return (
    <>
      <header className="page-header">
        {/* The whole title opens the date picker; the arrows live apart on the right so the two can't be mixed up. */}
        <label className="titles title-picker">
          <h1>
            {isToday ? 'Today' : formatDay(day.date)}
            <svg className="chevron" viewBox="0 0 24 24" aria-hidden>
              <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </h1>
          <div className="subtitle">{isToday ? formatDay(day.date) : daysAgo(daysBetween(day.date, today))}</div>
          <input
            type="date"
            max={today}
            value={day.date}
            aria-label="Pick a date"
            onClick={(e) => {
              // Desktop browsers only open the calendar from its own icon; open it from anywhere on the title.
              try {
                e.currentTarget.showPicker();
              } catch {
                // Not allowed here (e.g. already open); the native control still works.
              }
            }}
            onChange={(e) => e.target.value && (location.hash = e.target.value === today ? '#/' : `#/day/${e.target.value}`)}
          />
        </label>
        <nav className="header-nav" aria-label="Change day">
          {!isToday && (
            <a className="button small" href="#/">
              Today
            </a>
          )}
          <NavArrow direction="prev" href={`#/day/${addDays(day.date, -1)}`} label="Previous day" />
          <NavArrow direction="next" href={addDays(day.date, 1) === today ? '#/' : `#/day/${addDays(day.date, 1)}`} label="Next day" disabled={isToday} />
        </nav>
      </header>

      <section className="card">
        <Meter hero label="Calories" value={totals.calories} goal={goals.calories} unit="kcal" kind="limit" />
        <div className="macro-row">
          <Meter label="Protein" value={totals.protein_g} goal={goals.protein_g} unit="g" kind="target" />
          <Meter label="Carbs" value={totals.carbs_g} goal={goals.carbs_g} unit="g" />
          <Meter label="Fat" value={totals.fat_g} goal={goals.fat_g} unit="g" />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Meals</h2>
          <button className="button small" onClick={() => setEditing({ kind: 'meal' })}>
            + Add
          </button>
        </div>
        {day.meals.length === 0 && <p className="empty">Nothing logged yet. Tell Claude what you ate, or add it here.</p>}
        {day.meals.map((meal) => (
          <button key={meal.id} className="entry" onClick={() => setEditing({ kind: 'meal', entry: meal })}>
            <div className="entry-main">
              <div className="entry-meta">
                {formatTime(meal.time)}
                {meal.meal_type && <> · <span style={{ textTransform: 'capitalize' }}>{meal.meal_type}</span></>}
              </div>
              <div className="entry-title">{meal.description}</div>
              <div className="entry-detail">{meal.items.map((item) => item.name).join(', ')}</div>
            </div>
            <div className="entry-side">
              <strong>{formatNumber(meal.calories)} kcal</strong>
              <span className="entry-meta">
                P {formatNumber(meal.protein_g)} · C {formatNumber(meal.carbs_g)} · F {formatNumber(meal.fat_g)}
              </span>
            </div>
          </button>
        ))}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Workouts</h2>
          <button className="button small" onClick={() => setEditing({ kind: 'workout' })}>
            + Add
          </button>
        </div>
        {day.workouts.length === 0 && <p className="empty">No workout logged.</p>}
        {day.workouts.map((workout) => (
          <button key={workout.id} className="entry" onClick={() => setEditing({ kind: 'workout', entry: workout })}>
            <div className="entry-main">
              <div className="entry-meta">
                {formatTime(workout.time)} · <span className="chip">{workout.type}</span>
              </div>
              <div className="entry-title">{workout.description}</div>
              {workout.exercises.map((exercise, i) => (
                <div className="entry-meta" key={i}>
                  {exercise.name}
                  {exercise.sets?.length ? ` · ${setSummary(exercise.sets)}` : ''}
                  {exercise.distance ? ` · ${exercise.distance} ${exercise.distance_unit ?? 'mi'}` : ''}
                </div>
              ))}
            </div>
            <div className="entry-side">
              {workout.duration_min && <strong>{formatNumber(workout.duration_min)} min</strong>}
              {workout.effort && <span className="entry-meta">Effort {workout.effort}/10</span>}
            </div>
          </button>
        ))}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Weight</h2>
          <button className="button small" onClick={() => setEditing({ kind: 'weight' })}>
            + Log
          </button>
        </div>
        {day.weigh_ins.length === 0 && <p className="empty">No weigh-in.</p>}
        {day.weigh_ins.map((weighIn) => (
          <button key={weighIn.id} className="entry" onClick={() => setEditing({ kind: 'weight', entry: weighIn })}>
            <div className="entry-main">
              <div className="entry-title">
                {weighIn.weight} {weighIn.unit}
              </div>
              {weighIn.notes && <div className="entry-detail">{weighIn.notes}</div>}
            </div>
            <div className="entry-side entry-meta">{formatTime(weighIn.time)}</div>
          </button>
        ))}
      </section>

      {editing?.kind === 'meal' && <MealSheet {...sheetProps} entry={editing.entry} />}
      {editing?.kind === 'workout' && <WorkoutSheet {...sheetProps} entry={editing.entry} />}
      {editing?.kind === 'weight' && <WeightSheet {...sheetProps} entry={editing.entry} />}
    </>
  );
}
