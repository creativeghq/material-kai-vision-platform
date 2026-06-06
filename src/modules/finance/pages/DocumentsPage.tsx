/**
 * #204 — dedicated Finance documents list with a document-type left nav, mirroring the
 * operator's accounting tool. Invoices / Receipts (11.x) come from `invoices`; Credit
 * notes from `credit_notes`. Each row carries status + an mD (myDATA transmitted) flag +
 * the shared 3-dots action menu. Delivery notes / Expenses are placeholders for later.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Loader2, Plus, FileText, Receipt, FileMinus, Truck, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { financeService, formatMoney, type Invoice, type CreditNote } from '@/modules/finance/services/financeService';
import { InvoiceActionsMenu } from '@/modules/finance/components/InvoiceActionsMenu';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';

type DocType = 'invoices' | 'receipts' | 'credit_notes' | 'delivery_notes' | 'expenses';

const NAV: { key: DocType; label: string; icon: React.ComponentType<{ className?: string }>; enabled: boolean }[] = [
  { key: 'invoices', label: 'Invoices', icon: FileText, enabled: true },
  { key: 'receipts', label: 'Receipts', icon: Receipt, enabled: true },
  { key: 'credit_notes', label: 'Credit notes', icon: FileMinus, enabled: true },
  { key: 'delivery_notes', label: 'Delivery notes', icon: Truck, enabled: false },
  { key: 'expenses', label: 'Expenses', icon: Wallet, enabled: false },
];

const isReceipt = (docType: any) => String(docType ?? '').startsWith('11');
const transmitted = (s: any) => s === 'accepted' || s === 'offline';

const DocumentsPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();

  const [type, setType] = useState<DocType>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);

  const load = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const [inv, cn] = await Promise.all([
        financeService.listInvoices({ workspaceId: activeWorkspaceId, limit: 200 }),
        financeService.listCreditNotes({ workspaceId: activeWorkspaceId }),
      ]);
      setInvoices(inv);
      setCreditNotes(cn);
    } catch (err: any) {
      toast({ title: 'Failed to load documents', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activeWorkspaceId]);

  const rows = useMemo(() => {
    if (type === 'invoices') return invoices.filter((i) => !isReceipt((i as any).document_type));
    if (type === 'receipts') return invoices.filter((i) => isReceipt((i as any).document_type));
    return [];
  }, [type, invoices]);

  const statusVariant = (s: string) => s === 'overdue' ? 'destructive' : s === 'paid' ? 'default' : 'outline';

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Documents" description="Invoices, receipts and credit notes with myDATA status." badge="Finance" />

      <div className="p-3 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Document-type nav */}
          <div className="flex w-full shrink-0 flex-row flex-wrap gap-1 sm:w-52 sm:flex-col">
            {NAV.map((n) => (
              <button
                key={n.key}
                type="button"
                disabled={!n.enabled}
                onClick={() => n.enabled && setType(n.key)}
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors text-left
                  ${type === n.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}
                  ${!n.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <n.icon className="h-4 w-4" /> {n.label}
                {!n.enabled && <span className="ml-auto text-[10px]">soon</span>}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold capitalize">{NAV.find((n) => n.key === type)?.label}</h2>
              {(type === 'invoices' || type === 'receipts') && (
                <Button size="sm" onClick={() => setNewInvoiceOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                {loading || wsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : type === 'credit_notes' ? (
                  <CreditNoteTable rows={creditNotes} financeBase={financeBase} />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Number</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-right">Due</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-center">mD</th>
                        <th className="px-4 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No {NAV.find((n) => n.key === type)?.label.toLowerCase()} yet.</td></tr>
                      )}
                      {rows.map((i) => (
                        <tr key={i.id} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`${financeBase}/invoices/${i.id}`)}>
                          <td className="px-4 py-2 font-mono text-xs">{i.internal_number}</td>
                          <td className="px-4 py-2">{i.issued_at ? new Date(i.issued_at).toLocaleDateString() : <span className="text-muted-foreground">Draft</span>}</td>
                          <td className="px-4 py-2 text-right">{formatMoney(i.total, i.currency)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatMoney(i.amount_due, i.currency)}</td>
                          <td className="px-4 py-2 text-center"><Badge variant={statusVariant(i.status)} className="text-[10px]">{i.status}</Badge></td>
                          <td className="px-4 py-2 text-center">{transmitted((i as any).fiscal_status) ? <span className="text-emerald-500" title="Transmitted to myDATA">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2 text-right">
                            <InvoiceActionsMenu invoiceId={i.id} financeBase={financeBase} status={i.status} fiscalStatus={(i as any).fiscal_status ?? null} fiscalMark={(i as any).fiscal_mark ?? null} onChanged={load} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {activeWorkspaceId && (
        <NewInvoiceDialog
          workspaceId={activeWorkspaceId}
          open={newInvoiceOpen}
          onOpenChange={setNewInvoiceOpen}
          onCreated={(invoiceId) => { setNewInvoiceOpen(false); navigate(`${financeBase}/invoices/${invoiceId}`); }}
        />
      )}
    </div>
  );
};

const CreditNoteTable: React.FC<{ rows: CreditNote[]; financeBase: string }> = ({ rows, financeBase }) => (
  <table className="w-full text-sm">
    <thead className="border-b border-border/60 text-xs text-muted-foreground">
      <tr>
        <th className="px-4 py-2 text-left">Number</th>
        <th className="px-4 py-2 text-left">Date</th>
        <th className="px-4 py-2 text-left">Type</th>
        <th className="px-4 py-2 text-left">Reason</th>
        <th className="px-4 py-2 text-right">Amount</th>
        <th className="px-4 py-2 text-center">mD</th>
        <th className="px-4 py-2 text-left">Invoice</th>
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 && (
        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No credit notes yet.</td></tr>
      )}
      {rows.map((cn: any) => (
        <tr key={cn.id} className="border-b border-border/30">
          <td className="px-4 py-2 font-mono text-xs">{cn.credit_note_number}</td>
          <td className="px-4 py-2">{cn.issued_at ? new Date(cn.issued_at).toLocaleDateString() : '—'}</td>
          <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{cn.document_type ?? '—'}</Badge></td>
          <td className="px-4 py-2 text-muted-foreground truncate max-w-[220px]">{cn.reason ?? '—'}</td>
          <td className="px-4 py-2 text-right font-medium">{formatMoney(cn.total ?? cn.amount, cn.currency)}</td>
          <td className="px-4 py-2 text-center">{transmitted(cn.fiscal_status) ? <span className="text-emerald-500">✓</span> : <span className="text-muted-foreground">—</span>}</td>
          <td className="px-4 py-2">{cn.invoice_id ? <Link to={`${financeBase}/invoices/${cn.invoice_id}`} className="text-primary hover:underline text-xs">open</Link> : '—'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default DocumentsPage;
