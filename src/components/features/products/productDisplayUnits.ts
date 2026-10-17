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
