// Form controls that behave like iOS's own: grouped sections, decimal keyboards for numbers, segmented choices,
// the system date and time pickers, and destructive actions behind a confirmation alert.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useColors } from './theme.ts';
import { tap } from './ui.tsx';

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, { color: c.text2 }]}>{title.toUpperCase()}</Text>}
      <View style={[styles.sectionBody, { backgroundColor: c.surface }]}>{children}</View>
      {footer && <Text style={[styles.sectionFooter, { color: c.text3 }]}>{footer}</Text>}
    </View>
  );
}

/** A labelled text input stacked inside a section. */
export function TextField({ label, ...props }: TextInputProps & { label?: string }) {
  const c = useColors();
  return (
    <View style={styles.field}>
      {label && <Text style={[styles.label, { color: c.text2 }]}>{label}</Text>}
      <TextInput placeholderTextColor={c.text3} {...props} style={[styles.input, { color: c.text, backgroundColor: c.fill }, props.style]} />
    </View>
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
    <View style={compact ? styles.compactField : styles.field}>
      {label && <Text style={[compact ? styles.compactLabel : styles.label, { color: c.text2 }]}>{label}</Text>}
      <TextInput
        value={text}
        placeholder={placeholder}
        placeholderTextColor={c.text3}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        autoFocus={autoFocus}
        selectTextOnFocus
        onChangeText={(next) => {
          const cleaned = next.replace(',', '.');
          setText(cleaned);
          const parsed = Number(cleaned);
          onChange(cleaned.trim() === '' || Number.isNaN(parsed) ? undefined : parsed);
        }}
        style={[styles.input, compact && styles.compactInput, { color: c.text, backgroundColor: c.fill }]}
      />
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.fill }]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) tap();
              onChange(option.value);
            }}
            style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: c.surface }]]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, { color: c.text }, selected && { fontWeight: '600' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The entry's local date and time, with iOS's compact pickers (plain text fields in the web preview). */
export function WhenRow({ date, time, onDate, onTime }: { date: string; time: string; onDate: (date: string) => void; onTime: (time: string) => void }) {
  const c = useColors();
  if (Platform.OS === 'web') {
    return (
      <View style={styles.whenRow}>
        <TextField label="Date" value={date} onChangeText={onDate} style={{ minWidth: 130 }} />
        <TextField label="Time" value={time} onChangeText={onTime} style={{ minWidth: 90 }} />
      </View>
    );
  }
  const value = new Date(`${date}T${time}:00`);
  return (
    <View style={[styles.whenRow, styles.field]}>
      <Text style={[styles.label, { color: c.text2, flex: 1 }]}>When</Text>
      <DateTimePicker value={value} mode="date" display="compact" accentColor={c.accent} onChange={(_, d) => d && onDate(toIsoDate(d))} />
      <DateTimePicker value={value} mode="time" display="compact" accentColor={c.accent} onChange={(_, d) => d && onTime(toTime(d))} />
    </View>
  );
}

/** A red text button that asks before doing anything. */
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
    <Pressable onPress={ask} style={({ pressed }) => [styles.destructive, { backgroundColor: c.surface, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.destructiveText, { color: c.critical }]}>{label}</Text>
    </Pressable>
  );
}

/** A small text button, e.g. "+ Add food". */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Text style={[styles.linkText, { color: c.accentStrong }]}>{label}</Text>
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  /** Bottom padding so the last field clears the keyboard and home indicator. */
  content: { padding: 16, paddingBottom: 48 },
});

const styles = StyleSheet.create({
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 13, marginLeft: 16, marginBottom: 6 },
  sectionBody: { borderRadius: 12, padding: 12, gap: 12 },
  sectionFooter: { fontSize: 13, marginHorizontal: 16, marginTop: 6 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 17 },
  compactField: { flex: 1, gap: 3 },
  compactLabel: { fontSize: 11 },
  compactInput: { minHeight: 38, paddingHorizontal: 8, fontSize: 16 },
  segmented: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 7 },
  segmentSelected: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 13 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  destructive: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  destructiveText: { fontSize: 17 },
  linkButton: { paddingVertical: 4, alignSelf: 'flex-start' },
  linkText: { fontSize: 16, fontWeight: '600' },
});
