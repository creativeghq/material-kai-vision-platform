/**
 * What this user's margin authority says about these lines (#435).
 *
 * Margin control is a permission, not a report: the floor is tied to the workspace role and the
 * verdict is enforced at the write. This is the half that has to be on screen BEFORE the save, and
 * it shows the variance from what the product normally makes — because 12% is fine on a line that
 * usually makes 14% and a disaster on one that usually makes 40%.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  approvalService, verdictStops, type MarginVerdict,
} from '@/modules/finance/services/approvalService';

export interface MarginLine {
  key: string;
  description: string;
  unitPrice: number;
  unitCost: number | null;
  quantity: number;
  discountPct?: number | null;
  /** What this product normally makes, so the approver sees the variance and not only the number. */
  referenceMarginPercent?: number | null;
}

export const MarginAuthorityNotice: React.FC<{
  workspaceId: string | null | undefined;
  lines: MarginLine[];
}> = ({ workspaceId, lines }) => {
  const [verdicts, setVerdicts] = useState<{ line: MarginLine; v: MarginVerdict }[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Only lines that could actually breach a floor are asked about: a line with no price is not a
  // discount somebody gave, it is a line nobody has finished.
  const askable = lines.filter((l) => l.unitPrice > 0 && l.quantity > 0);
  const signature = askable
    .map((l) => `${l.key}:${l.unitPrice}:${l.unitCost ?? ''}:${l.quantity}:${l.discountPct ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || askable.length === 0) { setVerdicts([]); return; }
    setLoading(true);
    Promise.all(askable.map(async (line) => ({
      line,
      v: await approvalService.marginVerdict({
        workspaceId,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        quantity: line.quantity,
        discountPct: line.discountPct ?? 0,
        referenceMarginPercent: line.referenceMarginPercent ?? null,
      }),
    })))
      .then((rs) => {
        if (cancelled) return;
        setVerdicts(rs.filter((r) => r.v.decision !== 'allow'));
        setFailed(false);
      })
      .catch(() => { if (!cancelled) { setVerdicts([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `signature` is the only input that matters; `lines` is a fresh array on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, signature]);

  if (loading && verdicts.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking margin authority…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Margin authority could not be checked just now. The write is still gated server-side.
      </p>
    );
  }

  if (verdicts.length === 0) return null;

  return (
    <div className="space-y-1">
      {verdicts.map(({ line, v }) => (
        <p
          key={line.key}
          className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] ${
            verdictStops(v.decision)
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            <strong>{line.description || 'This line'}:</strong> {v.reason}
            {v.approver_role ? ` A ${v.approver_role} can sign for it.` : ''}
          </span>
        </p>
      ))}
    </div>
  );
};
