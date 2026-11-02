// Small SVG charts for the Trends tab: columns with a goal line, and lines/dots over days. One series hue (the
// accent ramp), hairline grid, values in a tooltip on hover, tap or arrow keys, and a table twin for each.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

const MARGIN = { top: 14, right: 8, bottom: 24, left: 40 };
const MIN_TICK_SPACING = 52;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean axis ticks (steps of 1, 2, 2.5 or 5 × 10ⁿ) covering lo..hi. */
function niceScale(lo: number, hi: number, count: number) {
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

const formatTick = (n: number) =>
  Math.abs(n) >= 1000 ? `${Number((n / 1000).toFixed(1))}K` : n.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Indices of the labelled positions, thinned so labels never collide. */
function visibleTicks(labels: (string | undefined)[], plotWidth: number): number[] {
  const marked = labels.flatMap((label, i) => (label ? [i] : []));
  const step = Math.max(1, Math.ceil(marked.length / Math.max(1, Math.floor(plotWidth / MIN_TICK_SPACING))));
  // Keep the most recent label; thin backwards from it.
  return marked.filter((_, k) => (marked.length - 1 - k) % step === 0);
}

/** Legend and tooltip swatches, mirroring the marks: a stroke for lines, a dot for points, a block for columns. */
export type Key = 'line' | 'dot' | 'dot-muted' | 'bar' | 'soft';

export interface TooltipContent {
  title: string;
  rows: { value: string; label?: string; key?: Key }[];
}

/**
 * The active position, from the pointer (hover or tap) or arrow keys. Keys step through `positions`, the
 * indices that have something to show.
 */
function useActive(positions: number[], indexAt: (x: number) => number | undefined) {
  const [active, setActive] = useState<number>();
  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setActive(indexAt(event.clientX - box.left));
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const k = active === undefined ? positions.length : positions.indexOf(active);
    setActive(positions[Math.min(positions.length - 1, Math.max(0, k + (event.key === 'ArrowLeft' ? -1 : 1)))]);
  };
  return {
    active,
    handlers: {
      onPointerMove: onPointer,
      onPointerDown: onPointer,
      // Touch fires pointerleave right after every tap, so only a mouse leaving clears the readout; on touch it
      // stays until focus moves elsewhere (a tap outside the chart).
      onPointerLeave: (event: PointerEvent<SVGSVGElement>) => event.pointerType === 'mouse' && setActive(undefined),
      onKeyDown,
      onBlur: () => setActive(undefined),
      tabIndex: 0,
    },
  };
}

function Tooltip({ content, x, width }: { content?: TooltipContent; x: number; width: number }) {
  if (!content) return null;
  const half = 80;
  const left = Math.min(Math.max(x, half), Math.max(half, width - half));
  return (
    <div className="chart-tooltip" style={{ left }} role="status">
      <div className="chart-tooltip-title">{content.title}</div>
      {content.rows.map((row, i) => (
        <div className="chart-tooltip-row" key={i}>
          {row.key && <span className={`key key-${row.key}`} aria-hidden />}
          <strong>{row.value}</strong>
          {row.label && <span>{row.label}</span>}
        </div>
      ))}
    </div>
  );
}

function YGrid({ ticks, y, width }: { ticks: number[]; y: (v: number) => number; width: number }) {
  return (
    <g className="grid">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
          <text x={MARGIN.left - 6} y={y(tick)} dy="0.32em" textAnchor="end">
            {formatTick(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ labels, x, plotWidth, height }: { labels: (string | undefined)[]; x: (i: number) => number; plotWidth: number; height: number }) {
  return (
    <g className="x-labels">
      {visibleTicks(labels, plotWidth).map((i) => (
        <text key={i} x={x(i)} y={height - 6} textAnchor="middle">
          {labels[i]}
        </text>
      ))}
    </g>
  );
}

function ReferenceLine({ value, label, y, width }: { value: number; label: string; y: (v: number) => number; width: number }) {
  return (
    <g className="reference">
      <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(value)} y2={y(value)} />
      <text x={width - MARGIN.right} y={y(value) - 5} textAnchor="end">
        {label}
      </text>
    </g>
  );
}

export interface Column {
  value?: number;
  /** Still filling in (today, this week): drawn in the lighter step of the ramp. */
  partial?: boolean;
  /** Axis label; only some columns carry one (e.g. week starts). */
  tick?: string;
  tooltip: TooltipContent;
}

/** Columns from a zero baseline, rounded at the data end only. */
export function ColumnChart({ columns, reference, height = 168, label }: { columns: Column[]; reference?: { value: number; label: string }; height?: number; label: string }) {
  const [ref, width] = useWidth();
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const band = columns.length ? plotWidth / columns.length : 0;
  const { active, handlers } = useActive([...columns.keys()], (px) => {
    const i = Math.floor((px - MARGIN.left) / band);
    return i >= 0 && i < columns.length ? i : undefined;
  });

  const values = columns.map((c) => c.value ?? 0);
  const { max, ticks } = niceScale(0, Math.max(...values, reference?.value ?? 0, 1) * 1.05, 3);
  const plotBottom = height - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + (1 - v / max) * (plotBottom - MARGIN.top);
  const center = (i: number) => MARGIN.left + band * (i + 0.5);
  // Columns never fill their slot: the leftover is air, and at most 24px wide.
  const barWidth = Math.max(2, Math.min(24, band * 0.6));

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} aria-label={label} role="group" {...handlers}>
          <YGrid ticks={ticks} y={y} width={width} />
          {columns.map((column, i) => {
            if (!column.value) return null;
            const top = y(column.value);
            const h = plotBottom - top;
            const r = Math.min(4, barWidth / 2, h);
            const x0 = center(i) - barWidth / 2;
            const x1 = x0 + barWidth;
            return (
              <path
                key={i}
                className={`column${column.partial ? ' partial' : ''}${active === i ? ' active' : ''}`}
                d={`M${x0},${plotBottom}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${plotBottom}Z`}
              />
            );
          })}
          {reference && <ReferenceLine value={reference.value} label={reference.label} y={y} width={width} />}
          <XLabels labels={columns.map((c) => c.tick)} x={center} plotWidth={plotWidth} height={height} />
        </svg>
      )}
      <Tooltip content={active !== undefined ? columns[active].tooltip : undefined} x={active !== undefined ? center(active) : 0} width={width} />
    </div>
  );
}

export interface Series {
  values: (number | undefined)[];
  kind: 'line' | 'dots';
  /** The emphasized series wears the accent; context series are muted. */
  tone: 'accent' | 'muted';
  label: string;
  /** Draw through missing values (sparse sessions) instead of breaking the line (gaps in a running average). */
  connect?: boolean;
}

/**
 * Values over evenly spaced positions (days). Lines break where there's no value. The crosshair snaps to the
 * nearest position that has data.
 */
export function LineChart({
  series,
  ticks: tickLabels,
  tooltip,
  reference,
  height = 180,
  minSpan = 0,
  label,
}: {
  series: Series[];
  ticks: (string | undefined)[];
  tooltip: (i: number) => TooltipContent;
  reference?: { value: number; label: string };
  height?: number;
  /** The y-axis covers at least this range, so small wobbles don't look like big swings. */
  minSpan?: number;
  label: string;
}) {
  const [ref, width] = useWidth();
  const count = tickLabels.length;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = (i: number) => MARGIN.left + (count > 1 ? (i / (count - 1)) * plotWidth : plotWidth / 2);
  const withData = [...Array(count).keys()].filter((i) => series.some((s) => s.values[i] !== undefined));
  const { active, handlers } = useActive(withData, (px) =>
    withData.reduce<number | undefined>((best, i) => (best === undefined || Math.abs(x(i) - px) < Math.abs(x(best) - px) ? i : best), undefined),
  );

  const all = series.flatMap((s) => s.values.filter((v) => v !== undefined));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = Math.max(0, minSpan - (hi - lo)) / 2;
  const { min, max, ticks } = niceScale(lo - pad, hi + pad, 3);
  const plotBottom = height - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + (1 - (v - min) / (max - min)) * (plotBottom - MARGIN.top);

  const path = ({ values, connect }: Series) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === undefined) {
        if (!connect) pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <div className="chart" ref={ref}>
      {width > 0 && all.length > 0 && (
        <svg width={width} height={height} aria-label={label} role="group" {...handlers}>
          <YGrid ticks={ticks} y={y} width={width} />
          {reference && reference.value >= min && reference.value <= max && (
            <ReferenceLine value={reference.value} label={reference.label} y={y} width={width} />
          )}
          {active !== undefined && <line className="crosshair" x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={plotBottom} />}
          {series.map((s, k) =>
            s.kind === 'line' ? (
              <path key={k} className={`series-line tone-${s.tone}`} d={path(s)} />
            ) : (
              <g key={k} className={`series-dots tone-${s.tone}`}>
                {s.values.map((v, i) => (v === undefined ? null : <circle key={i} cx={x(i)} cy={y(v)} r={active === i ? 5.5 : 4} />))}
              </g>
            ),
          )}
          {active !== undefined &&
            series
              .filter((s) => s.kind === 'line' && s.values[active] !== undefined)
              .map((s, k) => <circle key={k} className={`active-dot tone-${s.tone}`} cx={x(active)} cy={y(s.values[active]!)} r={5} />)}
          <XLabels labels={tickLabels} x={x} plotWidth={plotWidth} height={height} />
        </svg>
      )}
      <Tooltip content={active !== undefined ? tooltip(active) : undefined} x={active !== undefined ? x(active) : 0} width={width} />
    </div>
  );
}

export function Legend({ items }: { items: { label: string; key: Key }[] }) {
  return (
    <div className="legend chart-legend">
      {items.map((item) => (
        <span key={item.label}>
          <span className={`key key-${item.key}`} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Every chart's values, readable without hovering. */
export function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <details className="data-table">
      <summary>Show as table</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
