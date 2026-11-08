import { parseDecimal } from '@/utils/decimal';

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

/** One length in millimetres from a registry `_mm` key. Null when it does not parse. */
export function toMillimetres(mm: unknown): number | null {
  const m = parseDecimal(unwrap(mm) as string | number | null | undefined);
  return m !== null && m > 0 ? m : null;
}

export function formatDimensionsMm(dims: { w: number | null; h: number | null; d: number | null }): string | null {
  const parts = [
    dims.w !== null ? `W ${dims.w}` : null,
    dims.h !== null ? `H ${dims.h}` : null,
    dims.d !== null ? `D ${dims.d}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' × ')} mm` : null;
}

export function pickPackagingValue(
  nested: Record<string, unknown> | null | undefined,
  flat: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  for (const src of [nested, flat]) {
    const v = unwrap(src?.[key]);
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
  }
  return null;
}

const FORMAT_KEYS = ['pieces_per_box', 'm2_per_box', 'boxes_per_pallet', 'm2_per_pallet', 'weight_per_pallet_kg'] as const;

export interface PackagingFormatRow {
  format: string | null;
  pallet: string | null;
  values: Record<(typeof FORMAT_KEYS)[number], number | null>;
  estimated: Set<string>;
  basis: string | null;
}

/** `packaging.per_variant` as rows; `estimated.fields` marks values the supplier did not publish. */
export function packagingByFormat(packaging: unknown): PackagingFormatRow[] {
  const list = (packaging as { per_variant?: unknown } | null)?.per_variant;
  if (!Array.isArray(list)) return [];
  const rows: PackagingFormatRow[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const values = Object.fromEntries(
      FORMAT_KEYS.map(k => [k, parseDecimal(unwrap(r[k]))]),
    ) as PackagingFormatRow['values'];
    if (FORMAT_KEYS.every(k => values[k] === null)) continue;
    const est = (r.estimated ?? null) as { fields?: unknown; basis?: unknown } | null;
    rows.push({
      format: typeof r.format === 'string' && r.format ? r.format : null,
      pallet: typeof r.pallet === 'string' && r.pallet ? r.pallet : null,
      values,
      estimated: new Set(Array.isArray(est?.fields) ? est.fields.filter((f): f is string => typeof f === 'string') : []),
      basis: typeof est?.basis === 'string' ? est.basis : null,
    });
  }
  return rows;
}
