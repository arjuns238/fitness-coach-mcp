import { useEffect, useState } from 'react';
import { api, type Meal, type WeighIn, type Workout } from './api.ts';
import { addDays, formatDay, formatNumber, formatTime, setSummary, timeFromNow, todayFromNow } from './format.ts';
import { MealSheet, WeightSheet, WorkoutSheet } from './sheets.tsx';
import { Meter, useAsync } from './ui.tsx';

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
        <a className="icon-button" href={`#/day/${addDays(day.date, -1)}`} aria-label="Previous day">
          ‹
        </a>
        <div className="titles">
          <h1>{isToday ? 'Today' : formatDay(day.date)}</h1>
          <div className="subtitle">{isToday ? formatDay(day.date) : <a href="#/">Back to today</a>}</div>
        </div>
        <span className="icon-button date-picker">
          <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input type="date" max={today} value={day.date} aria-label="Pick a date" onChange={(e) => e.target.value && (location.hash = `#/day/${e.target.value}`)} />
        </span>
        <a className="icon-button" href={`#/day/${addDays(day.date, 1)}`} aria-label="Next day" aria-disabled={isToday}>
          ›
        </a>
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
