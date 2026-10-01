/** The two sides are never merged: ΑΑΔΕ's book confirms ours, and where it does not, it is named. */
import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, Scale, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/core/ui/collapsible';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
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
  VAT_PERIOD_STATUS_LABEL, PREFILL_STATUS_LABEL,
} from '@/modules/finance/vatReturn';

const HOW_IT_WORKS: Array<{ title: string; body: string }> = [
  {
    title: 'Pick the period you declare',
    body: 'The Φ.2 is moving to monthly filing, so the page opens on last month and offers the three months before it. Quarterly presets remain for businesses not moved yet. ΑΑΔΕ keeps its book by month, so a part-month cannot be compared.',
  },
  {
    title: 'Read the three figures',
    body: '"Your figure" is VAT you charged customers minus VAT you paid suppliers, from the invoices, bills and credit notes in this workspace. "ΑΑΔΕ\'s figure" is the same sum from what myDATA holds for you. Positive means you pay; negative means a refund or credit.',
  },
  {
    title: 'Clear the differences',
    body: '"Why they differ" names each cause: received documents nobody has booked yet, your invoices without a MARK (the number ΑΑΔΕ gives a document it accepted), and bills typed in by hand. Book or transmit them and reload.',
  },
  {
    title: 'Open the period, then file',
    body: 'Opening records both figures and checks ΑΑΔΕ\'s pre-fill rules: the sales you declare may not be lower than ΑΑΔΕ holds, and the purchases you deduct may not be higher. Submit the Φ.2 in myAADE yourself or through your accountant, then press "Mark as filed" here. This page never sends the declaration.',
  },
];

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
  const [range, setRange] = React.useState({ from: presets[0].from, to: presets[0].to });
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
            <CardDescription className="max-w-2xl text-xs">
              Prepares your periodic VAT declaration (Φ.2): the VAT you charged minus the VAT you
              paid. It works the figure out from your own documents, checks it against what ΑΑΔΕ
              already holds in myDATA for the same months, and lists what explains any gap. You
              still file the Φ.2 in myAADE; this page prepares it and records that it was filed.
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
              <SelectTrigger aria-label="VAT period" className="h-9 w-56 text-xs"><SelectValue /></SelectTrigger>
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
        <Collapsible className="rounded-md border border-hairline">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium">
            How this works
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 border-t border-hairline p-3">
            <ol className="space-y-2">
              {HOW_IT_WORKS.map((s, i) => (
                <li key={s.title} className="flex gap-3 text-xs">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-medium tabular-nums">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="text-muted-foreground">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              The &ldquo;VAT return ready&rdquo; notification is sent once per month, as soon as
              ΑΑΔΕ&apos;s book for a finished month has both sides. Its amount is ΑΑΔΕ&apos;s figure,
              so it can differ from yours until the differences below are cleared.
            </p>
          </CollapsibleContent>
        </Collapsible>

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
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your figure</p>
                <p className="mt-1 text-lg font-semibold"><Figure value={snap.ours.payable} /></p>
                <p className="text-[11px] text-muted-foreground">{vatPayableLabel(snap.ours.payable)}</p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ΑΑΔΕ&apos;s figure (myDATA)</p>
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
                    : 'Your figure minus ΑΑΔΕ’s. Zero means the two agree.'}
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
                <div className="overflow-hidden rounded-md border border-hairline">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">VAT</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Docs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((r) => (
                        <TableRow key={`${r.section}-${r.vat_rate ?? 'x'}`}>
                          <TableCell className="break-words">{vatReturnLineLabel(r.section, r.vat_rate)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMoney(Number(r.net || 0))}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMoney(Number(r.vat || 0))}</TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.doc_count ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="hover:bg-transparent">
                        <TableCell>{vatPayableLabel(snap.ours.payable)}</TableCell>
                        <TableCell />
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMoney(snap.ours.payable)}</TableCell>
                        <TableCell className="hidden sm:table-cell" />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">Compared with ΑΑΔΕ</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Net amounts before VAT. Income is what you invoiced; expenses are what suppliers invoiced you.
              </p>
              <div className="overflow-hidden rounded-md border border-hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Yours (net)</TableHead>
                      <TableHead className="text-right">ΑΑΔΕ (net)</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead className="hidden md:table-cell">ΑΑΔΕ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Income</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMoney(snap.ours.income_net)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums"><Figure value={snap.aade.income_net} status={snap.aade.income_status} /></TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums"><Figure value={snap.difference.income_net} /></TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{incomeVerdict?.label}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Expenses</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatMoney(snap.ours.expense_net)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums"><Figure value={snap.aade.expense_net} status={snap.aade.expense_status} /></TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums"><Figure value={snap.difference.expense_net} /></TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{expenseVerdict?.label}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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
                    {VAT_PERIOD_STATUS_LABEL[period.status] ?? period.status}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Open → Reconciled → Filed tracks where this period stands. Nothing here is sent to ΑΑΔΕ.
              </p>

              {!period ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    This period has not been opened yet. Opening it saves ΑΑΔΕ&apos;s figures next to
                    yours and checks the pre-fill rules: declared sales may not be below what ΑΑΔΕ
                    holds, and deducted purchases may not be above it. Deducting more than ΑΑΔΕ
                    holds loses that deduction unless the extra is declared on a myDATA document.
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
                        {PREFILL_STATUS_LABEL[verdict.status] ?? verdict.status}
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
