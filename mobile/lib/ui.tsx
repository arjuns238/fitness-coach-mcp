// Building blocks shared by the screens, made from Tamagui components: cards, list rows, meters, stat tiles,
// plus data loading and haptics. Page and card colors follow iOS's grouped-list look (see theme.ts).
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Button, Card as TamaguiCard, Paragraph, Progress, Separator, SizableText, XStack, YStack, type YStackProps } from 'tamagui';
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

export function Card({ children, ...props }: YStackProps & { children: ReactNode }) {
  const c = useColors();
  return (
    <TamaguiCard backgroundColor={c.surface} borderRadius="$6" padding="$4" marginBottom="$3.5" {...props}>
      {children}
    </TamaguiCard>
  );
}

/** A card's title row, with an optional action on the right (e.g. "+ Add"). */
export function CardHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <XStack alignItems="center" justifyContent="space-between" marginBottom="$1.5">
      <SizableText size="$6" fontWeight="600" color={c.text}>
        {title}
      </SizableText>
      {action && (
        <Button
          size="$2.5"
          borderRadius="$10"
          backgroundColor={c.fill}
          color={c.accentStrong}
          fontWeight="600"
          pressStyle={{ scale: 0.96, opacity: 0.8 }}
          onPress={() => {
            tap();
            onAction?.();
          }}
        >
          {action}
        </Button>
      )}
    </XStack>
  );
}

/** A tappable row inside a card, with a hairline above every row but the first. */
export function Row({ children, onPress, first }: { children: ReactNode; onPress?: () => void; first?: boolean }) {
  const c = useColors();
  return (
    <YStack>
      {!first && <Separator borderColor={c.separator} />}
      <XStack
        paddingVertical="$3"
        gap="$3"
        pressStyle={onPress ? { opacity: 0.55 } : undefined}
        onPress={
          onPress &&
          (() => {
            tap();
            onPress();
          })
        }
      >
        {children}
      </XStack>
    </YStack>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Paragraph size="$4" color={c.text3} paddingVertical="$1.5">
      {children}
    </Paragraph>
  );
}

/** A value against a goal. Limits (calories) turn the warning color when exceeded; targets (protein) turn green
 * when reached; every state is also spelled out. The bar fills in from zero when it first appears. */
export function Meter({ label, value, goal, unit, kind = 'neutral', hero = false }: { label: string; value: number; goal?: number; unit: string; kind?: 'limit' | 'target' | 'neutral'; hero?: boolean }) {
  const c = useColors();
  const percent = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal !== undefined && value > goal;
  const met = kind === 'target' && goal !== undefined && value >= goal;
  const warn = kind === 'limit' && over;
  const fill = warn ? c.serious : met ? c.good : c.accent;
  // Start empty and grow to the value, so the bar animates in.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  let note = 'No goal set';
  if (goal !== undefined) {
    const diff = formatNumber(Math.abs(goal - value));
    note = met ? '✓ Goal reached' : over ? `▲ ${diff} ${unit} over` : `${diff} ${unit} ${kind === 'target' ? 'to go' : 'left'}`;
  }

  return (
    <YStack accessible accessibilityLabel={`${label}: ${formatNumber(value)}${goal ? ` of ${formatNumber(goal)}` : ''} ${unit}. ${note}`}>
      <SizableText size="$3" color={c.text2}>
        {label}
      </SizableText>
      {hero ? (
        <XStack alignItems="baseline" gap="$2">
          <SizableText size="$11" fontWeight="700" color={c.text} letterSpacing={-1}>
            {formatNumber(value)}
          </SizableText>
          <SizableText size="$5" color={c.text2}>
            {goal ? `of ${formatNumber(goal)} ${unit}` : unit}
          </SizableText>
        </XStack>
      ) : (
        <SizableText size="$5" fontWeight="600" color={c.text}>
          {formatNumber(value)}
          <SizableText size="$5" color={c.text3}>
            {goal ? ` / ${formatNumber(goal)}` : ''} {unit}
          </SizableText>
        </SizableText>
      )}
      {goal !== undefined && (
        <Progress value={shown} size={hero ? '$3' : '$1'} backgroundColor={c.accentTrack} marginTop={hero ? '$2.5' : '$1.5'} marginBottom="$1">
          <Progress.Indicator transition="lazy" backgroundColor={fill} />
        </Progress>
      )}
      <SizableText size="$3" color={met ? c.good : warn ? c.critical : c.text2} fontWeight={met || warn ? '600' : '400'}>
        {note}
      </SizableText>
    </YStack>
  );
}

export function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const c = useColors();
  return (
    <YStack flex={1} alignItems="center">
      <SizableText size="$7" fontWeight="700" color={c.text}>
        {value}
        {unit && (
          <SizableText size="$4" fontWeight="600" color={c.text2}>
            {' '}
            {unit}
          </SizableText>
        )}
      </SizableText>
      <SizableText size="$2" color={c.text2} textAlign="center">
        {label}
      </SizableText>
    </YStack>
  );
}
