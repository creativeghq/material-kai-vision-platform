import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import { formatMoney, parseDecimal } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import {
  financeService,
  type PlannedPaymentCategory, type RecurringCadence, type RecurringExpense,
} from '@/modules/finance/services/financeService';
import { financeCategoriesService } from '@/modules/finance/services/financeCategoriesService';

const CADENCES: RecurringCadence[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const PLAN_CATEGORIES: PlannedPaymentCategory[] = [
  'rent', 'utility', 'tax', 'salary', 'loan', 'supplier_bill', 'expense', 'other',
];

const cadenceLabel = (c: RecurringCadence, every: number) =>
  every > 1 ? `Every ${every} ${c.replace('ly', '')}s` : humanizeLabel(c);

/**
 * Money that leaves on a schedule and was being typed in every month.
 *
 * The SAME templates the Expenses tab creates; the difference is what a due run produces. Here it
 * is a planned payment — a reminder that books nothing until someone settles it. Expenses asks for
 * a supplier bill instead, a real cost with no human in it, so that choice is made only there.
 */
export const RecurringPlansCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const { canOperateFinance } = usePermissions();
  const [rows, setRows] = useState<RecurringExpense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [category, setCategory] = useState<PlannedPaymentCategory>('rent');
  const [cadence, setCadence] = useState<RecurringCadence>('monthly');
  const [every, setEvery] = useState('1');
  const [startOn, setStartOn] = useState(todayLocalISO);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setRows(await financeService.listRecurringExpenses(workspaceId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Deliberately NOT cleared: an empty list under an error strip reads as "you have none",
      // and the way out of that is a create button that makes a duplicate of what is already there.
      setRows((prev) => prev ?? []);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  // Only the plan-producing templates. The bill ones belong to Expenses, where they are created.
  const plans = useMemo(() => (rows ?? []).filter((r) => r.creates === 'plan'), [rows]);

  const create = async () => {
    const parsed = parseDecimal(amount);
    if (parsed == null || parsed <= 0) {
      toast({ title: 'Amount must be positive', variant: 'destructive' }); return;
    }
    if (!title.trim()) {
      toast({ title: 'Give it a name', description: 'e.g. "Office rent".', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      // A finance category is required by the table; a plan does not use it, so the workspace's
      // own default expense category stands in rather than asking for an answer nobody needs.
      const cats = await financeCategoriesService.list(workspaceId).catch(() => []);
      const fallback = cats.find((c) => !c.is_system && (c.kind === 'expense' || c.kind === 'both'))
        ?? cats.find((c) => c.kind === 'expense' || c.kind === 'both')
        ?? cats[0];
      if (!fallback) {
        throw new Error('Add an expense category first, in Finance → Settings.');
      }
      await financeService.createRecurringExpense({
        workspaceId,
        creates: 'plan',
        planCategory: category,
        categoryId: fallback.id,
        description: title.trim(),
        currency,
        subtotalNet: parsed,
        vatAmount: 0,
        cadence,
        intervalCount: Math.max(1, Math.round(Number(every)) || 1),
        dueDays: 0,
        nextRunAt: startOn,
      });
      toast({ title: 'Recurring plan added', description: `The next one appears on ${formatDate(startOn)}.` });
      setOpen(false);
      setTitle(''); setAmount('');
      await load();
    } catch (e) {
      toast({ title: 'Could not add it', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: RecurringExpense) => {
    setBusy(r.id);
    try {
      await financeService.setRecurringExpenseActive(r.id, !r.is_active);
      await load();
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const remove = async (r: RecurringExpense) => {
    if (!window.confirm(
      `Remove "${r.description ?? 'this recurring plan'}"? It stops creating planned payments. `
      + 'The ones it already created are kept.',
    )) return;
    setBusy(r.id);
    try {
      await financeService.deleteRecurringExpense(r.id);
      toast({ title: 'Removed', description: 'Plans it already created are untouched.' });
      await load();
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (rows === null) return null;

  return (
    <>
      <Card>
        <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Repeat className="h-4 w-4 text-muted-foreground" /> Recurring
            </CardTitle>
            <p className="pt-1 text-[11px] text-muted-foreground">
              Money that leaves on a schedule. Each one appears as a planned payment when it falls
              due — nothing is booked and no money moves until you settle it.
            </p>
          </div>
          {canOperateFinance && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add recurring
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
              <span>Could not read them — <span className="opacity-80">{error}</span>.</span>
              <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
            </div>
          )}
          {error ? null : plans.length === 0 ? (
            <HubEmptyState
              icon={Repeat}
              title="Nothing recurring yet"
              description="Rent, utilities, an accountant's retainer — anything that leaves on a schedule. Add it once and it shows up in Planning each period instead of being typed again."
              action={canOperateFinance
                ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add recurring</Button>
                : undefined}
            />
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <tr className="border-b border-hairline">
                    <th className="px-4 py-2 text-left">What</th>
                    <th className="px-4 py-2 text-left">How often</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Next</th>
                    <th className="px-4 py-2 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((r) => (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.description ?? '—'}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {humanizeLabel(r.plan_category)}
                          {!r.is_active && ' · paused'}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">{cadenceLabel(r.cadence, r.interval_count)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {formatMoney(Number(r.subtotal_net) + Number(r.vat_amount), r.currency)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {r.is_active ? formatDate(r.next_run_at) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {canOperateFinance && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0"
                              disabled={busy === r.id}
                              title={r.is_active ? 'Pause — it stops creating plans' : 'Resume'}
                              onClick={() => void toggle(r)}
                            >
                              {busy === r.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : r.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              disabled={busy === r.id}
                              title="Remove — plans it already created are kept"
                              onClick={() => void remove(r)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a recurring plan</DialogTitle>
            <DialogDescription>
              It creates a planned payment each period. Nothing is booked and no money moves until
              you settle it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-title">What is it</Label>
              <Input id="rec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Office rent" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rec-amount">Amount</Label>
                <Input id="rec-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['EUR', 'USD', 'GBP'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bucket</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as PlannedPaymentCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLAN_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{humanizeLabel(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-start">First one on</Label>
                <Input id="rec-start" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>How often</Label>
                <Select value={cadence} onValueChange={(v) => setCadence(v as RecurringCadence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CADENCES.map((c) => <SelectItem key={c} value={c}>{humanizeLabel(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-every">Every</Label>
                <Input id="rec-every" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void create()} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
