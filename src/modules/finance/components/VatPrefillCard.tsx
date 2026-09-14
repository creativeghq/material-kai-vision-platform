/**
 * Pre-filled VAT: income is a floor, expenses are a ceiling (#445).
 *
 * Breaching the expense ceiling does not raise a warning — under Α.1020/2024 άρθρο 3 §2β the tax
 * deductions and the related deductible expenses are not taken into account at all. And the escape
 * hatch is an EMITTED document, so a deviation with no MARK is just a difference somebody noted.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Scale, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  greekComplianceService, prefillBlocks, deviationIsDeclared,
  type VatPrefillPeriod, type PrefillVerdict, type PrefillDeviation,
} from '@/modules/finance/services/greekComplianceService';

export const VatPrefillCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<VatPrefillPeriod[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<PrefillVerdict | null>(null);
  const [deviations, setDeviations] = useState<PrefillDeviation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: todayLocalISO(),
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setPeriods(await greekComplianceService.vatPeriods(workspaceId));
      setFailed(false);
    } catch {
      setPeriods([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => {
    setOpenId(id);
    try {
      const [v, d] = await Promise.all([
        greekComplianceService.vatVerdict(id),
        greekComplianceService.deviations(id).catch(() => [] as PrefillDeviation[]),
      ]);
      setVerdict(v); setDeviations(d);
    } catch { setVerdict(null); setDeviations([]); }
  };

  const createPeriod = async () => {
    setBusy(true);
    try {
      await greekComplianceService.saveVatPeriod({
        workspace_id: workspaceId, period_start: draft.start, period_end: draft.end,
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not create the period',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const declare = async (side: 'income' | 'expense', amount: number) => {
    if (!openId) return;
    setBusy(true);
    try {
      await greekComplianceService.recordDeviation({
        workspaceId, periodId: openId, side, amount,
      });
      await open(openId);
      toast({
        title: 'Deviation recorded',
        description: 'It is not declared until the document is emitted and carries a MARK.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the deviation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const undeclared = deviations.filter((d) => !deviationIsDeclared(d)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-primary" /> Pre-filled VAT reconciliation
        </CardTitle>
        <CardDescription>
          myDATA income is a floor and myDATA expenses are a ceiling. Declaring more income is
          always allowed; declaring more expenses forfeits the deduction.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading periods…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The VAT periods could not be read just now. That is not a statement that the return is
            inside the rules.
          </p>
        )}

        {!loading && !failed && periods.length === 0 && (
          <HubEmptyState
            title="No periods reconciled"
            description="Pre-filling has been binding since 1/1/2024. Until a period is reconciled, nothing here is checking the return against what AADE already holds."
          />
        )}

        {periods.length > 0 && (
          <ul className="space-y-1 text-xs">
            {periods.map((p) => (
              <li key={p.id}>
                <Button size="sm" variant="ghost" onClick={() => open(p.id)}>
                  {p.period_start} → {p.period_end}
                </Button>
                <Badge variant="neutral" className="ml-2">{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
          <div>
            <Label htmlFor="vat-from" className="text-[11px]">Period from</Label>
            <Input
              id="vat-from" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.start}
              onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="vat-to" className="text-[11px]">to</Label>
            <Input
              id="vat-to" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.end}
              onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            />
          </div>
          <Button size="sm" variant="outline" onClick={createPeriod} disabled={busy}>
            <Save className="mr-1 h-3 w-3" /> Add period
          </Button>
        </div>

        {verdict && (
          <div
            className={`space-y-1 rounded-md border p-2 text-xs ${
              prefillBlocks(verdict)
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : verdict.status === 'tolerance'
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                  : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {prefillBlocks(verdict)
                ? <AlertTriangle className="h-3.5 w-3.5" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              {verdict.status}
            </div>
            <p>{verdict.reason}</p>
            {verdict.legal_basis && <p>{verdict.legal_basis}</p>}
            {(verdict.expense_excess ?? 0) > 0 && (
              <Button
                size="sm" variant="outline" disabled={busy}
                onClick={() => declare('expense', verdict.expense_excess as number)}
              >
                Record a 14.30 deviation for {verdict.expense_excess}
              </Button>
            )}
            {(verdict.income_shortfall ?? 0) > 0 && (
              <Button
                size="sm" variant="outline" disabled={busy}
                onClick={() => declare('income', verdict.income_shortfall as number)}
              >
                Record an 11.4 deviation for {verdict.income_shortfall}
              </Button>
            )}
          </div>
        )}

        {deviations.length > 0 && (
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p className="font-medium">Deviations</p>
            {deviations.map((d) => (
              <p key={d.id} className="tabular-nums">
                {d.side} · {d.document_type} / {d.characterisation} · {d.amount}
                {deviationIsDeclared(d)
                  ? ` · MARK ${d.mydata_mark}`
                  : ' · not transmitted — still just a difference'}
              </p>
            ))}
            {undeclared > 0 && (
              <p className="text-amber-800 dark:text-amber-300">
                {undeclared} of these have not been emitted. The escape hatch is a transmission, not
                a note.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
