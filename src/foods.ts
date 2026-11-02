// Label data for packaged and branded foods. USDA FoodData Central has US branded products, searchable by name or
// UPC; Open Food Facts is a crowd-sourced fallback. A lookup that fails, times out or is rate limited simply finds
// nothing, so logging never depends on these services: the item keeps its estimate.
import { config } from './config.ts';
import type { FoodMatch } from './types.ts';

const TIMEOUT_MS = 4000;
const USER_AGENT = 'Hulk/1.4 (personal food log; https://github.com/arjuns238/fitness-coach-mcp)';
const OFF_FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments';

const round1 = (n: number) => Math.round(n * 10) / 10;
const defined = <T>(value: T | undefined): value is T => value !== undefined;

// ---------- Turning API responses into label data (pure, tested against saved responses) ----------

/** The parts of a FoodData Central search result used here. Branded nutrient values are per 100 g or 100 ml. */
export interface FdcFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: { nutrientNumber?: string; value?: number }[];
}

/** The parts of an Open Food Facts product used here. */
export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string>;
}

const STOP_WORDS = new Set(['and', 'with', 'the', 'of', 'in']);

/** Lowercase words without punctuation, stop words or plural s: "Cookies & Cream Bars" -> cookie, cream, bar. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

const titleCase = (text: string) => text.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
const withoutCompanySuffix = (name: string) => name.replace(/,?\s+(llc|inc|co|corp|corporation|company|ltd)\.?$/i, '');

function fdcBrand(food: FdcFood): string | undefined {
  const brand = food.brandName ?? food.brandOwner;
  return brand ? titleCase(withoutCompanySuffix(brand)) : undefined;
}

/** "COOKIES & CREAM PROTEIN BAR, COOKIES & CREAM" from QUEST -> "Quest Cookies & Cream Protein Bar". */
function fdcProductName(food: FdcFood): string {
  const [head = '', ...rest] = food.description.split(',').map((part) => part.trim()).filter(Boolean);
  const description = titleCase([head, ...rest.filter((part) => !head.toLowerCase().includes(part.toLowerCase()))].join(', '));
  const brand = fdcBrand(food);
  return brand && !description.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${description}` : description;
}

/** One label serving of a branded USDA food, or undefined when the serving isn't in grams or millilitres. */
export function fromFdc(food: FdcFood): FoodMatch | undefined {
  const unit = /^(g|grm|gram|grams)$/i.test(food.servingSizeUnit ?? '') ? 'g' : /^(ml|mlt)$/i.test(food.servingSizeUnit ?? '') ? 'ml' : undefined;
  const per100 = (number: string) => food.foodNutrients?.find((n) => n.nutrientNumber === number)?.value;
  const kcal = per100('208');
  if (!unit || !food.servingSize || kcal === undefined) return undefined;
  const scale = food.servingSize / 100;
  const amount = `${round1(food.servingSize)} ${unit}`;
  const household = food.householdServingFullText?.trim();
  return {
    source: { db: 'usda', id: String(food.fdcId), product: fdcProductName(food) },
    brand: fdcBrand(food),
    serving: household ? `${household} (${amount})` : amount,
    per_serving: {
      calories: Math.round(kcal * scale),
      protein_g: round1((per100('203') ?? 0) * scale),
      carbs_g: round1((per100('205') ?? 0) * scale),
      fat_g: round1((per100('204') ?? 0) * scale),
    },
  };
}

/**
 * The search result that is this brand's version of the named food. Every word of the brand must appear in the
 * product's brand or owner, so a different company's product is never swapped in; then the product sharing the
 * most words with the name wins (at least half of them), ties going to USDA's own ranking.
 */
export function pickMatch(foods: FdcFood[], brand: string, name: string): FoodMatch | undefined {
  const brandWords = words(brand);
  if (!brandWords.length) return undefined;
  const wanted = words(name).filter((word) => !brandWords.includes(word));
  let best: { match: FoodMatch; score: number } | undefined;
  for (const food of foods) {
    const maker = words(`${food.brandName ?? ''} ${food.brandOwner ?? ''}`);
    if (!brandWords.every((word) => maker.includes(word))) continue;
    const match = fromFdc(food);
    if (!match) continue;
    const described = new Set(words(food.description));
    const score = wanted.length ? wanted.filter((word) => described.has(word)).length / wanted.length : 1;
    if (score >= 0.5 && (!best || score > best.score)) best = { match, score };
  }
  return best?.match;
}

/** One serving of an Open Food Facts product: its per-serving values, else per 100 g scaled to its serving. */
export function fromOff(product: OffProduct): FoodMatch | undefined {
  const name = product.product_name?.trim();
  const n = product.nutriments ?? {};
  const value = (key: string) => {
    const v = Number(n[key]);
    return n[key] !== undefined && Number.isFinite(v) ? v : undefined;
  };
  if (!name) return undefined;

  let serving: string;
  let per: (nutrient: string) => number | undefined;
  const servingGrams = Number(product.serving_quantity);
  if (value('energy-kcal_serving') !== undefined) {
    serving = product.serving_size?.trim() || '1 serving';
    per = (nutrient) => value(`${nutrient}_serving`);
  } else if (value('energy-kcal_100g') !== undefined && servingGrams > 0 && product.serving_size) {
    serving = product.serving_size.trim();
    per = (nutrient) => {
      const v = value(`${nutrient}_100g`);
      return v === undefined ? undefined : (v * servingGrams) / 100;
    };
  } else if (value('energy-kcal_100g') !== undefined) {
    serving = '100 g';
    per = (nutrient) => value(`${nutrient}_100g`);
  } else {
    return undefined;
  }

  const brand = product.brands?.split(',')[0]?.trim() || undefined;
  return {
    source: { db: 'off', id: product.code ?? '', product: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name },
    brand,
    serving,
    per_serving: {
      calories: Math.round(per('energy-kcal')!),
      protein_g: round1(per('proteins') ?? 0),
      carbs_g: round1(per('carbohydrates') ?? 0),
      fat_g: round1(per('fat') ?? 0),
    },
  };
}

// ---------- Network ----------

/** Successful responses only, for a day; failures (rate limits included) are retried next time. */
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_SIZE = 500;

async function cached<T>(key: string, load: () => Promise<T | undefined>): Promise<T | undefined> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  if (value !== undefined) {
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('[foods]', res.status, new URL(url).host);
      return undefined;
    }
    return await res.json();
  } catch (error) {
    console.warn('[foods]', (error as Error).message);
    return undefined;
  }
}

function searchFdc(query: string): Promise<FdcFood[] | undefined> {
  return cached(`fdc:${query.toLowerCase()}`, async () => {
    const body = (await fetchJson(`${config.fdcBaseUrl}/foods/search`, {
      method: 'POST',
      // The key goes in a header so it never shows up in a URL or a log line.
      headers: { 'content-type': 'application/json', 'x-api-key': config.fdcApiKey },
      body: JSON.stringify({ query, dataType: ['Branded'], pageSize: 25 }),
    })) as { foods?: FdcFood[] } | undefined;
    return body?.foods;
  });
}

/** Label data for an item Claude named with a brand, or undefined to keep its estimate. */
export async function findBranded(brand: string, name: string): Promise<FoodMatch | undefined> {
  const foods = await searchFdc(`${brand} ${name}`);
  return foods ? pickMatch(foods, brand, name) : undefined;
}

/** The dashboard's food search: products with label data for one serving. */
export async function searchFoods(query: string): Promise<FoodMatch[]> {
  const usda = (await searchFdc(query))?.map(fromFdc).filter(defined) ?? [];
  const results = usda.length
    ? usda
    : (
        (await cached(`off-search:${query.toLowerCase()}`, async () => {
          const params = new URLSearchParams({ search_terms: query, search_simple: '1', json: '1', page_size: '12', fields: OFF_FIELDS });
          return ((await fetchJson(`${config.offBaseUrl}/cgi/search.pl?${params}`)) as { products?: OffProduct[] } | undefined)?.products;
        })) ?? []
      )
        .map(fromOff)
        .filter(defined);
  const seen = new Set<string>();
  return results.filter((match) => !seen.has(match.source.product + match.serving) && seen.add(match.source.product + match.serving)).slice(0, 12);
}

const withoutLeadingZeros = (code: string) => code.replace(/^0+/, '');

/** A scanned UPC or EAN: USDA first (US labels), then Open Food Facts. */
export async function lookupBarcode(code: string): Promise<FoodMatch | undefined> {
  const usda = (await searchFdc(code))?.find((food) => food.gtinUpc && withoutLeadingZeros(food.gtinUpc) === withoutLeadingZeros(code));
  const fromUsda = usda && fromFdc(usda);
  if (fromUsda) return fromUsda;
  const body = (await cached(`off:${code}`, () => fetchJson(`${config.offBaseUrl}/api/v2/product/${code}?fields=${OFF_FIELDS}`))) as
    | { status?: number; product?: OffProduct }
    | undefined;
  return body?.status === 1 && body.product ? fromOff({ code, ...body.product }) : undefined;
}
