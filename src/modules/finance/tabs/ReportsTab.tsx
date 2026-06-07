import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, formatPct } from '@/modules/finance/services/financeService';

type ReportKind =
  | 'sales_per_day' | 'sales_per_customer' | 'sales_per_product' | 'sales_per_category'
  | 'sales_per_factory' | 'sales_per_designer'
  | 'purchases_per_product' | 'receipts_per_product'
  | 'spend_per_supplier' | 'payments_out_per_counterparty' | 'payments_in_per_counterparty'
  | 'top_customer_outstanding' | 'top_supplier_outstanding'
  | 'vat_return'
  | 'open_tasks';

type Period = 'this_month' | 'last_month' | 'last_quarter' | 'ytd' | 'last_year' | 'custom';
type SortDir = 'desc' | 'asc';

type ReportGroup = 'sales' | 'purchases' | 'payments' | 'outstanding' | 'vat' | 'tasks';

const REPORTS: { value: ReportKind; label: string; group: ReportGroup; period: 'range' | 'snapshot' }[] = [
  // Sales
  { value: 'sales_per_day',       label: 'Sales per day',           group: 'sales',       period: 'range' },
  { value: 'sales_per_customer',  label: 'Sales per customer',      group: 'sales',       period: 'range' },
  { value: 'sales_per_factory',   label: 'Sales per factory',       group: 'sales',       period: 'range' },
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
  { value: 'vat_return', label: 'VAT analysis (ΦΠΑ)', group: 'vat', period: 'range' },
  // Outstanding snapshots (no period)
  { value: 'top_customer_outstanding', label: 'Top outstanding customers', group: 'outstanding', period: 'snapshot' },
  { value: 'top_supplier_outstanding', label: 'Top outstanding suppliers', group: 'outstanding', period: 'snapshot' },
  // Tasks
  { value: 'open_tasks', label: 'Open tasks / follow-ups', group: 'tasks', period: 'snapshot' },
];

const GROUP_LABELS: Record<ReportGroup, string> = {
  sales: 'Sales',
  purchases: 'Purchases',
  payments: 'Payments (cash movements)',
  vat: 'VAT / Tax',
  outstanding: 'Outstanding (snapshot)',
  tasks: 'Tasks',
};

function rangeForPeriod(p: Period): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
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
  const [report, setReport] = useState<ReportKind>('sales_per_day');
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState<string>(() => rangeForPeriod('this_month').from);
  const [customTo, setCustomTo] = useState<string>(() => rangeForPeriod('this_month').to);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  const range = period === 'custom' ? { from: customFrom, to: customTo } : rangeForPeriod(period);
  const isSnapshot = REPORTS.find((r) => r.value === report)?.period === 'snapshot';

  useEffect(() => { void runReport(); }, [report, period, customFrom, customTo, workspaceId]);

  const runReport = async () => {
    try {
      setLoading(true);
      let data: any[] = [];
      switch (report) {
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
        case 'open_tasks':
          data = await financeService.reportOpenTasks(workspaceId); break;
      }
      setRows(data);
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

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Report</Label>
            <Select value={report} onValueChange={(v) => setReport(v as ReportKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['sales', 'purchases', 'payments', 'vat', 'outstanding', 'tasks'] as ReportGroup[]).map((g) => {
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
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No data for this report and period.</div>
          ) : (
            renderReport(report, sorted, totals)
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

function primarySortKey(report: ReportKind): string {
  switch (report) {
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
      return 'vat';
    case 'open_tasks':
      return 'scheduled_for';
  }
}

function computeTotals(report: ReportKind, rows: any[]): { label: string; value: string }[] {
  switch (report) {
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
      const outputVat = sum((r) => r.section === 'output' || r.section === 'output_credit', 'vat');
      const inputVat = sum((r) => r.section === 'input' || r.section === 'input_credit', 'vat');
      const payable = Math.round((outputVat - inputVat) * 100) / 100;
      return [
        { label: 'Output VAT (sales)', value: formatMoney(outputVat) },
        { label: 'Input VAT (purchases)', value: formatMoney(inputVat) },
        { label: payable >= 0 ? 'VAT payable' : 'VAT credit', value: formatMoney(Math.abs(payable)) },
      ];
    }
    case 'open_tasks':
      return [{ label: 'Open tasks', value: String(rows.length) }];
  }
}

function renderReport(report: ReportKind, rows: any[], totals: { label: string; value: string }[]): React.ReactNode {
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
    const line = (label: string, r: any) => [label, formatMoney(Number(r?.net || 0)), formatMoney(Number(r?.vat || 0)), String(r?.doc_count ?? 0)];
    const body: string[][] = [];
    for (const o of outputs) body.push([`Sales @ ${fmtRate(o.vat_rate)}`, formatMoney(Number(o.net || 0)), formatMoney(Number(o.vat || 0)), String(o.doc_count ?? 0)]);
    if (outputCredit) body.push(line('Less: customer credit notes', outputCredit));
    if (input) body.push(line('Purchases (supplier bills)', input));
    if (inputCredit) body.push(line('Less: supplier credit notes', inputCredit));
    return <Table headers={['Line', 'Net', 'VAT', 'Docs']} totals={totals} rows={body} />;
  }
  if (report === 'open_tasks') {
    return (
      <Table headers={['Quote', 'Kind', 'Scheduled for', 'In', 'Note']} totals={totals} rows={rows.map((r: any) => [
        r.quote_label, r.kind, new Date(r.scheduled_for).toLocaleString(), `${r.days_until}d`, r.body ?? '—',
      ])} />
    );
  }
  if (report === 'sales_per_factory') {
    return (
      <Table headers={['Factory', 'Lines', 'Quantity', 'Revenue', 'Margin']} totals={totals} rows={rows.map((r: any) => [
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

const Table: React.FC<{ headers: string[]; rows: string[][]; totals: { label: string; value: string }[] }> = ({ headers, rows, totals }) => (
  <div>
    <div className="grid gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 text-xs" style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}>
      {totals.map((t) => (
        <div key={t.label}><span className="text-muted-foreground">{t.label}: </span><span className="font-semibold">{t.value}</span></div>
      ))}
    </div>
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
);
