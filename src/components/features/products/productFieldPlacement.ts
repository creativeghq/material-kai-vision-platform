export interface KnownField {
  name: string;
  label: string;
  section: string;
  description: string | null;
}

export interface PlacedField {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

const tokens = (s: string): string[] =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 1 && !/^\d+$/.test(t))
    .map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));

interface Index {
  docs: Array<{ section: string; toks: Set<string> }>;
  idf: Map<string, number>;
}

const indexCache = new WeakMap<KnownField[], Index>();

function indexOf(fields: KnownField[]): Index {
  const hit = indexCache.get(fields);
  if (hit) return hit;
  const docs = fields.map(f => ({
    section: f.section,
    toks: new Set([...tokens(f.name), ...tokens(f.label), ...tokens(f.description ?? '')]),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.toks) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + docs.length / n)]));
  const built = { docs, idf };
  indexCache.set(fields, built);
  return built;
}

/**
 * The section whose registered fields share the most (rare) words with this key, or 'other'.
 * The registry is the vocabulary: a field registered once teaches every later import.
 */
export function inferSection(fields: KnownField[], key: string, hint = ''): string {
  if (fields.length === 0) return 'other';
  const { docs, idf } = indexOf(fields);
  const own = new Map<string, number>();
  for (const t of tokens(key)) own.set(t, 1);
  for (const t of tokens(hint)) if (!own.has(t)) own.set(t, 0.5);
  const score = new Map<string, number>();
  for (const d of docs) {
    let s = 0;
    for (const [t, w] of own) if (d.toks.has(t)) s += w * (idf.get(t) ?? 0);
    if (s > 0) score.set(d.section, (score.get(d.section) ?? 0) + s * s);
  }
  let best = 'other';
  let top = 0;
  let total = 0;
  for (const [section, s] of score) {
    total += s;
    if (s > top) {
      top = s;
      best = section;
    }
  }
  return total > 0 && top / total >= 0.4 ? best : 'other';
}

/** Buckets leftover fields by the section the registry suggests; unmatched ones stay together. */
export function placeFields(fields: KnownField[], items: PlacedField[]): Map<string, PlacedField[]> {
  const out = new Map<string, PlacedField[]>();
  for (const f of items) {
    const section = inferSection(fields, f.key, f.hint ?? '');
    const list = out.get(section);
    if (list) list.push(f);
    else out.set(section, [f]);
  }
  return out;
}
