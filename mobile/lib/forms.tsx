// Form controls in the same Tamagui style as the screens: grouped sections on card color, soft filled inputs
// (decimal keyboards for numbers), segmented controls, icon choice chips, and buttons. Dates and times use iOS's
// own compact pickers; deletes ask first with a native alert.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet, useColorScheme } from 'react-native';
import { Button, Input, SizableText, TextArea, Theme, XStack, YStack, type InputProps, type ThemeName } from 'tamagui';
import { useCardColor } from './kit.tsx';
import { useColors } from './theme.ts';
import { tap } from './ui.tsx';

type Icon = ComponentType<{ size?: number; color?: string }>;

/** Inputs sit one step darker than the card they're on. */
export function useFieldColor() {
  return useColorScheme() === 'dark' ? '$color5' : '$color3';
}

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const card = useCardColor();
  return (
    <YStack marginBottom="$5">
      {title && (
        <SizableText size="$2" fontWeight="600" color="$color10" marginLeft="$3" marginBottom="$1.5" letterSpacing={0.6} textTransform="uppercase">
          {title}
        </SizableText>
      )}
      <YStack backgroundColor={card} borderRadius="$6" padding="$3.5" gap="$3">
        {children}
      </YStack>
      {footer && (
        <SizableText size="$2" color="$color10" marginHorizontal="$3" marginTop="$1.5">
          {footer}
        </SizableText>
      )}
    </YStack>
  );
}

export function FieldLabel({ children, compact }: { children: string; compact?: boolean }) {
  return (
    <SizableText size={compact ? '$1' : '$2'} fontWeight="600" color="$color10">
      {children}
    </SizableText>
  );
}

/** A labelled text input (a taller text area with `multiline`). */
export function TextField({ label, multiline, ...props }: InputProps & { label?: string; multiline?: boolean }) {
  const field = useFieldColor();
  return (
    <YStack gap="$1.5">
      {label && <FieldLabel>{label}</FieldLabel>}
      {multiline ? (
        <TextArea size="$4" minHeight={96} backgroundColor={field} borderWidth={0} color="$color" placeholderTextColor={'$color8' as never} {...(props as object)} />
      ) : (
        <Input size="$4" backgroundColor={field} borderWidth={0} color="$color" placeholderTextColor={'$color8' as never} {...props} />
      )}
    </YStack>
  );
}

/** A number input: blank means "not set", and the text the user typed is kept while they type ("1." stays). */
export function NumberField({ label, value, onChange, placeholder, integer = false, compact = false, large = false, autoFocus, suffix }: { label?: string; value: number | undefined; onChange: (value: number | undefined) => void; placeholder?: string; integer?: boolean; compact?: boolean; large?: boolean; autoFocus?: boolean; suffix?: string }) {
  const field = useFieldColor();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(value === undefined ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <YStack gap={compact ? '$1' : '$1.5'} flex={compact ? 1 : undefined}>
      {label && <FieldLabel compact={compact}>{label}</FieldLabel>}
      <XStack alignItems="center" backgroundColor={field} borderRadius={compact ? '$3' : '$4'} paddingRight={suffix ? '$3' : 0}>
        <Input
          flex={1}
          unstyled
          size={large ? '$9' : compact ? '$3' : '$4'}
          paddingHorizontal={compact ? '$2' : '$3'}
          height={large ? 76 : compact ? 38 : 44}
          fontWeight={large ? '800' : '400'}
          value={text}
          placeholder={placeholder}
          placeholderTextColor={'$color8' as never}
          keyboardType={integer ? 'number-pad' : 'decimal-pad'}
          autoFocus={autoFocus}
          selectTextOnFocus
          color="$color"
          onChangeText={(next: string) => {
            const cleaned = next.replace(',', '.');
            setText(cleaned);
            const parsed = Number(cleaned);
            onChange(cleaned.trim() === '' || Number.isNaN(parsed) ? undefined : parsed);
          }}
        />
        {suffix && (
          <SizableText size={large ? '$7' : '$3'} color="$color10" fontWeight="700">
            {suffix}
          </SizableText>
        )}
      </XStack>
    </YStack>
  );
}

type SegmentedProps<T extends string> = { options: { value: T; label: string }[]; value: T | '' } & (
  | { allowNone?: false; onChange: (value: T) => void }
  | { allowNone: true; onChange: (value: T | '') => void }
);

/** A segmented control, iOS style. With `allowNone`, tapping the selected option clears it. */
export function Segmented<T extends string>({ options, value, onChange, allowNone = false }: SegmentedProps<T>) {
  const field = useFieldColor();
  const card = useCardColor();
  return (
    <XStack backgroundColor={field} borderRadius="$4" padding={3} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            flex={1}
            size="$3"
            paddingHorizontal="$1"
            borderRadius="$3"
            borderWidth={0}
            backgroundColor={selected ? card : 'transparent'}
            shadowColor="#000"
            shadowOpacity={selected ? 0.12 : 0}
            shadowRadius={3}
            shadowOffset={{ width: 0, height: 1 }}
            pressStyle={{ backgroundColor: selected ? card : '$color6' }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected && !allowNone) return;
              tap();
              (onChange as (value: string) => void)(selected ? '' : option.value);
            }}
          >
            <SizableText size="$3" numberOfLines={1} color="$color" fontWeight={selected ? '700' : '500'}>
              {option.label}
            </SizableText>
          </Button>
        );
      })}
    </XStack>
  );
}

/** A row of choices, each an icon in its own color; the selected one fills with that color. With `allowNone`,
 * tapping it again clears it. */
export function ChoiceChips<T extends string>({ options, value, onChange, allowNone = false }: { options: { value: T; label: string; theme: ThemeName; icon: Icon }[]; value: T | ''; onChange: (value: T | '') => void; allowNone?: boolean }) {
  return (
    <XStack gap="$2" accessibilityRole="radiogroup">
      {options.map(({ value: option, label, theme, icon: Icon }) => {
        const selected = option === value;
        return (
          <Theme key={option} name={theme}>
            <YStack
              flex={1}
              alignItems="center"
              gap="$1"
              paddingVertical="$2.5"
              borderRadius="$5"
              borderWidth={2}
              borderColor={selected ? '$color9' : 'transparent'}
              backgroundColor={selected ? '$color5' : '$color2'}
              transition="quick"
              pressStyle={{ scale: 0.95 }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => {
                if (selected && !allowNone) return;
                tap();
                onChange(selected ? '' : option);
              }}
            >
              <Icon size={20} color={selected ? '$color12' : '$color11'} />
              <SizableText size="$1" fontWeight={selected ? '800' : '600'} color={selected ? '$color12' : '$color11'} numberOfLines={1}>
                {label}
              </SizableText>
            </YStack>
          </Theme>
        );
      })}
    </XStack>
  );
}

const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The entry's local date and time, with iOS's compact pickers (plain text fields in the web preview). */
export function WhenRow({ date, time, onDate, onTime }: { date: string; time: string; onDate: (date: string) => void; onTime: (time: string) => void }) {
  const c = useColors();
  if (Platform.OS === 'web') {
    return (
      <XStack gap="$2">
        <YStack flex={1}>
          <TextField label="Date" value={date} onChangeText={onDate} />
        </YStack>
        <YStack flex={1}>
          <TextField label="Time" value={time} onChangeText={onTime} />
        </YStack>
      </XStack>
    );
  }
  const value = new Date(`${date}T${time}:00`);
  return (
    <XStack alignItems="center" gap="$2">
      <SizableText size="$4" fontWeight="600" color="$color" flex={1}>
        When
      </SizableText>
      <DateTimePicker value={value} mode="date" display="compact" accentColor={c.accent} onValueChange={(_, d) => onDate(toIsoDate(d))} />
      <DateTimePicker value={value} mode="time" display="compact" accentColor={c.accent} onValueChange={(_, d) => onTime(toTime(d))} />
    </XStack>
  );
}

/** The main action of a screen, e.g. "Save goals": full width, on Hulk's blue. */
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Theme name="blue">
      <Button size="$5" borderRadius="$6" backgroundColor="$color9" color="white" fontWeight="700" disabled={disabled} opacity={disabled ? 0.5 : 1} pressStyle={{ backgroundColor: '$color10', scale: 0.98 }} onPress={onPress}>
        {label}
      </Button>
    </Theme>
  );
}

/** A red button that asks before doing anything. */
export function DestructiveButton({ label, title, message, onConfirm }: { label: string; title: string; message: string; onConfirm: () => void }) {
  const card = useCardColor();
  const ask = () => {
    tap();
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: onConfirm },
    ]);
  };
  return (
    <Theme name="red">
      <Button size="$5" borderRadius="$6" backgroundColor={card} color="$color10" fontWeight="600" pressStyle={{ backgroundColor: '$color3' }} onPress={ask}>
        {label}
      </Button>
    </Theme>
  );
}

/** A small text button, e.g. "+ Add food". */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Theme name="blue">
      <Button
        chromeless
        size="$3"
        alignSelf="flex-start"
        paddingHorizontal="$1"
        color="$color10"
        fontWeight="700"
        pressStyle={{ opacity: 0.5, backgroundColor: 'transparent' }}
        onPress={() => {
          tap();
          onPress();
        }}
      >
        {label}
      </Button>
    </Theme>
  );
}

export const formStyles = StyleSheet.create({
  /** Bottom padding so the last field clears the keyboard and home indicator. */
  content: { padding: 16, paddingBottom: 48 },
});
