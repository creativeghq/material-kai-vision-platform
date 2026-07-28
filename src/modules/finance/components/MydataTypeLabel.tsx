/**
 * A myDATA document-type code ("2.1", "9.3", …) rendered as a dotted-underline hint that
 * explains itself on hover. The codes are meaningless on their own and appear all over the
 * document lists, so the label reads from the canonical `mydata_reference` table rather than
 * a hardcoded map — new AADE codes surface without a deploy.
 *
 * The reference list is fetched once per session and shared by every instance (a document
 * list renders one of these per row; each mounting its own query would be a fetch storm).
 */
import React, { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/core/ui/tooltip';
import { invoicingSetupService } from '@/services/invoicingSetupService';

/** code → description, resolved once per session. */
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;
const subscribers = new Set<(m: Record<string, string>) => void>();

function loadTypes(): Promise<Record<string, string>> {
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

/** Broad families, for the one-line "what kind of document is this" context under the name. */
const FAMILY: Record<string, string> = {
  '1': 'Goods invoice', '2': 'Services invoice', '3': 'Proof of expenditure', '5': 'Credit note',
  '6': 'Self-billing', '7': 'Contract', '8': 'Rents / special', '9': 'Delivery note',
  '11': 'Retail receipt', '13': 'Retail / expenses', '14': 'Cross-border', '15': 'Contractor',
};

export const MydataTypeLabel: React.FC<{ code: string | null | undefined; className?: string }> = ({ code, className }) => {
  const [map, setMap] = useState<Record<string, string>>(() => cache ?? {});

  useEffect(() => {
    if (cache) { setMap(cache); return; }
    let live = true;
    const sub = (m: Record<string, string>) => { if (live) setMap(m); };
    subscribers.add(sub);
    void loadTypes().then((m) => { if (live) setMap(m); });
    return () => { live = false; subscribers.delete(sub); };
  }, []);

  if (!code) return <span className={className ?? 'text-xs text-muted-foreground'}>—</span>;

  const description = map[code];
  const family = FAMILY[code.split('.')[0]];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`${className ?? 'text-xs text-muted-foreground'} cursor-help underline decoration-dotted decoration-from-font underline-offset-4`}
          >
            {code}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{description ?? `myDATA type ${code}`}</p>
          {family && <p className="text-xs text-muted-foreground mt-0.5">{family} · AADE code {code}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
