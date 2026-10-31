export type Cell = string | number | boolean | null;
export type ColumnRole = 'colour' | 'size' | 'status' | 'availability' | 'text';

export interface RawProductTable {
  id: string;
  headers: unknown;
  table_data: unknown;
  extractor?: string | null;
  metadata?: unknown;
}

export interface SkuColumn {
  index: number;
  header: string;
  role: ColumnRole;
  numeric: boolean;
}

export interface SkuTable {
  id: string;
  title: string;
  source: string | null;
  columns: SkuColumn[];
  rows: Cell[][];
}

export interface SkuFilter {
  query: string;
  colour: string;
  size: string;
  status: string;
  availability: string;
}

export const NO_FILTER: SkuFilter = { query: '', colour: '', size: '', status: '', availability: '' };

export const DISCONTINUED = 'Discontinued';
export const MADE_TO_ORDER = 'Made to order';

const OCR_FRAGMENT_EXTRACTORS = new Set(['paddleocr-vl']);

const PRICE_HEADER = /\b(price|prices|cost|costs|margin|markup|discount|rrp|eur|euro|vat)\b|[€$£]/i;

const asRecord = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const roleOf = (header: string): ColumnRole => {
  const h = header.trim().toLowerCase();
  if (h === 'colour' || h === 'color') return 'colour';
  if (h.startsWith('size')) return 'size';
  if (h === 'status') return 'status';
  if (h === 'availability') return 'availability';
  return 'text';
};

const titleOf = (raw: RawProductTable): string | null => {
  const t = asRecord(raw.metadata).title;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
};

/** Prepared tables carry a title; raw OCR fragments of a table photographed from a page do not. */
export function isDisplayableTable(raw: RawProductTable): boolean {
  if (titleOf(raw)) return true;
  return !OCR_FRAGMENT_EXTRACTORS.has(String(raw.extractor ?? ''));
}

const toCell = (v: unknown): Cell => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return JSON.stringify(v);
};

const headerText = (h: unknown, index: number): string => {
  const t = typeof h === 'string' ? h.trim() : h == null ? '' : JSON.stringify(h);
  return t || `Column ${index + 1}`;
};

/** `canSeeInternal` false drops any column that looks like a price or cost: a table is not gated per field. */
export function toSkuTable(raw: RawProductTable, canSeeInternal = false): SkuTable | null {
  if (!isDisplayableTable(raw)) return null;
  const allHeaders = Array.isArray(raw.headers) ? raw.headers.map(headerText) : [];
  const dataRows = asRecord(raw.table_data).rows;
  if (allHeaders.length === 0 || !Array.isArray(dataRows) || dataRows.length === 0) return null;

  const keep = allHeaders.map((h, i) => (canSeeInternal || !PRICE_HEADER.test(h) ? i : -1)).filter(i => i >= 0);
  const headers = keep.map(i => allHeaders[i]);
  if (headers.length === 0) return null;

  const rows = dataRows
    .filter((r): r is unknown[] => Array.isArray(r))
    .map(r => keep.map(i => toCell(r[i])));
  if (rows.length === 0) return null;

  const columns = headers.map((header, index): SkuColumn => {
    const values = rows.map(r => r[index]).filter(v => v !== null);
    return {
      index,
      header,
      role: roleOf(header),
      numeric: values.length > 0 && values.every(v => typeof v === 'number'),
    };
  });
  const meta = asRecord(raw.metadata);
  return {
    id: raw.id,
    title: titleOf(raw) ?? 'Item table',
    source: typeof meta.source === 'string' ? meta.source : null,
    columns,
    rows,
  };
}

const columnOf = (table: SkuTable, role: ColumnRole): SkuColumn | undefined =>
  table.columns.find(c => c.role === role);

export function distinctValues(table: SkuTable, role: ColumnRole): string[] {
  const col = columnOf(table, role);
  if (!col) return [];
  const seen = new Set<string>();
  for (const r of table.rows) {
    const v = r[col.index];
    if (v !== null) seen.add(String(v));
  }
  return [...seen];
}

export const isFiltering = (f: SkuFilter): boolean =>
  Boolean(f.query.trim() || f.colour || f.size || f.status || f.availability);

export function filterRows(table: SkuTable, f: SkuFilter): Cell[][] {
  const q = f.query.trim().toLowerCase();
  const picks: Array<[ColumnRole, string]> = [
    ['colour', f.colour], ['size', f.size], ['status', f.status], ['availability', f.availability],
  ];
  return table.rows.filter(r => {
    for (const [role, want] of picks) {
      if (!want) continue;
      const col = columnOf(table, role);
      if (col && String(r[col.index] ?? '') !== want) return false;
    }
    return !q || r.some(v => v !== null && (String(v).toLowerCase().includes(q) || formatCell(v).toLowerCase().includes(q)));
  });
}

export const normaliseLabel = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export function summarise(table: SkuTable): { total: number; discontinued: number; madeToOrder: number } {
  const status = columnOf(table, 'status');
  const availability = columnOf(table, 'availability');
  const count = (col: SkuColumn | undefined, label: string) =>
    col ? table.rows.filter(r => normaliseLabel(r[col.index]) === normaliseLabel(label)).length : 0;
  return {
    total: table.rows.length,
    discontinued: count(status, DISCONTINUED),
    madeToOrder: count(availability, MADE_TO_ORDER),
  };
}

export function formatCell(c: Cell): string {
  if (c === null) return '—';
  if (typeof c === 'number') return c.toLocaleString('en', { maximumFractionDigits: 2 });
  if (typeof c === 'boolean') return c ? 'Yes' : 'No';
  return c;
}

/** Hex by lower-cased colour name, from the product's colour_options (either the English or the catalogue name). */
export function colourHexIndex(options: unknown): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  if (!Array.isArray(options)) return out;
  for (const o of options) {
    const rec = asRecord(o);
    const hex = rec.hex;
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
    for (const k of [rec.name, rec.catalogue_name]) {
      if (typeof k === 'string' && k.trim()) out[k.trim().toLowerCase()] = hex;
    }
  }
  return out;
}
