// Axis math shared by the web dashboard's charts and the iPhone app's.

const MIN_TICK_SPACING = 52;

/** Clean axis ticks (steps of 1, 2, 2.5 or 5 × 10ⁿ) covering lo..hi. */
export function niceScale(lo: number, hi: number, count: number) {
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { min, max, ticks };
}

export const formatTick = (n: number) =>
  Math.abs(n) >= 1000 ? `${Number((n / 1000).toFixed(1))}K` : n.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Indices of the labelled positions, thinned so labels never collide. */
export function visibleTicks(labels: (string | undefined)[], plotWidth: number): number[] {
  const marked = labels.flatMap((label, i) => (label ? [i] : []));
  const step = Math.max(1, Math.ceil(marked.length / Math.max(1, Math.floor(plotWidth / MIN_TICK_SPACING))));
  // Keep the most recent label; thin backwards from it.
  return marked.filter((_, k) => (marked.length - 1 - k) % step === 0);
}

