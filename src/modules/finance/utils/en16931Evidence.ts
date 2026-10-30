export type En16931Tone = 'success' | 'warning' | 'neutral';

export interface En16931Evidence {
  tone: En16931Tone;
  headline: string;
  detail: string;
}

interface Row {
  source_format?: string | null;
  delivery_channel?: string | null;
  raw?: Record<string, unknown> | null;
}

const NOT_DELIVERED = 'We fetched this from the provider link ourselves; it does not count as a structured document delivered to us.';

export function en16931Evidence(row: Row | null | undefined): En16931Evidence | null {
  if (!row || (row.source_format !== 'en16931_ubl' && row.source_format !== 'en16931_cii')) return null;
  const fetched = row.delivery_channel === 'provider_link';
  const check = row.raw?.en16931_check as { verdict?: string; differences?: string[] } | null | undefined;
  const origin = fetched ? NOT_DELIVERED : 'Delivered as a structured EN 16931 document.';

  if (check?.verdict === 'agrees') {
    return { tone: 'success', headline: 'EN 16931 file agrees with AADE', detail: `Supplier VAT, totals, MARK and line count match what AADE reported. ${origin}` };
  }
  if (check?.verdict === 'differs') {
    const what = check.differences?.length ? check.differences.join(', ') : 'unspecified fields';
    return { tone: 'warning', headline: 'EN 16931 file differs from AADE', detail: `Differs on: ${what}. Check both before relying on either. ${origin}` };
  }
  return { tone: 'neutral', headline: 'EN 16931 file stored, not checked yet', detail: origin };
}
