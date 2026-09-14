/**
 * Which economic operator we are for this product (#430).
 *
 * CPR (EU) 2024/3110 and GPSR (EU) 2023/988 give four roles four different obligation sets, and the
 * difference between two of them is one fact already on the record: where the goods come from.
 * Derived in SQL from the SAVED origin, never typed — a role somebody picked is a role that drifts.
 */
import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import {
  cbamService, ROLE_OBLIGATIONS, type RegulatoryRoleVerdict,
} from '@/modules/finance/services/cbamService';

const ROLE_LABEL = {
  manufacturer: 'Manufacturer',
  importer: 'Importer',
  distributor: 'Distributor',
} as const;

export const RegulatoryRoleNotice: React.FC<{
  productId: string;
  /** Bumped by the parent after a save, so the derivation re-reads what was actually stored. */
  refreshKey?: number;
}> = ({ productId, refreshKey = 0 }) => {
  const [verdict, setVerdict] = useState<RegulatoryRoleVerdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cbamService.regulatoryRole(productId)
      .then((v) => { if (!cancelled) { setVerdict(v); setFailed(false); } })
      .catch(() => { if (!cancelled) { setVerdict(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId, refreshKey]);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Deriving the regulatory role…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        The regulatory role could not be derived just now. That is not a statement that we are only
        the distributor.
      </p>
    );
  }

  if (!verdict || !verdict.role) {
    return (
      <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>{verdict?.reason ?? 'No verdict.'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border border-hairline bg-surface-sunken p-2 text-[11px]">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Our role</span>
        <Badge variant={verdict.role === 'distributor' ? 'neutral' : 'warning'}>
          {ROLE_LABEL[verdict.role]}
        </Badge>
        {verdict.origin && (
          <span className="text-muted-foreground">origin {verdict.origin}</span>
        )}
      </div>
      <p className="text-muted-foreground">{verdict.reason}</p>
      <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
        {ROLE_OBLIGATIONS[verdict.role].map((o) => <li key={o}>{o}</li>)}
      </ul>
      {verdict.legal_basis && (
        <p className="text-muted-foreground">{verdict.legal_basis}</p>
      )}
    </div>
  );
};
