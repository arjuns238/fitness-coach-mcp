// Hulk's screen pieces, built from Tamagui's own components and themes: a gradient hero, themed macro tiles,
// grouped list items with colored icon tiles, and section headers. Colors come from Tamagui's v5 themes (light
// and dark follow the phone; blue, green, orange and purple sub-themes give each part its own palette).
import { LinearGradient } from '@tamagui/linear-gradient';
// One file per icon: Metro doesn't tree-shake, so importing the package root would bundle all of them.
import { Apple } from '@tamagui/lucide-icons-2/icons/Apple';
import { Beef } from '@tamagui/lucide-icons-2/icons/Beef';
import { Coffee } from '@tamagui/lucide-icons-2/icons/Coffee';
import { CupSoda } from '@tamagui/lucide-icons-2/icons/CupSoda';
import { Droplet } from '@tamagui/lucide-icons-2/icons/Droplet';
import { Dumbbell } from '@tamagui/lucide-icons-2/icons/Dumbbell';
import { Flame } from '@tamagui/lucide-icons-2/icons/Flame';
import { Footprints } from '@tamagui/lucide-icons-2/icons/Footprints';
import { PersonStanding } from '@tamagui/lucide-icons-2/icons/PersonStanding';
import { Plus } from '@tamagui/lucide-icons-2/icons/Plus';
import { Sandwich } from '@tamagui/lucide-icons-2/icons/Sandwich';
import { Scale } from '@tamagui/lucide-icons-2/icons/Scale';
import { Trophy } from '@tamagui/lucide-icons-2/icons/Trophy';
import { Utensils } from '@tamagui/lucide-icons-2/icons/Utensils';
import { UtensilsCrossed } from '@tamagui/lucide-icons-2/icons/UtensilsCrossed';
import { Wheat } from '@tamagui/lucide-icons-2/icons/Wheat';
import { Zap } from '@tamagui/lucide-icons-2/icons/Zap';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Button, Circle, H2, ListItem, Paragraph, Progress, SizableText, Theme, XStack, YGroup, YStack, type ThemeName } from 'tamagui';
import { formatNumber } from '../../web/src/format.ts';
import { tap } from './ui.tsx';

type Icon = ComponentType<{ size?: number; color?: string }>;

/** Cards sit one step off the page: white on light gray, a lifted gray on near-black. */
export function useCardColor() {
  return useColorScheme() === 'dark' ? '$color3' : '$color1';
}

/** Eases a number up to its value (ease-out, ~0.7s), starting from wherever it is now. */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    const from = shown.current;
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      shown.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/** The screen's own title and subtitle, big and bold at the top of the content. */
export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <XStack alignItems="flex-end" justifyContent="space-between" paddingTop="$2" paddingBottom="$1">
      <YStack flex={1}>
        <H2 fontWeight="800" letterSpacing={-0.5}>
          {title}
        </H2>
        {subtitle ? (
          <Paragraph size="$4" color="$color10">
            {subtitle}
          </Paragraph>
        ) : null}
      </YStack>
      {right}
    </XStack>
  );
}

/** Calories today, on a blue-to-purple gradient: count-up total, animated bar, what's left. */
export function CalorieHero({ value, goal }: { value: number; goal?: number }) {
  const shown = useCountUp(value);
  const percent = goal ? Math.min(100, (value / goal) * 100) : 0;
  const [bar, setBar] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setBar(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);
  const over = goal !== undefined && value > goal;

  return (
    <YStack
      borderRadius="$8"
      overflow="hidden"
      transition="lazy"
      enterStyle={{ opacity: 0, y: 12, scale: 0.98 }}
      shadowColor="$blue9"
      shadowOpacity={0.35}
      shadowRadius={18}
      shadowOffset={{ width: 0, height: 8 }}
    >
      {/* The gradient is a background layer; the content sits above it in its own stack. */}
      <LinearGradient colors={['$blue9', '$purple9']} start={[0, 0]} end={[1, 1]} position="absolute" top={0} left={0} right={0} bottom={0} />
      <YStack position="relative" zIndex={1} padding="$5" gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <SizableText size="$2" fontWeight="700" letterSpacing={1.4} color="rgba(255,255,255,0.85)">
            CALORIES
          </SizableText>
          <Circle size="$3" backgroundColor="rgba(255,255,255,0.18)">
            <Flame size={16} color="#fff" />
          </Circle>
        </XStack>
        <XStack alignItems="baseline" gap="$2">
          <SizableText size="$12" fontWeight="800" color="#fff" letterSpacing={-2} lineHeight={64}>
            {formatNumber(shown)}
          </SizableText>
          <SizableText size="$6" color="rgba(255,255,255,0.8)">
            {goal ? `/ ${formatNumber(goal)} kcal` : 'kcal'}
          </SizableText>
        </XStack>
        {goal !== undefined && (
          <>
            <Progress value={bar} size="$2" backgroundColor="rgba(255,255,255,0.25)" marginTop="$1">
              <Progress.Indicator transition="lazy" backgroundColor={over ? '$orange8' : '#fff'} />
            </Progress>
            <XStack justifyContent="space-between">
              <SizableText size="$4" fontWeight="600" color="#fff">
                {over ? `▲ ${formatNumber(value - goal)} over` : `${formatNumber(goal - value)} left`}
              </SizableText>
              <SizableText size="$4" color="rgba(255,255,255,0.8)">
                {Math.round((value / goal) * 100)}%
              </SizableText>
            </XStack>
          </>
        )}
        {goal === undefined && (
          <SizableText size="$3" color="rgba(255,255,255,0.8)">
            Set a daily goal in Goals to track what's left.
          </SizableText>
        )}
      </YStack>
    </YStack>
  );
}

/** One macro on its own colored tile. Targets (protein) show a check when reached. */
export function MacroTile({ theme, icon: Icon, label, value, goal, target = false, delay = 0 }: { theme: ThemeName; icon: Icon; label: string; value: number; goal?: number; target?: boolean; delay?: number }) {
  const percent = goal ? Math.min(100, (value / goal) * 100) : 0;
  const [bar, setBar] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setBar(percent), 120 + delay);
    return () => clearTimeout(timer);
  }, [percent, delay]);
  const met = target && goal !== undefined && value >= goal;

  return (
    <Theme name={theme}>
      <YStack
        flex={1}
        backgroundColor="$color3"
        borderRadius="$6"
        padding="$3"
        gap="$1.5"
        transition="lazy"
        enterStyle={{ opacity: 0, y: 10 }}
        accessible
        accessibilityLabel={`${label}: ${formatNumber(value)}${goal ? ` of ${formatNumber(goal)}` : ''} grams${met ? ', goal reached' : ''}`}
      >
        <XStack alignItems="center" justifyContent="space-between">
          <Circle size="$2.5" backgroundColor="$color5">
            <Icon size={14} color="$color11" />
          </Circle>
          {met && (
            <SizableText size="$2" fontWeight="700" color="$color11">
              ✓
            </SizableText>
          )}
        </XStack>
        <SizableText size="$2" color="$color11" fontWeight="600">
          {label}
        </SizableText>
        <XStack alignItems="baseline" gap="$1">
          <SizableText size="$7" fontWeight="800" color="$color12">
            {formatNumber(value)}
          </SizableText>
          <SizableText size="$2" color="$color11">
            {goal ? `/ ${formatNumber(goal)}g` : 'g'}
          </SizableText>
        </XStack>
        {goal !== undefined ? (
          // A plain track and fill: Tamagui's Progress has a minimum width wider than these tiles.
          <YStack height={6} borderRadius={3} backgroundColor="$color5" overflow="hidden">
            <YStack height="100%" width={`${bar}%`} borderRadius={3} backgroundColor="$color9" transition="lazy" />
          </YStack>
        ) : (
          <SizableText size="$1" color="$color10">
            No goal set
          </SizableText>
        )}
      </YStack>
    </Theme>
  );
}

export const MACRO_TILES = { protein: { theme: 'green' as ThemeName, icon: Beef }, carbs: { theme: 'orange' as ThemeName, icon: Wheat }, fat: { theme: 'purple' as ThemeName, icon: Droplet } };

/** A colored rounded square with an icon, marking what kind of entry a row is. */
export function IconTile({ theme, icon: Icon }: { theme: ThemeName; icon: Icon }) {
  return (
    <Theme name={theme}>
      <YStack width={40} height={40} borderRadius="$4" backgroundColor="$color4" alignItems="center" justifyContent="center">
        <Icon size={20} color="$color11" />
      </YStack>
    </Theme>
  );
}

const MEAL_ICONS: Record<string, { theme: ThemeName; icon: Icon }> = {
  breakfast: { theme: 'yellow', icon: Coffee },
  lunch: { theme: 'green', icon: Sandwich },
  dinner: { theme: 'purple', icon: UtensilsCrossed },
  snack: { theme: 'red', icon: Apple },
  drink: { theme: 'blue', icon: CupSoda },
};
export const mealIcon = (mealType: string | null) => MEAL_ICONS[mealType ?? ''] ?? { theme: 'gray' as ThemeName, icon: Utensils };

const WORKOUT_ICONS: Record<string, { theme: ThemeName; icon: Icon }> = {
  strength: { theme: 'blue', icon: Dumbbell },
  cardio: { theme: 'green', icon: Footprints },
  sport: { theme: 'orange', icon: Trophy },
  mobility: { theme: 'purple', icon: PersonStanding },
};
export const workoutIcon = (type: string) => WORKOUT_ICONS[type] ?? { theme: 'yellow' as ThemeName, icon: Zap };
export const weightIcon = { theme: 'gray' as ThemeName, icon: Scale };

/** A section of the page: a bold heading with an "Add" button, then a grouped list (or an empty message). */
export function ListSection({ title, actionLabel = 'Add', onAction, empty, children }: { title: string; actionLabel?: string; onAction?: () => void; empty?: string; children?: ReactNode[] }) {
  const card = useCardColor();
  const rows = (children ?? []).filter(Boolean);
  return (
    <YStack gap="$2" transition="lazy" enterStyle={{ opacity: 0, y: 10 }}>
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$1">
        <SizableText size="$6" fontWeight="700">
          {title}
        </SizableText>
        {onAction && (
          <Theme name="blue">
            <Button
              size="$2.5"
              borderRadius="$10"
              backgroundColor="$color4"
              color="$color11"
              fontWeight="700"
              icon={<Plus size={14} color="$color11" />}
              pressStyle={{ scale: 0.95, backgroundColor: '$color5' }}
              onPress={() => {
                tap();
                onAction();
              }}
            >
              {actionLabel}
            </Button>
          </Theme>
        )}
      </XStack>
      {rows.length ? (
        <YGroup borderRadius="$6" overflow="hidden" backgroundColor={card}>
          {rows.map((row, i) => (
            <YGroup.Item key={i}>{row}</YGroup.Item>
          ))}
        </YGroup>
      ) : (
        <YStack backgroundColor={card} borderRadius="$6" padding="$4">
          <Paragraph size="$3" color="$color10">
            {empty}
          </Paragraph>
        </YStack>
      )}
    </YStack>
  );
}

/** A row in a list section: icon tile, title and detail, and a value on the right. */
export function EntryRow({ tile, title, detail, note, value, valueDetail, onPress, separated }: { tile: { theme: ThemeName; icon: Icon }; title: string; detail?: string; note?: string; value?: string; valueDetail?: string; onPress?: () => void; separated?: boolean }) {
  const card = useCardColor();
  return (
    <ListItem
      backgroundColor={card}
      paddingVertical="$3"
      paddingHorizontal="$3.5"
      gap="$3"
      borderTopWidth={separated ? 0.5 : 0}
      borderTopColor="$borderColor"
      pressStyle={{ backgroundColor: '$color4' }}
      icon={<IconTile {...tile} />}
      onPress={
        onPress &&
        (() => {
          tap();
          onPress();
        })
      }
      title={
        <SizableText size="$4" fontWeight="600" numberOfLines={2}>
          {title}
        </SizableText>
      }
      subTitle={
        detail || note ? (
          <YStack>
            {detail ? (
              <SizableText size="$2" color="$color10" numberOfLines={1}>
                {detail}
              </SizableText>
            ) : null}
            {note ? (
              <Theme name="green">
                <SizableText size="$2" color="$color10" fontWeight="600">
                  {note}
                </SizableText>
              </Theme>
            ) : null}
          </YStack>
        ) : undefined
      }
      iconAfter={
        value ? (
          <YStack alignItems="flex-end">
            <SizableText size="$4" fontWeight="700">
              {value}
            </SizableText>
            {valueDetail ? (
              <SizableText size="$1" color="$color10">
                {valueDetail}
              </SizableText>
            ) : null}
          </YStack>
        ) : undefined
      }
    />
  );
}
