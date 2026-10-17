import {
  isInternalFieldKey,
  sectionsForCategory,
  type FieldRegistrySnapshot,
} from '@/services/fieldRegistryService';

export interface CompareProductInput {
  id: string;
  category?: string | null;
  attributes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
  specifications?: Record<string, unknown> | null;
}

export interface CompareRow { key: string; label: string; values: string[] }
export interface CompareSection { key: string; label: string; rows: CompareRow[] }

export const ABSENT = '—';

function display(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return display((v as Record<string, unknown>).value);
  }
  if (Array.isArray(v)) {
    const parts = v.map(display).filter((x): x is string => x !== null);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object') return null;
  return String(v);
}

export function productValues(p: CompareProductInput): Record<string, string> {
  const out: Record<string, string> = {};
  const absorb = (src: Record<string, unknown> | null | undefined) => {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (k.startsWith('_')) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && !('value' in (v as Record<string, unknown>))) {
        for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
          const d = display(iv);
          if (d !== null && !(ik in out)) out[ik] = d;
        }
        continue;
      }
      const d = display(v);
      if (d !== null) out[k] = d;
    }
  };
  // Later sources win: curated metadata over the derived attributes.
  absorb(p.specifications);
  absorb(p.properties);
  absorb(p.attributes);
  absorb(p.metadata);
  return out;
}

export function categoryOf(p: CompareProductInput): string {
  const meta = p.metadata ?? {};
  return (p.category || (typeof meta.material_category === 'string' ? meta.material_category : '') || '').toString();
}

/** Rows are the registry's fields for each product's category; an internal or unjudged (`null`) key is withheld. */
export function buildCompareSections(
  products: CompareProductInput[],
  registry: FieldRegistrySnapshot,
): CompareSection[] {
  const values = products.map(productValues);
  const sections = new Map<string, { label: string; rows: Map<string, string> }>();
  for (const p of products) {
    for (const s of sectionsForCategory(registry, categoryOf(p))) {
      const sec = sections.get(s.key) ?? { label: s.label, rows: new Map<string, string>() };
      for (const f of s.fields) if (!sec.rows.has(f.key)) sec.rows.set(f.key, f.label);
      sections.set(s.key, sec);
    }
  }
  const out: CompareSection[] = [];
  for (const [key, sec] of sections) {
    const rows: CompareRow[] = [];
    for (const [field, label] of sec.rows) {
      if (isInternalFieldKey(registry, field) !== false) continue;
      const vals = values.map((v) => v[field] ?? ABSENT);
      if (vals.every((x) => x === ABSENT)) continue;
      rows.push({ key: field, label, values: vals });
    }
    if (rows.length) out.push({ key, label: sec.label, rows });
  }
  return out;
}

export const valuesDiffer = (vals: string[]) => new Set(vals.filter((v) => v !== ABSENT)).size > 1;
