export { addDays } from '../../src/time.ts';

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export const formatDay = (date: string) =>
  utc(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const formatMonth = (month: string) =>
  utc(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const formatNumber = (n: number) => Math.round(n).toLocaleString('en-US');

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "2026-11-02 (Mon) 14:05 America/Chicago" -> "2026-11-02" */
export const todayFromNow = (now: string) => now.slice(0, 10);
export const timeFromNow = (now: string) => now.split(' ')[2];

/** "3×8 @ 135 lb" for identical sets; runs are grouped, e.g. "2×8 @ 135 lb, 6 @ 145 lb". */
export function setSummary(sets: { reps?: number; weight?: number; unit?: string }[] = []): string {
  const one = (s: (typeof sets)[number]) => `${s.reps ?? '?'}${s.weight !== undefined ? ` @ ${s.weight} ${s.unit ?? ''}`.trimEnd() : ''}`;
  const runs: { label: string; count: number }[] = [];
  for (const set of sets) {
    const label = one(set);
    if (runs.at(-1)?.label === label) runs.at(-1)!.count++;
    else runs.push({ label, count: 1 });
  }
  return runs.map((run) => (run.count > 1 ? `${run.count}×${run.label}` : run.label)).join(', ');
}
