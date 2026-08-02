import React, { useEffect, useMemo, useState } from 'react';
import { Plus, CheckCircle2, X, Bell, Loader2, CalendarDays, Coins, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  financeService, formatMoney,
  type PlannedPayment, type PlannedPaymentStatus, type PlannedPaymentDirection,
} from '@/modules/finance/services/financeService';
import { statusTone, directionTone } from '@/modules/finance/utils/statusTone';
import { NewPlannedPaymentDialog } from '@/modules/finance/components/NewPlannedPaymentDialog';
import { humanizeLabel } from '@/utils/humanize';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import {
  FilterBar, optionsFromRows, useFilters,
  type DateRangeValue, type FilterGroupDef,
} from '@/components/core/filters';
import { SectionHeader } from '@/components/shared/SectionHeader';

interface Props { workspaceId: string }

const ALL_STATUSES: PlannedPaymentStatus[] = ['planned', 'overdue', 'paid', 'cancelled'];
/** The two statuses that mean "still open" — the default view, and what the bucketed layout shows. */
const OPEN_STATUSES: PlannedPaymentStatus[] = ['planned', 'overdue'];

/**
 * The old single Select conflated three dimensions (direction, status, "upcoming") into one flat
 * list, so you could never ask for e.g. "outgoing AND overdue". They are separate fields now.
 * Status / direction / date all have `column`-less, accessor-less defs: they are pushed into
 * `listPlannedPayments` (SQL) and `applyFilters` passes them through.
 */
function buildPlanningFilters(rows: PlannedPayment[]): FilterGroupDef[] {
  const maxAmount = rows.reduce((m, r) => Math.max(m, Number(r.amount) || 0), 0);
  return [
    {
      key: 'flow', label: 'Flow', icon: ArrowLeftRight,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search', placeholder: 'Title or note…',
          accessor: (r: PlannedPayment) => [r.title, r.notes],
        },
        {
          key: 'direction', type: 'multi', label: 'Direction',
          options: [{ value: 'in', label: 'Incoming' }, { value: 'out', label: 'Outgoing' }],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          description: 'Open statuses keep the grouped by-due-date layout.',
          options: ALL_STATUSES.map((s) => ({ value: s, label: humanizeLabel(s) })),
        },
        {
          key: 'category', type: 'multi', label: 'Category',
          options: optionsFromRows(rows, (r) => r.category, humanizeLabel),
          accessor: (r: PlannedPayment) => r.category,
        },
      ],
    },
    {
      key: 'amounts', label: 'Amounts', icon: Coins,
      fields: [
        {
          key: 'amount', type: 'range', label: 'Amount',
          min: 0, max: Math.max(Math.ceil(maxAmount / 10) * 10, 10),
          accessor: (r: PlannedPayment) => r.amount,
        },
        {
          key: 'currency', type: 'multi', label: 'Currency',
          options: optionsFromRows(rows, (r) => r.currency),
          accessor: (r: PlannedPayment) => r.currency,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        {
          key: 'scheduled_for', type: 'dateRange', label: 'Scheduled date',
          description: 'Applied server-side — changing it reloads the list.',
        },
        { key: 'reminder_at', type: 'dateRange', label: 'Reminder date', accessor: (r: PlannedPayment) => r.reminder_at },
      ],
    },
  ];
}

export const PlanningTab: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PlannedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const filterGroups = useMemo(() => buildPlanningFilters(rows), [rows]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<PlannedPayment>(rows, filterGroups, { initial: { status: OPEN_STATUSES } });

  // The three server-side dimensions, read straight out of the values bag.
  const statusSel = (filterValues.status as PlannedPaymentStatus[] | undefined) ?? [];
  const directionSel = (filterValues.direction as PlannedPaymentDirection[] | undefined) ?? [];
  const scheduled = (filterValues.scheduled_for as DateRangeValue | undefined) ?? {};
  // Serialized so the fetch effect re-runs on a real change, not on every values-object identity.
  const fetchKey = JSON.stringify([statusSel, directionSel, scheduled]);
  const filterKey = JSON.stringify(filterValues);
  // Open-only selections keep the by-due-date grouping; asking for paid/cancelled rows makes the
  // buckets meaningless (they skip those statuses), so those views fall back to a flat table.
  const groupedLayout = statusSel.length > 0 && statusSel.every((s) => OPEN_STATUSES.includes(s));

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, fetchKey]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await financeService.listPlannedPayments({
        workspaceId,
        status: statusSel.length > 0 ? statusSel : undefined,
        // One direction narrows in SQL; both (or none) means no direction predicate at all.
        direction: directionSel.length === 1 ? directionSel[0] : undefined,
        from: scheduled.from,
        to: scheduled.to,
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
    for (const r of filtered) {
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
  }, [filtered]);

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of filtered) {
      if (r.status !== 'planned' && r.status !== 'overdue') continue;
      if (r.direction === 'in') inSum += Number(r.amount);
      else outSum += Number(r.amount);
    }
    return { inSum, outSum, net: inSum - outSum };
  }, [filtered]);

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
      <SectionHeader
        title="Planning"
        subtitle="Scheduled future payments and expected receipts. Marking Paid creates a real payment + allocation."
        actions={<>
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            searchPlaceholder="Title or note…"
            title="Filter planned payments"
          />
          <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add planned payment</Button>
        </>}
      />

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
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No planned payments. Click "Add planned payment" to schedule one.'
            : 'No planned payments match the filters.'}
        </CardContent></Card>
      ) : groupedLayout ? (
        <div className="space-y-4">
          {grouped.overdue.length > 0 && <Section title="Overdue" rows={grouped.overdue} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} accent="destructive" />}
          {grouped.today.length > 0 && <Section title="Due today" rows={grouped.today} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
          {grouped.next7.length > 0 && <Section title="Next 7 days" rows={grouped.next7} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
          {grouped.next30.length > 0 && <Section title="Next 30 days" rows={grouped.next30} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
          {grouped.later.length > 0 && <Section title="Later" rows={grouped.later} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />}
        </div>
      ) : (
        /* keyed on the filter state so changing it remounts the table at page 1 */
        <FlatTable key={filterKey} rows={filtered} onMarkPaid={markPaid} onCancel={cancel} markingId={markingId} />
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
      <CardTitle className={`font-semibold ${accent === 'destructive' ? 'text-destructive' : ''}`}>{title} · {rows.length}</CardTitle>
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
        <th className="px-4 py-2 text-right"><span className="sr-only">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      {paginate(rows, page).map((r) => (
        <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
          <td className="px-4 py-2"><div className="font-medium">{r.title}</div>{r.notes && <div className="text-[10px] text-muted-foreground line-clamp-1">{r.notes}</div>}</td>
          <td className="px-4 py-2 text-xs text-muted-foreground">{r.category}</td>
          <td className="px-4 py-2"><span className={`text-xs ${directionTone(r.direction)}`}>{r.direction === 'in' ? 'In' : 'Out'}</span></td>
          <td className={`px-4 py-2 text-right font-medium ${r.direction === 'out' ? 'text-red-400' : 'text-emerald-500'}`}>{formatMoney(Number(r.amount), r.currency)}</td>
          <td className="px-4 py-2 text-right">{r.scheduled_for}</td>
          <td className="px-4 py-2 text-right">{r.reminder_at ? <span className="inline-flex items-center gap-1 text-xs"><Bell className="h-3 w-3" /> {r.reminder_at}</span> : '—'}</td>
          <td className="px-4 py-2 text-right"><span className={`text-xs ${statusTone(r.status)}`}>{humanizeLabel(r.status)}</span></td>
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
