import React, { useEffect, useState } from 'react';
import { Loader2, Download, FileText, FileCheck, Receipt } from 'lucide-react';
import { Card } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  customerDocumentsService,
  type CustomerInvoiceDoc,
  type CustomerReceiptDoc,
} from '@/services/customerDocumentsService';

const money = (v: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v || 0);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-500/10 text-emerald-400',
  partially_paid: 'bg-amber-500/10 text-amber-400',
  overdue: 'bg-red-500/10 text-red-400',
  issued: 'bg-blue-500/10 text-blue-300',
};

/**
 * "My documents" — a customer's own invoices, retail receipts, and payment receipts,
 * with signed download links. Data comes from the finance-customer-documents edge
 * function (the invoices table is workspace-member RLS-gated, so customers can't read
 * it directly). Empty/`linked:false` simply means no documents are addressed to this
 * account yet.
 */
export const MyDocumentsTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<CustomerInvoiceDoc[]>([]);
  const [receipts, setReceipts] = useState<CustomerReceiptDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await customerDocumentsService.listMyDocuments();
        if (!cancelled) { setInvoices(res.invoices); setReceipts(res.receipts); }
      } catch (err) {
        if (!cancelled) toast({ title: 'Could not load your documents', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const open = (url: string | null) => {
    if (url) window.open(url, '_blank');
    else toast({ title: 'Not available yet', description: 'This document is still being prepared.', variant: 'destructive' });
  };

  if (loading) {
    return (
      <Card className="dashboard-card p-12 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (invoices.length === 0 && receipts.length === 0) {
    return (
      <Card className="dashboard-card p-12 text-center space-y-3">
        <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">No documents yet.</p>
        <p className="text-xs text-muted-foreground">
          Invoices and receipts issued to you will appear here, ready to download.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {invoices.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Invoices &amp; receipts</h3>
          <div className="space-y-2">
            {invoices.map((d) => (
              <Card key={d.id} className="dashboard-card p-3 flex items-center gap-3">
                {d.kind === 'receipt' ? <FileCheck className="h-4 w-4 text-primary shrink-0" /> : <FileText className="h-4 w-4 text-primary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {d.kind === 'receipt' ? 'Receipt' : 'Invoice'} {d.number}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(d.issued_at)} · {money(d.total, d.currency)}
                    {d.amount_due > 0 && d.status !== 'paid' ? ` · ${money(d.amount_due, d.currency)} due` : ''}
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] uppercase ${STATUS_STYLES[d.status] ?? 'text-muted-foreground'}`}>
                  {d.status.replace('_', ' ')}
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 gap-1 shrink-0" onClick={() => open(d.pdf_url)}>
                  <Download className="h-3.5 w-3.5" /> <span className="text-xs">PDF</span>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Payment receipts</h3>
          <div className="space-y-2">
            {receipts.map((r) => (
              <Card key={r.id} className="dashboard-card p-3 flex items-center gap-3">
                <Receipt className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">Receipt {r.number}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(r.paid_at)} · {money(r.amount, r.currency)}{r.method ? ` · ${r.method.replace('_', ' ')}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 gap-1 shrink-0" onClick={() => open(r.pdf_url)}>
                  <Download className="h-3.5 w-3.5" /> <span className="text-xs">PDF</span>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
