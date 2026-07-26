/**
 * #207 — Accounting export bridge (γέφυρα λογιστικής). Pick a period, download the sales /
 * purchases journals + a myDATA-classification summary as CSV for the accountant to import.
 * Reads RLS-scoped finance tables directly; works for the invited `accountant` persona (#202).
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  accountingExportService, journalToCsv, toCsv, downloadCsv,
} from '@/modules/finance/services/accountingExportService';

type Period = 'this_month' | 'last_month' | 'last_quarter' | 'ytd' | 'last_year' | 'custom';

function rangeFor(p: Period): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case 'this_month': return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
    case 'last_month': return { from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case 'last_quarter': { const s = new Date(today); s.setMonth(s.getMonth() - 3); return { from: fmt(s), to: fmt(today) }; }
    case 'ytd': return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) };
    case 'last_year': return { from: fmt(new Date(today.getFullYear() - 1, 0, 1)), to: fmt(new Date(today.getFullYear() - 1, 11, 31)) };
    default: return { from: fmt(today), to: fmt(today) };
  }
}

export const AccountingExportCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>('last_month');
  const [customFrom, setCustomFrom] = useState(() => rangeFor('last_month').from);
  const [customTo, setCustomTo] = useState(() => rangeFor('last_month').to);
  const [busy, setBusy] = useState<string | null>(null);

  const range = period === 'custom' ? { from: customFrom, to: customTo } : rangeFor(period);
  const tag = `${range.from}_${range.to}`;

  const run = async (which: 'sales' | 'purchases' | 'summary') => {
    setBusy(which);
    try {
      if (which === 'sales') {
        const rows = await accountingExportService.salesJournal(workspaceId, range.from, range.to);
        if (!rows.length) { toast({ title: 'No sales documents in this period' }); return; }
        downloadCsv(`sales-journal_${tag}.csv`, journalToCsv(rows));
        toast({ title: 'Sales journal exported', description: `${rows.length} documents` });
      } else if (which === 'purchases') {
        const rows = await accountingExportService.purchasesJournal(workspaceId, range.from, range.to);
        if (!rows.length) { toast({ title: 'No purchase documents in this period' }); return; }
        downloadCsv(`purchases-journal_${tag}.csv`, journalToCsv(rows));
        toast({ title: 'Purchases journal exported', description: `${rows.length} documents` });
      } else {
        const [sales, purchases] = await Promise.all([
          accountingExportService.salesJournal(workspaceId, range.from, range.to),
          accountingExportService.purchasesJournal(workspaceId, range.from, range.to),
        ]);
        const summary = accountingExportService.summarize(sales, purchases);
        if (!summary.length) { toast({ title: 'No documents in this period' }); return; }
        const csv = toCsv(['Section', 'VAT rate', 'Net', 'VAT', 'Documents'],
          summary.map((s) => [s.section, s.rate, s.net.toFixed(2), s.vat.toFixed(2), s.docs]));
        downloadCsv(`mydata-vat-summary_${tag}.csv`, csv);
        toast({ title: 'VAT summary exported' });
      }
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Accounting export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Download the period&apos;s sales &amp; purchases journals and a myDATA VAT summary as CSV (UTF-8, opens in Excel).
          Hand these to your accountant or import them into your accounting software.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => run('sales')}>
            {busy === 'sales' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} Sales journal
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => run('purchases')}>
            {busy === 'purchases' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} Purchases journal
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => run('summary')}>
            {busy === 'summary' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} VAT summary
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Period: {range.from} → {range.to}</p>
      </CardContent>
    </Card>
  );
};
