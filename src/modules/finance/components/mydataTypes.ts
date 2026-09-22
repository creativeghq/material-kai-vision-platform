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

export { MYDATA_TYPE_FAMILY, mydataTypeName, mydataTypeRank } from '@/modules/finance/mydataDocumentTypes';

/** code → description, resolved once per session. */
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;
const subscribers = new Set<(m: Record<string, string>) => void>();

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

