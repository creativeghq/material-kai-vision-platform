/** Per-cost-code cost control, with the CVR's value and margin beside it when the job reports CVR. */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import { useToast } from '@/hooks/use-toast';
import {
  projectsService,
  type CostControlRow,
  type CostLine,
  type CostLineKind,
} from '../services/projectsService';
import { variationsService, type CvrRow } from '../services/variationsService';

const KINDS: Array<{ kind: CostLineKind; label: string }> = [
  { kind: 'supplier_bills', label: 'Supplier Bills' },
  { kind: 'purchase_orders', label: 'Purchase Orders' },
  { kind: 'expenses', label: 'Expenses' },
  { kind: 'time', label: 'Time Entries' },
  { kind: 'invoices', label: 'Invoices' },
];

const n = (v: number | string | null | undefined) => Number(v ?? 0);
const keyOf = (id: string | null) => id ?? 'uncoded';
const rowName = (r: CostControlRow) => [r.code, r.name].filter(Boolean).join(' · ') || 'Not coded';
const marginTone = (v: number) => (v < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400');

const OVERALL_BUDGET: CostControlRow = {
  cost_code_id: null, code: null, name: null, total_value: 0, budget_cost: 0, actual_cost: 0,
  committed_cost: 0, etc_override: null, etc_effective: 0, forecast_cost: 0, variance: null,
};

export const CostCodesCard: React.FC<{
  projectId: string;
  currency: string;
  showCvr: boolean;
}> = ({ projectId, currency, showCvr }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<CostControlRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cvr, setCvr] = useState<CvrRow[] | null | 'failed'>(null);
  const [editing, setEditing] = useState<CostControlRow | null>(null);
  const [lines, setLines] = useState<{ kind: CostLineKind; rows: CostLine[] } | null>(null);
  const [loadingKind, setLoadingKind] = useState<CostLineKind | null>(null);
  const money = (v: number | string | null | undefined) => formatMoney(n(v), currency);

  const load = useCallback(async () => {
    setFailed(false);
    const [control, value] = await Promise.allSettled([
      projectsService.getCostControl(projectId),
      variationsService.cvr(projectId),
    ]);
    if (control.status === 'fulfilled') setRows(control.value);
    else {
      setFailed(true);
      toast({ title: 'Failed to load cost codes', description: (control.reason as Error)?.message, variant: 'destructive' });
    }
    setCvr(value.status === 'fulfilled' ? value.value : 'failed');
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  const openLines = async (kind: CostLineKind) => {
    setLoadingKind(kind);
    try {
      setLines({ kind, rows: await projectsService.getCostLines(projectId, kind) });
    } catch (e) {
      toast({ title: 'Failed to load the detail', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoadingKind(null);
    }
  };

  const cvrRows = Array.isArray(cvr) ? cvr : [];
  const cvrByCode = new Map(cvrRows.map((c) => [keyOf(c.cost_code_id), c]));
  const withCvr = showCvr && Array.isArray(cvr);
  const anyPending = cvrRows.some((c) => n(c.pending_cost) > 0);
  const uncoded = cvrRows.find((c) => c.cost_code_id === null);

  // Sums of the SQL's own per-row figures; no row is rebuilt from its parts.
  const totals = (rows ?? []).reduce(
    (t, r) => ({
      budget: t.budget + r.budget_cost,
      actual: t.actual + r.actual_cost,
      committed: t.committed + r.committed_cost,
      forecast: t.forecast + r.forecast_cost,
    }),
    { budget: 0, actual: 0, committed: 0, forecast: 0 },
  );
  const cvrTotals = cvrRows.reduce(
    (t, c) => ({ value: t.value + n(c.total_value), margin: t.margin + n(c.margin), pending: t.pending + n(c.pending_cost) }),
    { value: 0, margin: 0, pending: 0 },
  );

  return (
    <Card className="dashboard-card">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 font-medium"><Target className="h-4 w-4 text-primary" />Cost codes</CardTitle>
        <p className="text-xs text-muted-foreground">
          Budget, spent, on order and forecast per cost code, net of VAT. To complete defaults to what is left of the
          budget, or the open purchase orders if larger; set it by hand to override.
          {showCvr && ' Value is accepted quotes plus approved client variations; margin also deducts approved subcontractor variations.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">Cost codes could not be loaded. Their figures are unknown, not zero.</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : rows === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={Target}
            title="No costs or budgets yet"
            description="Set a budget, or tag bills, orders and time with a cost code, and it appears here."
            action={<Button size="sm" onClick={() => setEditing(OVERALL_BUDGET)}>Set budget</Button>}
          />
        ) : (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cost Code</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">On Order</TableHead>
                  {anyPending && <TableHead className="text-right">Draft Orders</TableHead>}
                  <TableHead className="text-right">To Complete</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right">Budget Variance</TableHead>
                  {withCvr && <TableHead className="text-right">Value</TableHead>}
                  {withCvr && <TableHead className="text-right">Margin</TableHead>}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const c = cvrByCode.get(keyOf(r.cost_code_id));
                  return (
                    <TableRow key={keyOf(r.cost_code_id)}>
                      <TableCell className="max-w-[20rem] break-words">
                        {r.cost_code_id === null
                          ? <span className="text-amber-800 dark:text-amber-300">Not coded</span>
                          : rowName(r)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.budget_cost > 0 ? money(r.budget_cost) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.actual_cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.committed_cost)}</TableCell>
                      {anyPending && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {c && n(c.pending_cost) > 0 ? money(c.pending_cost) : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {money(r.etc_effective)}{r.etc_override !== null && <span className="text-xs text-muted-foreground"> set</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.forecast_cost)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${r.variance !== null && r.variance < 0 ? 'text-destructive' : ''}`}>
                        {r.variance === null ? '—' : money(r.variance)}
                      </TableCell>
                      {withCvr && <TableCell className="text-right tabular-nums">{c && n(c.total_value) ? money(c.total_value) : '—'}</TableCell>}
                      {withCvr && (
                        <TableCell className={`text-right tabular-nums ${c ? marginTone(n(c.margin)) : ''}`}>
                          {c ? money(c.margin) : '—'}
                          {c && c.margin_pct !== null && (
                            <span className="ml-1 text-[11px] text-muted-foreground">{n(c.margin_pct).toFixed(1)}%</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" title="Set budget" aria-label="Set budget" onClick={() => setEditing(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-surface-sunken">
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{totals.budget > 0 ? money(totals.budget) : '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(totals.actual)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(totals.committed)}</TableCell>
                  {anyPending && <TableCell className="text-right tabular-nums text-muted-foreground">{money(cvrTotals.pending)}</TableCell>}
                  <TableCell />
                  <TableCell className="text-right font-medium tabular-nums">{money(totals.forecast)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {totals.budget > 0 ? money(totals.budget - totals.forecast) : '—'}
                  </TableCell>
                  {withCvr && <TableCell className="text-right font-medium tabular-nums">{money(cvrTotals.value)}</TableCell>}
                  {withCvr && <TableCell className={`text-right font-medium tabular-nums ${marginTone(cvrTotals.margin)}`}>{money(cvrTotals.margin)}</TableCell>}
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        {showCvr && cvr === 'failed' && !failed && (
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Value and margin per cost code could not be loaded. They are unknown, not zero.
          </p>
        )}
        {anyPending && (
          <p className="text-xs text-muted-foreground">
            Draft orders are purchase orders nobody has approved. They are shown and NOT added to On Order or
            Forecast — an order nobody has approved is not yet a spend.
          </p>
        )}
        {uncoded && (n(uncoded.total_value) > 0 || n(uncoded.total_cost) > 0) && (
          <p className="text-xs text-muted-foreground">
            {money(uncoded.total_value)} of value and {money(uncoded.total_cost)} of cost carry no cost code, so they are
            not attributed to any part of the job. Code the quote lines, bills and timesheets to move them.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <span className="text-xs text-muted-foreground">Behind the numbers:</span>
          {KINDS.map((k) => (
            <Button key={k.kind} size="sm" variant="outline" disabled={loadingKind !== null} onClick={() => void openLines(k.kind)}>
              {loadingKind === k.kind && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{k.label}
            </Button>
          ))}
        </div>
      </CardContent>

      {editing && (
        <BudgetDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (budget, etc) => {
            await projectsService.setCostBudget(projectId, editing.cost_code_id, budget, etc);
            setEditing(null);
            await load();
          }}
        />
      )}

      <Dialog open={lines !== null} onOpenChange={(v) => { if (!v) setLines(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{KINDS.find((k) => k.kind === lines?.kind)?.label}</DialogTitle>
          </DialogHeader>
          {lines && lines.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing recorded against this project.</p>
          ) : (
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">{lines?.kind === 'time' ? 'Hours' : 'Net Amount'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines?.rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.date ? formatDate(l.date) : '—'}</TableCell>
                      <TableCell>{l.label}</TableCell>
                      <TableCell>{l.counterparty ?? '—'}</TableCell>
                      <TableCell>{l.status ? humanizeLabel(l.status) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {lines.kind === 'time' ? (l.hours ?? 0) : l.amount == null ? '—' : formatMoney(l.amount, l.currency ?? currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const BudgetDialog: React.FC<{
  row: CostControlRow;
  onClose: () => void;
  onSave: (budget: number, etc: number | null) => Promise<void>;
}> = ({ row, onClose, onSave }) => {
  const { toast } = useToast();
  const [budget, setBudget] = useState(String(row.budget_cost || ''));
  const [etc, setEtc] = useState(row.etc_override === null ? '' : String(row.etc_override));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const b = Number(budget || 0);
    const e = etc.trim() === '' ? null : Number(etc);
    if (!Number.isFinite(b) || b < 0 || (e !== null && (!Number.isFinite(e) || e < 0))) {
      toast({ title: 'Enter amounts of zero or more', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await onSave(b, e);
    } catch (err) {
      toast({ title: 'Could not save the budget', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Budget — {row.cost_code_id === null ? 'Overall / Not Coded' : rowName(row)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Cost Budget, Net of VAT</Label>
            <Input type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Estimate to Complete (optional)</Label>
            <Input type="number" min={0} step="0.01" value={etc} onChange={(e) => setEtc(e.target.value)} className="mt-1" />
            <p className="mt-1 text-[11px] text-muted-foreground">Leave empty to derive it.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
