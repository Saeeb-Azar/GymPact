// Produktsuche über die offene Lebensmitteldatenbank Open Food Facts.
// Kein API-Key nötig, CORS ist freigegeben. Liefert Nährwerte je 100 g.

export interface OffProduct {
  code: string;
  name: string;
  brand: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  serving_g: number | null;
  image: string | null;
}

interface OffRaw {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  brands?: string;
  serving_quantity?: number | string;
  image_small_url?: string;
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n * 10) / 10));

export function mapOffProduct(p: OffRaw): OffProduct | null {
  const name = (p.product_name_de || p.product_name || '').trim();
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184;
  if (!name || kcal <= 0) return null;
  const serving = num(p.serving_quantity);
  return {
    code: p.code ?? '',
    name: name.slice(0, 120),
    brand: (p.brands ?? '').split(',')[0].trim().slice(0, 80),
    kcal_100: clamp(kcal, 1000),
    protein_100: clamp(num(n['proteins_100g']), 100),
    carbs_100: clamp(num(n['carbohydrates_100g']), 100),
    fat_100: clamp(num(n['fat_100g']), 100),
    serving_g: serving > 0 && serving <= 5000 ? serving : null,
    image: p.image_small_url ?? null,
  };
}

const FIELDS =
  'code,product_name,product_name_de,brands,serving_quantity,image_small_url,nutriments';

export async function searchOpenFoodFacts(term: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1' +
    `&page_size=24&lc=de&fields=${FIELDS}&search_terms=${encodeURIComponent(term)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Open Food Facts nicht erreichbar');
  const json = (await res.json()) as { products?: OffRaw[] };
  return (json.products ?? []).map(mapOffProduct).filter((p): p is OffProduct => !!p);
}

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<OffProduct | null> {
  // UPC-A (12-stellig) ist bei Open Food Facts meist als EAN-13 mit führender 0 gespeichert
  const candidates = code.length === 12 ? [code, `0${code}`] : [code];
  for (const c of candidates) {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=${FIELDS}`,
      { signal },
    );
    if (res.status === 404) continue;
    if (!res.ok) throw new Error('Open Food Facts nicht erreichbar');
    const json = (await res.json()) as { status?: number; product?: OffRaw };
    if (json.status === 1 && json.product) {
      const p = mapOffProduct({ ...json.product, code: c });
      if (p) return p;
    }
  }
  return null;
}
