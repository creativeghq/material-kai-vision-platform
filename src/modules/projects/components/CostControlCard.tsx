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

const KINDS: Array<{ kind: CostLineKind; label: string }> = [
  { kind: 'supplier_bills', label: 'Supplier bills' },
  { kind: 'purchase_orders', label: 'Purchase orders' },
  { kind: 'expenses', label: 'Expenses' },
  { kind: 'time', label: 'Time entries' },
  { kind: 'invoices', label: 'Invoices' },
];

const rowName = (r: CostControlRow) => [r.code, r.name].filter(Boolean).join(' · ') || 'Uncoded';

export const CostControlCard: React.FC<{
  projectId: string;
  currency?: string;
  reloadToken?: number;
}> = ({ projectId, currency = 'EUR', reloadToken }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<CostControlRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<CostControlRow | null>(null);
  const [lines, setLines] = useState<{ kind: CostLineKind; rows: CostLine[] } | null>(null);
  const [loadingKind, setLoadingKind] = useState<CostLineKind | null>(null);
  const money = (v: number) => formatMoney(v, currency);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setRows(await projectsService.getCostControl(projectId));
    } catch (e) {
      toast({ title: 'Failed to load cost control', description: (e as Error).message, variant: 'destructive' });
      setFailed(true);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load, reloadToken]);

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

  const totals = (rows ?? []).reduce(
    (t, r) => ({
      budget: t.budget + r.budget_cost,
      actual: t.actual + r.actual_cost,
      forecast: t.forecast + r.forecast_cost,
    }),
    { budget: 0, actual: 0, forecast: 0 },
  );

  return (
    <Card className="dashboard-card">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 font-medium"><Target className="h-4 w-4 text-primary" />Cost control</CardTitle>
        <p className="text-xs text-muted-foreground">
          Budget, actual and forecast cost per cost code. Estimate to complete defaults to what is left of the budget,
          or the open purchase orders if those are larger; set it by hand to override.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">Cost control could not be loaded. Its figures are unknown, not zero.</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : rows === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            title="No costs or budgets yet"
            description="Tag bills, orders or variations with a cost code, or set a budget for a code, and it appears here."
            action={(
              <Button size="sm" onClick={() => setEditing({
                cost_code_id: null, code: null, name: null, total_value: 0, budget_cost: 0, actual_cost: 0,
                committed_cost: 0, etc_override: null, etc_effective: 0, forecast_cost: 0, variance: null,
              })}>Set an overall budget</Button>
            )}
          />
        ) : (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cost code</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">On order</TableHead>
                  <TableHead className="text-right">To complete</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.cost_code_id ?? 'uncoded'}>
                    <TableCell>{rowName(r)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.budget_cost > 0 ? money(r.budget_cost) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.actual_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.committed_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(r.etc_effective)}{r.etc_override !== null && <span className="text-xs text-muted-foreground"> set</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.forecast_cost)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.variance !== null && r.variance < 0 ? 'text-destructive' : ''}`}>
                      {r.variance === null ? '—' : money(r.variance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" title="Set budget" onClick={() => setEditing(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{totals.budget > 0 ? money(totals.budget) : '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(totals.actual)}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-medium tabular-nums">{money(totals.forecast)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {totals.budget > 0 ? money(totals.budget - totals.forecast) : '—'}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
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
                    <TableHead className="text-right">{lines?.kind === 'time' ? 'Hours' : 'Net amount'}</TableHead>
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
        <DialogHeader><DialogTitle>Budget — {rowName(row)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Cost budget, net of VAT</Label>
            <Input type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Estimate to complete (optional)</Label>
            <Input type="number" min={0} step="0.01" value={etc} onChange={(e) => setEtc(e.target.value)} className="mt-1"
              placeholder="Leave empty to derive it" />
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
