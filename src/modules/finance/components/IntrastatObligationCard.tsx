/**
 * Whether the INTRASTAT return is owed at all, and from which month (#451).
 *
 * Shown above the declaration lines because it changes what they MEAN: the same empty table is
 * "nothing to declare" under `not_obliged` and "nobody has ever checked" under `threshold_unknown`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Gauge, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  intrastatObligationService, INTRASTAT_STATUS_LABEL, FLOW_LABEL,
  obligationIsUnknown, intrastatNeedsAttention, isObliged,
  SUGGESTED_THRESHOLD, THRESHOLD_SOURCE_NOTE, RELATED_OBLIGATIONS,
  type IntrastatFlow, type IntrastatFlowVerdict, type IntrastatObligation,
  type IntrastatThreshold,
} from '@/modules/finance/services/intrastatObligationService';

interface Props {
  workspaceId: string | null;
  flow: IntrastatFlow;
  year?: number;
  canManage?: boolean;
}

export const IntrastatObligationCard: React.FC<Props> = ({
  workspaceId, flow, year, canManage = true,
}) => {
  const { toast } = useToast();
  const [obligation, setObligation] = useState<IntrastatObligation | null>(null);
  const [thresholds, setThresholds] = useState<IntrastatThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const v: IntrastatFlowVerdict | undefined = obligation?.[flow];
  const effectiveYear = year ?? new Date().getFullYear();
  const [draft, setDraft] = useState({
    amount: String(SUGGESTED_THRESHOLD[flow]),
    from: `${effectiveYear}-01-01`,
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [ob, rows] = await Promise.all([
        intrastatObligationService.obligation(workspaceId, year),
        // The figure the verdict was reached ON. Without it "obliged from March" is a number the
        // reader has to take on faith, and a revision is invisible.
        intrastatObligationService.thresholds(workspaceId).catch(() => [] as IntrastatThreshold[]),
      ]);
      setObligation(ob);
      setThresholds(rows.filter((t) => t.flow === flow));
      setFailed(false);
    } catch {
      setObligation(null); setThresholds([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, year, flow]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await intrastatObligationService.recordThreshold({
        workspaceId, flow,
        amount: Number(draft.amount),
        effectiveFrom: draft.from,
        sourceNote: THRESHOLD_SOURCE_NOTE,
      });
      await load();
      toast({ title: 'Threshold recorded' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the threshold',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" /> {FLOW_LABEL[flow]} — obligation
        </CardTitle>
        <CardDescription>
          The threshold is assessed per flow per calendar year, and the obligation starts the month
          it is crossed. An empty declaration only means "nothing to declare" once this is answered.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the threshold…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The obligation could not be checked just now. That is not a statement that nothing is
            owed.
          </p>
        )}

        {!loading && !failed && v && (
          <div
            className={`space-y-1 rounded-md border p-2 ${
              obligationIsUnknown(v) || isObliged(v)
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : intrastatNeedsAttention(v)
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                  : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {intrastatNeedsAttention(v)
                ? <AlertTriangle className="h-3.5 w-3.5" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              <Badge variant={isObliged(v) ? 'error' : obligationIsUnknown(v) ? 'warning' : 'neutral'}>
                {INTRASTAT_STATUS_LABEL[v.status]}
              </Badge>
              <span className="tabular-nums">
                {v.year}: {v.total ?? 0}
                {v.threshold != null ? ` of ${v.threshold}` : ''}
                {v.percent_of_threshold != null ? ` (${v.percent_of_threshold}%)` : ''}
              </span>
              {v.obliged_from && <span className="tabular-nums">from {v.obliged_from}</span>}
            </div>
            <p>{v.reason}</p>
          </div>
        )}

        {!loading && !failed && obligationIsUnknown(v) && canManage && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
            <div>
              <Label htmlFor={`intr-amt-${flow}`} className="text-[11px]">Threshold (EUR)</Label>
              <Input
                id={`intr-amt-${flow}`} type="number" min="1" className="mt-1 h-8 w-36 text-xs"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor={`intr-from-${flow}`} className="text-[11px]">Effective from</Label>
              <Input
                id={`intr-from-${flow}`} type="date" className="mt-1 h-8 w-40 text-xs"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </div>
            <Button size="sm" onClick={save} disabled={busy}>
              <Save className="mr-1 h-3 w-3" /> Record threshold
            </Button>
            <p className="w-full text-[11px] text-muted-foreground">{THRESHOLD_SOURCE_NOTE}</p>
          </div>
        )}

        {!loading && !failed && thresholds.length > 0 && (
          <div className="mt-2 border-t border-hairline pt-2">
            <p className="mb-1 text-[11px] font-medium">Thresholds on record</p>
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {thresholds.map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="tabular-nums font-medium">
                    {Number(t.threshold_amount).toLocaleString('en-US')} {t.currency}
                  </span>
                  <span className="tabular-nums">
                    from {t.effective_from}{t.effective_to ? ` to ${t.effective_to}` : ''}
                  </span>
                  {/* An unconfirmed figure is somebody's recollection until an accountant signs it. */}
                  <Badge variant={t.confirmed_on ? 'success' : 'warning'}>
                    {t.confirmed_on ? `confirmed ${t.confirmed_on}` : 'not confirmed'}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && !failed && (
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {RELATED_OBLIGATIONS.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
