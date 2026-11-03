// Building blocks shared by the screens: cards, list rows, meters, stat tiles, data loading and haptics.
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { formatNumber } from '../../web/src/format.ts';
import { useSession } from './session.tsx';
import { useColors } from './theme.ts';

/** A light tap on iOS; nothing on the web preview, which has no haptics. */
export const tap = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style);
};
export const success = () => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

/** Loads data, keeps the last result while reloading, and signs out on an auth error. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const { handle } = useSession();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader.current());
      setError(undefined);
    } catch (e) {
      handle(e);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    void reload();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload };
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface }, style]}>{children}</View>;
}

/** A card's title row, with an optional action on the right (e.g. "Add"). */
export function CardHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.cardHeader}>
      <Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
      {action && (
        <Pressable
          onPress={() => {
            tap();
            onAction?.();
          }}
          hitSlop={10}
          style={({ pressed }) => [styles.pill, { backgroundColor: c.fill, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.pillText, { color: c.accentStrong }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A tappable row inside a card, separated from the one above by a hairline. */
export function Row({ children, onPress, first }: { children: ReactNode; onPress?: () => void; first?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={
        onPress &&
        (() => {
          tap();
          onPress();
        })
      }
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
        pressed && onPress && { opacity: 0.55 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.empty, { color: c.text3 }]}>{children}</Text>;
}

/** A value against a goal. Limits (calories) turn the warning color when exceeded; targets (protein) turn green
 * when reached; every state is also spelled out. The bar fills in from zero when it first appears. */
export function Meter({ label, value, goal, unit, kind = 'neutral', hero = false }: { label: string; value: number; goal?: number; unit: string; kind?: 'limit' | 'target' | 'neutral'; hero?: boolean }) {
  const c = useColors();
  const fraction = goal ? Math.min(1, value / goal) : 0;
  const over = goal !== undefined && value > goal;
  const met = kind === 'target' && goal !== undefined && value >= goal;
  const fill = kind === 'limit' && over ? c.serious : met ? c.good : c.accent;
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: fraction, duration: 700, useNativeDriver: false }).start();
  }, [fraction, width]);

  let note = 'No goal set';
  if (goal !== undefined) {
    const diff = formatNumber(Math.abs(goal - value));
    note = met ? '✓ Goal reached' : over ? `▲ ${diff} ${unit} over` : `${diff} ${unit} ${kind === 'target' ? 'to go' : 'left'}`;
  }

  return (
    <View accessible accessibilityLabel={`${label}: ${formatNumber(value)}${goal ? ` of ${formatNumber(goal)}` : ''} ${unit}. ${note}`}>
      <Text style={[styles.meterLabel, { color: c.text2 }]}>{label}</Text>
      {hero ? (
        <Text style={[styles.heroValue, { color: c.text }]}>
          {formatNumber(value)}
          <Text style={[styles.heroOf, { color: c.text2 }]}>{goal ? `  of ${formatNumber(goal)} ${unit}` : `  ${unit}`}</Text>
        </Text>
      ) : (
        <Text style={[styles.meterValue, { color: c.text }]}>
          {formatNumber(value)}
          <Text style={{ color: c.text3, fontWeight: '400' }}>{goal ? ` / ${formatNumber(goal)}` : ''} {unit}</Text>
        </Text>
      )}
      {goal !== undefined && (
        <View style={[styles.track, hero && styles.heroTrack, { backgroundColor: c.accentTrack }]}>
          <Animated.View
            style={[styles.fill, { backgroundColor: fill, width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
          />
        </View>
      )}
      <Text style={[styles.meterNote, { color: met ? c.good : kind === 'limit' && over ? c.critical : c.text2 }, (met || (kind === 'limit' && over)) && { fontWeight: '600' }]}>
        {note}
      </Text>
    </View>
  );
}

export function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: c.text }]}>
        {value}
        {unit && <Text style={[styles.statUnit, { color: c.text2 }]}> {unit}</Text>}
      </Text>
      <Text style={[styles.statLabel, { color: c.text2 }]}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 15, fontWeight: '600' },
  row: { paddingVertical: 12, flexDirection: 'row', gap: 12 },
  empty: { fontSize: 15, paddingVertical: 6 },
  meterLabel: { fontSize: 13 },
  meterValue: { fontSize: 16, fontWeight: '600', marginTop: 1 },
  heroValue: { fontSize: 48, fontWeight: '700', letterSpacing: -1, marginTop: 2 },
  heroOf: { fontSize: 17, fontWeight: '400', letterSpacing: 0 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 6, marginBottom: 4 },
  heroTrack: { height: 12, marginTop: 10 },
  fill: { height: '100%', borderRadius: 999 },
  meterNote: { fontSize: 13 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statUnit: { fontSize: 14, fontWeight: '600' },
  statLabel: { fontSize: 12, marginTop: 2, textAlign: 'center' },
});
