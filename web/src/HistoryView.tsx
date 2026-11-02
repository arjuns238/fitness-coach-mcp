import { api, type MonthSummary, type SummaryDay } from './api.ts';
import { formatMonth, shiftMonth, todayFromNow } from './format.ts';
import { useAsync } from './ui.tsx';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A day "meets goals" when calories land within 10% of the goal and protein reaches its goal
 * (whichever of the two are set). Undefined when neither goal is set.
 */
function metGoals(day: SummaryDay, goals: MonthSummary['goals']): boolean | undefined {
  if (goals.calories === undefined && goals.protein_g === undefined) return undefined;
  if (!day.meals || day.in_progress) return false;
  const caloriesOk = goals.calories === undefined || Math.abs((day.calories ?? 0) - goals.calories) <= goals.calories * 0.1;
  const proteinOk = goals.protein_g === undefined || (day.protein_g ?? 0) >= goals.protein_g;
  return caloriesOk && proteinOk;
}

const browserMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);

export function HistoryView({ month = browserMonth() }: { month?: string }) {
  const { data } = useAsync(() => api.month(month), [month]);

  return (
    <>
      <header className="page-header">
        <a className="icon-button" href={`#/history/${shiftMonth(month, -1)}`} aria-label="Previous month">
          ‹
        </a>
        <div className="titles">
          <h1>{formatMonth(month)}</h1>
          <div className="subtitle">History</div>
        </div>
        <a className="icon-button" href={`#/history/${shiftMonth(month, 1)}`} aria-label="Next month" aria-disabled={month >= browserMonth()}>
          ›
        </a>
      </header>
      {data ? <Month key={data.range.start} data={data} /> : <p className="loading">Loading…</p>}
    </>
  );
}

function Month({ data }: { data: MonthSummary }) {
  const today = todayFromNow(data.now);
  const leadingBlanks = new Date(`${data.range.start}T00:00:00Z`).getUTCDay();
  const goalsSet = metGoals({ date: '', wd: '', meals: 0 }, data.goals) !== undefined;
  const past = data.days.filter((day) => day.date <= today);
  const logged = past.filter((day) => day.meals > 0).length;
  const met = past.filter((day) => metGoals(day, data.goals)).length;
  const workouts = past.reduce((n, day) => n + (day.workouts?.length ?? 0), 0);

  return (
    <>
      <section className="card">
        <div className="calendar" role="grid" aria-label={formatMonth(data.range.start.slice(0, 7))}>
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="weekday" aria-hidden>
              {d}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {data.days.map((day) => {
            const future = day.date > today;
            const goal = metGoals(day, data.goals);
            const state = future ? 'future' : goal ? 'met' : day.meals > 0 ? 'logged' : 'empty';
            const label = [
              day.date,
              day.meals > 0 ? `${day.meals} meals, ${Math.round(day.calories ?? 0)} kcal` : 'nothing logged',
              goal ? 'goals met' : '',
              day.workouts?.length ? `${day.workouts.length} workout${day.workouts.length > 1 ? 's' : ''}` : '',
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <a
                key={day.date}
                className="day-cell"
                href={`#/day/${day.date}`}
                data-state={state}
                data-today={day.date === today}
                aria-label={label}
                title={label}
              >
                {Number(day.date.slice(8))}
                {goal && (
                  <span className="check" aria-hidden>
                    ✓
                  </span>
                )}
                {day.workouts?.length ? <span className="workout-dot" aria-hidden /> : null}
              </a>
            );
          })}
        </div>
        <div className="legend">
          <span>
            <i className="swatch" /> Not logged
          </span>
          <span>
            <i className="swatch logged" /> Logged
          </span>
          {goalsSet && (
            <span>
              <i className="swatch met">✓</i> Goals met
            </span>
          )}
          <span>
            <i className="swatch dot" /> Workout
          </span>
        </div>
        {!goalsSet && (
          <p className="empty" style={{ marginTop: 12 }}>
            Set calorie or protein goals to see which days you hit them.
          </p>
        )}
      </section>

      <section className="card stats">
        <div>
          <strong>{logged}</strong>
          <span>days logged</span>
        </div>
        <div>
          <strong>{goalsSet ? met : '—'}</strong>
          <span>goal days</span>
        </div>
        <div>
          <strong>{workouts}</strong>
          <span>workouts</span>
        </div>
      </section>
    </>
  );
}
