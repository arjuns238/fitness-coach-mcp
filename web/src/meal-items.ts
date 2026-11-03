// Meal-item helpers shared by the web dashboard and the iPhone app.
import { formatDecimal } from './format.ts';
import type { FoodItem, FoodMatch } from '../../src/types.ts';

/** A product picked from search or a scan, as a meal item with its label numbers for one serving. */
export const itemFromMatch = (match: FoodMatch): FoodItem => ({
  name: match.source.product,
  brand: match.brand,
  servings: 1,
  quantity: match.serving,
  ...match.per_serving,
  source: match.source,
});

/** A label item eaten `servings` times: its numbers and amount scale from the current ones. */
export function withServings(item: FoodItem, servings: number): FoodItem {
  const ratio = servings / (item.servings ?? 1);
  const base = item.quantity?.replace(/^[\d.]+ × /, '');
  return {
    ...item,
    servings,
    quantity: base && (servings === 1 ? base : `${formatDecimal(servings)} × ${base}`),
    calories: Math.round(item.calories * ratio),
    protein_g: Math.round(item.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(item.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(item.fat_g * ratio * 10) / 10,
  };
}
