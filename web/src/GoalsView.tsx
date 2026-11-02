import { useEffect, useState, type FormEvent } from 'react';
import { api, type Profile, type WeightUnit } from './api.ts';
import { NumberField, useApp, useAsync } from './ui.tsx';

const GOAL_FIELDS = [
  ['daily_calories', 'Calories per day', 'kcal'],
  ['daily_protein_g', 'Protein per day', 'g'],
  ['daily_carbs_g', 'Carbs per day', 'g'],
  ['daily_fat_g', 'Fat per day', 'g'],
  ['workouts_per_week', 'Workouts per week', ''],
] as const;

type GoalKey = (typeof GOAL_FIELDS)[number][0] | 'target_weight';

export function GoalsView() {
  const { data: profile } = useAsync(() => api.profile(), []);
  return (
    <>
      <header className="page-header">
        <div className="titles">
          <h1>Goals</h1>
          <div className="subtitle">Claude reads these when it coaches you</div>
        </div>
      </header>
      {profile ? <GoalsForm profile={profile} /> : <p className="loading">Loading…</p>}
    </>
  );
}

function GoalsForm({ profile }: { profile: Profile }) {
  const { report, notify, authRequired, signOut } = useApp();
  const [goals, setGoals] = useState<Partial<Record<GoalKey, number>>>(profile);
  const [unit, setUnit] = useState<WeightUnit>(profile.weight_unit);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [notes, setNotes] = useState(profile.coaching_notes ?? '');
  const [busy, setBusy] = useState(false);
  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => setZones(Intl.supportedValuesOf('timeZone')), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { weight_unit: unit, timezone, coaching_notes: notes.trim() || null };
      // An emptied field clears that goal.
      for (const key of [...GOAL_FIELDS.map(([k]) => k), 'target_weight'] as GoalKey[]) patch[key] = goals[key] || null;
      await api.updateProfile(patch);
      notify('Goals saved');
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <section className="card">
        <div className="card-header">
          <h2>Daily targets</h2>
        </div>
        {GOAL_FIELDS.map(([key, label, unitLabel]) => (
          <label className="field" key={key}>
            <span>
              {label}
              {unitLabel && ` (${unitLabel})`}
            </span>
            <NumberField value={goals[key]} onChange={(value) => setGoals({ ...goals, [key]: value })} placeholder="No goal" />
          </label>
        ))}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Body weight</h2>
        </div>
        <div className="field">
          <span>Units</span>
          <div className="segmented" role="group" aria-label="Weight unit">
            {(['lb', 'kg'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Target weight ({unit})</span>
          <NumberField value={goals.target_weight} onChange={(value) => setGoals({ ...goals, target_weight: value })} placeholder="No target" />
          {unit !== profile.weight_unit && goals.target_weight && <span className="hint">Remember to convert the target to {unit}.</span>}
        </label>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Coaching notes</h2>
        </div>
        <label className="field">
          <span>What Claude should keep in mind</span>
          <textarea
            value={notes}
            placeholder="e.g. Cutting until March. Vegetarian. Left knee is cranky, no deep squats."
            onChange={(e) => setNotes(e.target.value)}
          />
          <span className="hint">Claude can update these too, when you tell it something worth remembering.</span>
        </label>
        <label className="field">
          <span>Timezone</span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <span className="hint">Decides which day a late-night snack counts toward.</span>
        </label>
      </section>

      <div className="form-actions">
        {authRequired ? (
          <button type="button" className="button" onClick={() => signOut()}>
            Sign out
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save goals'}
        </button>
      </div>
      {authRequired && <SignOutEverywhere onConfirm={() => signOut(true)} />}
    </form>
  );
}

/** For a lost phone: ends every dashboard session without changing the key Claude uses. Asks for a second tap. */
function SignOutEverywhere({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <p className="fine-print sign-out-everywhere">
      <button type="button" className={`link-button${armed ? ' danger' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
        {armed ? 'Tap again to sign out every device' : 'Sign out on all devices'}
      </button>
    </p>
  );
}
