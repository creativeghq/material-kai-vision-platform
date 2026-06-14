/**
 * #204 — dedicated Finance documents list with a document-type left nav, mirroring the
 * operator's accounting tool. Invoices / Receipts (11.x) come from `invoices`; Credit
 * notes from `credit_notes`. Each row carries status + an mD (myDATA transmitted) flag +
 * the shared 3-dots action menu. Delivery/goods-receipt notes (`delivery_notes`) and the
 * Expenses inbox (`inbound_documents`) are fully wired surfaces alongside invoices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Loader2, Plus, FileText, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
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
import { DispatchBoard } from '@/modules/finance/components/DispatchBoard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { warehouseService, type WarehouseItem, type Warehouse } from '@/services/warehouseService';

type DocType = 'invoices' | 'receipts' | 'credit_notes' | 'payments' | 'dispatch' | 'delivery_notes' | 'cheques' | 'expenses';

// This page is ALWAYS rendered embedded — FinancePage's `DOC_TABS` sidebar is the single
// source of truth for the document-type nav (labels, icons, order). Add new document types
// THERE, not here. This map only resolves the heading + empty-state copy for the active type.
const DOC_LABEL: Record<DocType, string> = {
  invoices: 'Invoices',
  receipts: 'Receipts',
  credit_notes: 'Credit notes',
  payments: 'Payments',
  expenses: 'Expenses (Inbox)',
  dispatch: 'Dispatch board',
  delivery_notes: 'Delivery notes',
  cheques: 'Cheques',
};

const isReceipt = (docType: any) => String(docType ?? '').startsWith('11');
const transmitted = (s: any) => s === 'accepted' || s === 'offline';

const DocumentsPage: React.FC<{ embeddedType: DocType }> = ({ embeddedType }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { isAccountant, canOperateFinance } = usePermissions();

  const type = embeddedType;
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
    <div>
      <div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Content — the document-type nav lives in FinancePage's DOC_TABS sidebar. */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold capitalize">{DOC_LABEL[type]}</h2>
              <div className="flex items-center gap-2">
                {type === 'receipts' && !isAccountant && (
                  <Link to="/pos"><Button size="sm" variant="outline"><Receipt className="h-3.5 w-3.5 mr-1" /> Open POS</Button></Link>
                )}
                {(type === 'invoices' || type === 'expenses') && canOperateFinance && (
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
                {type === 'payments' && canOperateFinance && (
                  <Button size="sm" onClick={() => setRecordPaymentOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Record payment</Button>
                )}
                {type === 'credit_notes' && !isAccountant && (
                  <Button size="sm" onClick={() => setNewCreditNoteOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
                )}
              </div>
            </div>

            {type === 'dispatch' ? (
              activeWorkspaceId ? <DispatchBoard workspaceId={activeWorkspaceId} readOnly={isAccountant} /> : null
            ) : (
            <Card>
              <CardContent className="p-0">
                {loading || wsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : type === 'credit_notes' ? (
                  <CreditNoteTable rows={creditNotes} financeBase={financeBase} />
                ) : type === 'expenses' ? (
                  <InboundTable rows={inbound} financeBase={financeBase} workspaceId={activeWorkspaceId} readOnly={!canOperateFinance} onChanged={load} />
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
                        <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No {DOC_LABEL[type].toLowerCase()} yet.</td></tr>
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
            )}
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
  const genPdf = async (id: string) => {
    setBusy(id);
    try { const url = await deliveryNotesService.generatePdf(id, true); if (url) window.open(url, '_blank'); }
    catch (err: any) { toast({ title: 'PDF failed', description: err?.message, variant: 'destructive' }); }
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
                {d.status !== 'draft' && (
                  <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => genPdf(d.id)} title="Download PDF">
                    {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  </Button>
                )}
                {!readOnly && d.status === 'issued' && d.kind === 'dispatch' && (
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

const CreditNoteTable: React.FC<{ rows: CreditNote[]; financeBase: string }> = ({ rows, financeBase }) => {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const genPdf = async (id: string) => {
    setBusy(id);
    try { const { pdf_url } = await financeService.generateCreditNotePdf(id, true); if (pdf_url) window.open(pdf_url, '_blank'); }
    catch (err: any) { toast({ title: 'PDF failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return (
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
        <th className="px-4 py-2 text-right" />
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 && (
        <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No credit notes yet.</td></tr>
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
          <td className="px-4 py-2 text-right">
            <Button size="sm" variant="ghost" disabled={busy === cn.id} onClick={() => genPdf(cn.id)} title="Download PDF">
              {busy === cn.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            </Button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  );
};

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

const InboundTable: React.FC<{ rows: InboundDocument[]; financeBase: string; workspaceId: string | null; readOnly: boolean; onChanged: () => void }> = ({ rows, workspaceId, readOnly, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = React.useState<InboundDocument | null>(null);

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
              {!readOnly && (d.status === 'new' || d.status === 'classified') && (
                <div className="flex justify-end gap-2 items-center">
                  {d.status === 'classified' && <span className="text-xs text-emerald-500 mr-1">Bill created</span>}
                  {d.status === 'new' && (
                    <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => createBill(d.id)}>
                      {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create bill'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => setReceiveDoc(d)}>Receive stock</Button>
                  {d.status === 'new' && <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => dismiss(d.id)}>Dismiss</Button>}
                </div>
              )}
              {d.status === 'received' && <span className="text-xs text-emerald-500">Received</span>}
              {d.status === 'dismissed' && <span className="text-xs text-muted-foreground">Dismissed</span>}
            </td>
          </tr>
        ))}
      </tbody>
      {receiveDoc && workspaceId && (
        <ReceiveToWarehouseDialog
          doc={receiveDoc}
          workspaceId={workspaceId}
          onOpenChange={(v) => { if (!v) setReceiveDoc(null); }}
          onDone={() => { setReceiveDoc(null); onChanged(); }}
        />
      )}
    </table>
  );
};

/**
 * #206/#207 — receive a myDATA inbound doc's lines into the warehouse. Each line can be
 * MATCHED to an existing stock item, or used to CREATE a brand-new stock item (and,
 * optionally, a catalog product) right from the supplier line. Lines auto-match to an
 * existing item by name; unmatched lines default to "create". One 'in' movement per line.
 */
type LineMode = 'skip' | string /* existing item id */ | '__create';
interface LineRow { mode: LineMode; name: string; sku: string; unit: string; qty: string; }

const ReceiveToWarehouseDialog: React.FC<{
  doc: InboundDocument; workspaceId: string; onOpenChange: (v: boolean) => void; onDone: () => void;
}> = ({ doc, workspaceId, onOpenChange, onDone }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [targetWh, setTargetWh] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lines = doc.lines ?? [];
  const [rows, setRows] = useState<Record<number, LineRow>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [its, whs] = await Promise.all([
          warehouseService.listItems(workspaceId),
          warehouseService.listWarehouses(workspaceId).catch(() => [] as Warehouse[]),
        ]);
        if (cancelled) return;
        setItems(its);
        setWarehouses(whs);
        setTargetWh(whs.find((w) => w.is_default)?.id ?? whs[0]?.id ?? '');
        // Auto-match each line to an existing item by name; else default to create.
        const init: Record<number, LineRow> = {};
        lines.forEach((ln, i) => {
          const desc = (ln.item_description ?? '').trim();
          const match = desc ? its.find((it) => it.name && (it.name.toLowerCase().includes(desc.toLowerCase()) || desc.toLowerCase().includes(it.name.toLowerCase()))) : undefined;
          init[i] = {
            mode: match ? match.id : (desc ? '__create' : 'skip'),
            name: desc || `Item ${ln.line_number ?? i + 1}`,
            sku: '', unit: '',
            qty: ln.quantity != null ? String(ln.quantity) : '',
          };
        });
        setRows(init);
      } catch (e: any) {
        toast({ title: 'Failed to load', description: e?.message, variant: 'destructive' });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const setRow = (i: number, patch: Partial<LineRow>) => setRows((m) => ({ ...m, [i]: { ...m[i], ...patch } }));

  const submit = async () => {
    const active = lines.map((_, i) => ({ i, r: rows[i] })).filter(({ r }) => r && r.mode !== 'skip' && (parseFloat(r.qty) || 0) > 0);
    if (active.length === 0) { toast({ title: 'Nothing to receive', description: 'Match or create at least one line.', variant: 'destructive' }); return; }
    const needsCreate = active.some(({ r }) => r.mode === '__create');
    if (needsCreate && !targetWh) { toast({ title: 'Pick a target warehouse', description: 'New stock items need a warehouse.', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const mappings: { item_id: string; quantity: number }[] = [];
      let created = 0;
      for (const { r } of active) {
        const qty = parseFloat(r.qty) || 0;
        if (r.mode === '__create') {
          const productId = addToCatalog ? await warehouseService.createProduct({ workspaceId, name: r.name.trim() || 'Item', sku: r.sku.trim() || null }) : null;
          const itemId = await warehouseService.createItem({
            workspaceId, warehouse_id: targetWh, name: r.name.trim() || 'Item',
            sku: r.sku.trim() || undefined, unit: r.unit.trim() || undefined, product_id: productId, qty_on_hand: 0,
          });
          mappings.push({ item_id: itemId, quantity: qty });
          created += 1;
        } else {
          mappings.push({ item_id: r.mode, quantity: qty });
        }
      }
      const n = await inboundService.receiveToWarehouse(doc.id, mappings);
      toast({ title: `Received ${n} line(s)`, description: created > 0 ? `${created} new stock item(s) created.` : undefined });
      onDone();
    } catch (e: any) {
      toast({ title: 'Failed to receive', description: e?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive into warehouse — {doc.issuer_name ?? doc.issuer_vat ?? doc.mark}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : lines.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            This document has no line detail from myDATA. Add stock manually in Finance → Warehouse.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">New items → warehouse:</span>
                <Select value={targetWh} onValueChange={setTargetWh}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Default warehouse" /></SelectTrigger>
                  <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={addToCatalog} onChange={(e) => setAddToCatalog(e.target.checked)} />
                <span>Also add new items to the sellable catalog</span>
              </label>
            </div>
            <div className="space-y-2 max-h-[52vh] overflow-y-auto">
              {lines.map((ln, i) => {
                const r = rows[i] ?? { mode: 'skip', name: '', sku: '', unit: '', qty: '' };
                return (
                  <div key={i} className="rounded-md border border-border/50 p-2">
                    <div className="grid grid-cols-[1fr_2fr_84px] items-center gap-2">
                      <div className="text-xs">
                        <div className="font-medium">#{ln.line_number ?? i + 1}{ln.item_description ? ` · ${ln.item_description}` : ''}</div>
                        <div className="text-muted-foreground">net {formatMoney(ln.net_value ?? 0, doc.currency)}{ln.quantity != null ? ` · qty ${ln.quantity}` : ''}</div>
                      </div>
                      <Select value={r.mode} onValueChange={(v) => setRow(i, { mode: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">— Skip —</SelectItem>
                          <SelectItem value="__create">➕ Create new stock item</SelectItem>
                          {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="h-8 text-xs text-right" type="number" min="0" step="0.01"
                        value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder="qty" disabled={r.mode === 'skip'} />
                    </div>
                    {r.mode === '__create' && (
                      <div className="mt-2 grid grid-cols-[2fr_1fr_72px] gap-2">
                        <Input className="h-8 text-xs" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="New product name" />
                        <Input className="h-8 text-xs" value={r.sku} onChange={(e) => setRow(i, { sku: e.target.value })} placeholder="SKU (optional)" />
                        <Input className="h-8 text-xs" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="unit" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || loading || lines.length === 0}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Receiving…</> : 'Receive stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentsPage;
