/**
 * The tax basis alongside the book one, and the difference between them (#451).
 *
 * Greek tax depreciation is a statutory RATE on acquisition cost by category, so the rate lives
 * against a date rather than as a useful life. The platform table is only a prefill: a copied rate
 * stays "not confirmed" until someone signs it off.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, Scale, Calculator, ChevronDown, CheckCircle2, Pencil, Wand2, Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/core/ui/collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import {
  taxDepreciationService, TAX_STATUS_LABEL, TAX_RATE_STATUS_LABEL,
  rateIsConfirmed, rateNeedsAttention, taxBasisIsUnknown, differenceIsReportable,
  rateDiffersFromStatutory, prefillableCategories, formatRate,
  ADJUSTMENT_DOCUMENT, LEGAL_BASIS,
  type TaxRateRow, type BasisDifference,
} from '@/modules/finance/services/taxDepreciationService';

interface Props {
  workspaceId: string | null;
  canManage?: boolean;
}

interface Draft {
  row: TaxRateRow;
  percent: string;
  from: string;
  note: string;
  confirmed: boolean;
}

const errText = (err: unknown) => (err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err));

export const TaxDepreciationCard: React.FC<Props> = ({ workspaceId, canManage = true }) => {
  const { toast } = useToast();
  const [rates, setRates] = useState<TaxRateRow[]>([]);
  const [diff, setDiff] = useState<BasisDifference | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        taxDepreciationService.rateTable(workspaceId),
        taxDepreciationService.basisDifference(workspaceId),
      ]);
      setRates(r); setDiff(d); setFailed(false);
    } catch {
      setRates([]); setDiff(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const unconfirmed = useMemo(() => rates.filter(rateNeedsAttention), [rates]);
  const prefillable = useMemo(() => prefillableCategories(rates), [rates]);
  const nothingOnFile = rates.length > 0 && rates.every((r) => r.history_count === 0);
  const showGuide = guideOpen ?? nothingOnFile;
  const examples = rates
    .filter((r) => r.statutory_rate_percent != null && Number(r.statutory_rate_percent) > 0)
    .slice(0, 3)
    .map((r) => `${r.label_en.toLowerCase()} ${formatRate(r.statutory_rate_percent)}`)
    .join(', ');

  const openChange = (row: TaxRateRow) => {
    if (!canManage) return;
    const firstEntry = row.history_count === 0;
    setDraft({
      row,
      percent: String(row.rate_percent ?? row.statutory_rate_percent ?? ''),
      from: firstEntry && row.statutory_effective_from ? row.statutory_effective_from : `${new Date().getFullYear()}-01-01`,
      note: '',
      confirmed: false,
    });
  };

  const prefill = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const n = await taxDepreciationService.prefillStatutory(workspaceId);
      await load();
      toast({
        title: n === 1 ? '1 rate prefilled' : `${n} rates prefilled`,
        description: 'They are marked "Recorded, not confirmed" until you confirm each one with your accountant.',
      });
    } catch (err) {
      toast({ title: 'Could not prefill the rates', description: errText(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const confirm = async (row: TaxRateRow) => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await taxDepreciationService.confirmRate(workspaceId, row.code, todayLocalISO());
      await load();
      toast({ title: `${row.label_en}: rate confirmed`, description: `${formatRate(row.rate_percent)} is now the rate in force.` });
    } catch (err) {
      toast({ title: 'Could not confirm the rate', description: errText(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!workspaceId || !draft || draft.percent === '' || !draft.from) return;
    setBusy(true);
    try {
      await taxDepreciationService.recordRate({
        workspaceId,
        categoryCode: draft.row.code,
        ratePercent: Number(draft.percent),
        effectiveFrom: draft.from,
        sourceNote: draft.note || null,
        confirmedOn: draft.confirmed ? todayLocalISO() : null,
      });
      setDraft(null);
      await load();
      toast({ title: 'Rate recorded', description: 'It applies from the date you gave; earlier years keep the rate they were filed under.' });
    } catch (err) {
      toast({ title: 'Could not record the rate', description: errText(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const fmt = (n: number | undefined) => (n == null ? '—' : formatMoney(n, 'EUR'));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-primary" /> Tax Depreciation ({LEGAL_BASIS})
        </CardTitle>
        <CardDescription>
          The yearly write-off the tax office accepts for your fixed assets: a fixed percentage of cost
          per category, set by law. It runs beside the book depreciation above, and the gap between
          the two is an adjustment on the income-tax return.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Collapsible open={showGuide} onOpenChange={setGuideOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center gap-2 text-left text-xs font-medium text-foreground">
              <Info className="h-3.5 w-3.5 text-primary" /> How this works
              <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 space-y-2 rounded-md border border-hairline bg-surface-sunken p-3 text-xs text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1. Set the rate per category.</span>{' '}
                Press <span className="font-medium">Prefill statutory rates</span> to copy the article 24 table
                {examples ? ` (${examples})` : ''}, or click a row to enter your own.
              </li>
              <li>
                <span className="font-medium text-foreground">2. Confirm with your accountant.</span>{' '}
                A prefilled rate is marked <span className="font-medium">Recorded, not confirmed</span> until
                you press <span className="font-medium">Confirm</span>. Special regimes (contractual intangibles,
                accelerated deductions) can override the table.
              </li>
              <li>
                <span className="font-medium text-foreground">3. Give each asset a category.</span>{' '}
                In the asset form, under Tax Category. The Assets column counts them. Depreciation starts the
                month after the asset was put into use.
              </li>
              <li>
                <span className="font-medium text-foreground">Changing a rate later</span> never rewrites the past:
                the new rate applies from the date you give, and earlier years keep the rate they were filed under.
              </li>
            </ol>
          </CollapsibleContent>
        </Collapsible>

        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading both bases…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The tax basis could not be read just now. That is not a statement that the two bases agree.
          </p>
        )}

        {!loading && !failed && (
          <>
            {canManage && prefillable.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/[0.05] p-3 text-xs">
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                <p className="min-w-0 flex-1">
                  {prefillable.length === rates.length
                    ? 'No rates on file yet.'
                    : `${prefillable.length} categor${prefillable.length === 1 ? 'y has' : 'ies have'} no rate on file.`}{' '}
                  Start from the statutory table; nothing you already recorded is overwritten.
                </p>
                <Button size="sm" variant="secondary" onClick={prefill} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                  Prefill statutory rates
                </Button>
              </div>
            )}

            {unconfirmed.length > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {unconfirmed.length} categor{unconfirmed.length === 1 ? 'y has' : 'ies have'} assets but no
                confirmed rate. Check the percentage with your accountant, then press Confirm.
              </p>
            )}

            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statutory Category</TableHead>
                    <TableHead className="text-right">Law Says</TableHead>
                    <TableHead className="text-right">Your Rate</TableHead>
                    <TableHead className="hidden sm:table-cell">From</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r) => (
                    <TableRow
                      key={r.code}
                      className={canManage ? 'cursor-pointer' : undefined}
                      onClick={() => openChange(r)}
                    >
                      <TableCell>
                        <span className="font-medium">{r.label_en}</span>
                        <span className="block text-[11px] text-muted-foreground">{r.label_el}</span>
                        {r.notes && <span className="block text-[11px] text-muted-foreground">{r.notes}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatRate(r.statutory_rate_percent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRate(r.rate_percent)}
                        {rateDiffersFromStatutory(r) && (
                          <span className="block text-[11px] text-amber-800 dark:text-amber-300">differs from the table</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell tabular-nums">{r.effective_from ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={rateIsConfirmed(r) ? 'success' : r.rate_percent != null ? 'warning' : 'neutral'}>
                          {TAX_RATE_STATUS_LABEL[r.status]}
                        </Badge>
                        {r.source_note && (
                          <span className="mt-0.5 block max-w-[16rem] truncate text-[11px] text-muted-foreground" title={r.source_note}>
                            {r.source_note}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.asset_count}</TableCell>
                      {canManage && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {r.status === 'unconfirmed' && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => confirm(r)}>
                                <CheckCircle2 className="mr-1 h-3 w-3" /> Confirm
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openChange(r)}>
                              <Pencil className="mr-1 h-3 w-3" /> {r.history_count === 0 ? 'Set' : 'Change'}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {diff && (
              <div className="space-y-1 rounded-md border border-hairline bg-surface-sunken p-3 text-xs">
                <p className="flex items-center gap-2 font-medium">
                  <Calculator className="h-3.5 w-3.5" /> Book vs Tax
                </p>
                {differenceIsReportable(diff) ? (
                  <dl className="grid grid-cols-3 gap-2 tabular-nums">
                    <div><dt className="text-muted-foreground">Book Depreciation</dt><dd className="font-medium">{fmt(diff.book_total)}</dd></div>
                    <div><dt className="text-muted-foreground">Tax Depreciation</dt><dd className="font-medium">{fmt(diff.tax_total)}</dd></div>
                    <div><dt className="text-muted-foreground">Adjustment</dt><dd className="font-medium">{fmt(diff.difference)}</dd></div>
                  </dl>
                ) : (
                  <p className="text-muted-foreground">No adjustment can be worked out yet.</p>
                )}
                <p className="text-muted-foreground">{diff.reason}</p>
                {differenceIsReportable(diff) && <p className="text-muted-foreground">{ADJUSTMENT_DOCUMENT}</p>}
                {(diff.unknown_assets ?? 0) > 0 && (
                  <p className="text-amber-800 dark:text-amber-300">
                    {diff.unknown_assets} asset(s) are left out of the totals. {diff.unknown_reason}
                  </p>
                )}
                {diff.assets.filter((a) => taxBasisIsUnknown(a.tax_status)).slice(0, 6).map((a) => (
                  <p key={a.asset_id} className="text-muted-foreground">
                    {a.name} — {TAX_STATUS_LABEL[a.tax_status]}: {a.tax_reason}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.row.history_count === 0 ? 'Set rate' : 'Change rate'} — {draft.row.label_en}</DialogTitle>
                <DialogDescription>
                  {draft.row.label_el}. The law sets {formatRate(draft.row.statutory_rate_percent)}
                  {draft.row.statutory_reference ? ` (${draft.row.statutory_reference})` : ''}.
                  {draft.row.rate_percent != null && ` Your rate today is ${formatRate(draft.row.rate_percent)} from ${draft.row.effective_from}.`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <FormGrid>
                  <FormField
                    label="Rate %"
                    hint={draft.row.statutory_rate_percent != null && Number(draft.percent) !== Number(draft.row.statutory_rate_percent) ? (
                      <button
                        type="button" className="text-primary underline-offset-2 hover:underline"
                        onClick={() => setDraft((d) => d && ({ ...d, percent: String(d.row.statutory_rate_percent) }))}
                      >
                        Use the statutory {formatRate(draft.row.statutory_rate_percent)}
                      </button>
                    ) : undefined}
                  >
                    <Input
                      type="number" step="0.001" min="0" max="100" value={draft.percent}
                      onChange={(e) => setDraft((d) => d && ({ ...d, percent: e.target.value }))}
                    />
                  </FormField>
                  <FormField
                    label="Applies From"
                    hint={draft.row.history_count === 0
                      ? `First entry: from ${draft.row.statutory_effective_from ?? 'the start'}, when the rate took effect, so every asset you own is covered.`
                      : 'Usually 1 January of the first tax year the new rate applies to.'}
                  >
                    <Input
                      type="date" value={draft.from}
                      onChange={(e) => setDraft((d) => d && ({ ...d, from: e.target.value }))}
                    />
                  </FormField>
                </FormGrid>
                <FormField label="Confirmed Against" optional>
                  <Input
                    placeholder="e.g. checked with our accountant, Nov 2026"
                    value={draft.note}
                    onChange={(e) => setDraft((d) => d && ({ ...d, note: e.target.value }))}
                  />
                </FormField>
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={draft.confirmed}
                    onCheckedChange={(v) => setDraft((d) => d && ({ ...d, confirmed: v === true }))}
                    className="mt-0.5"
                  />
                  <span>This rate is confirmed by our accountant. Leave unticked to save it as not confirmed yet.</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  A later date adds a new rate and keeps the old one for earlier years. The same date as an
                  existing entry corrects that entry.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
                <Button onClick={save} disabled={busy || draft.percent === '' || !draft.from}>
                  {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save rate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
