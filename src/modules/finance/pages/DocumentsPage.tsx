/**
 * #204 — dedicated Finance documents list with a document-type left nav, mirroring the
 * operator's accounting tool. Invoices / Receipts (11.x) come from `invoices`; Credit
 * notes from `credit_notes`. Each row carries status + an mD (myDATA transmitted) flag +
 * the shared 3-dots action menu. Delivery notes / Expenses are placeholders for later.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Loader2, Plus, FileText, Receipt, FileMinus, Truck, Wallet, Banknote, FileSignature } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCapabilities } from '@/hooks/useCapabilities';
import { financeService, formatMoney, type Invoice, type CreditNote, type PaymentWithAllocation } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { deliveryNotesService, type DeliveryNote } from '@/modules/finance/services/deliveryNotesService';
import { chequesService, type Cheque } from '@/modules/finance/services/chequesService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { InvoiceActionsMenu } from '@/modules/finance/components/InvoiceActionsMenu';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { NewDeliveryNoteDialog } from '@/modules/finance/components/NewDeliveryNoteDialog';
import { NewChequeDialog } from '@/modules/finance/components/NewChequeDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { NewCreditNoteDialog } from '@/modules/finance/components/NewCreditNoteDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';

type DocType = 'invoices' | 'receipts' | 'credit_notes' | 'payments' | 'delivery_notes' | 'cheques' | 'expenses';

const NAV: { key: DocType; label: string; icon: React.ComponentType<{ className?: string }>; enabled: boolean }[] = [
  { key: 'invoices', label: 'Invoices', icon: FileText, enabled: true },
  { key: 'receipts', label: 'Receipts', icon: Receipt, enabled: true },
  { key: 'credit_notes', label: 'Credit notes', icon: FileMinus, enabled: true },
  { key: 'payments', label: 'Payments', icon: Banknote, enabled: true },
  { key: 'expenses', label: 'Expenses (Inbox)', icon: Wallet, enabled: true },
  { key: 'delivery_notes', label: 'Delivery notes', icon: Truck, enabled: true },
  { key: 'cheques', label: 'Cheques', icon: FileSignature, enabled: true },
];

const isReceipt = (docType: any) => String(docType ?? '').startsWith('11');
const transmitted = (s: any) => s === 'accepted' || s === 'offline';

const DocumentsPage: React.FC<{ embeddedType?: DocType }> = ({ embeddedType }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { isAccountant } = useCapabilities();

  const [internalType, setType] = useState<DocType>('invoices');
  const type = embeddedType ?? internalType;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [inbound, setInbound] = useState<InboundDocument[]>([]);
  const [payments, setPayments] = useState<PaymentWithAllocation[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const categoryName = (id: any) => (id && categoryMap[id]) || '—';
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newDeliveryOpen, setNewDeliveryOpen] = useState(false);
  const [newChequeOpen, setNewChequeOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [newCreditNoteOpen, setNewCreditNoteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncInbound = async () => {
    setSyncing(true);
    try {
      const res = await inboundService.syncNow();
      toast({ title: 'myDATA sync ran', description: res?.skipped ? 'No inbound credentials configured yet (Settings → Documents).' : 'Inbox updated.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err?.message, variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  const load = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const [inv, cn, inb, pmts, dns, chq, cats] = await Promise.all([
        financeService.listInvoices({ workspaceId: activeWorkspaceId, limit: 200 }),
        financeService.listCreditNotes({ workspaceId: activeWorkspaceId }),
        inboundService.list(activeWorkspaceId).catch(() => []),
        financeService.listPayments({ workspaceId: activeWorkspaceId, limit: 200 }).catch(() => []),
        deliveryNotesService.list(activeWorkspaceId).catch(() => []),
        chequesService.list(activeWorkspaceId).catch(() => []),
        financeCategoriesService.list(activeWorkspaceId).catch(() => [] as FinanceCategory[]),
      ]);
      setCategoryMap(Object.fromEntries((cats ?? []).map((c) => [c.id, c.name])));
      setInvoices(inv);
      setCreditNotes(cn);
      setInbound(inb);
      setPayments(pmts);
      setDeliveryNotes(dns);
      setCheques(chq);
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
    <div className={embeddedType ? '' : 'min-h-screen'}>
      {!embeddedType && <GlobalAdminHeader title="Documents" description="Invoices, receipts and credit notes with myDATA status." badge="Finance" />}

      <div className={embeddedType ? '' : 'p-3 sm:p-6'}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {!embeddedType && (
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
          )}

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold capitalize">{NAV.find((n) => n.key === type)?.label}</h2>
              <div className="flex items-center gap-2">
                {type === 'receipts' && !isAccountant && (
                  <Link to="/pos"><Button size="sm" variant="outline"><Receipt className="h-3.5 w-3.5 mr-1" /> Open POS</Button></Link>
                )}
                {(type === 'invoices' || type === 'expenses') && !isAccountant && (
                  <Button size="sm" variant="outline" disabled={syncing} onClick={syncInbound}>
                    {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wallet className="h-3.5 w-3.5 mr-1" />} Sync from myDATA
                  </Button>
                )}
                {(type === 'invoices' || type === 'receipts') && !isAccountant && (
                  <Button size="sm" onClick={() => setNewInvoiceOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
                )}
                {type === 'delivery_notes' && !isAccountant && (
                  <Button size="sm" onClick={() => setNewDeliveryOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
                )}
                {type === 'cheques' && !isAccountant && (
                  <Button size="sm" onClick={() => setNewChequeOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
                )}
                {type === 'payments' && !isAccountant && (
                  <Button size="sm" onClick={() => setRecordPaymentOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Record payment</Button>
                )}
                {type === 'credit_notes' && !isAccountant && (
                  <Button size="sm" onClick={() => setNewCreditNoteOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
                )}
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {loading || wsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : type === 'credit_notes' ? (
                  <CreditNoteTable rows={creditNotes} financeBase={financeBase} />
                ) : type === 'expenses' ? (
                  <InboundTable rows={inbound} financeBase={financeBase} readOnly={isAccountant} onChanged={load} />
                ) : type === 'payments' ? (
                  <PaymentsTable rows={payments} categoryName={categoryName} />
                ) : type === 'delivery_notes' ? (
                  <DeliveryNotesTable rows={deliveryNotes} readOnly={isAccountant} onChanged={load} />
                ) : type === 'cheques' ? (
                  <ChequesTable rows={cheques} readOnly={isAccountant} onChanged={load} />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Number</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Category</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-right">Due</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-center">mD</th>
                        <th className="px-4 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No {NAV.find((n) => n.key === type)?.label.toLowerCase()} yet.</td></tr>
                      )}
                      {rows.map((i) => (
                        <tr key={i.id} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`${financeBase}/invoices/${i.id}`)}>
                          <td className="px-4 py-2 font-mono text-xs">{i.internal_number}</td>
                          <td className="px-4 py-2">{i.issued_at ? new Date(i.issued_at).toLocaleDateString() : <span className="text-muted-foreground">Draft</span>}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{categoryName((i as any).category_id)}</td>
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
      {activeWorkspaceId && (
        <NewDeliveryNoteDialog
          workspaceId={activeWorkspaceId}
          open={newDeliveryOpen}
          onOpenChange={setNewDeliveryOpen}
          onCreated={() => { setNewDeliveryOpen(false); load(); }}
        />
      )}
      {activeWorkspaceId && (
        <NewChequeDialog
          workspaceId={activeWorkspaceId}
          open={newChequeOpen}
          onOpenChange={setNewChequeOpen}
          onCreated={() => { setNewChequeOpen(false); load(); }}
        />
      )}
      {activeWorkspaceId && (
        <RecordPaymentDialog
          workspaceId={activeWorkspaceId}
          open={recordPaymentOpen}
          onOpenChange={setRecordPaymentOpen}
          onSaved={() => { setRecordPaymentOpen(false); load(); }}
        />
      )}
      {activeWorkspaceId && (
        <NewCreditNoteDialog
          workspaceId={activeWorkspaceId}
          open={newCreditNoteOpen}
          onOpenChange={setNewCreditNoteOpen}
          onCreated={() => { setNewCreditNoteOpen(false); load(); }}
        />
      )}
    </div>
  );
};

const CHEQUE_STATUSES: Cheque['status'][] = ['pending', 'cleared', 'bounced', 'cancelled'];

const ChequesTable: React.FC<{ rows: Cheque[]; readOnly: boolean; onChanged: () => void }> = ({ rows, readOnly, onChanged }) => {
  const { toast } = useToast();
  const setStatus = async (id: string, status: Cheque['status']) => {
    try { await chequesService.setStatus(id, status); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };
  const overdue = (c: Cheque) => c.status === 'pending' && c.due_date && new Date(c.due_date) < new Date();
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border/60 text-xs text-muted-foreground">
        <tr>
          <th className="px-4 py-2 text-left">Direction</th>
          <th className="px-4 py-2 text-left">Cheque no.</th>
          <th className="px-4 py-2 text-left">Bank</th>
          <th className="px-4 py-2 text-left">Due</th>
          <th className="px-4 py-2 text-right">Amount</th>
          <th className="px-4 py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No cheques recorded.</td></tr>
        )}
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-border/30">
            <td className="px-4 py-2"><Badge variant={c.direction === 'in' ? 'default' : 'outline'} className="text-[10px]">{c.direction === 'in' ? 'Received' : 'Issued'}</Badge></td>
            <td className="px-4 py-2 font-mono text-xs">{c.cheque_number ?? '—'}</td>
            <td className="px-4 py-2">{c.bank ?? '—'}</td>
            <td className={`px-4 py-2 ${overdue(c) ? 'text-destructive font-medium' : ''}`}>{c.due_date ?? '—'}</td>
            <td className="px-4 py-2 text-right font-medium">{formatMoney(c.amount, c.currency)}</td>
            <td className="px-4 py-2">
              {readOnly ? (
                <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
              ) : (
                <Select value={c.status} onValueChange={(v: any) => setStatus(c.id, v)}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CHEQUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const DeliveryNotesTable: React.FC<{ rows: DeliveryNote[]; readOnly: boolean; onChanged: () => void }> = ({ rows, readOnly, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const [busy, setBusy] = React.useState<string | null>(null);
  const issue = async (id: string) => {
    setBusy(id);
    try { await deliveryNotesService.issue(id); toast({ title: 'Delivery note issued · stock decremented' }); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const toInvoice = async (id: string) => {
    setBusy(id);
    try { const invId = await deliveryNotesService.toInvoice(id); toast({ title: 'Invoice created' }); navigate(`${financeBase}/invoices/${invId}`); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const sendFiscal = async (id: string) => {
    setBusy(id);
    try { const r = await deliveryNotesService.submitFiscal(id); toast({ title: r?.fiscal?.mark ? `Sent to myDATA · MARK ${r.fiscal.mark}` : 'Sent to myDATA' }); onChanged(); }
    catch (err: any) { toast({ title: 'myDATA transmission failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border/60 text-xs text-muted-foreground">
        <tr>
          <th className="px-4 py-2 text-left">Number</th>
          <th className="px-4 py-2 text-left">Type</th>
          <th className="px-4 py-2 text-left">Date</th>
          <th className="px-4 py-2 text-center">Status</th>
          <th className="px-4 py-2 text-right" />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No delivery notes yet.</td></tr>
        )}
        {rows.map((d) => (
          <tr key={d.id} className="border-b border-border/30">
            <td className="px-4 py-2 font-mono text-xs">{d.delivery_note_number ?? <span className="text-muted-foreground">draft</span>}</td>
            <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{d.kind === 'receipt' ? 'Receipt' : 'Dispatch'}</Badge></td>
            <td className="px-4 py-2">{d.issued_at ? new Date(d.issued_at).toLocaleDateString() : new Date(d.created_at).toLocaleDateString()}</td>
            <td className="px-4 py-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <Badge variant={d.status === 'draft' ? 'outline' : d.status === 'void' ? 'secondary' : 'default'} className="text-[10px]">{d.status}</Badge>
                {d.fiscal_mark && <Badge variant="secondary" className="text-[10px]" title={`MARK ${d.fiscal_mark}`}>myDATA ✓</Badge>}
              </div>
            </td>
            <td className="px-4 py-2 text-right">
              <div className="flex items-center justify-end gap-1">
                {!readOnly && d.status === 'draft' && (
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => issue(d.id)}>
                    {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Issue'}
                  </Button>
                )}
                {!readOnly && d.status === 'issued' && d.kind === 'dispatch' && d.fiscal_status !== 'accepted' && (
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => sendFiscal(d.id)}>
                    {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send to myDATA'}
                  </Button>
                )}
                {!readOnly && d.status === 'issued' && (
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => toInvoice(d.id)}>
                    {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create invoice'}
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

const PaymentsTable: React.FC<{ rows: PaymentWithAllocation[]; categoryName: (id: any) => string }> = ({ rows, categoryName }) => (
  <table className="w-full text-sm">
    <thead className="border-b border-border/60 text-xs text-muted-foreground">
      <tr>
        <th className="px-4 py-2 text-left">Date</th>
        <th className="px-4 py-2 text-left">Direction</th>
        <th className="px-4 py-2 text-left">Method</th>
        <th className="px-4 py-2 text-left">Category</th>
        <th className="px-4 py-2 text-left">Reference</th>
        <th className="px-4 py-2 text-right">Amount</th>
        <th className="px-4 py-2 text-right">Allocated</th>
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 && (
        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No payments recorded.</td></tr>
      )}
      {rows.map((p: any) => {
        const allocated = (p.allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0);
        return (
          <tr key={p.id} className="border-b border-border/30">
            <td className="px-4 py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
            <td className="px-4 py-2">
              <Badge variant={p.direction === 'in' ? 'default' : 'outline'} className="text-[10px]">{p.direction === 'in' ? 'Received' : 'Paid out'}</Badge>
            </td>
            <td className="px-4 py-2 capitalize">{(p.method ?? '—').replace('_', ' ')}</td>
            <td className="px-4 py-2 text-xs text-muted-foreground">{categoryName(p.category_id)}</td>
            <td className="px-4 py-2 text-muted-foreground">{p.reference ?? '—'}</td>
            <td className="px-4 py-2 text-right font-medium">{formatMoney(p.amount, p.currency)}</td>
            <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(allocated, p.currency)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const InboundTable: React.FC<{ rows: InboundDocument[]; financeBase: string; readOnly: boolean; onChanged: () => void }> = ({ rows, readOnly, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const createBill = async (id: string) => {
    setBusy(id);
    try { await inboundService.toSupplierBill(id); toast({ title: 'Supplier bill created' }); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const dismiss = async (id: string) => {
    setBusy(id);
    try { await inboundService.dismiss(id); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No received documents yet. Documents other businesses issue to you on myDATA appear here once the
        inbound poller has your AADE received-docs credentials — then you can turn each into a supplier bill or warehouse intake.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border/60 text-xs text-muted-foreground">
        <tr>
          <th className="px-4 py-2 text-left">Date</th>
          <th className="px-4 py-2 text-left">Issuer</th>
          <th className="px-4 py-2 text-left">Type</th>
          <th className="px-4 py-2 text-right">Total</th>
          <th className="px-4 py-2 text-center">Status</th>
          <th className="px-4 py-2 text-right" />
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} className="border-b border-border/30">
            <td className="px-4 py-2">{d.issue_date ? new Date(d.issue_date).toLocaleDateString() : '—'}</td>
            <td className="px-4 py-2">
              <div className="font-medium">{d.issuer_name ?? '—'}</div>
              <div className="text-xs text-muted-foreground font-mono">{d.issuer_vat ?? ''}</div>
            </td>
            <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{d.doc_type ?? '—'}</Badge></td>
            <td className="px-4 py-2 text-right font-medium">{formatMoney(d.total_gross ?? 0, d.currency)}</td>
            <td className="px-4 py-2 text-center"><Badge variant={d.status === 'dismissed' ? 'secondary' : d.status === 'new' ? 'outline' : 'default'} className="text-[10px]">{d.status}</Badge></td>
            <td className="px-4 py-2 text-right">
              {!readOnly && d.status === 'new' && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => createBill(d.id)}>
                    {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create bill'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => dismiss(d.id)}>Dismiss</Button>
                </div>
              )}
              {d.status === 'classified' && <span className="text-xs text-emerald-500">Bill created</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default DocumentsPage;
