import React, { useEffect, useMemo, useState } from 'react';
import { Plus, CheckCircle2, X, Bell, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  financeService, formatMoney, type PlannedPayment,
} from '@/modules/finance/services/financeService';
import { NewPlannedPaymentDialog } from '@/modules/finance/components/NewPlannedPaymentDialog';
import { humanizeLabel } from '@/utils/humanize';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

interface Props { workspaceId: string }

export const PlanningTab: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PlannedPayment[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'all' | 'paid' | 'overdue' | 'incoming' | 'outgoing'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => { void load(); }, [workspaceId, filter]);

  const load = async () => {
    try {
      setLoading(true);
      const filterStatus: ('planned' | 'overdue' | 'paid' | 'cancelled')[] | undefined =
        filter === 'all' ? undefined :
        filter === 'paid' ? ['paid'] :
        filter === 'overdue' ? ['overdue'] :
        filter === 'incoming' || filter === 'outgoing' || filter === 'upcoming' ? ['planned', 'overdue'] :
        undefined;
      const direction = filter === 'incoming' ? 'in' : filter === 'outgoing' ? 'out' : undefined;
      const data = await financeService.listPlannedPayments({
        workspaceId, status: filterStatus, direction,
      });
      setRows(data);
    } catch (err: any) {
      toast({ title: 'Load failed', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const buckets = { overdue: [] as PlannedPayment[], today: [] as PlannedPayment[], next7: [] as PlannedPayment[], next30: [] as PlannedPayment[], later: [] as PlannedPayment[] };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      const d = new Date(r.scheduled_for);
      const diff = Math.floor((d.getTime() - today.getTime()) / 86_400_000);
      if (r.status === 'paid' || r.status === 'cancelled') continue;
      if (diff < 0) buckets.overdue.push(r);
      else if (diff === 0) buckets.today.push(r);
      else if (diff <= 7) buckets.next7.push(r);
      else if (diff <= 30) buckets.next30.push(r);
      else buckets.later.push(r);
    }
    return buckets;
  }, [rows]);

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of rows) {
      if (r.status !== 'planned' && r.status !== 'overdue') continue;
      if (r.direction === 'in') inSum += Number(r.amount);
      else outSum += Number(r.amount);
    }
    return { inSum, outSum, net: inSum - outSum };
  }, [rows]);

  const markPaid = async (row: PlannedPayment) => {
    try {
      setMarkingId(row.id);
      await financeService.markPlannedPaymentPaid(row);
      toast({ title: 'Marked as paid', description: 'A payment record was created and allocated.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setMarkingId(null);
    }
  };

  const cancel = async (row: PlannedPayment) => {
    try {
      await financeService.updatePlannedPayment(row.id, { status: 'cancelled' });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Planning</h3>
          <p className="text-xs text-muted-foreground">Scheduled future payments and expected receipts. Marking Paid creates a real payment + allocation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming (open)</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="incoming">Incoming only</SelectItem>
              <SelectItem value="outgoing">Outgoing only</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add planned payment</Button>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Expected in</div>
          <div className="text-lg font-semibold text-emerald-500">{formatMoney(totals.inSum)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Planned out</div>
          <div className="text-lg font-semibold text-red-400">{formatMoney(totals.outSum)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Net planned</div>
          <div className={`text-lg font-semibold ${totals.net < 0 ? 'text-destructive' : ''}`}>{formatMoney(totals.net)}</div>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No planned payments. Click "Add planned payment" to schedule one.
        </CardContent></Card>
      ) : (filter === 'upcoming' || filter === 'overdue') ? (
        <div className="space-y-4">
          {grouped.overdue.length > 0 && <Section title="Overdue" rows={grouped.overdue} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} accent="destructive" />}
          {grouped.today.length > 0 && <Section title="Due today" rows={grouped.today} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
          {grouped.next7.length > 0 && <Section title="Next 7 days" rows={grouped.next7} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
          {grouped.next30.length > 0 && <Section title="Next 30 days" rows={grouped.next30} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
          {grouped.later.length > 0 && <Section title="Later" rows={grouped.later} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
        </div>
      ) : (
        /* keyed on the filter so switching it remounts the table at page 1 */
        <FlatTable key={filter} rows={rows} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />
      )}

      <NewPlannedPaymentDialog
        workspaceId={workspaceId} open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={async () => { setNewOpen(false); await load(); }}
      />
    </div>
  );
};

const Section: React.FC<{
  title: string; rows: PlannedPayment[];
  onMarkPaid: (r: PlannedPayment) => void; onCancel: (r: PlannedPayment) => void;
  markingId: string | null; accent?: 'destructive';
}> = ({ title, rows, onMarkPaid, onCancel, markingId, accent }) => (
  <Card className={accent === 'destructive' ? 'border-destructive/40' : ''}>
    <CardHeader className="border-b border-border/60 px-5 py-2">
      <CardTitle className={`text-xs font-semibold ${accent === 'destructive' ? 'text-destructive' : ''}`}>{title} · {rows.length}</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <FlatTable rows={rows} onMarkPaid={onMarkPaid} onCancel={onCancel} markingId={markingId} />
    </CardContent>
  </Card>
);

const FlatTable: React.FC<{
  rows: PlannedPayment[];
  onMarkPaid: (r: PlannedPayment) => void; onCancel: (r: PlannedPayment) => void;
  markingId: string | null;
}> = ({ rows, onMarkPaid, onCancel, markingId }) => {
  // Each bucket (Overdue / Today / Next 7 …) renders its own FlatTable, so each keeps its
  // own page — paging "Later" must not move you off the overdue rows you're clearing.
  const [page, setPage] = useState(1);
  // Marking a row paid or cancelled removes it from this bucket.
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);
  return (
  <>
  <table className="w-full text-sm">
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b border-border/60">
        <th className="px-4 py-2 text-left">Title</th>
        <th className="px-4 py-2 text-left">Category</th>
        <th className="px-4 py-2 text-left">Direction</th>
        <th className="px-4 py-2 text-right">Amount</th>
        <th className="px-4 py-2 text-right">Date</th>
        <th className="px-4 py-2 text-right">Reminder</th>
        <th className="px-4 py-2 text-right">Status</th>
        <th className="px-4 py-2 text-right" />
      </tr>
    </thead>
    <tbody>
      {paginate(rows, page).map((r) => (
        <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
          <td className="px-4 py-2"><div className="font-medium">{r.title}</div>{r.notes && <div className="text-[10px] text-muted-foreground line-clamp-1">{r.notes}</div>}</td>
          <td className="px-4 py-2 text-xs text-muted-foreground">{r.category}</td>
          <td className="px-4 py-2">{r.direction === 'in' ? <Badge variant="default" className="text-[10px]">In</Badge> : <Badge variant="outline" className="text-[10px]">Out</Badge>}</td>
          <td className={`px-4 py-2 text-right font-medium ${r.direction === 'out' ? 'text-red-400' : 'text-emerald-500'}`}>{formatMoney(Number(r.amount), r.currency)}</td>
          <td className="px-4 py-2 text-right">{r.scheduled_for}</td>
          <td className="px-4 py-2 text-right">{r.reminder_at ? <span className="inline-flex items-center gap-1 text-xs"><Bell className="h-3 w-3" /> {r.reminder_at}</span> : '—'}</td>
          <td className="px-4 py-2 text-right"><Badge variant={r.status === 'overdue' ? 'destructive' : r.status === 'paid' ? 'default' : 'outline'} className="text-[10px]">{humanizeLabel(r.status)}</Badge></td>
          <td className="px-4 py-2 text-right">
            {r.status === 'planned' || r.status === 'overdue' ? (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" disabled={markingId === r.id} onClick={() => onMarkPaid(r)} title="Mark paid">
                  {markingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onCancel(r)} title="Cancel"><X className="h-3 w-3" /></Button>
              </div>
            ) : '—'}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  <TablePagination page={page} total={rows.length} onPageChange={setPage} label="planned payments" />
  </>
  );
};
