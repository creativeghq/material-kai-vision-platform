/**
 * The tax basis alongside the book one, and the difference between them (#451).
 *
 * Greek tax depreciation is a statutory RATE on acquisition cost by category — not a useful life
 * anybody chooses — so it cannot be expressed in `useful_life_months` without back-computing a life
 * that goes silently wrong the day the rate changes. The rate therefore lives here, against a date.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, Scale, Save, Calculator } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  taxDepreciationService, TAX_STATUS_LABEL, TAX_RATE_STATUS_LABEL,
  rateIsConfirmed, rateNeedsAttention, taxBasisIsUnknown, differenceIsReportable,
  ADJUSTMENT_DOCUMENT, LEGAL_BASIS,
  type TaxRateRow, type BasisDifference,
} from '@/modules/finance/services/taxDepreciationService';

interface Props {
  workspaceId: string | null;
  canManage?: boolean;
}

export const TaxDepreciationCard: React.FC<Props> = ({ workspaceId, canManage = true }) => {
  const { toast } = useToast();
  const [rates, setRates] = useState<TaxRateRow[]>([]);
  const [diff, setDiff] = useState<BasisDifference | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    code: '', percent: '', from: `${new Date().getFullYear()}-01-01`, note: '',
  });

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

  const save = async () => {
    if (!workspaceId || !draft.code || draft.percent === '') return;
    setBusy(true);
    try {
      await taxDepreciationService.recordRate({
        workspaceId,
        categoryCode: draft.code,
        ratePercent: Number(draft.percent),
        effectiveFrom: draft.from,
        sourceNote: draft.note || null,
        confirmedOn: todayLocalISO(),
      });
      setDraft((d) => ({ ...d, code: '', percent: '', note: '' }));
      await load();
      toast({ title: 'Rate recorded', description: 'It applies from the date you gave, and leaves earlier years on the rate they were filed under.' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the rate',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-primary" /> Tax depreciation ({LEGAL_BASIS})
        </CardTitle>
        <CardDescription>
          The book basis above is useful life and salvage. The tax basis is a statutory percentage
          of cost per category, and the two legitimately differ — that difference is the adjustment
          on the income-tax return, not an error.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading both bases…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The tax basis could not be read just now. That is not a statement that the two bases
            agree.
          </p>
        )}

        {!loading && !failed && (
          <>
            {unconfirmed.length > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {unconfirmed.length} categor{unconfirmed.length === 1 ? 'y has' : 'ies have'} assets
                on the register and no confirmed rate. Confirm the percentage with the accountant —
                a rate nobody confirmed is a number somebody typed.
              </p>
            )}

            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statutory category</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell>
                        <span className="font-medium">{r.label_en}</span>
                        <span className="block text-[11px] text-muted-foreground">{r.label_el}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.rate_percent != null ? `${r.rate_percent}%` : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">{r.effective_from ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={rateIsConfirmed(r) ? 'success' : r.rate_percent != null ? 'warning' : 'neutral'}>
                          {TAX_RATE_STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.asset_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {canManage && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
                <div>
                  <Label htmlFor="tax-cat" className="text-[11px]">Category</Label>
                  <Select value={draft.code} onValueChange={(v) => setDraft((d) => ({ ...d, code: v }))}>
                    <SelectTrigger id="tax-cat" className="mt-1 h-8 w-64 text-xs">
                      <SelectValue placeholder="Pick a statutory category" />
                    </SelectTrigger>
                    <SelectContent>
                      {rates.map((r) => (
                        <SelectItem key={r.code} value={r.code}>{r.label_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tax-pct" className="text-[11px]">Rate %</Label>
                  <Input
                    id="tax-pct" type="number" step="0.001" min="0" max="100"
                    className="mt-1 h-8 w-24 text-xs" value={draft.percent}
                    onChange={(e) => setDraft((d) => ({ ...d, percent: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="tax-from" className="text-[11px]">Effective from</Label>
                  <Input
                    id="tax-from" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.from}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="tax-src" className="text-[11px]">Confirmed against</Label>
                  <Input
                    id="tax-src" className="mt-1 h-8 w-56 text-xs" placeholder="who confirmed it, and from what"
                    value={draft.note}
                    onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  />
                </div>
                <Button size="sm" onClick={save} disabled={busy || !draft.code || draft.percent === ''}>
                  <Save className="mr-1 h-3 w-3" /> Record rate
                </Button>
              </div>
            )}

            {diff && (
              <div className="space-y-1 rounded-md border border-hairline bg-surface-sunken p-2 text-xs">
                <p className="flex items-center gap-2 font-medium">
                  <Calculator className="h-3.5 w-3.5" />
                  {differenceIsReportable(diff)
                    ? `Book ${diff.book_total} · tax ${diff.tax_total} · adjustment ${diff.difference}`
                    : 'No adjustment derivable yet'}
                </p>
                <p className="text-muted-foreground">{diff.reason}</p>
                {differenceIsReportable(diff) && (
                  <p className="text-muted-foreground">{ADJUSTMENT_DOCUMENT}</p>
                )}
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
    </Card>
  );
};
