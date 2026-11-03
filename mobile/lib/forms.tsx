// Form controls built from Tamagui: grouped sections, labelled inputs (decimal keyboards for numbers), segmented
// toggles, and buttons. Dates and times use iOS's own compact pickers; deletes ask first with a native alert.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import { Button, Input, SizableText, XStack, YStack, type InputProps } from 'tamagui';
import { useColors } from './theme.ts';
import { tap } from './ui.tsx';

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const c = useColors();
  return (
    <YStack marginBottom="$5">
      {title && (
        <SizableText size="$2" color={c.text2} marginLeft="$4" marginBottom="$1.5" textTransform="uppercase">
          {title}
        </SizableText>
      )}
      <YStack backgroundColor={c.surface} borderRadius="$5" padding="$3" gap="$3">
        {children}
      </YStack>
      {footer && (
        <SizableText size="$2" color={c.text3} marginHorizontal="$4" marginTop="$1.5">
          {footer}
        </SizableText>
      )}
    </YStack>
  );
}

function FieldLabel({ children, compact }: { children: string; compact?: boolean }) {
  const c = useColors();
  return (
    <SizableText size={compact ? '$1' : '$2'} color={c.text2}>
      {children}
    </SizableText>
  );
}

/** A labelled text input. */
export function TextField({ label, ...props }: InputProps & { label?: string }) {
  const c = useColors();
  return (
    <YStack gap="$1.5">
      {label && <FieldLabel>{label}</FieldLabel>}
      <Input size="$4" backgroundColor={c.fill} borderWidth={0} color={c.text} placeholderTextColor={c.text3 as never} {...props} />
    </YStack>
  );
}

/** A number input: blank means "not set", and the text the user typed is kept while they type ("1." stays). */
export function NumberField({ label, value, onChange, placeholder, integer = false, compact = false, autoFocus }: { label?: string; value: number | undefined; onChange: (value: number | undefined) => void; placeholder?: string; integer?: boolean; compact?: boolean; autoFocus?: boolean }) {
  const c = useColors();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(value === undefined ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <YStack gap={compact ? '$1' : '$1.5'} flex={compact ? 1 : undefined}>
      {label && <FieldLabel compact={compact}>{label}</FieldLabel>}
      <Input
        size={compact ? '$3' : '$4'}
        value={text}
        placeholder={placeholder}
        placeholderTextColor={c.text3 as never}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        autoFocus={autoFocus}
        selectTextOnFocus
        backgroundColor={c.fill}
        borderWidth={0}
        color={c.text}
        paddingHorizontal={compact ? '$2' : undefined}
        onChangeText={(next: string) => {
          const cleaned = next.replace(',', '.');
          setText(cleaned);
          const parsed = Number(cleaned);
          onChange(cleaned.trim() === '' || Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
    </YStack>
  );
}

/** A segmented control, iOS style. With `allowNone`, tapping the selected option clears it. */
type SegmentedProps<T extends string> = { options: { value: T; label: string }[]; value: T | '' } & (
  | { allowNone?: false; onChange: (value: T) => void }
  | { allowNone: true; onChange: (value: T | '') => void }
);

export function Segmented<T extends string>({ options, value, onChange, allowNone = false }: SegmentedProps<T>) {
  const c = useColors();
  return (
    <XStack backgroundColor={c.fill} borderRadius="$4" padding={2} accessibilityRole="radiogroup">
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
            backgroundColor={selected ? c.surface : 'transparent'}
            shadowColor="#000"
            shadowOpacity={selected ? 0.12 : 0}
            shadowRadius={3}
            shadowOffset={{ width: 0, height: 1 }}
            pressStyle={{ backgroundColor: selected ? c.surface : c.separator }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected && !allowNone) return;
              tap();
              (onChange as (value: string) => void)(selected ? '' : option.value);
            }}
          >
            <SizableText size="$2" numberOfLines={1} color={c.text} fontWeight={selected ? '600' : '400'}>
              {option.label}
            </SizableText>
          </Button>
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
      <SizableText size="$4" color={c.text} flex={1}>
        When
      </SizableText>
      <DateTimePicker value={value} mode="date" display="compact" accentColor={c.accent} onValueChange={(_, d) => onDate(toIsoDate(d))} />
      <DateTimePicker value={value} mode="time" display="compact" accentColor={c.accent} onValueChange={(_, d) => onTime(toTime(d))} />
    </XStack>
  );
}

/** A red button that asks before doing anything. */
export function DestructiveButton({ label, title, message, onConfirm }: { label: string; title: string; message: string; onConfirm: () => void }) {
  const c = useColors();
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
    <Button size="$5" borderRadius="$5" backgroundColor={c.surface} color={c.critical} pressStyle={{ opacity: 0.7, backgroundColor: c.surface }} onPress={ask}>
      {label}
    </Button>
  );
}

/** A small text button, e.g. "+ Add food". */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Button
      chromeless
      size="$3"
      alignSelf="flex-start"
      paddingHorizontal="$1"
      color={c.accentStrong}
      fontWeight="600"
      pressStyle={{ opacity: 0.5, backgroundColor: 'transparent' }}
      onPress={() => {
        tap();
        onPress();
      }}
    >
      {label}
    </Button>
  );
}

export const formStyles = StyleSheet.create({
  /** Bottom padding so the last field clears the keyboard and home indicator. */
  content: { padding: 16, paddingBottom: 48 },
});
