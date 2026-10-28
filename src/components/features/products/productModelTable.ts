import { isNoiseSpecKey } from './productSpecDisplay';

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

export interface ModelColumn {
  key: string;
  label: string;
  numeric: boolean;
}

export interface ModelTable {
  columns: ModelColumn[];
  rows: Array<{ model: string; cells: Record<string, string> }>;
  /** Metadata keys the table now owns, so the leftover grids never repeat them. */
  consumed: string[];
}

const UNIT_SUFFIXES: Array<[RegExp, string]> = [
  [/_w_per_m$/, 'W/m'], [/_n$/, 'N'],
  [/_mm$/, 'mm'], [/_kg$/, 'kg'], [/_w$/, 'W'], [/_l$/, 'l'], [/_m2$/, 'm²'],
  [/_bar$/, 'bar'], [/_pct$/, '%'], [/_c$/, '°C'], [/_v$/, 'V'],
];

export function keyUnit(key: string): string {
  const k = key.toLowerCase();
  return UNIT_SUFFIXES.find(([re]) => re.test(k))?.[1] ?? '';
}

export function modelColumnLabel(key: string): string {
  if (key === 'sku_codes') return 'SKU';
  let base = key.toLowerCase();
  let unit = '';
  for (const [re, u] of UNIT_SUFFIXES) {
    if (re.test(base)) {
      base = base.replace(re, '');
      unit = u;
      break;
    }
  }
  const words = base
    .replace(/_+/g, ' ')
    .replace(/(\d+) (\d+)/g, '$1/$2')
    .replace(/\b\p{L}/gu, c => c.toUpperCase());
  return unit ? `${words} (${unit})` : words;
}

const COLUMN_PRIORITY = ['height_mm', 'width_mm', 'depth_mm', 'length_mm', 'diameter_mm', 'weight_kg'];
const BARE_SIZE_RE = /^\d{3,4}[./x×]\d{2,4}$/;
const MODEL_CODE_RE = /^([A-Za-z0-9]{2,8}[ -]?)?\d{2,4}[./x×]\d{2,4}$/;

function scalar(v: unknown): string | null {
  const x = unwrap(v);
  if (typeof x === 'number') return Number.isFinite(x) ? String(x) : null;
  if (typeof x === 'boolean') return x ? 'Yes' : 'No';
  if (typeof x === 'string') return x.trim() === '' ? null : x.trim();
  return null;
}

/**
 * One row per model, one column per fact: folds the per-model records an import carries
 * (`available_sizes` as objects, per-code maps like `weight_kg`) into a table.
 * Which keys become columns is read from the data, so a new ingest needs no code change.
 */
export function buildModelTable(bags: Array<Record<string, unknown> | undefined>): ModelTable | null {
  const rows = new Map<string, Record<string, string>>();
  const order: string[] = [];
  const consumed = new Set<string>();
  const addCell = (model: string, key: string, value: string) => {
    let row = rows.get(model);
    if (!row) {
      row = {};
      rows.set(model, row);
    }
    row[key] = value;
    if (!order.includes(key)) order.push(key);
  };

  const known = new Set<string>();
  for (const bag of bags) {
    const codes = unwrap(bag?.product_codes);
    if (Array.isArray(codes)) codes.forEach(c => typeof c === 'string' && known.add(c));
    const skus = unwrap(bag?.sku_codes);
    if (skus && typeof skus === 'object' && !Array.isArray(skus)) Object.keys(skus).forEach(k => known.add(k));
  }

  for (const bag of bags) {
    const sizes = unwrap(bag?.available_sizes);
    if (!Array.isArray(sizes)) continue;
    for (const entry of sizes) {
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      const model = typeof o.model === 'string' ? o.model.trim() : '';
      if (!model) continue;
      known.add(model);
      for (const [k, v] of Object.entries(o)) {
        if (k === 'model') continue;
        const s = scalar(v);
        if (s !== null) addCell(model, k, s);
      }
      consumed.add('available_sizes');
    }
  }

  const hadRecords = rows.size > 0;
  for (const bag of bags) {
    for (const [k, raw] of Object.entries(bag || {})) {
      if (k.startsWith('_') || isNoiseSpecKey(k) || k === 'product_codes') continue;
      const v = unwrap(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length < 2 || entries.some(([, x]) => scalar(x) === null)) continue;
      const hits = entries.filter(([code]) => known.has(code) || MODEL_CODE_RE.test(code)).length;
      if (hits / entries.length < 0.6) continue;
      if (hadRecords && entries.every(([code]) => BARE_SIZE_RE.test(code))) {
        // Keyed by size alone, the same models the records above already describe.
        if (order.includes(k)) consumed.add(k);
        continue;
      }
      for (const [code, x] of entries) addCell(code, k, scalar(x) as string);
      consumed.add(k);
    }
  }

  if (rows.size < 2 || order.length === 0) return null;

  const keys = [
    ...COLUMN_PRIORITY.filter(k => order.includes(k)),
    ...order.filter(k => !COLUMN_PRIORITY.includes(k) && k !== 'sku_codes'),
    ...(order.includes('sku_codes') ? ['sku_codes'] : []),
  ];
  const columns: ModelColumn[] = keys.map(key => ({
    key,
    label: modelColumnLabel(key),
    numeric: Array.from(rows.values()).every(r => r[key] === undefined || /^-?\d+([.,]\d+)?$/.test(r[key])),
  }));

  const num = (r: Record<string, string>, k: string) => parseFloat((r[k] ?? '').replace(',', '.'));
  const list = Array.from(rows.entries()).map(([model, cells]) => ({ model, cells }));
  if (order.includes('height_mm')) {
    list.sort(
      (a, b) =>
        (num(a.cells, 'height_mm') || 0) - (num(b.cells, 'height_mm') || 0) ||
        (num(a.cells, 'width_mm') || 0) - (num(b.cells, 'width_mm') || 0) ||
        a.model.localeCompare(b.model),
    );
  }
  return { columns, rows: list, consumed: Array.from(consumed) };
}
