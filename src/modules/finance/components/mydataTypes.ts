/**
 * myDATA document-type codes ("1.1", "9.3", …) → their human names.
 *
 * The codes are meaningless on their own, so anything that shows one to a user — a table
 * cell, a filter option, a chip — needs the name next to it. The names live in the canonical
 * `mydata_reference` table (new AADE codes surface without a deploy), fetched once per
 * session and shared by every consumer: a document list renders one label per row, and each
 * mounting its own query would be a fetch storm.
 */
import { useEffect, useState } from 'react';
import { invoicingSetupService } from '@/services/invoicingSetupService';

/** code → description, resolved once per session. */
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;
const subscribers = new Set<(m: Record<string, string>) => void>();

/**
 * Broad families, for the one-line "what kind of document is this" context, and the group
 * headers in the document-type picker. ONE map — a second hardcoded copy is how family 6
 * came to be labelled "Self-billing" in the picker while the codes under it read
 * "Self-Delivery Record" / "Self-Supply Record".
 */
export const MYDATA_TYPE_FAMILY: Record<string, string> = {
  '1': 'Sales invoice', '2': 'Service rendered invoice', '3': 'Proof of expenditure', '5': 'Credit invoice',
  '6': 'Self-delivery / self-supply', '7': 'Contract — income', '8': 'Special record (income)',
  '9': 'Transport document', '11': 'Retail document',
  '13': 'Retail / expenses', '14': 'Cross-border', '15': 'Contractor',
};

export function loadMydataTypeLabels(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = invoicingSetupService.listReference('invoice_type')
      .then((rows) => {
        cache = Object.fromEntries(rows.map((r) => [r.code, r.description]));
        subscribers.forEach((fn) => fn(cache!));
        return cache;
      })
      .catch(() => ({}))   // a lookup outage must never blank the code itself
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** The shared code→name map, re-rendering the caller once it lands. `{}` until then. */
export function useMydataTypeLabels(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>(() => cache ?? {});

  useEffect(() => {
    if (cache) { setMap(cache); return; }
    let live = true;
    const sub = (m: Record<string, string>) => { if (live) setMap(m); };
    subscribers.add(sub);
    void loadMydataTypeLabels().then((m) => { if (live) setMap(m); });
    return () => { live = false; subscribers.delete(sub); };
  }, []);

  return map;
}

/** Name for a code, falling back to the code itself so an outage never renders a blank. */
export function mydataTypeName(code: string, labels: Record<string, string>): string {
  return labels[code] ?? MYDATA_TYPE_FAMILY[code.split('.')[0]] ?? `myDATA type ${code}`;
}

/** Sort key that orders codes numerically — "2.1" before "11.1", which a string sort reverses. */
export function mydataTypeRank(code: string): number {
  const [major, minor] = code.split('.');
  return (Number(major) || 0) * 1000 + (Number(minor) || 0);
}
