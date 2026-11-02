// Label-data matching against real (trimmed) USDA and Open Food Facts responses saved in test/fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFdc, fromOff, pickMatch, words, type FdcFood } from '../src/foods.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const { foods } = fixture('fdc-search-quest.json') as { foods: FdcFood[] };

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log('Foods');

check('words drop punctuation, stop words and plural s', () => {
  assert.deepEqual(words('Cookies & Cream Protein Bars'), ['cookie', 'cream', 'protein', 'bar']);
  assert.deepEqual(words("Ben & Jerry's"), ['ben', 'jerry']);
});

check('a USDA branded food becomes one label serving (per 100 g scaled to the serving)', () => {
  const quest = fromFdc(foods[0])!;
  assert.deepEqual(quest.source, { db: 'usda', id: '2669747', product: 'Quest Cookies & Cream Protein Bar' });
  assert.equal(quest.serving, '1 bar (60 g)');
  // 317 kcal per 100 g x 60 g; matches the printed label (190 kcal, 21 g protein).
  assert.deepEqual(quest.per_serving, { calories: 190, protein_g: 21, carbs_g: 21, fat_g: 8 });
  assert.equal(fromFdc({ ...foods[0], servingSizeUnit: 'ONZ' }), undefined);
});

check('pickMatch only ever returns the named brand', () => {
  assert.equal(pickMatch(foods, 'Quest', 'cookies and cream protein bar')?.source.id, '2669747');
  assert.equal(pickMatch(foods, 'Lindora', 'cookies & cream protein bar')?.source.id, '2390287');
  // Same product name, unknown brand: no match rather than another company's bar.
  assert.equal(pickMatch(foods, 'Barebells', 'cookies and cream protein bar'), undefined);
  // Right brand, unrelated food: no match.
  assert.equal(pickMatch(foods, 'Quest', 'tortilla chips nacho'), undefined);
});

check('an Open Food Facts product uses its per-serving values', () => {
  const { product } = fixture('off-product-quest.json');
  const quest = fromOff(product)!;
  assert.equal(quest.source.db, 'off');
  assert.equal(quest.source.product, 'Quest Cookies & Cream Protein Bar');
  assert.equal(quest.serving, '1 bar (60 g)');
  assert.deepEqual(quest.per_serving, { calories: 190, protein_g: 21, carbs_g: 22, fat_g: 7 });
  // Only per-100 g values and a serving weight: scaled to the serving.
  const scaled = fromOff({ product_name: 'Oats', serving_size: '40 g', serving_quantity: 40, nutriments: { 'energy-kcal_100g': 380, proteins_100g: 13 } })!;
  assert.deepEqual(scaled.per_serving, { calories: 152, protein_g: 5.2, carbs_g: 0, fat_g: 0 });
  assert.equal(fromOff({ product_name: 'Mystery', nutriments: {} }), undefined);
});

console.log(`\n${passed} checks passed`);
