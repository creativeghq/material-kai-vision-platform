/** The two sides are never merged: ΑΑΔΕ's book confirms ours, and where it does not, it is named. */
import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { usePermissions } from '@/hooks/usePermissions';
import { formatMoney } from '@/modules/finance/services/financeService';
import {
  greekComplianceService, prefillBlocks, deviationIsDeclared,
  type VatPrefillPeriod, type PrefillVerdict, type PrefillDeviation,
} from '@/modules/finance/services/greekComplianceService';
import { aadeVerdict } from '@/modules/finance/pnlStatus';
import {
  sortVatReturnLines, vatReturnLineLabel, vatPayableLabel, vatDifferenceLines,
  residualVerdict, vatPeriodPresets, worseAadeStatus, type VatReturnSnapshot,
} from '@/modules/finance/vatReturn';

const TONE_CLASS: Record<'ok' | 'warn' | 'unknown', string> = {
  ok: 'text-muted-foreground',
  warn: 'text-amber-800 dark:text-amber-300',
  unknown: 'text-muted-foreground',
};

/** A figure, or the reason there is none — never a zero standing in for "we could not tell". */
const Figure: React.FC<{ value: number | null | undefined; status?: string; className?: string }> = ({
  value, status, className,
}) => {
  const verdict = status ? aadeVerdict(status) : null;
  if (value == null || (verdict && !verdict.hasFigures)) {
    return <span className="text-xs font-normal text-muted-foreground">{verdict?.label ?? 'Unknown'}</span>;
  }
  return <span className={`tabular-nums ${className ?? ''}`}>{formatMoney(value)}</span>;
};

export const VatReturnPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const { isWorkspaceManager } = usePermissions();
  const presets = React.useMemo(() => vatPeriodPresets(new Date()), []);
  const [range, setRange] = React.useState({ from: presets[1].from, to: presets[1].to });
  const [snap, setSnap] = React.useState<VatReturnSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [period, setPeriod] = React.useState<VatPrefillPeriod | null>(null);
  const [verdict, setVerdict] = React.useState<PrefillVerdict | null>(null);
  const [deviations, setDeviations] = React.useState<PrefillDeviation[]>([]);

  const loadPeriodRecord = React.useCallback(async (id: string | null) => {
    if (!id) { setPeriod(null); setVerdict(null); setDeviations([]); return; }
    const [periods, v, d] = await Promise.all([
      greekComplianceService.vatPeriods(workspaceId).catch(() => [] as VatPrefillPeriod[]),
      greekComplianceService.vatVerdict(id).catch(() => null),
      greekComplianceService.deviations(id).catch(() => [] as PrefillDeviation[]),
    ]);
    setPeriod(periods.find((p) => p.id === id) ?? null);
    setVerdict(v);
    setDeviations(d);
  }, [workspaceId]);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const s = await greekComplianceService.vatReturn(workspaceId, range.from, range.to);
      setSnap(s);
      setError(null);
      await loadPeriodRecord(s.prefill_period_id);
    } catch (e) {
      // Cleared: keeping them shows the previous period's numbers under the new period's dates.
      setSnap(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [workspaceId, range.from, range.to, loadPeriodRecord]);

  React.useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { toast({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const openPeriod = () => act('Open the period', async () => {
    await greekComplianceService.openVatReturn(workspaceId, range.from, range.to);
    await load();
    toast({
      title: 'Period opened',
      description: 'ΑΑΔΕ’s figures and yours are both filled from the books — neither was typed.',
    });
  });

  const setStatus = (status: 'draft' | 'reconciled' | 'submitted') => act('Update the period', async () => {
    if (!period) return;
    if (status === 'submitted') {
      const warn = verdict && prefillBlocks(verdict)
        ? '\n\nThis period is in BREACH of the pre-fill rules, which forfeits the deduction rather than raising a warning. Record it anyway?'
        : '';
      if (!window.confirm(`Mark ${period.period_start} → ${period.period_end} as filed?${warn}`)) return;
    }
    const out = await greekComplianceService.setVatReturnStatus(period.id, status);
    await loadPeriodRecord(period.id);
    toast({
      title: out.outcome === 'already_submitted' ? 'Already filed' : 'Period updated',
      description: out.outcome === 'already_submitted'
        ? 'It was marked filed before this ran — the original stamp is kept.'
        : undefined,
    });
  });

  const declare = (side: 'income' | 'expense', amount: number) => act('Record the deviation', async () => {
    if (!period) return;
    await greekComplianceService.recordDeviation({ workspaceId, periodId: period.id, side, amount });
    await loadPeriodRecord(period.id);
    toast({
      title: 'Deviation recorded',
      description: 'It is not declared until the document is emitted and carries a MARK.',
    });
  });

  const lines = snap ? sortVatReturnLines(snap.ours.rates) : [];
  const diffLines = snap ? vatDifferenceLines(snap) : [];
  const incomeVerdict = snap ? aadeVerdict(snap.aade.income_status) : null;
  const expenseVerdict = snap ? aadeVerdict(snap.aade.expense_status) : null;
  const bothSides = snap ? worseAadeStatus(snap.aade.income_status, snap.aade.expense_status) : null;
  const bothVerdict = bothSides ? aadeVerdict(bothSides) : null;
  const undeclared = deviations.filter((d) => !deviationIsDeclared(d)).length;

  return (
    <Card>
      <CardHeader className="border-b border-hairline">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-primary" /> VAT Return
            </CardTitle>
            <CardDescription className="text-xs">
              What you owe for the period, from your own documents — set against what ΑΑΔΕ already
              holds for the same months, with every difference named rather than averaged away.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              value={presets.find((p) => p.from === range.from && p.to === range.to)?.key ?? 'custom'}
              onValueChange={(k) => {
                const p = presets.find((x) => x.key === k);
                if (p) setRange({ from: p.from, to: p.to });
              }}
            >
              <SelectTrigger aria-label="VAT period" className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {presets.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label htmlFor="vat-return-from" className="text-[11px] text-muted-foreground">From</Label>
              <Input id="vat-return-from" type="date" className="mt-1 h-9 w-36 text-xs"
                value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="vat-return-to" className="text-[11px] text-muted-foreground">To</Label>
              <Input id="vat-return-to" type="date" className="mt-1 h-9 w-36 text-xs"
                value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
            <Button size="sm" variant="outline" className="h-9" onClick={() => void load()} disabled={loading || busy}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reload
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working out the return…
          </p>
        )}

        {!loading && error && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The return could not be worked out just now ({error}). That is not a statement that
            nothing is due.
          </p>
        )}

        {!loading && snap && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">From your documents</p>
                <p className="mt-1 text-lg font-semibold"><Figure value={snap.ours.payable} /></p>
                <p className="text-[11px] text-muted-foreground">{vatPayableLabel(snap.ours.payable)}</p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">From ΑΑΔΕ&apos;s book</p>
                <p className="mt-1 text-lg font-semibold">
                  <Figure value={snap.aade.payable} status={bothSides ?? undefined} />
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {bothVerdict?.hasFigures ? vatPayableLabel(snap.aade.payable) : bothVerdict?.detail}
                </p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Difference</p>
                <p className="mt-1 text-lg font-semibold"><Figure value={snap.difference.payable} /></p>
                <p className="text-[11px] text-muted-foreground">
                  {snap.difference.payable == null
                    ? 'Nothing to compare against for these months.'
                    : 'What your return says, less what their book implies.'}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Your return, line by line</h3>
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No invoice, bill or credit note in this workspace falls in this period. That is a
                  nil return, not a missing one.
                </p>
              ) : (
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-sunken">
                      <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2 text-right">Net</th>
                        <th className="px-3 py-2 text-right">VAT</th>
                        <th className="px-3 py-2 text-right">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lines.map((r) => (
                        <tr key={`${r.section}-${r.vat_rate ?? 'x'}`}>
                          <td className="px-3 py-2">{vatReturnLineLabel(r.section, r.vat_rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(r.net || 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(r.vat || 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.doc_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surface-sunken">
                      <tr className="font-semibold">
                        <td className="px-3 py-2">{vatPayableLabel(snap.ours.payable)}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(snap.ours.payable)}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Against ΑΑΔΕ&apos;s book</h3>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunken">
                    <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                      <th className="px-3 py-2">Side</th>
                      <th className="px-3 py-2 text-right">Yours (net)</th>
                      <th className="px-3 py-2 text-right">ΑΑΔΕ (net)</th>
                      <th className="px-3 py-2 text-right">Difference</th>
                      <th className="px-3 py-2">ΑΑΔΕ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-3 py-2">Income</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(snap.ours.income_net)}</td>
                      <td className="px-3 py-2 text-right"><Figure value={snap.aade.income_net} status={snap.aade.income_status} /></td>
                      <td className="px-3 py-2 text-right"><Figure value={snap.difference.income_net} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{incomeVerdict?.label}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Expenses</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(snap.ours.expense_net)}</td>
                      <td className="px-3 py-2 text-right"><Figure value={snap.aade.expense_net} status={snap.aade.expense_status} /></td>
                      <td className="px-3 py-2 text-right"><Figure value={snap.difference.expense_net} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{expenseVerdict?.label}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {!snap.period.aligned_to_months && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  {aadeVerdict('period_not_comparable').detail}
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Why they differ</h3>
              {diffLines.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing is sitting unbooked, untransmitted or undeclared for this period.
                </p>
              ) : (
                <ul className="space-y-2">
                  {diffLines.map((d) => (
                    <li key={d.key} className="rounded-md border border-hairline p-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{d.label}</span>
                        <span className="shrink-0 text-sm tabular-nums">
                          {d.count} {d.count === 1 ? 'document' : 'documents'}
                          {d.net != null ? ` · ${formatMoney(d.net)}` : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{d.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 space-y-1 text-xs">
                {(['income', 'expense'] as const).map((side) => {
                  const residual = side === 'income'
                    ? snap.difference.income_residual : snap.difference.expense_residual;
                  const v = residualVerdict(residual);
                  return (
                    <p key={side} className={TONE_CLASS[v.tone]}>
                      <span className="font-medium">{side === 'income' ? 'Income' : 'Expenses'} left unexplained: </span>
                      {residual == null ? '—' : formatMoney(residual)} — {v.text}
                    </p>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-hairline p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Filing</h3>
                {period && (
                  <Badge variant={period.status === 'submitted' ? 'success' : 'neutral'}>
                    {period.status}
                  </Badge>
                )}
              </div>

              {!period ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    This period has not been opened yet. Opening it records ΑΑΔΕ&apos;s figures next
                    to yours, so the pre-fill rules can be checked — income is a floor, expenses are
                    a ceiling, and breaching the ceiling forfeits the deduction rather than warning.
                  </p>
                  {isWorkspaceManager && (
                    <Button size="sm" onClick={openPeriod} disabled={busy}>Open this period</Button>
                  )}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
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
                      {isWorkspaceManager && (verdict.expense_excess ?? 0) > 0 && (
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => declare('expense', verdict.expense_excess as number)}>
                          Record a 14.30 deviation for {formatMoney(verdict.expense_excess as number)}
                        </Button>
                      )}
                      {isWorkspaceManager && (verdict.income_shortfall ?? 0) > 0 && (
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => declare('income', verdict.income_shortfall as number)}>
                          Record an 11.4 deviation for {formatMoney(verdict.income_shortfall as number)}
                        </Button>
                      )}
                    </div>
                  )}

                  {deviations.length > 0 && (
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <p className="font-medium">Deviations</p>
                      {deviations.map((d) => (
                        <p key={d.id} className="tabular-nums">
                          {d.side} · {d.document_type} / {d.characterisation} · {formatMoney(d.amount)}
                          {deviationIsDeclared(d)
                            ? ` · MARK ${d.mydata_mark}`
                            : ' · not transmitted — still just a difference'}
                        </p>
                      ))}
                      {undeclared > 0 && (
                        <p className="text-amber-800 dark:text-amber-300">
                          {undeclared} of these have not been emitted.{' '}
                          The escape hatch is a transmission, not a note.
                        </p>
                      )}
                    </div>
                  )}

                  {isWorkspaceManager && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={openPeriod} disabled={busy}>
                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-read the figures
                      </Button>
                      {period.status !== 'reconciled' && period.status !== 'submitted' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus('reconciled')} disabled={busy}>
                          Mark reconciled
                        </Button>
                      )}
                      {period.status !== 'submitted' ? (
                        <Button size="sm" onClick={() => setStatus('submitted')} disabled={busy}>
                          <Send className="mr-1 h-3.5 w-3.5" /> Mark as filed
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setStatus('reconciled')} disabled={busy}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  )}
                  {period.status === 'submitted' && period.submitted_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Filed {formatDate(period.submitted_at, { withTime: true })}.
                    </p>
                  )}
                  {!isWorkspaceManager && (
                    <p className="text-[11px] text-muted-foreground">
                      Filing this period is a workspace owner or admin action.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
