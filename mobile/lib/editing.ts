// Hand-offs between screens that don't fit in route params: the entry a sheet should edit, and the meal sheet
// waiting for a barcode scan.
import type { FoodMatch, Meal, WeighIn, Workout } from './api.ts';

let entry: Meal | Workout | WeighIn | undefined;

/** Called just before opening an edit sheet; the sheet takes it once. */
export function editEntry(value: Meal | Workout | WeighIn | undefined) {
  entry = value;
}

export function takeEntry<T extends Meal | Workout | WeighIn>(): T | undefined {
  const value = entry as T | undefined;
  entry = undefined;
  return value;
}

let scanHandler: ((match: FoodMatch) => void) | undefined;

/** The open meal sheet registers here; the scanner calls it with what it found. */
export function onScanned(handler: ((match: FoodMatch) => void) | undefined) {
  scanHandler = handler;
}

export function deliverScan(match: FoodMatch) {
  scanHandler?.(match);
}
