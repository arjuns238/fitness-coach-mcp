// Add/edit forms for meals, workouts and weigh-ins, shown as bottom sheets over the day view.
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { api, type Collection, type Exercise, type FoodItem, type FoodMatch, type Meal, type WeighIn, type WeightUnit, type Workout } from './api.ts';
import { formatDecimal, formatNumber } from './format.ts';
import { DeleteButton, NumberField, Sheet, useApp } from './ui.tsx';

interface SheetProps<T> {
  /** The entry being edited; absent when adding. */
  entry?: T;
  date: string;
  defaultTime: string;
  weightUnit: WeightUnit;
  onClose: () => void;
  onSaved: () => void;
}

function useSave(collection: Collection, id: number | undefined, onSaved: () => void) {
  const { report, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      notify(message);
      onSaved();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    save: (body: unknown) =>
      run(() => (id === undefined ? api.create(collection, body) : api.update(collection, id, body)), id === undefined ? 'Added' : 'Saved'),
    remove: () => run(() => api.remove(collection, id!), 'Deleted'),
  };
}

function WhenFields({ date, time, setDate, setTime }: { date: string; time: string; setDate: (v: string) => void; setTime: (v: string) => void }) {
  return (
    <div className="row">
      <label className="field">
        <span>Date</span>
        <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Time</span>
        <input type="time" value={time} required onChange={(e) => setTime(e.target.value)} />
      </label>
    </div>
  );
}

function Footer({ busy, editing, onDelete, formId }: { busy: boolean; editing: boolean; onDelete: () => void; formId: string }) {
  return (
    <div className="form-actions">
      {editing ? <DeleteButton onConfirm={onDelete} disabled={busy} /> : <span />}
      <button type="submit" form={formId} className="button primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

// ---------- Meal ----------

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];
const blankItem = (): FoodItem => ({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
const MACROS = ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const;
const SOURCE_NAMES = { usda: 'USDA', off: 'Open Food Facts' };

/** Loaded on first use: the barcode decoder is large. */
const Scanner = lazy(() => import('./Scanner.tsx'));

const itemFromMatch = (match: FoodMatch): FoodItem => ({
  name: match.source.product,
  brand: match.brand,
  servings: 1,
  quantity: match.serving,
  ...match.per_serving,
  source: match.source,
});

/** A label item eaten `servings` times: its numbers and amount scale from the current ones. */
function withServings(item: FoodItem, servings: number): FoodItem {
  const ratio = servings / (item.servings ?? 1);
  const base = item.quantity?.replace(/^[\d.]+ × /, '');
  return {
    ...item,
    servings,
    quantity: base && (servings === 1 ? base : `${formatDecimal(servings)} × ${base}`),
    calories: Math.round(item.calories * ratio),
    protein_g: Math.round(item.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(item.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(item.fat_g * ratio * 10) / 10,
  };
}

/** Search packaged foods or scan a barcode; a pick becomes an item with its label numbers. No Claude involved. */
function FoodFinder({ onAdd }: { onAdd: (item: FoodItem) => void }) {
  const { report, notify } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults(null);
    let current = true;
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .searchFoods(q)
        .then((found) => current && setResults(found.results))
        .catch(report)
        .finally(() => current && setSearching(false));
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, report]);

  const add = (match: FoodMatch) => {
    onAdd(itemFromMatch(match));
    setQuery('');
    setResults(null);
    notify(`Added ${match.source.product}`);
  };

  const onCode = async (code: string) => {
    setScanning(false);
    try {
      const { result } = await api.barcode(code);
      if (result) add(result);
      else notify(`No label data for barcode ${code}. Add it by hand.`);
    } catch (error) {
      report(error);
    }
  };

  return (
    <div className="food-finder">
      <div className="finder-row">
        <input type="search" value={query} placeholder="Search packaged foods" aria-label="Search packaged foods" onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="button" onClick={() => setScanning(true)}>
          <svg viewBox="0 0 24 24" aria-hidden className="barcode-icon">
            <path d="M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Scan
        </button>
      </div>
      {results && (
        <div className="finder-results">
          {searching && !results.length && <p className="empty">Searching…</p>}
          {!searching && !results.length && <p className="empty">No products with label data. Add it by hand below.</p>}
          {results.map((match) => (
            <button type="button" className="finder-result" key={`${match.source.db}:${match.source.id}`} onClick={() => add(match)}>
              <span className="finder-name">{match.source.product}</span>
              <span className="finder-meta">
                {match.serving} · {formatNumber(match.per_serving.calories)} kcal · P {formatNumber(match.per_serving.protein_g)} · C{' '}
                {formatNumber(match.per_serving.carbs_g)} · F {formatNumber(match.per_serving.fat_g)}
              </span>
            </button>
          ))}
        </div>
      )}
      {scanning && (
        <Suspense
          fallback={
            <div className="scanner">
              <p className="scanner-message">Loading the scanner…</p>
            </div>
          }
        >
          <Scanner onCode={onCode} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  );
}

export function MealSheet({ entry, date: initialDate, defaultTime, onClose, onSaved }: SheetProps<Meal>) {
  const [description, setDescription] = useState(entry?.description ?? '');
  const [mealType, setMealType] = useState(entry?.meal_type ?? '');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(entry?.time ?? defaultTime);
  const [items, setItems] = useState<FoodItem[]>(entry?.items ?? [blankItem()]);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [recent, setRecent] = useState<Meal[]>([]);
  const [error, setError] = useState('');
  const { busy, save, remove } = useSave('meals', entry?.id, onSaved);

  useEffect(() => {
    if (!entry) api.recentMeals().then((meals) => setRecent(meals.slice(0, 10) as unknown as Meal[]), () => {});
  }, [entry]);

  const setItem = (index: number, patch: Partial<FoodItem>) => setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const total = (key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g') => items.reduce((sum, item) => sum + (item[key] || 0), 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const named = items.filter((item) => item.name.trim());
    if (!named.length) return setError('Add at least one food.');
    save({
      description: description.trim() || named.map((item) => item.name).join(', '),
      items: named.map((item) => ({ ...item, name: item.name.trim(), quantity: item.quantity?.trim() || undefined })),
      meal_type: mealType || undefined,
      date,
      time,
      notes,
    });
  };

  return (
    <Sheet
      title={entry ? 'Edit meal' : 'Add meal'}
      onClose={onClose}
      footer={<Footer busy={busy} editing={!!entry} onDelete={remove} formId="meal-form" />}
    >
      <form id="meal-form" onSubmit={submit}>
        {recent.length > 0 && (
          <>
            <div className="field">
              <span>Repeat a recent meal</span>
            </div>
            <div className="recent">
              {recent.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => {
                    setDescription(meal.description);
                    setMealType(meal.meal_type ?? mealType);
                    setItems(meal.items.map((item) => ({ ...item })));
                  }}
                >
                  <span>{meal.description}</span>
                  <small>{formatNumber(meal.calories)} kcal</small>
                </button>
              ))}
            </div>
          </>
        )}
        <label className="field">
          <span>What was it?</span>
          <input value={description} placeholder="e.g. chicken burrito bowl" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="field">
          <span>Meal</span>
          <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
            <option value="">—</option>
            {MEAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type[0].toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <WhenFields date={date} time={time} setDate={setDate} setTime={setTime} />

        <div className="field">
          <span>Foods</span>
        </div>
        <FoodFinder onAdd={(item) => setItems([...items.filter((i) => i.name.trim() || i.calories), item])} />
        {items.map((item, index) => (
          <div className="subcard" key={index}>
            <div className="subcard-head">
              {item.source ? (
                // A product from its label: shown in full rather than squeezed into inputs.
                <div className="label-item">
                  <strong>{item.name}</strong>
                  {item.quantity && <span>{item.quantity}</span>}
                </div>
              ) : (
                <>
                  <input value={item.name} placeholder="Food" aria-label="Food" onChange={(e) => setItem(index, { name: e.target.value })} />
                  <input
                    value={item.quantity ?? ''}
                    placeholder="Amount"
                    aria-label="Amount"
                    style={{ maxWidth: '7rem' }}
                    onChange={(e) => setItem(index, { quantity: e.target.value })}
                  />
                </>
              )}
              {items.length > 1 && (
                <button type="button" className="remove" aria-label="Remove food" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                  ×
                </button>
              )}
            </div>
            <div className="mini-grid">
              {(
                [
                  ['calories', 'kcal'],
                  ['protein_g', 'Protein g'],
                  ['carbs_g', 'Carbs g'],
                  ['fat_g', 'Fat g'],
                ] as const
              ).map(([key, label]) => (
                <label className="mini" key={key}>
                  <span>{label}</span>
                  <NumberField
                    value={item[key] || undefined}
                    placeholder="0"
                    // Typing over label numbers makes them your own: drop the source (and the brand, so saving
                    // doesn't look the label up again).
                    onChange={(value) => setItem(index, { [key]: value ?? 0, ...(item.source ? { source: undefined, brand: undefined } : {}) })}
                  />
                </label>
              ))}
            </div>
            <div className="item-source">
              {item.source ? (
                <>
                  <span className="chip label" title={item.source.product}>
                    ✓ Label · {SOURCE_NAMES[item.source.db]}
                  </span>
                  <span className="stepper" role="group" aria-label="Servings">
                    <button type="button" aria-label="Fewer servings" disabled={(item.servings ?? 1) <= 0.5} onClick={() => setItems(items.map((it, i) => (i === index ? withServings(it, (it.servings ?? 1) - 0.5) : it)))}>
                      −
                    </button>
                    <span>
                      {formatDecimal(item.servings ?? 1)} serving{(item.servings ?? 1) === 1 ? '' : 's'}
                    </span>
                    <button type="button" aria-label="More servings" onClick={() => setItems(items.map((it, i) => (i === index ? withServings(it, (it.servings ?? 1) + 0.5) : it)))}>
                      +
                    </button>
                  </span>
                </>
              ) : (
                item.name.trim() && <span className="chip estimate">Estimate</span>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="link-button" onClick={() => setItems([...items, blankItem()])}>
          + Add food
        </button>
        <div className="totals-line">
          <span>
            Total <strong>{formatNumber(total('calories'))} kcal</strong>
          </span>
          <span>
            P {formatNumber(total('protein_g'))} · C {formatNumber(total('carbs_g'))} · F {formatNumber(total('fat_g'))}
          </span>
        </div>
        <label className="field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
      </form>
    </Sheet>
  );
}

// ---------- Workout ----------

const WORKOUT_TYPES = ['strength', 'cardio', 'sport', 'mobility', 'other'] as const;

export function WorkoutSheet({ entry, date: initialDate, defaultTime, weightUnit, onClose, onSaved }: SheetProps<Workout>) {
  const [description, setDescription] = useState(entry?.description ?? '');
  const [type, setType] = useState<(typeof WORKOUT_TYPES)[number]>((entry?.type as (typeof WORKOUT_TYPES)[number]) ?? 'strength');
  const [duration, setDuration] = useState<number | undefined>(entry?.duration_min ?? undefined);
  const [effort, setEffort] = useState<number | undefined>(entry?.effort ?? undefined);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(entry?.time ?? defaultTime);
  const [exercises, setExercises] = useState<Exercise[]>(entry?.exercises ?? []);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [error, setError] = useState('');
  const { busy, save, remove } = useSave('workouts', entry?.id, onSaved);
  const showSets = type !== 'cardio';
  const showDistance = type !== 'strength';

  const setExercise = (index: number, patch: Partial<Exercise>) =>
    setExercises(exercises.map((exercise, i) => (i === index ? { ...exercise, ...patch } : exercise)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!description.trim()) return setError('Give the workout a short name, e.g. "push day".');
    save({
      description: description.trim(),
      type,
      duration_min: duration,
      effort,
      exercises: exercises
        .filter((exercise) => exercise.name.trim())
        .map((exercise) => ({
          ...exercise,
          name: exercise.name.trim(),
          sets: exercise.sets?.filter((set) => set.reps !== undefined || set.weight !== undefined || set.duration_sec !== undefined),
        })),
      date,
      time,
      notes,
    });
  };

  return (
    <Sheet
      title={entry ? 'Edit workout' : 'Add workout'}
      onClose={onClose}
      footer={<Footer busy={busy} editing={!!entry} onDelete={remove} formId="workout-form" />}
    >
      <form id="workout-form" onSubmit={submit}>
        <label className="field">
          <span>Workout</span>
          <input value={description} placeholder="e.g. push day, 5k run" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="row">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as (typeof WORKOUT_TYPES)[number])}>
              {WORKOUT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Effort (1–10)</span>
            <select value={effort ?? ''} onChange={(e) => setEffort(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Duration (minutes)</span>
          <NumberField value={duration} onChange={setDuration} />
        </label>
        <WhenFields date={date} time={time} setDate={setDate} setTime={setTime} />

        <div className="field">
          <span>Exercises</span>
        </div>
        {exercises.map((exercise, index) => (
          <div className="subcard" key={index}>
            <div className="subcard-head">
              <input value={exercise.name} placeholder="Exercise" aria-label="Exercise" onChange={(e) => setExercise(index, { name: e.target.value })} />
              <button type="button" className="remove" aria-label="Remove exercise" onClick={() => setExercises(exercises.filter((_, i) => i !== index))}>
                ×
              </button>
            </div>
            {showSets && (
              <>
                {(exercise.sets ?? []).map((set, setIndex) => {
                  const setSet = (patch: object) =>
                    setExercise(index, { sets: exercise.sets!.map((s, i) => (i === setIndex ? { ...s, ...patch } : s)) });
                  return (
                    <div className="set-row" key={setIndex}>
                      <span className="set-label">#{setIndex + 1}</span>
                      <label className="mini">
                        <span>Reps</span>
                        <NumberField value={set.reps} step={1} onChange={(reps) => setSet({ reps })} />
                      </label>
                      <label className="mini">
                        <span>Weight</span>
                        <NumberField value={set.weight} onChange={(weight) => setSet({ weight })} />
                      </label>
                      <label className="mini">
                        <span>Unit</span>
                        <select value={set.unit ?? weightUnit} onChange={(e) => setSet({ unit: e.target.value })}>
                          <option value="lb">lb</option>
                          <option value="kg">kg</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="remove"
                        aria-label={`Remove set ${setIndex + 1}`}
                        onClick={() => setExercise(index, { sets: exercise.sets!.filter((_, i) => i !== setIndex) })}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    const sets = exercise.sets ?? [];
                    // A new set starts as a copy of the last one; most sets repeat.
                    setExercise(index, { sets: [...sets, sets.length ? { ...sets[sets.length - 1] } : { unit: weightUnit }] });
                  }}
                >
                  + Add set
                </button>
              </>
            )}
            {showDistance && (
              <div className="mini-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 6 }}>
                <label className="mini">
                  <span>Distance</span>
                  <NumberField value={exercise.distance} onChange={(distance) => setExercise(index, { distance })} />
                </label>
                <label className="mini">
                  <span>Unit</span>
                  <select value={exercise.distance_unit ?? 'mi'} onChange={(e) => setExercise(index, { distance_unit: e.target.value as 'mi' | 'km' })}>
                    <option value="mi">mi</option>
                    <option value="km">km</option>
                  </select>
                </label>
                <label className="mini">
                  <span>Minutes</span>
                  <NumberField value={exercise.duration_min} onChange={(duration_min) => setExercise(index, { duration_min })} />
                </label>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="link-button"
          onClick={() => setExercises([...exercises, { name: '', ...(showSets ? { sets: [{ unit: weightUnit }] } : {}) }])}
        >
          + Add exercise
        </button>
        <label className="field" style={{ marginTop: 14 }}>
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
      </form>
    </Sheet>
  );
}

// ---------- Weigh-in ----------

export function WeightSheet({ entry, date: initialDate, defaultTime, weightUnit, onClose, onSaved }: SheetProps<WeighIn>) {
  const [weight, setWeight] = useState<number | undefined>(entry?.weight);
  const [unit, setUnit] = useState<WeightUnit>(entry?.unit ?? weightUnit);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(entry?.time ?? defaultTime);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [error, setError] = useState('');
  const { busy, save, remove } = useSave('weigh-ins', entry?.id, onSaved);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!weight) return setError('Enter a weight.');
    save({ weight, unit, date, time, notes });
  };

  return (
    <Sheet
      title={entry ? 'Edit weigh-in' : 'Log weight'}
      onClose={onClose}
      footer={<Footer busy={busy} editing={!!entry} onDelete={remove} formId="weight-form" />}
    >
      <form id="weight-form" onSubmit={submit}>
        <div className="row">
          <label className="field">
            <span>Weight</span>
            <NumberField value={weight} onChange={setWeight} autoFocus={!entry} />
          </label>
          <label className="field">
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>
        </div>
        <WhenFields date={date} time={time} setDate={setDate} setTime={setTime} />
        <label className="field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
      </form>
    </Sheet>
  );
}
