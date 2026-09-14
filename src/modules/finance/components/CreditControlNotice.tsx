/**
 * What credit control says about this document (#426).
 *
 * The verdict is derived in SQL beside the exposure it reads, so the dialog and the write cannot
 * disagree — and an overdue account is held even while it is under its limit, which is the more
 * common way a trade account goes bad.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, ShieldCheck } from 'lucide-react';
import {
  approvalService, verdictStops, verdictIsApprovable, type CreditVerdict,
} from '@/modules/finance/services/approvalService';

export const CreditControlNotice: React.FC<{
  workspaceId: string | null | undefined;
  companyId?: string | null;
  contactId?: string | null;
  amount: number;
  /** Told when the verdict stops the write, so the caller can refuse to issue. */
  onBlockedChange?: (blocked: boolean) => void;
}> = ({ workspaceId, companyId, contactId, amount, onBlockedChange }) => {
  const [verdict, setVerdict] = useState<CreditVerdict | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || (!companyId && !contactId)) {
      setVerdict(null); onBlockedChange?.(false);
      return;
    }
    setLoading(true);
    approvalService
      .creditVerdict({ workspaceId, companyId, contactId, amount })
      .then((v) => {
        if (cancelled) return;
        setVerdict(v); setFailed(false);
        onBlockedChange?.(verdictStops(v.decision));
      })
      .catch(() => {
        if (cancelled) return;
        // A failed read is not "within the limit". It is unknown, and the write refuses on its own
        // anyway — so saying nothing here would be the misleading half.
        setVerdict(null); setFailed(true); onBlockedChange?.(false);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `onBlockedChange` is intentionally not a dependency: callers pass an inline closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, companyId, contactId, amount]);

  if (loading && !verdict) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking credit control…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Credit control could not be checked just now. The write is still gated server-side.
      </p>
    );
  }

  if (!verdict || verdict.decision === 'allow') return null;

  const stops = verdictStops(verdict.decision);
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
        stops
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
      }`}
    >
      {stops ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
             : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div className="space-y-0.5">
        <p>{verdict.reason}</p>
        {verdict.overdue_amount > 0 && (
          <p className="tabular-nums">
            Overdue {verdict.overdue_amount.toFixed(2)}, oldest {verdict.days_overdue} days —
            grace {verdict.grace_days} {verdict.grace_basis} days.
          </p>
        )}
        {verdictIsApprovable(verdict.decision) && verdict.approver_role && (
          <p>A {verdict.approver_role} can sign for this. Nobody else can wave it through.</p>
        )}
      </div>
    </div>
  );
};
