/**
 * "This delivery destination changes the VAT rate" (#443).
 *
 * Shown on the invoice builder beside the delivery address, because that is where the decision is
 * actually made. The rate is derived in SQL — this only says what the derivation found, so the
 * screen and the transmitted document cannot disagree.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, Ship } from 'lucide-react';
import {
  islandVatService, vatVerdictBlocks, type VatDestinationVerdict,
} from '@/modules/finance/services/islandVatService';

export const DeliveryVatNotice: React.FC<{
  /** The myDATA VAT category the lines currently carry. */
  standardCategory: number | null | undefined;
  postalCode: string | null | undefined;
  countryCode?: string | null;
  /** The document's own date — a 2025 invoice is rated by the 2025 rule. */
  on?: string;
  /** Told when the derivation cannot decide, so the caller can refuse to issue. */
  onBlockedChange?: (blocked: boolean) => void;
}> = ({ standardCategory, postalCode, countryCode, on, onBlockedChange }) => {
  const [verdict, setVerdict] = useState<VatDestinationVerdict | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (standardCategory == null) { setVerdict(null); return; }
    islandVatService
      .forDestination({ standardCategory, postalCode, countryCode, on })
      .then((v) => {
        if (cancelled) return;
        setVerdict(v); setFailed(false);
        onBlockedChange?.(vatVerdictBlocks(v));
      })
      .catch(() => {
        if (cancelled) return;
        // A failed read is not "mainland". It is unknown, and it blocks for the same reason an
        // unclassifiable postcode does.
        setVerdict(null); setFailed(true); onBlockedChange?.(true);
      });
    return () => { cancelled = true; };
    // `onBlockedChange` is intentionally not a dependency: callers pass an inline closure and
    // including it would re-run the query on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardCategory, postalCode, countryCode, on]);

  if (failed) {
    return (
      <Notice tone="blocked" icon={AlertTriangle}>
        The delivery destination could not be checked against the island VAT regime just now. This
        is not a statement that the mainland rate applies.
      </Notice>
    );
  }
  if (!verdict) return null;

  if (verdict.status === 'unclassified') {
    return (
      <Notice tone="blocked" icon={AlertTriangle}>
        {verdict.reason}
      </Notice>
    );
  }
  if (verdict.status === 'reduced') {
    return (
      <Notice tone="info" icon={Ship}>
        {verdict.territory} is in the reduced-rate regime (ν.5246/2025): {verdict.standard_rate}%
        becomes <strong>{verdict.rate}%</strong> on this delivery. The rate follows the
        destination, not the customer.
      </Notice>
    );
  }
  if (verdict.status === 'already_reduced') {
    return (
      <Notice tone="info" icon={Info}>
        These lines already carry an island rate, so nothing further is reduced —
        the island rates are statutory figures, not a percentage off.
      </Notice>
    );
  }
  // `standard`, `not_applicable` and `no_reduced_equivalent` need no notice: the rate the
  // operator chose is the right one, and a banner on every mainland invoice is noise.
  return null;
};

const Notice: React.FC<{
  tone: 'info' | 'blocked';
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ tone, icon: Icon, children }) => (
  <div
    className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
      tone === 'blocked'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'border-hairline bg-surface-sunken text-muted-foreground'
    }`}
  >
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{children}</span>
  </div>
);
