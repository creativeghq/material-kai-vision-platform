import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, formatPct } from '@/modules/finance/services/financeService';
import { AccountingExportCard } from '@/modules/finance/components/AccountingExportCard';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { formatDate, toLocalISODate, todayLocalISO } from '@/utils/datetime';
type ReportKind =
  | 'cashflow_per_day' | 'pnl_per_category' | 'profit_taken'
  | 'sales_per_day' | 'sales_per_customer' | 'sales_per_product' | 'sales_per_category'
  | 'sales_per_factory' | 'sales_per_designer'
  | 'purchases_per_product' | 'receipts_per_product'
  | 'spend_per_supplier' | 'payments_out_per_counterparty' | 'payments_in_per_counterparty'
  | 'top_customer_outstanding' | 'top_supplier_outstanding'
  | 'vat_return' | 'vat_by_code' | 'mydata_reconciliation' | 'myf'
  | 'intrastat_dispatch' | 'intrastat_arrival'
  | 'open_tasks';

type Period = 'this_month' | 'last_month' | 'last_quarter' | 'ytd' | 'last_year' | 'custom';
type SortDir = 'desc' | 'asc';

type ReportGroup = 'overview' | 'sales' | 'purchases' | 'payments' | 'outstanding' | 'vat' | 'customs' | 'tasks';

const REPORTS: { value: ReportKind; label: string; group: ReportGroup; period: 'range' | 'snapshot' }[] = [
  // Overview (Oxygen Ταμείο)
  { value: 'cashflow_per_day', label: 'Daily cash flow',   group: 'overview', period: 'range' },
  { value: 'pnl_per_category', label: 'P&L by category',   group: 'overview', period: 'range' },
  { value: 'profit_taken',     label: 'Profit taken',      group: 'overview', period: 'range' },
  // Sales
  { value: 'sales_per_day',       label: 'Sales per day',           group: 'sales',       period: 'range' },
  { value: 'sales_per_customer',  label: 'Sales per customer',      group: 'sales',       period: 'range' },
  { value: 'sales_per_factory',   label: 'Sales per brand',         group: 'sales',       period: 'range' },
  { value: 'sales_per_product',   label: 'Sales per product',       group: 'sales',       period: 'range' },
  { value: 'sales_per_category',  label: 'Sales per category',      group: 'sales',       period: 'range' },
  { value: 'sales_per_designer',  label: 'Sales per designer',      group: 'sales',       period: 'range' },
  // Purchases
  { value: 'purchases_per_product', label: 'Purchases per product', group: 'purchases',   period: 'range' },
  { value: 'receipts_per_product',  label: 'Receipts per product',  group: 'purchases',   period: 'range' },
  { value: 'spend_per_supplier',    label: 'Spend per supplier',    group: 'purchases',   period: 'range' },
  // Payments / cash
  { value: 'payments_out_per_counterparty', label: 'Money sent (per supplier)',  group: 'payments', period: 'range' },
  { value: 'payments_in_per_counterparty',  label: 'Money received (per customer)', group: 'payments', period: 'range' },
  // VAT / tax
  { value: 'vat_return', label: 'VAT analysis (by rate)', group: 'vat', period: 'range' },
  { value: 'vat_by_code', label: 'VAT analysis (by myDATA code)', group: 'vat', period: 'range' },
  { value: 'mydata_reconciliation', label: 'myDATA reconciliation', group: 'vat', period: 'range' },
  { value: 'myf', label: 'MYF summary (per counterparty)', group: 'vat', period: 'range' },
  // Statutory statistical return for intra-EU goods movements. Rows come out one per
  // commodity code / partner / origin, so the generic table and its CSV export carry them.
  { value: 'intrastat_dispatch', label: 'Intrastat — dispatches (sales)',   group: 'customs', period: 'range' },
  { value: 'intrastat_arrival',  label: 'Intrastat — arrivals (purchases)', group: 'customs', period: 'range' },
  // Outstanding snapshots (no period)
  { value: 'top_customer_outstanding', label: 'Top outstanding customers', group: 'outstanding', period: 'snapshot' },
  { value: 'top_supplier_outstanding', label: 'Top outstanding suppliers', group: 'outstanding', period: 'snapshot' },
  // Tasks
  { value: 'open_tasks', label: 'Open tasks / Follow-ups', group: 'tasks', period: 'snapshot' },
];

const GROUP_LABELS: Record<ReportGroup, string> = {
  overview: 'Overview (cash & P&L)',
  sales: 'Sales',
  purchases: 'Purchases',
  payments: 'Payments (cash movements)',
  vat: 'VAT / myDATA',
  customs: 'Customs (Intrastat)',
  outstanding: 'Outstanding (snapshot)',
  tasks: 'Tasks',
};

function rangeForPeriod(p: Period): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => toLocalISODate(d);
  if (p === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(start), to: fmt(today) };
  }
  if (p === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: fmt(start), to: fmt(end) };
  }
  if (p === 'last_quarter') {
    const start = new Date(today); start.setMonth(start.getMonth() - 3);
    return { from: fmt(start), to: fmt(today) };
  }
  if (p === 'ytd') {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: fmt(start), to: fmt(today) };
  }
  if (p === 'last_year') {
    const start = new Date(today.getFullYear() - 1, 0, 1);
    const end = new Date(today.getFullYear() - 1, 11, 31);
    return { from: fmt(start), to: fmt(end) };
  }
  return { from: fmt(today), to: fmt(today) };
}

interface Props { workspaceId: string }

export const ReportsTab: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<ReportKind>('cashflow_per_day');
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState<string>(() => rangeForPeriod('this_month').from);
  const [customTo, setCustomTo] = useState<string>(() => rangeForPeriod('this_month').to);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [intrastatWarning, setIntrastatWarning] = useState<string | null>(null);

  const range = period === 'custom' ? { from: customFrom, to: customTo } : rangeForPeriod(period);
  const isSnapshot = REPORTS.find((r) => r.value === report)?.period === 'snapshot';

  useEffect(() => { void runReport(); }, [report, period, customFrom, customTo, workspaceId]);

  const runReport = async () => {
    try {
      setLoading(true);
      let data: any[] = [];
      switch (report) {
        case 'cashflow_per_day':
          data = await financeService.reportCashflowPerDay(workspaceId, range.from, range.to); break;
        case 'pnl_per_category':
          data = await financeService.reportPnlPerCategory(workspaceId, range.from, range.to); break;
        case 'profit_taken':
          data = await financeService.reportProfitTaken(workspaceId, range.from, range.to); break;
        case 'sales_per_day':
          data = await financeService.reportSalesPerDay(workspaceId, range.from, range.to); break;
        case 'sales_per_customer':
          data = await financeService.reportSalesPerCustomer(workspaceId, range.from, range.to); break;
        case 'sales_per_product':
          data = await financeService.reportSalesPerProduct(workspaceId, range.from, range.to); break;
        case 'sales_per_category':
          data = await financeService.reportSalesPerCategory(workspaceId, range.from, range.to); break;
        case 'sales_per_factory':
          data = await financeService.reportSalesPerFactory(workspaceId, range.from, range.to); break;
        case 'sales_per_designer':
          data = await financeService.reportSalesPerDesigner(workspaceId, range.from, range.to); break;
        case 'purchases_per_product':
          data = await financeService.reportPurchasesPerProduct(workspaceId, range.from, range.to); break;
        case 'receipts_per_product':
          data = await financeService.reportReceiptsPerProduct(workspaceId, range.from, range.to); break;
        case 'spend_per_supplier':
          data = await financeService.reportSpendPerSupplier(workspaceId, range.from, range.to); break;
        case 'payments_out_per_counterparty':
          data = await financeService.reportPaymentsOutPerCounterparty(workspaceId, range.from, range.to); break;
        case 'payments_in_per_counterparty':
          data = await financeService.reportPaymentsInPerCounterparty(workspaceId, range.from, range.to); break;
        case 'top_customer_outstanding':
          data = await financeService.reportTopCustomerOutstanding(workspaceId); break;
        case 'top_supplier_outstanding':
          data = await financeService.reportTopSupplierOutstanding(workspaceId); break;
        case 'vat_return':
          data = await financeService.getVatReport(workspaceId, range.from, range.to); break;
        case 'vat_by_code':
          data = await financeService.getVatByCode(workspaceId, range.from, range.to); break;
        case 'mydata_reconciliation':
          data = await financeService.getMyDataReconciliation(workspaceId, range.from, range.to); break;
        case 'myf':
          data = await financeService.reportMyf(workspaceId, range.from, range.to); break;
        case 'open_tasks':
          data = await financeService.reportOpenTasks(workspaceId); break;
        case 'intrastat_dispatch':
        case 'intrastat_arrival': {
          const res = await financeService.reportIntrastat(
            workspaceId, range.from, range.to,
            report === 'intrastat_dispatch' ? 'dispatch' : 'arrival',
          );
          data = res.rows;
          // Never let a short return look complete: an in-scope line with no commodity code or
          // no weight is one the declaration would silently omit.
          setIntrastatWarning(
            res.unclassified > 0 || res.unweighed > 0
              ? `${res.unclassified} line(s) in scope have no commodity code`
                + (res.unclassifiedValue > 0 ? ` (${formatMoney(res.unclassifiedValue)})` : '')
                + ` and ${res.unweighed} have no weight — they are NOT in this return.`
              : null,
          );
          break;
        }
      }
      setRows(data);
      if (!report.startsWith('intrastat')) setIntrastatWarning(null);
    } catch (err: any) {
      toast({ title: 'Report failed', description: err?.message, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(() => {
    const cmp = (a: any, b: any) => {
      const key = primarySortKey(report);
      const av = Number(a?.[key] ?? 0);
      const bv = Number(b?.[key] ?? 0);
      return sortDir === 'asc' ? av - bv : bv - av;
    };
    return [...rows].sort(cmp);
  }, [rows, report, sortDir]);

  const totals = useMemo(() => computeTotals(report, rows), [report, rows]);

  // Only the two DOCUMENT-level reports page (myDATA reconciliation lists one row per document,
  // open tasks one row per task). The rest are aggregate summaries — one row per day/customer/
  // product — and are meant to be read whole, so they stay unpaginated.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [report, period, customFrom, customTo, sortDir]);
  useEffect(() => { setPage((p) => clampPage(p, sorted.length)); }, [sorted.length]);

  return (
    <div className="space-y-4">
      {/* Accounting export bridges (γέφυρες): download journals for the accountant. */}
      <AccountingExportCard workspaceId={workspaceId} />

      {/* Filter bar */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Report</Label>
            <Select value={report} onValueChange={(v) => setReport(v as ReportKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['overview', 'sales', 'purchases', 'payments', 'vat', 'outstanding', 'tasks'] as ReportGroup[]).map((g) => {
                  const inGroup = REPORTS.filter((r) => r.group === g);
                  if (inGroup.length === 0) return null;
                  return (
                    <React.Fragment key={g}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{GROUP_LABELS[g]}</div>
                      {inGroup.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </React.Fragment>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {!isSnapshot && (
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="last_quarter">Last 3 months</SelectItem>
                  <SelectItem value="ytd">Year to date</SelectItem>
                  <SelectItem value="last_year">Last year</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {period === 'custom' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          {period !== 'custom' && (
            <div className="space-y-1">
              <Label className="text-xs">Sort</Label>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {period !== 'custom' && (
            <div className="flex items-end">
              <Button size="sm" variant="outline" onClick={runReport}>Refresh</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result */}
      <Card>
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <span className="text-sm font-medium">{REPORTS.find((r) => r.value === report)?.label}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={sorted.length === 0}
            onClick={() => downloadReportCsv(report, sorted)}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        </div>
        {/* What the return would silently omit. Shown above the table, not in a toast: this is a
            property of the result, and it has to still be on screen when the CSV is exported. */}
        {intrastatWarning && !loading && (
          <p className="flex items-start gap-2 border-b border-border/60 px-4 py-2 text-xs text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {intrastatWarning}
          </p>
        )}
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No data for this report and period.</div>
          ) : (
            renderReport(report, sorted, totals, page, setPage)
          )}
        </CardContent>
      </Card>

      {/* Period label */}
      <p className="text-xs text-muted-foreground">
        {isSnapshot ? 'Snapshot — current state, no period.' : `Period: ${range.from} → ${range.to}`}
      </p>
    </div>
  );
};

// Generic CSV export of the raw report rows (keys = columns). Works for every report.
function downloadReportCsv(report: ReportKind, rows: any[]): void {
  if (rows.length === 0) return;
  const colSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) colSet.add(k);
  const cols: string[] = Array.from(colSet);
  // CSV field quoter (RFC-4180 double-quote doubling). NOT an HTML escaper — do not
  // rename to `esc` (that name is the HTML escaper; see src/utils/escapeHtml.ts).
  const csvQuote = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvQuote(r[c])).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${report}-${todayLocalISO()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function primarySortKey(report: ReportKind): string {
  switch (report) {
    case 'cashflow_per_day':
      return 'period';
    case 'pnl_per_category':
      return 'net';
    case 'profit_taken':
      return 'amount';
    case 'sales_per_day':
    case 'sales_per_customer':
    case 'sales_per_product':
    case 'sales_per_category':
    case 'sales_per_factory':
    case 'sales_per_designer':
      return 'revenue_net';
    case 'purchases_per_product':
    case 'receipts_per_product':
      return 'total_cost';
    case 'spend_per_supplier':
      return 'billed_total';
    case 'payments_out_per_counterparty':
      return 'total_paid';
    case 'payments_in_per_counterparty':
      return 'total_received';
    case 'top_customer_outstanding':
    case 'top_supplier_outstanding':
      return 'outstanding';
    case 'vat_return':
    case 'vat_by_code':
      return 'vat';
    case 'myf':
      return 'gross';
    case 'mydata_reconciliation':
      return 'issued_at';
    case 'open_tasks':
      return 'scheduled_for';
  }
}

function computeTotals(report: ReportKind, rows: any[]): { label: string; value: string }[] {
  switch (report) {
    case 'cashflow_per_day': {
      let inAmt = 0, outAmt = 0;
      for (const r of rows) { inAmt += Number(r.receipts || 0); outAmt += Number(r.payments || 0); }
      return [
        { label: 'Receipts (in)', value: formatMoney(inAmt) },
        { label: 'Payments (out)', value: formatMoney(outAmt) },
        { label: 'Net movement', value: formatMoney(inAmt - outAmt) },
      ];
    }
    case 'profit_taken': {
      let amount = 0, orders = 0;
      for (const r of rows) { amount += Number(r.amount || 0); orders += Number(r.order_count || 0); }
      return [
        { label: 'Orders drawn from', value: String(orders) },
        { label: 'Profit taken', value: formatMoney(amount) },
      ];
    }
    case 'pnl_per_category': {
      let income = 0, expenses = 0, net = 0;
      for (const r of rows) { income += Number(r.income || 0); expenses += Number(r.expenses || 0); net += Number(r.net || 0); }
      return [
        { label: 'Income', value: formatMoney(income) },
        { label: 'Expenses', value: formatMoney(expenses) },
        { label: 'Net', value: formatMoney(net) },
      ];
    }
    case 'sales_per_day':
    case 'sales_per_customer':
    case 'sales_per_product':
    case 'sales_per_category':
    case 'sales_per_factory':
    case 'sales_per_designer': {
      let revenue = 0, margin = 0;
      for (const r of rows) { revenue += Number(r.revenue_net || 0); margin += Number(r.gross_margin || 0); }
      const pct = revenue > 0 ? (margin / revenue) * 100 : null;
      return [
        { label: 'Revenue net', value: formatMoney(revenue) },
        { label: 'Margin', value: formatMoney(margin) },
        { label: 'Margin %', value: formatPct(pct) },
      ];
    }
    case 'purchases_per_product':
    case 'receipts_per_product': {
      let qty = 0, cost = 0;
      for (const r of rows) { qty += Number(r.total_quantity || 0); cost += Number(r.total_cost || 0); }
      return [
        { label: 'Total quantity', value: qty.toFixed(2) },
        { label: 'Total cost', value: formatMoney(cost) },
      ];
    }
    case 'spend_per_supplier': {
      let billed = 0, paid = 0, outstanding = 0;
      for (const r of rows) { billed += Number(r.billed_total || 0); paid += Number(r.paid_total || 0); outstanding += Number(r.outstanding || 0); }
      return [
        { label: 'Billed', value: formatMoney(billed) },
        { label: 'Paid', value: formatMoney(paid) },
        { label: 'Outstanding', value: formatMoney(outstanding) },
      ];
    }
    case 'payments_out_per_counterparty': {
      let total = 0;
      for (const r of rows) total += Number(r.total_paid || 0);
      return [
        { label: 'Suppliers paid', value: String(rows.length) },
        { label: 'Total sent', value: formatMoney(total) },
      ];
    }
    case 'payments_in_per_counterparty': {
      let total = 0;
      for (const r of rows) total += Number(r.total_received || 0);
      return [
        { label: 'Customers paying', value: String(rows.length) },
        { label: 'Total received', value: formatMoney(total) },
      ];
    }
    case 'top_customer_outstanding': {
      let total = 0;
      for (const r of rows) total += Number(r.outstanding || 0);
      return [
        { label: 'Customers with open balance', value: String(rows.length) },
        { label: 'Total AR outstanding', value: formatMoney(total) },
      ];
    }
    case 'top_supplier_outstanding': {
      let total = 0;
      for (const r of rows) total += Number(r.outstanding || 0);
      return [
        { label: 'Suppliers with open balance', value: String(rows.length) },
        { label: 'Total AP outstanding', value: formatMoney(total) },
      ];
    }
    case 'vat_return': {
      const sum = (pred: (r: any) => boolean, key: string) => rows.filter(pred).reduce((s, r) => s + Number(r[key] || 0), 0);
      // Reverse charge sits on BOTH sides: self-assessed as output, reclaimed as input. Leaving
      // it out of either would misstate that side even though the two cancel in the payable.
      const outputVat = sum((r) => r.section === 'output' || r.section === 'output_credit'
        || r.section === 'reverse_charge_output', 'vat');
      const inputVat = sum((r) => r.section === 'input' || r.section === 'input_credit'
        || r.section === 'reverse_charge_input', 'vat');
      const reverseCharge = sum((r) => r.section === 'reverse_charge_output', 'vat');
      const payable = Math.round((outputVat - inputVat) * 100) / 100;
      return [
        { label: 'Output VAT (sales)', value: formatMoney(outputVat) },
        { label: 'Input VAT (purchases)', value: formatMoney(inputVat) },
        ...(reverseCharge > 0
          // Stated in its own right, not merely folded into the two above: it is the one figure
          // on this report that is declared and reclaimed in the same breath.
          ? [{ label: 'of which reverse charge (nets to zero)', value: formatMoney(reverseCharge) }]
          : []),
        { label: payable >= 0 ? 'VAT payable' : 'VAT credit', value: formatMoney(Math.abs(payable)) },
      ];
    }
    case 'vat_by_code': {
      let net = 0, vat = 0;
      for (const r of rows) { net += Number(r.net || 0); vat += Number(r.vat || 0); }
      return [
        { label: 'Net', value: formatMoney(net) },
        { label: 'VAT', value: formatMoney(vat) },
        { label: 'Code groups', value: String(rows.length) },
      ];
    }
    case 'mydata_reconciliation': {
      const count = (b: string) => rows.filter((r) => r.bucket === b).length;
      const attention = rows.filter((r) => r.bucket !== 'accepted').length;
      return [
        { label: 'Accepted', value: String(count('accepted')) },
        { label: 'Not transmitted', value: String(count('not_transmitted')) },
        { label: 'Needs attention', value: String(attention) },
      ];
    }
    case 'myf': {
      const sum = (dir: string, key: string) => rows.filter((r) => r.direction === dir).reduce((s, r) => s + Number(r[key] || 0), 0);
      return [
        { label: 'Sales net', value: formatMoney(sum('sales', 'net')) },
        { label: 'Purchases net', value: formatMoney(sum('purchases', 'net')) },
        { label: 'Counterparties', value: String(rows.length) },
      ];
    }
    case 'open_tasks':
      return [{ label: 'Open tasks', value: String(rows.length) }];
  }
}

function renderReport(
  report: ReportKind,
  rows: any[],
  totals: { label: string; value: string }[],
  page: number,
  onPageChange: (p: number) => void,
): React.ReactNode {
  if (report === 'cashflow_per_day') {
    return (
      <Table headers={['Date', 'Receipts', 'Payments', 'Difference']} totals={totals} rows={rows.map((r: any) => [
        r.period, formatMoney(Number(r.receipts || 0)), formatMoney(Number(r.payments || 0)), formatMoney(Number(r.difference || 0)),
      ])} />
    );
  }
  if (report === 'profit_taken') {
    return (
      <Table headers={['Category', 'Orders', 'Profit taken']} totals={totals} rows={rows.map((r: any) => [
        r.category_name,
        String(r.order_count ?? 0),
        formatMoney(Number(r.amount || 0), r.currency || 'EUR'),
      ])} />
    );
  }
  if (report === 'pnl_per_category') {
    return (
      <Table headers={['Category', 'Income', 'Cust. credits', 'Expenses', 'Suppl. credits', 'Net', 'VAT in', 'VAT out']} totals={totals} rows={rows.map((r: any) => [
        r.category_name,
        formatMoney(Number(r.income || 0)),
        formatMoney(Number(r.customer_credits || 0)),
        formatMoney(Number(r.expenses || 0)),
        formatMoney(Number(r.supplier_credits || 0)),
        formatMoney(Number(r.net || 0)),
        formatMoney(Number(r.vat_income || 0)),
        formatMoney(Number(r.vat_expense || 0)),
      ])} />
    );
  }
  if (report === 'sales_per_day') {
    return (
      <Table headers={['Date', 'Invoices', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
        r.period, String(r.invoice_count ?? 0), formatMoney(Number(r.revenue_net || 0)), formatMoney(Number(r.gross_margin || 0)),
      ])} />
    );
  }
  if (report === 'sales_per_customer') {
    return (
      <Table headers={['Customer', 'Type', 'Invoices', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, r.party_type, String(r.invoice_count ?? 0), formatMoney(Number(r.revenue_net || 0)), formatMoney(Number(r.gross_margin || 0)),
      ])} />
    );
  }
  if (report === 'sales_per_product') {
    return (
      <Table headers={['Product', 'SKU', 'Quantity', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
        r.product_name, r.sku ?? '—', String(Number(r.total_quantity ?? 0)), formatMoney(Number(r.revenue_net || 0)), formatMoney(Number(r.gross_margin || 0)),
      ])} />
    );
  }
  if (report === 'sales_per_category') {
    return (
      <Table headers={['Category', 'Lines', 'Quantity', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
        r.category_name, String(r.line_count ?? 0), String(Number(r.total_quantity ?? 0)), formatMoney(Number(r.revenue_net || 0)), formatMoney(Number(r.gross_margin || 0)),
      ])} />
    );
  }
  if (report === 'purchases_per_product' || report === 'receipts_per_product') {
    return (
      <Table headers={['Product', 'SKU', 'Quantity', 'Cost']} totals={totals} rows={rows.map((r: any) => [
        r.product_name, r.sku ?? '—', String(Number(r.total_quantity ?? 0)), formatMoney(Number(r.total_cost || 0)),
      ])} />
    );
  }
  if (report === 'vat_return') {
    const fmtRate = (rate: any) => rate == null ? '—' : `${Number(rate)}%`;
    const outputs = rows.filter((r: any) => r.section === 'output').sort((a: any, b: any) => Number(b.vat_rate ?? 0) - Number(a.vat_rate ?? 0));
    const outputCredit = rows.find((r: any) => r.section === 'output_credit');
    const input = rows.find((r: any) => r.section === 'input');
    const inputCredit = rows.find((r: any) => r.section === 'input_credit');
    const rcOutput = rows.find((r: any) => r.section === 'reverse_charge_output');
    const rcInput = rows.find((r: any) => r.section === 'reverse_charge_input');
    const line = (label: string, r: any) => [label, formatMoney(Number(r?.net || 0)), formatMoney(Number(r?.vat || 0)), String(r?.doc_count ?? 0)];
    const body: string[][] = [];
    for (const o of outputs) body.push([`Sales @ ${fmtRate(o.vat_rate)}`, formatMoney(Number(o.net || 0)), formatMoney(Number(o.vat || 0)), String(o.doc_count ?? 0)]);
    if (outputCredit) body.push(line('Less: customer credit notes', outputCredit));
    if (input) body.push(line('Purchases (supplier bills)', input));
    if (inputCredit) body.push(line('Less: supplier credit notes', inputCredit));
    // Two lines, because it really is two entries. The supplier charged nothing; we declare the
    // VAT and reclaim it in the same filing, so the pair cancels and both halves must be shown.
    if (rcOutput) body.push(line('Intra-EU acquisitions — VAT self-assessed', rcOutput));
    if (rcInput) body.push(line('Intra-EU acquisitions — VAT reclaimed', rcInput));
    return <Table headers={['Line', 'Net', 'VAT', 'Docs']} totals={totals} rows={body} />;
  }
  if (report === 'vat_by_code') {
    const fmtRate = (rate: any) => rate == null ? '—' : `${Number(rate)}%`;
    return (
      <Table headers={['VAT cat', 'Rate', 'Classification type', 'Classification category', 'Net', 'VAT', 'Lines']} totals={totals} rows={rows.map((r: any) => [
        r.vat_category == null ? '—' : String(r.vat_category), fmtRate(r.vat_rate),
        r.income_classification_type ?? '—', r.income_classification_category ?? '—',
        formatMoney(Number(r.net || 0)), formatMoney(Number(r.vat || 0)), String(r.line_count ?? 0),
      ])} />
    );
  }
  if (report === 'mydata_reconciliation') {
    return <MyDataReconTable rows={rows} totals={totals} page={page} onPageChange={onPageChange} />;
  }
  if (report === 'myf') {
    return (
      <Table headers={['Flow', 'Counterparty', 'VAT no.', 'Docs', 'Net', 'VAT', 'Gross']} totals={totals} rows={rows.map((r: any) => [
        r.direction === 'sales' ? 'Sales' : 'Purchases', r.counterparty_name, r.vat_number ?? '—',
        String(r.doc_count ?? 0), formatMoney(Number(r.net || 0)), formatMoney(Number(r.vat || 0)), formatMoney(Number(r.gross || 0)),
      ])} />
    );
  }
  if (report === 'open_tasks') {
    return (
      <Table
        headers={['Quote', 'Kind', 'Scheduled for', 'In', 'Note']}
        totals={totals}
        rows={paginate(rows, page).map((r: any) => [
          r.quote_label, r.kind, r.scheduled_for ? formatDate(r.scheduled_for, { withTime: true }) : '—', `${r.days_until}d`, r.body ?? '—',
        ])}
        footer={<TablePagination page={page} total={rows.length} onPageChange={onPageChange} label="tasks" />}
      />
    );
  }
  if (report === 'sales_per_factory') {
    return (
      <Table headers={['Brand', 'Lines', 'Quantity', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
        r.factory_name, String(r.line_count ?? 0), String(Number(r.total_quantity ?? 0)), formatMoney(Number(r.revenue_net || 0)), formatMoney(Number(r.gross_margin || 0)),
      ])} />
    );
  }
  if (report === 'sales_per_designer') {
    return (
      <Table headers={['Designer', 'Invoices', 'Accepted quotes', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, String(r.invoice_count ?? 0), String(r.accepted_quote_count ?? 0), formatMoney(Number(r.revenue_net || 0)), formatMoney(Number(r.gross_margin || 0)),
      ])} />
    );
  }
  if (report === 'spend_per_supplier') {
    return (
      <Table headers={['Supplier', 'Bills', 'Billed', 'Paid', 'Outstanding']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, String(r.bill_count ?? 0), formatMoney(Number(r.billed_total || 0)), formatMoney(Number(r.paid_total || 0)), formatMoney(Number(r.outstanding || 0)),
      ])} />
    );
  }
  if (report === 'payments_out_per_counterparty') {
    return (
      <Table headers={['Supplier', 'Payments', 'Total sent']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, String(r.payment_count ?? 0), formatMoney(Number(r.total_paid || 0)),
      ])} />
    );
  }
  if (report === 'payments_in_per_counterparty') {
    return (
      <Table headers={['Customer', 'Payments', 'Total received']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, String(r.payment_count ?? 0), formatMoney(Number(r.total_received || 0)),
      ])} />
    );
  }
  if (report === 'top_customer_outstanding') {
    return (
      <Table headers={['Customer', 'Open invoices', 'Outstanding', 'Oldest due', 'Max overdue']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, String(r.open_invoice_count ?? 0), formatMoney(Number(r.outstanding || 0)), r.oldest_due_at ?? '—', r.max_days_overdue > 0 ? `${r.max_days_overdue}d` : '—',
      ])} />
    );
  }
  if (report === 'top_supplier_outstanding') {
    return (
      <Table headers={['Supplier', 'Open bills', 'Outstanding', 'Oldest due', 'Max overdue']} totals={totals} rows={rows.map((r: any) => [
        r.display_name, String(r.open_bill_count ?? 0), formatMoney(Number(r.outstanding || 0)), r.oldest_due_at ?? '—', r.max_days_overdue > 0 ? `${r.max_days_overdue}d` : '—',
      ])} />
    );
  }
  return null;
}

const BUCKET_META: Record<string, { label: string; cls: string; rank: number }> = {
  not_transmitted: { label: 'Not transmitted', cls: 'bg-destructive/15 text-destructive border-destructive/30', rank: 0 },
  rejected: { label: 'Rejected', cls: 'bg-destructive/15 text-destructive border-destructive/30', rank: 1 },
  failed: { label: 'Failed', cls: 'bg-destructive/15 text-destructive border-destructive/30', rank: 2 },
  offline_pending: { label: 'Offline — pending MARK', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30', rank: 3 },
  accepted: { label: 'Accepted', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30', rank: 9 },
};
const DOC_KIND_LABEL: Record<string, string> = { invoice: 'Invoice', credit_note: 'Credit note', delivery_note: 'Delivery note' };

const MyDataReconTable: React.FC<{
  rows: any[]; totals: { label: string; value: string }[]; page: number; onPageChange: (p: number) => void;
}> = ({ rows, totals, page, onPageChange }) => {
  const ordered = [...rows].sort((a, b) => {
    const ra = BUCKET_META[a.bucket]?.rank ?? 5, rb = BUCKET_META[b.bucket]?.rank ?? 5;
    if (ra !== rb) return ra - rb;
    return String(b.issued_at ?? '').localeCompare(String(a.issued_at ?? ''));
  });
  return (
    <div>
      <div className="grid gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 text-xs" style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}>
        {totals.map((t) => (<div key={t.label}><span className="text-muted-foreground">{t.label}: </span><span className="font-semibold">{t.value}</span></div>))}
      </div>
      <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-left">Document</th>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2 text-left">MARK</th>
            <th className="px-4 py-2 text-left">myDATA status</th>
          </tr>
        </thead>
        <tbody>
          {paginate(ordered, page).map((r) => {
            const meta = BUCKET_META[r.bucket] ?? { label: r.bucket, cls: 'bg-muted text-muted-foreground border-border', rank: 5 };
            return (
              <tr key={`${r.doc_kind}-${r.doc_id}`} className="border-b border-border/30">
                <td className="px-4 py-2 font-mono text-xs">{r.doc_number ?? r.doc_id?.slice(0, 8)}</td>
                <td className="px-4 py-2">{DOC_KIND_LABEL[r.doc_kind] ?? r.doc_kind}</td>
                <td className="px-4 py-2">{r.issued_at ? formatDate(r.issued_at) : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.total != null ? formatMoney(Number(r.total), r.currency ?? undefined) : '—'}</td>
                <td className="px-4 py-2 font-mono text-[11px] break-all">{r.fiscal_mark ?? '—'}</td>
                <td className="px-4 py-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${meta.cls}`}>{meta.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {/* The totals strip above counts every document, not just this page. */}
      <TablePagination page={page} total={ordered.length} onPageChange={onPageChange} label="documents" />
    </div>
  );
};

const Table: React.FC<{
  headers: string[]; rows: string[][]; totals: { label: string; value: string }[];
  /** Pagination footer — only the document-level reports pass one. */
  footer?: React.ReactNode;
}> = ({ headers, rows, totals, footer }) => (
  <div>
    <div className="grid gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 text-xs" style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}>
      {totals.map((t) => (
        <div key={t.label}><span className="text-muted-foreground">{t.label}: </span><span className="font-semibold">{t.value}</span></div>
      ))}
    </div>
    <div className="table-scroll">
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b border-border/60">
          {headers.map((h, i) => (<th key={h} className={`px-4 py-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} className="border-b border-border/30">
            {r.map((cell, i) => (<td key={i} className={`px-4 py-2 ${i === 0 ? '' : 'text-right tabular-nums'}`}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
    {footer}
  </div>
);
