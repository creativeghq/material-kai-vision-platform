/**
 * Expenses booked against this project (#285).
 *
 * Two ways in, both from inside the job:
 *   · Add — books a new claim straight onto this project.
 *   · Link — pulls an existing unattributed claim onto it. That list is where imported card
 *     spend shows up (the Revolut feed materialises into trip_expense_items), so a fetched
 *     charge gets attached here rather than being re-keyed.
 *
 * The claim itself still lives in Expenses and still goes through the normal approval — this
 * panel never approves anything. Only APPROVED claims count towards job cost; pending ones are
 * shown so they are visible without moving the margin.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Link2, Link2Off, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { parseDecimal } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import {
  tripExpenseService, TRIP_EXPENSE_CATEGORIES, type TripExpenseItem,
} from '@/modules/finance/services/tripExpenseService';

const money = (n: number | null | undefined, c: string | null | undefined) => formatMoney(n, c ?? 'EUR');

const approvalTone = (s: string) =>
  s === 'approved' ? 'text-emerald-400' : s === 'rejected' ? 'text-destructive' : 'text-amber-400';

export const ProjectExpensesCard: React.FC<{
  projectId: string;
  projectName: string;
  workspaceId: string;
  onChanged?: () => void;
}> = ({ projectId, projectName, workspaceId, onChanged }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<TripExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setItems(await tripExpenseService.listByProject(projectId)); }
    catch (err: any) { toast({ title: 'Failed to load expenses', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    let approved = 0, pending = 0;
    for (const i of items) {
      if (i.approval_status === 'approved') approved += Number(i.amount);
      else if (i.approval_status === 'pending') pending += Number(i.amount);
    }
    return { approved, pending };
  }, [items]);

  const refresh = async () => { await load(); onChanged?.(); };

  const unlink = async (item: TripExpenseItem) => {
    if (!confirm('Remove this expense from the project? The claim itself is kept.')) return;
    try { await tripExpenseService.assignToProject(item.id, null); await refresh(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-white/8 px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Receipt className="h-4 w-4 text-primary" /> Expenses
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {money(totals.approved, 'EUR')} approved
            {totals.pending > 0 && <> · {money(totals.pending, 'EUR')} awaiting approval</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setLinking(true)}>
            <Link2 className="h-3.5 w-3.5 mr-1" /> Link existing
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add expense
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing booked to this project yet.
          </p>
        ) : (
          <div className="divide-y divide-white/8">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-4">
                <div className="w-20 shrink-0 text-xs text-muted-foreground">{i.expense_date}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{i.description || humanizeLabel(i.category || 'expense')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {i.vendor ? `${i.vendor} · ` : ''}{humanizeLabel(i.category || '')}
                    {i.billable && <> · rebillable</>}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] ${approvalTone(i.approval_status)}`}>
                  {humanizeLabel(i.approval_status)}
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">{money(Number(i.amount), i.currency)}</span>
                <button
                  type="button" title="Remove from project"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => unlink(i)}
                >
                  <Link2Off className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {adding && (
        <AddProjectExpenseDialog
          projectId={projectId} projectName={projectName} workspaceId={workspaceId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); void refresh(); }}
        />
      )}
      {linking && (
        <LinkExpenseDialog
          projectId={projectId} workspaceId={workspaceId}
          onClose={() => setLinking(false)}
          onLinked={() => { setLinking(false); void refresh(); }}
        />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const AddProjectExpenseDialog: React.FC<{
  projectId: string; projectName: string; workspaceId: string;
  onClose: () => void; onSaved: () => void;
}> = ({ projectId, projectName, workspaceId, onClose, onSaved }) => {
  const { toast } = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<string>('transport');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [billable, setBillable] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseDecimal(amount);
    if (!amt || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      // Every claim needs a card to sit on; one per project is reused rather than created per
      // expense, so the reviewer sees a single card instead of a queue of one-line cards.
      const reportId = await tripExpenseService.ensureProjectCard(workspaceId, projectId, projectName);
      await tripExpenseService.addItem({
        report_id: reportId,
        expense_date: date,
        category,
        description: description.trim() || null,
        vendor: vendor.trim() || null,
        amount: amt,
        billable,
        project_id: projectId,
      });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Could not add expense', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add an expense to this project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (incl. VAT)</Label>
              <Input inputMode="decimal" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
              value={category} onChange={(e) => setCategory(e.target.value)}>
              {TRIP_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{humanizeLabel(c)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Taxi to site" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billable} onCheckedChange={(v) => setBillable(!!v)} />
            Rebillable to the client
          </label>
          <p className="text-[11px] text-muted-foreground">
            Counts towards this project&apos;s cost once approved in Expenses — whether or not it is
            rebillable.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add expense'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LinkExpenseDialog: React.FC<{
  projectId: string; workspaceId: string; onClose: () => void; onLinked: () => void;
}> = ({ projectId, workspaceId, onClose, onLinked }) => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<TripExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setCandidates(await tripExpenseService.listUnassigned(workspaceId)); }
      catch (err: any) { toast({ title: 'Failed to load expenses', description: err?.message, variant: 'destructive' }); }
      finally { setLoading(false); }
    })();
  }, [workspaceId, toast]);

  const link = async (item: TripExpenseItem) => {
    setBusy(item.id);
    try { await tripExpenseService.assignToProject(item.id, projectId); onLinked(); }
    catch (err: any) {
      toast({ title: 'Could not link', description: err?.message, variant: 'destructive' });
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Link an existing expense</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No unassigned expenses. Imported card spend appears here once it lands.
          </p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border border-white/10 divide-y divide-white/8">
            {candidates.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-3">
                <div className="w-20 shrink-0 text-xs text-muted-foreground">{c.expense_date}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{c.description || humanizeLabel(c.category || 'expense')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.vendor ? `${c.vendor} · ` : ''}{humanizeLabel(c.approval_status)}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-sm">{money(Number(c.amount), c.currency)}</span>
                <Button size="sm" className="rounded-full" onClick={() => link(c)} disabled={busy === c.id}>
                  {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Link'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProjectExpensesCard;
