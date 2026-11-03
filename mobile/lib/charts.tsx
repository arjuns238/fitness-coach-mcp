// Native charts for Trends, drawn with react-native-svg in Tamagui's theme colors: columns with a goal line, and
// lines/dots over days. Columns grow and lines draw in when they appear; tap or drag across a chart for its values.
import { themes } from '@tamagui/config/v5';
import { useEffect, useState, type ReactNode } from 'react';
import { useColorScheme, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { SizableText, XStack, YStack } from 'tamagui';
import { formatTick, niceScale, visibleTicks } from '../../web/src/chart-math.ts';
import { tap } from './ui.tsx';

const MARGIN = { top: 16, right: 6, bottom: 22, left: 34 };
export type Tone = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';

type ThemeValues = Record<string, string>;
const themeValues = (name: string) => (themes as unknown as Record<string, ThemeValues>)[name];

/** Raw colors for drawing: a tone's ramp, plus the neutral grid, text and card colors. */
export function usePalette(tone: Tone) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const base = themeValues(scheme);
  const ramp = themeValues(`${scheme}_${tone}`) ?? base;
  return {
    mark: ramp.color9,
    strong: ramp.color11,
    soft: ramp.color6,
    grid: base.color4,
    axis: base.color9,
    label: base.color11,
    muted: base.color8,
    card: scheme === 'dark' ? base.color3 : base.color1,
  };
}

/** 0 -> 1 with an ease-out, once, when the chart first appears. */
function useProgress(duration = 800) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration]);
  return progress;
}

export interface TooltipContent {
  title: string;
  rows: { value: string; label?: string }[];
}

function Tooltip({ content, x, width }: { content: TooltipContent; x: number; width: number }) {
  const half = 85;
  const left = Math.min(Math.max(x - half, 0), Math.max(0, width - half * 2));
  return (
    <YStack position="absolute" top={-8} left={left} width={half * 2} alignItems="center" pointerEvents="none" zIndex={10}>
      <YStack backgroundColor="$color1" borderRadius="$4" paddingHorizontal="$2.5" paddingVertical="$1.5" borderWidth={0.5} borderColor="$color5" shadowColor="#000" shadowOpacity={0.15} shadowRadius={10} shadowOffset={{ width: 0, height: 4 }}>
        <SizableText size="$1" color="$color10" fontWeight="600">
          {content.title}
        </SizableText>
        {content.rows.map((row, i) => (
          <XStack key={i} gap="$1.5" alignItems="baseline">
            <SizableText size="$3" fontWeight="800">
              {row.value}
            </SizableText>
            {row.label ? (
              <SizableText size="$1" color="$color10">
                {row.label}
              </SizableText>
            ) : null}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

/** Tap a position to show its tooltip (tap again to hide), or drag across the chart to scrub. */
function useScrub(indexAt: (x: number) => number | undefined) {
  const [active, setActive] = useState<number>();
  const select = (i: number | undefined) => {
    setActive((current) => {
      if (i !== undefined && i !== current) tap();
      return i;
    });
  };
  const gesture = Gesture.Simultaneous(
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        const i = indexAt(e.x);
        setActive((current) => (current === i ? undefined : (tap(), i)));
      }),
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onUpdate((e) => select(indexAt(e.x))),
  );
  return { active, gesture };
}

function ChartFrame({ height, onWidth, children, gesture, tooltip }: { height: number; onWidth: (w: number) => void; children: ReactNode; gesture: ReturnType<typeof Gesture.Simultaneous>; tooltip?: ReactNode }) {
  return (
    <GestureDetector gesture={gesture}>
      <YStack height={height} position="relative" onLayout={(e: LayoutChangeEvent) => onWidth(e.nativeEvent.layout.width)}>
        {children}
        {tooltip}
      </YStack>
    </GestureDetector>
  );
}

function YAxis({ ticks, y, width, palette }: { ticks: number[]; y: (v: number) => number; width: number; palette: ReturnType<typeof usePalette> }) {
  return (
    <G>
      {ticks.map((tick) => (
        <G key={tick}>
          <Line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke={palette.grid} strokeWidth={1} />
          <SvgText x={MARGIN.left - 6} y={y(tick) + 4} fontSize={10} fill={palette.axis} textAnchor="end">
            {formatTick(tick)}
          </SvgText>
        </G>
      ))}
    </G>
  );
}

function XLabels({ labels, x, plotWidth, height, palette }: { labels: (string | undefined)[]; x: (i: number) => number; plotWidth: number; height: number; palette: ReturnType<typeof usePalette> }) {
  // Labels near either edge anchor inward so they aren't cut off.
  const anchor = (px: number) => (px < MARGIN.left + 18 ? 'start' : px > MARGIN.left + plotWidth - 18 ? 'end' : 'middle');
  return (
    <G>
      {visibleTicks(labels, plotWidth).map((i) => (
        <SvgText key={i} x={x(i)} y={height - 5} fontSize={10} fill={palette.axis} textAnchor={anchor(x(i))}>
          {labels[i]}
        </SvgText>
      ))}
    </G>
  );
}

function GoalLine({ value, label, y, width, palette }: { value: number; label: string; y: (v: number) => number; width: number; palette: ReturnType<typeof usePalette> }) {
  return (
    <G>
      <Line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(value)} y2={y(value)} stroke={palette.label} strokeWidth={1.5} strokeDasharray="5 4" />
      {/* A halo in the card color first, so the label stays readable where it crosses columns or the line. */}
      <SvgText x={width - MARGIN.right} y={y(value) - 6} fontSize={11} fontWeight="700" fill={palette.card} stroke={palette.card} strokeWidth={4} strokeLinejoin="round" textAnchor="end">
        {label}
      </SvgText>
      <SvgText x={width - MARGIN.right} y={y(value) - 6} fontSize={11} fontWeight="700" fill={palette.label} textAnchor="end">
        {label}
      </SvgText>
    </G>
  );
}

export interface Column {
  value?: number;
  /** Still filling in (today, this week): drawn in the lighter step of the tone. */
  partial?: boolean;
  /** Axis label; only some columns carry one (e.g. week starts). */
  tick?: string;
  tooltip: TooltipContent;
}

/** Columns from a zero baseline, rounded at the top, growing left to right when they appear. */
export function ColumnChart({ columns, tone = 'blue', reference, height = 170 }: { columns: Column[]; tone?: Tone; reference?: { value: number; label: string }; height?: number }) {
  const palette = usePalette(tone);
  const progress = useProgress();
  const [width, setWidth] = useState(0);
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const band = columns.length ? plotWidth / columns.length : 0;
  const { active, gesture } = useScrub((px) => {
    const i = Math.floor((px - MARGIN.left) / band);
    return i >= 0 && i < columns.length ? i : undefined;
  });

  const { max, ticks } = niceScale(0, Math.max(...columns.map((col) => col.value ?? 0), reference?.value ?? 0, 1) * 1.05, 3);
  const bottom = height - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + (1 - v / max) * (bottom - MARGIN.top);
  const center = (i: number) => MARGIN.left + band * (i + 0.5);
  const barWidth = Math.max(3, Math.min(22, band * 0.62));

  return (
    <ChartFrame height={height} onWidth={setWidth} gesture={gesture} tooltip={active !== undefined && width > 0 ? <Tooltip content={columns[active].tooltip} x={center(active)} width={width} /> : undefined}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <YAxis ticks={ticks} y={y} width={width} palette={palette} />
          {columns.map((column, i) => {
            if (!column.value) return null;
            // Each column starts growing a little after the one to its left.
            const own = Math.max(0, Math.min(1, progress * 1.6 - (i / columns.length) * 0.6));
            const top = y(column.value * own);
            const h = bottom - top;
            if (h <= 0) return null;
            const r = Math.min(5, barWidth / 2, h);
            const x0 = center(i) - barWidth / 2;
            const x1 = x0 + barWidth;
            const fill = active === i ? palette.strong : column.partial ? palette.soft : palette.mark;
            return <Path key={i} d={`M${x0},${bottom}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${bottom}Z`} fill={fill} />;
          })}
          {reference && progress > 0.4 && <GoalLine value={reference.value} label={reference.label} y={y} width={width} palette={palette} />}
          <XLabels labels={columns.map((col) => col.tick)} x={center} plotWidth={plotWidth} height={height} palette={palette} />
        </Svg>
      )}
    </ChartFrame>
  );
}

export interface Series {
  values: (number | undefined)[];
  kind: 'line' | 'dots';
  /** The emphasized series wears the tone; context series are muted gray. */
  muted?: boolean;
  /** Draw through missing values (sparse sessions) instead of breaking the line (gaps in a running average). */
  connect?: boolean;
}

/** Values over evenly spaced positions (days), drawing in left to right. The readout snaps to the nearest position
 * with data. */
export function LineChart({ series, ticks: tickLabels, tooltip, tone = 'blue', reference, height = 180, minSpan = 0 }: { series: Series[]; ticks: (string | undefined)[]; tooltip: (i: number) => TooltipContent; tone?: Tone; reference?: { value: number; label: string }; height?: number; minSpan?: number }) {
  const palette = usePalette(tone);
  const progress = useProgress(1000);
  const [width, setWidth] = useState(0);
  const count = tickLabels.length;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = (i: number) => MARGIN.left + (count > 1 ? (i / (count - 1)) * plotWidth : plotWidth / 2);
  const withData = [...Array(count).keys()].filter((i) => series.some((s) => s.values[i] !== undefined));
  const { active, gesture } = useScrub((px) =>
    withData.reduce<number | undefined>((best, i) => (best === undefined || Math.abs(x(i) - px) < Math.abs(x(best) - px) ? i : best), undefined),
  );

  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== undefined));
  if (!all.length) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = Math.max(0, minSpan - (hi - lo)) / 2;
  const { min, max, ticks } = niceScale(lo - pad, hi + pad, 3);
  const bottom = height - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + (1 - (v - min) / (max - min)) * (bottom - MARGIN.top);

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
    <ChartFrame height={height} onWidth={setWidth} gesture={gesture} tooltip={active !== undefined && width > 0 ? <Tooltip content={tooltip(active)} x={x(active)} width={width} /> : undefined}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            {/* Reveals the marks left to right as the chart appears. */}
            <ClipPath id="reveal">
              <Rect x={0} y={0} width={MARGIN.left + plotWidth * progress + 8} height={height} />
            </ClipPath>
          </Defs>
          <YAxis ticks={ticks} y={y} width={width} palette={palette} />
          {reference && reference.value >= min && reference.value <= max && <GoalLine value={reference.value} label={reference.label} y={y} width={width} palette={palette} />}
          {active !== undefined && <Line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={bottom} stroke={palette.axis} strokeWidth={1} />}
          <G clipPath="url(#reveal)">
            {series.map((s, k) =>
              s.kind === 'line' ? (
                <Path key={k} d={path(s)} fill="none" stroke={s.muted ? palette.muted : palette.mark} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              ) : (
                <G key={k}>
                  {s.values.map((v, i) =>
                    v === undefined ? null : <Circle key={i} cx={x(i)} cy={y(v)} r={active === i ? 5.5 : 3.5} fill={s.muted ? palette.muted : palette.mark} opacity={s.muted ? 0.6 : 1} stroke={palette.card} strokeWidth={1.5} />,
                  )}
                </G>
              ),
            )}
          </G>
          {active !== undefined &&
            series
              .filter((s) => s.kind === 'line' && s.values[active] !== undefined)
              .map((s, k) => <Circle key={k} cx={x(active)} cy={y(s.values[active]!)} r={5.5} fill={palette.mark} stroke={palette.card} strokeWidth={2} />)}
          <XLabels labels={tickLabels} x={x} plotWidth={plotWidth} height={height} palette={palette} />
        </Svg>
      )}
    </ChartFrame>
  );
}

/** Key for a chart with more than one series: a short line, dot or block in the series' color. */
export function Legend({ items, tone = 'blue' }: { items: { label: string; key: 'line' | 'dot' | 'soft'; muted?: boolean }[]; tone?: Tone }) {
  const palette = usePalette(tone);
  return (
    <XStack gap="$3" flexWrap="wrap" marginTop="$1">
      {items.map((item) => (
        <XStack key={item.label} alignItems="center" gap="$1.5">
          {item.key === 'line' ? (
            <YStack width={14} height={3} borderRadius={2} backgroundColor={item.muted ? palette.muted : palette.mark} />
          ) : item.key === 'dot' ? (
            <YStack width={8} height={8} borderRadius={4} backgroundColor={item.muted ? palette.muted : palette.mark} opacity={item.muted ? 0.6 : 1} />
          ) : (
            <YStack width={10} height={10} borderRadius={3} backgroundColor={palette.soft} />
          )}
          <SizableText size="$2" color="$color10">
            {item.label}
          </SizableText>
        </XStack>
      ))}
    </XStack>
  );
}
