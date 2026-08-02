/**
 * #204 — dedicated Finance documents list with a document-type left nav, mirroring the
 * operator's accounting tool. Invoices / Receipts (11.x) come from `invoices`; Credit
 * notes from `credit_notes`. Each row carries status + an mD (myDATA transmitted) flag +
 * the shared 3-dots action menu. Delivery/goods-receipt notes (`delivery_notes`) and the
 * Expenses inbox (`inbound_documents`) are fully wired surfaces alongside invoices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Plus, FileText, Receipt, Wallet, Tags, Repeat, Pause, Play, Trash2, Truck, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { financeService, formatMoney, type Invoice, type CreditNote, type PaymentWithAllocation, type RecurringExpense } from '@/modules/finance/services/financeService';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { deliveryNotesService, type DeliveryNote } from '@/modules/finance/services/deliveryNotesService';
import { chequesService, type Cheque } from '@/modules/finance/services/chequesService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { InvoiceActionsMenu } from '@/modules/finance/components/InvoiceActionsMenu';
import { InboundDocActionsMenu } from '@/modules/finance/components/InboundDocActionsMenu';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { NewDeliveryNoteDialog } from '@/modules/finance/components/NewDeliveryNoteDialog';
import { NewChequeDialog } from '@/modules/finance/components/NewChequeDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { ExpensePaymentsDialog } from '@/modules/finance/components/ExpensePaymentsDialog';
import { NewOrderModal } from '@/modules/finance/components/OrdersPanel';
import { orderLinesFromDoc, docsWithOrders } from '@/modules/finance/utils/inboundToOrder';
import { NewCreditNoteDialog } from '@/modules/finance/components/NewCreditNoteDialog';
import { QuickCategoryDialog } from '@/modules/finance/components/QuickCategoryDialog';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { MydataSyncDialog } from '@/modules/finance/components/MydataSyncDialog';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import { useMydataTypeLabels } from '@/modules/finance/components/mydataTypes';
import { inboundOutcomes } from '@/modules/finance/components/inboundStatus';
import { ReceiveToWarehouseDialog } from '@/modules/finance/components/ReceiveToWarehouseDialog';
import { DispatchBoard } from '@/modules/finance/components/DispatchBoard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildDocumentFilters, type DocFilterType } from '@/modules/finance/components/documentFilters';

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

const NONE = '__none';

/** Inline category picker used in document rows. Shows the current category + lets the
 *  operator (re)assign it without leaving the list. '__none' clears the category. */
const CategoryCell: React.FC<{
  value: string | null;
  options: FinanceCategory[];
  onChange: (categoryId: string | null) => void;
}> = ({ value, options, onChange }) => (
  // "No category" is the CLEAR action, not a category — it must not read as one more entry in
  // the workspace's category list, which is what "Uncategorized" sitting above the real names did.
  <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
    <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="No category" /></SelectTrigger>
    <SelectContent>
      <SelectItem value={NONE}><span className="text-muted-foreground">— No category —</span></SelectItem>
      {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
    </SelectContent>
  </Select>
);

const DocumentsPage: React.FC<{ embeddedType: DocType }> = ({ embeddedType }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { isAccountant, canOperateFinance } = usePermissions();

  const type = embeddedType;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [inbound, setInbound] = useState<InboundDocument[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentWithAllocation[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  // Only one document table renders at a time (the type discriminates), so a single page
  // cursor serves them all — it's reset on every type/filter change below.
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const categoryName = (id: any) => (id && categoryMap[id]) || '—';
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newDeliveryOpen, setNewDeliveryOpen] = useState(false);
  const [dispatchRefresh, setDispatchRefresh] = useState(0);
  const [newChequeOpen, setNewChequeOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  // The expense whose payments are open — set from either side of the link (an Inbox row or an
  // open bill), both of which resolve to the same supplier_bill id.
  const [paymentsExpenseId, setPaymentsExpenseId] = useState<string | null>(null);
  const [newCreditNoteOpen, setNewCreditNoteOpen] = useState(false);
  const [categoryKind, setCategoryKind] = useState<'income' | 'expense' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  // The pull is always date-bounded from the UI — the dialog asks for the window first so a
  // sync never drags in years of AADE history.
  const syncInbound = async (range: { dateFrom: string; dateTo: string }) => {
    setSyncing(true);
    try {
      const res = await inboundService.syncNow(range);
      const pulled = (res?.results ?? []).reduce((n: number, r: any) => n + (r?.upserted ?? 0), 0);
      toast({
        title: 'myDATA sync ran',
        description: res?.skipped
          ? 'No inbound credentials configured yet (Settings → Documents).'
          : `${pulled} new document${pulled === 1 ? '' : 's'} for ${range.dateFrom} → ${range.dateTo}.`,
      });
      setSyncDialogOpen(false);
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
        // Paged client-side below, so the fetch cap is a safety ceiling, not a page size —
        // 200 silently hid older documents once a workspace crossed it.
        financeService.listInvoices({ workspaceId: activeWorkspaceId, limit: 1000 }),
        financeService.listCreditNotes({ workspaceId: activeWorkspaceId }),
        inboundService.list(activeWorkspaceId).catch(() => []),
        financeService.listPayments({ workspaceId: activeWorkspaceId, limit: 1000 }).catch(() => []),
        deliveryNotesService.list(activeWorkspaceId).catch(() => []),
        chequesService.list(activeWorkspaceId).catch(() => []),
        financeCategoriesService.list(activeWorkspaceId).catch(() => [] as FinanceCategory[]),
      ]);
      // Recurring templates — Expenses tab only.
      if (type === 'expenses') {
        setRecurring(await financeService.listRecurringExpenses(activeWorkspaceId).catch(() => [] as RecurringExpense[]));
      }
      setCategories(cats ?? []);
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

  /** Supplier scope for the Expenses Inbox, set when arriving from a company's CRM record. */
  const issuerVatParam = searchParams.get('issuer_vat');

  // Which finance-category side applies to the active surface (drives filter + inline picker).
  const sideKind: 'income' | 'expense' | null =
    type === 'expenses' ? 'expense' : (type === 'invoices' || type === 'receipts') ? 'income' : null;
  const sideCategories = useMemo(
    () => categories.filter((c) => !sideKind || c.kind === sideKind || c.kind === 'both'),
    [categories, sideKind],
  );

  // The unfiltered rows for the active document type — one table renders at a time, so a
  // single base array feeds the shared filter engine and the pagination footer.
  const baseRows = useMemo<any[]>(() => {
    switch (type) {
      case 'invoices': return invoices.filter((i) => !isReceipt((i as any).document_type));
      case 'receipts': return invoices.filter((i) => isReceipt((i as any).document_type));
      case 'credit_notes': return creditNotes;
      // `?issuer_vat=` scopes the Inbox to one supplier — how their CRM record links here.
      // VAT is the join key (it is the only thing tying a received document to a company), and
      // it is compared on digits so EL800370260 and 800370260 are the same supplier.
      case 'expenses': {
        const want = (issuerVatParam ?? '').replace(/\D/g, '');
        if (!want) return inbound;
        return inbound.filter((d) => String(d.issuer_vat ?? '').replace(/\D/g, '') === want);
      }
      case 'payments': return payments;
      case 'delivery_notes': return deliveryNotes;
      case 'cheques': return cheques;
      default: return [];
    }
  }, [type, invoices, creditNotes, inbound, payments, deliveryNotes, cheques, issuerVatParam]);

  // myDATA code → name, so the document-type filter offers "Sales Invoice", not a bare "1.1".
  const mydataTypes = useMydataTypeLabels();
  const filterGroups = useMemo(
    () => buildDocumentFilters(type as DocFilterType, { rows: baseRows, categories: sideCategories, categoryName, mydataTypes }),
    [type, baseRows, sideCategories, categoryMap, mydataTypes],
  );
  const { values: filterValues, setValues: setFilterValues, filtered: activeRows, previewCount } =
    useFilters<any>(baseRows, filterGroups);

  // Switching document type carries no meaningful filter state across — start clean.
  useEffect(() => { setFilterValues({}); setPage(1); }, [type]);

  // Arriving from a CRM company's "N invoices … not yet booked" callout: land on the inbox
  // already narrowed to that counterparty. The VAT (not the name) is the key — myDATA issuer
  // names rarely match the CRM record verbatim, and the free-text field already searches VAT.
  // Declared AFTER the reset effect above so it wins on the same commit; the param is consumed
  // so a later manual filter change isn't silently re-overwritten.
  useEffect(() => {
    const vat = searchParams.get('issuer_vat');
    if (!vat || type !== 'expenses') return;
    setFilterValues({ q: vat });
    setPage(1);
    const p = new URLSearchParams(searchParams);
    p.delete('issuer_vat');
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams, type, setFilterValues]);
  // A narrowed result set is a different list — restart at the first page.
  useEffect(() => { setPage(1); }, [filterValues]);

  const rows = activeRows as Invoice[];
  const filteredInbound = activeRows as InboundDocument[];
  const filteredPayments = activeRows as PaymentWithAllocation[];

  // Issuing/dismissing a document shrinks the list — clamp so the last page never goes blank.
  useEffect(() => { setPage((p) => clampPage(p, activeRows.length)); }, [activeRows.length]);

  // Inline category assignment — optimistic local update so the cell reflects the change at once.
  const setInvoiceCategory = async (invoiceId: string, categoryId: string | null) => {
    setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, category_id: categoryId } as Invoice : i));
    try { await financeService.updateInvoice(invoiceId, { category_id: categoryId } as any); }
    catch (err: any) { toast({ title: 'Failed to set category', description: err?.message, variant: 'destructive' }); void load(); }
  };

  // Type-conditional header actions — shared by the dispatch (board) and table layouts so the
  // title/actions look identical whether the content is a Card table or the kanban board.
  const docActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {type !== 'dispatch' && filterGroups.length > 0 && (
        <FilterBar
          groups={filterGroups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          title={`Filter ${DOC_LABEL[type].toLowerCase()}`}
        />
      )}
      {type === 'receipts' && !isAccountant && (
        <Link to="/pos"><Button size="sm" variant="outline"><Receipt className="h-3.5 w-3.5 mr-1" /> Open POS</Button></Link>
      )}
      {(type === 'invoices' || type === 'expenses') && canOperateFinance && (
        <Button size="sm" variant="outline" disabled={syncing} onClick={() => setSyncDialogOpen(true)}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wallet className="h-3.5 w-3.5 mr-1" />} Sync from myDATA
        </Button>
      )}
      {(type === 'invoices' || type === 'receipts') && canOperateFinance && (
        <Button size="sm" variant="outline" onClick={() => setCategoryKind('income')} title="Add an internal income category">
          <Tags className="h-3.5 w-3.5 mr-1" /> Income category
        </Button>
      )}
      {type === 'expenses' && canOperateFinance && (
        <Button size="sm" variant="outline" onClick={() => setCategoryKind('expense')} title="Add an internal expense category">
          <Tags className="h-3.5 w-3.5 mr-1" /> Expense category
        </Button>
      )}
      {type === 'expenses' && canOperateFinance && (
        <Button size="sm" onClick={() => setNewExpenseOpen(true)} title="Record a business expense (rent, utilities, fees…)">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add expense
        </Button>
      )}
      {(type === 'invoices' || type === 'receipts') && !isAccountant && (
        <Button size="sm" onClick={() => setNewInvoiceOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
      )}
      {type === 'delivery_notes' && !isAccountant && (
        <Button size="sm" onClick={() => setNewDeliveryOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
      )}
      {type === 'dispatch' && !isAccountant && (
        <Button size="sm" onClick={() => setNewDeliveryOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add manual note</Button>
      )}
      {type === 'cheques' && !isAccountant && (
        <Button size="sm" onClick={() => setNewChequeOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
      )}
      {type === 'payments' && canOperateFinance && (
        // Two directions of money, one action each: money in is a payment, money out is an
        // expense. "Add expense" opens the SAME dialog as the Expenses tab — it books the
        // cost and (Paid now, on by default) the cash going out in one step. It used to open
        // the payment form on a settle-only branch, which could pay an expense but never
        // record one, so the label described something the form could not do — and it
        // dead-ended ("nothing to pay") for the ordinary case where the bill doesn't exist
        // yet. Settling a bill you already have belongs on that bill's own row, where you can
        // see what is owed: Expenses / Payables / the Inbox all carry "Record payment".
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* The chevron is the only thing telling you this opens a choice rather than the
                payment form directly — same affordance as OrdersPanel's "New order". */}
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Record payment
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRecordPaymentOpen(true)}>
              <Wallet className="h-4 w-4 mr-2" /> Record payment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setNewExpenseOpen(true)}>
              <Receipt className="h-4 w-4 mr-2" /> Add expense
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {type === 'credit_notes' && !isAccountant && (
        <Button size="sm" onClick={() => setNewCreditNoteOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New</Button>
      )}
    </div>
  );

  return (
    <div>
      <div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Content — the document-type nav lives in FinancePage's DOC_TABS sidebar. */}
          <div className="min-w-0 flex-1 space-y-3">
            {type === 'dispatch' ? (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold capitalize flex items-center gap-2"><Truck className="h-4 w-4" /> {DOC_LABEL[type]}</h2>
                  {docActions}
                </div>
                {activeWorkspaceId ? <DispatchBoard key={dispatchRefresh} workspaceId={activeWorkspaceId} readOnly={isAccountant} /> : null}
              </>
            ) : (
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
                <CardTitle className="flex items-center gap-2 capitalize"><FileText className="h-4 w-4" /> {DOC_LABEL[type]}</CardTitle>
                {docActions}
              </CardHeader>
              <CardContent className="p-0">
                {loading || wsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : type === 'credit_notes' ? (
                  <CreditNoteTable rows={paginate(activeRows as CreditNote[], page)} financeBase={financeBase} />
                ) : type === 'expenses' ? (
                  <InboundTable rows={paginate(filteredInbound, page)} financeBase={financeBase} workspaceId={activeWorkspaceId} readOnly={!canOperateFinance} onChanged={load} categories={sideCategories} categoryName={categoryName} onOpenExpense={setPaymentsExpenseId} />
                ) : type === 'payments' ? (
                  <PaymentsTable rows={paginate(filteredPayments, page)} categoryName={categoryName} financeBase={financeBase} />
                ) : type === 'delivery_notes' ? (
                  <DeliveryNotesTable rows={paginate(activeRows as DeliveryNote[], page)} readOnly={isAccountant} onChanged={load} />
                ) : type === 'cheques' ? (
                  <ChequesTable rows={paginate(activeRows as Cheque[], page)} readOnly={isAccountant} onChanged={load} />
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
                      {paginate(rows, page).map((i) => (
                        <tr
                          key={i.id}
                          className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                          // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                          // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                          // row is invalid ARIA and yields a focus stop with no name. (audit #302 finding 3)
                          onClick={() => navigate(`${financeBase}/invoices/${i.id}`)}
                        >
                          <td className="px-4 py-2 font-mono text-xs">
                            <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`${financeBase}/invoices/${i.id}`); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{i.internal_number}</button>
                          </td>
                          <td className="px-4 py-2">{i.issued_at ? new Date(i.issued_at).toLocaleDateString() : <span className="text-muted-foreground">Draft</span>}</td>
                          <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                            {isAccountant ? (
                              <span className="text-xs text-muted-foreground">{categoryName((i as any).category_id)}</span>
                            ) : (
                              <CategoryCell value={(i as any).category_id ?? null} options={sideCategories} onChange={(v) => setInvoiceCategory(i.id, v)} />
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">{formatMoney(i.total, i.currency)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatMoney(i.amount_due, i.currency)}</td>
                          <td className="px-4 py-2 text-center"><span className={`text-[10px] ${statusTone(i.status)}`}>{humanizeLabel(i.status)}</span></td>
                          <td className="px-4 py-2 text-center">{transmitted((i as any).fiscal_status) ? <span className="text-emerald-500" title="Transmitted to myDATA">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2 text-right">
                            <InvoiceActionsMenu invoiceId={i.id} financeBase={financeBase} status={i.status} fiscalStatus={(i as any).fiscal_status ?? null} fiscalMark={(i as any).fiscal_mark ?? null} onChanged={load} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {/* One footer for whichever document table is active — they all render inside
                    this CardContent, so the border lines up with the last row. */}
                {!loading && !wsLoading && (
                  <TablePagination page={page} total={activeRows.length} onPageChange={setPage} label={DOC_LABEL[type].toLowerCase()} />
                )}
              </CardContent>
            </Card>
            )}

            {type === 'expenses' && !loading && recurring.length > 0 && (
              <RecurringExpensesCard rows={recurring} categoryName={categoryName} readOnly={!canOperateFinance} onChanged={load} />
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
          onCreated={() => { setNewDeliveryOpen(false); load(); setDispatchRefresh((n) => n + 1); }}
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
        <ExpensePaymentsDialog
          workspaceId={activeWorkspaceId}
          expenseId={paymentsExpenseId}
          open={!!paymentsExpenseId}
          onOpenChange={(v) => { if (!v) setPaymentsExpenseId(null); }}
          onChanged={load}
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
      {activeWorkspaceId && categoryKind && (
        <QuickCategoryDialog
          workspaceId={activeWorkspaceId}
          kind={categoryKind}
          open={!!categoryKind}
          onOpenChange={(v) => { if (!v) setCategoryKind(null); }}
          onChanged={load}
        />
      )}
      {activeWorkspaceId && (
        <NewExpenseDialog
          workspaceId={activeWorkspaceId}
          open={newExpenseOpen}
          onOpenChange={setNewExpenseOpen}
          onCreated={() => { setNewExpenseOpen(false); load(); }}
        />
      )}
      <MydataSyncDialog
        open={syncDialogOpen}
        onOpenChange={(v) => { if (!syncing) setSyncDialogOpen(v); }}
        syncing={syncing}
        onConfirm={syncInbound}
      />
    </div>
  );
};

const CADENCE_LABEL: Record<RecurringExpense['cadence'], string> = {
  weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

/** Recurring-expense templates — each auto-generates a categorized bill every period via the
 *  finance-recurring-expenses-daily cron. Pause/resume/delete inline. */
const RecurringExpensesCard: React.FC<{ rows: RecurringExpense[]; categoryName: (id: any) => string; readOnly: boolean; onChanged: () => void }> = ({ rows, categoryName, readOnly, onChanged }) => {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Deleting a template shrinks the list — don't strand the operator on a page that's gone.
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);
  const toggle = async (r: RecurringExpense) => {
    setBusyId(r.id);
    try { await financeService.setRecurringExpenseActive(r.id, !r.is_active); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };
  const remove = async (r: RecurringExpense) => {
    if (!window.confirm('Delete this recurring expense? Bills already generated are kept.')) return;
    setBusyId(r.id);
    try { await financeService.deleteRecurringExpense(r.id); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };
  return (
    <Card>
      <div className="border-b border-border/60 px-4 py-2.5 flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold">Recurring expenses</div>
      </div>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Every</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-left">Next</th>
              <th className="px-4 py-2 text-center">Auto-pay</th>
              <th className="px-4 py-2 text-center">Status</th>
              {!readOnly && <th className="px-4 py-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {paginate(rows, page).map((r) => (
              <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                <td className="px-4 py-2">{r.description || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{categoryName(r.category_id)}</td>
                <td className="px-4 py-2 text-xs">{r.interval_count > 1 ? `${r.interval_count}× ` : ''}{CADENCE_LABEL[r.cadence]}</td>
                <td className="px-4 py-2 text-right">{formatMoney(Number(r.subtotal_net) + Number(r.vat_amount), r.currency)}</td>
                <td className="px-4 py-2">{r.is_active ? new Date(r.next_run_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2 text-center">{r.auto_pay ? <span className="text-emerald-500">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2 text-center"><span className={`text-[10px] ${statusTone(r.is_active ? 'active' : 'paused')}`}>{r.is_active ? 'Active' : 'Paused'}</span></td>
                {!readOnly && (
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busyId === r.id} onClick={() => toggle(r)} title={r.is_active ? 'Pause' : 'Resume'}>
                        {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : r.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={busyId === r.id} onClick={() => remove(r)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination page={page} total={rows.length} onPageChange={setPage} label="recurring expenses" />
      </CardContent>
    </Card>
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
            <td className="px-4 py-2"><span className={c.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>{c.direction === 'in' ? 'Received' : 'Issued'}</span></td>
            <td className="px-4 py-2 font-mono text-xs">{c.cheque_number ?? '—'}</td>
            <td className="px-4 py-2">{c.bank ?? '—'}</td>
            <td className={`px-4 py-2 ${overdue(c) ? 'text-destructive font-medium' : ''}`}>{c.due_date ?? '—'}</td>
            <td className="px-4 py-2 text-right font-medium">{formatMoney(c.amount, c.currency)}</td>
            <td className="px-4 py-2">
              {readOnly ? (
                <span className={`text-[10px] ${statusTone(c.status)}`}>{humanizeLabel(c.status)}</span>
              ) : (
                <Select value={c.status} onValueChange={(v: any) => setStatus(c.id, v)}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CHEQUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanizeLabel(s)}</SelectItem>)}</SelectContent>
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
            <td className="px-4 py-2"><span className="text-[10px] text-muted-foreground">{d.kind === 'receipt' ? 'Receipt' : 'Dispatch'}</span></td>
            <td className="px-4 py-2">{d.issued_at ? new Date(d.issued_at).toLocaleDateString() : new Date(d.created_at).toLocaleDateString()}</td>
            <td className="px-4 py-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className={`text-[10px] ${statusTone(d.status)}`}>{humanizeLabel(d.status)}</span>
                {d.fiscal_mark && <span className="text-[10px] text-emerald-500" title={`MARK ${d.fiscal_mark}`}>myDATA ✓</span>}
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
          <td className="px-4 py-2"><span className="text-xs text-muted-foreground">{cn.document_type ?? '—'}</span></td>
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

const PaymentsTable: React.FC<{ rows: PaymentWithAllocation[]; categoryName: (id: any) => string; financeBase: string }> = ({ rows, categoryName, financeBase }) => {
  // Deep-link the party name to its CRM record. Mirror the finance mount point:
  // operator surfaces are under /admin/*, business-owner surfaces at the root.
  const crmBase = financeBase.startsWith('/admin') ? '/admin/crm' : '/crm';
  return (
  <table className="w-full text-sm">
    <thead className="border-b border-border/60 text-xs text-muted-foreground">
      <tr>
        <th className="px-4 py-2 text-left">Date</th>
        <th className="px-4 py-2 text-left">Direction</th>
        <th className="px-4 py-2 text-left">Party</th>
        <th className="px-4 py-2 text-left">Order</th>
        <th className="px-4 py-2 text-left">Account</th>
        <th className="px-4 py-2 text-left">Reference</th>
        <th className="px-4 py-2 text-right">Amount</th>
        <th className="px-4 py-2 text-right">Allocated</th>
        <th className="px-4 py-2 text-right w-24">Receipt / Voucher</th>
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 && (
        <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No payments recorded.</td></tr>
      )}
      {rows.map((p: any) => {
        const allocated = (p.allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0);
        // On-account remainder — the credit still available on a money-in payment.
        const onAccount = p.direction === 'in' ? Math.round((Number(p.amount ?? 0) - allocated) * 100) / 100 : 0;
        return (
          <tr key={p.id} className="border-b border-border/30">
            <td className="px-4 py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
            <td className="px-4 py-2">
              <span className={p.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                {p.direction === 'in' ? 'Received' : (p.credit_number ? 'Refund' : 'Paid')}
              </span>
            </td>
            <td className="px-4 py-2 truncate max-w-[180px]" title={p.party_name ?? undefined}>
              {p.party_name
                ? ((p.counterparty_company_id || p.counterparty_contact_id)
                    ? <Link to={`${crmBase}/${p.counterparty_company_id ? 'companies' : 'contacts'}/${p.counterparty_company_id ?? p.counterparty_contact_id}`} className="text-primary hover:underline">{p.party_name}</Link>
                    : p.party_name)
                : '—'}
            </td>
            <td className="px-4 py-2">
              {p.order_id
                ? <Link to={`${financeBase}/orders/${p.order_id}`} className="text-primary hover:underline text-xs">{p.order_number ?? 'open'}</Link>
                : <span className="text-muted-foreground">—</span>}
            </td>
            {/* The ACCOUNT, not the method — the account is what was picked and the method is
                derived from it, so printing the method restated the same fact one step removed. */}
            <td className="px-4 py-2">{p.bank_account_name ?? '—'}</td>
            <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]" title={p.reference ?? undefined}>
              {p.reference ?? (p.category_id ? categoryName(p.category_id) : '—')}
            </td>
            <td className="px-4 py-2 text-right font-medium">
              {formatMoney(p.amount, p.currency)}
              {p.credit_number && onAccount > 0.005 && (
                <span className="block text-[10px] font-normal text-muted-foreground">{p.credit_number} · {formatMoney(onAccount, p.currency)} on account</span>
              )}
            </td>
            <td className="px-4 py-2 text-right text-muted-foreground">
              {formatMoney(allocated, p.currency)}
              {/* Name what the money actually settled — an amount alone doesn't say whether
                  this paid an expense, an invoice or sat against an order. */}
              {(p.settled ?? []).length > 0 && (
                <span className="block text-[10px] font-normal text-muted-foreground/80">
                  {(p.settled ?? []).map((s: any) => s.label).join(' · ')}
                </span>
              )}
            </td>
            <td className="px-4 py-2 text-right"><PaymentReceiptActions paymentId={p.id} direction={p.direction} /></td>
          </tr>
        );
      })}
    </tbody>
  </table>
  );
};

/**
 * The issuer of a received document. When we already know them — a CRM company carrying the
 * same ΑΦΜ — the name becomes a link to that record; otherwise it stays plain text and the
 * row's ⋮ menu offers "Add issuer to CRM". The VAT always shows, because for ~2/3 of AADE's
 * documents it is the ONLY identity the feed carries until ΓΕΜΗ resolution fills the name in.
 */
const IssuerCell: React.FC<{ doc: InboundDocument; crmCompanyId?: string }> = ({ doc, crmCompanyId }) => {
  const label = doc.issuer_name ?? '—';
  return (
    <>
      {crmCompanyId ? (
        <Link
          to={`/crm/companies/${crmCompanyId}`}
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </Link>
      ) : (
        <div className="font-medium">{label}</div>
      )}
      <div className="text-xs text-muted-foreground font-mono">{doc.issuer_vat ?? ''}</div>
    </>
  );
};

const InboundTable: React.FC<{ rows: InboundDocument[]; financeBase: string; workspaceId: string | null; readOnly: boolean; onChanged: () => void; categories: FinanceCategory[]; categoryName: (id: any) => string; onOpenExpense: (billId: string) => void }> = ({ rows, workspaceId, readOnly, onChanged, categories, categoryName }) => {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = React.useState<InboundDocument | null>(null);
  /** Document being paid before it is an expense — the conversion happens when that form saves. */
  const [payDoc, setPayDoc] = React.useState<InboundDocument | null>(null);
  /** Document being turned into the purchase order it was always for. */
  const [orderDoc, setOrderDoc] = React.useState<InboundDocument | null>(null);
  /** Which rows already produced an order — held on their expense (`supplier_bills.order_id`). */
  const [ordered, setOrdered] = React.useState<Set<string>>(new Set());
  const [localCat, setLocalCat] = React.useState<Record<string, string | null>>({});
  // VAT → CRM company id, so a known issuer's name links straight to their record instead of
  // making the operator go and search for them.
  const [crmByVat, setCrmByVat] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    (async () => {
      const { data } = await supabase
        .from('crm_companies').select('id, vat_number')
        .eq('workspace_id', workspaceId).not('vat_number', 'is', null);
      if (!live) return;
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as { id: string; vat_number: string }[]) {
        const key = String(c.vat_number).replace(/\D/g, '');
        if (key) map[key] = c.id;
      }
      setCrmByVat(map);
    })();
    return () => { live = false; };
  }, [workspaceId, rows.length]);

  /**
   * Recording a payment is ONE act with ONE form — the platform's Record Payment dialog, preset
   * to this document. Whether an expense exists yet is our bookkeeping, not the operator's
   * question: if it does the payment settles it, if it doesn't the document is converted on
   * save. (This briefly branched to a different modal when the expense existed, which is exactly
   * the "why are there two of these?" the operator hit. Opening never writes either way.)
   */
  const openPayments = (d: InboundDocument) => setPayDoc(d);

  React.useEffect(() => {
    let live = true;
    docsWithOrders(rows).then((s) => { if (live) setOrdered(s); }).catch(() => {});
    return () => { live = false; };
  }, [rows]);
  const setCategory = async (id: string, categoryId: string | null) => {
    setLocalCat((m) => ({ ...m, [id]: categoryId }));
    try { await inboundService.setCategory(id, categoryId); }
    catch (err: any) { toast({ title: 'Failed to set category', description: err?.message, variant: 'destructive' }); onChanged(); }
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
          <th className="px-4 py-2 text-left">Number</th>
          <th className="px-4 py-2 text-left">Issuer</th>
          <th className="px-4 py-2 text-left">Type</th>
          <th className="px-4 py-2 text-left">Category</th>
          <th className="px-4 py-2 text-right">Net</th>
          <th className="px-4 py-2 text-right">VAT</th>
          <th className="px-4 py-2 text-right">Payable</th>
          <th className="px-4 py-2 text-center">Handled</th>
          <th className="px-4 py-2 text-right" />
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const cat = d.id in localCat ? localCat[d.id] : (d.category_id ?? null);
          const outcomes = inboundOutcomes(d, { ordered: ordered.has(d.id) });
          return (
          <tr key={d.id} className={`border-b border-border/30 ${d.status === 'dismissed' ? 'opacity-60' : ''}`}>
            <td className="px-4 py-2">{d.issue_date ? new Date(d.issue_date).toLocaleDateString() : '—'}</td>
            <td className="px-4 py-2">
              <div className="text-xs font-medium">{d.series ?? '—'}{d.aa ? ` ${d.aa}` : ''}</div>
              <div className="text-[10px] text-muted-foreground font-mono" title={`MARK ${d.mark}`}>{d.mark}</div>
            </td>
            <td className="px-4 py-2">
              <IssuerCell doc={d} crmCompanyId={d.issuer_vat ? crmByVat[d.issuer_vat.replace(/\D/g, '')] : undefined} />
            </td>
            <td className="px-4 py-2"><MydataTypeLabel code={d.doc_type} /></td>
            <td className="px-4 py-2">
              {readOnly
                ? <span className="text-xs text-muted-foreground">{categoryName(cat)}</span>
                : <CategoryCell value={cat} options={categories} onChange={(v) => setCategory(d.id, v)} />}
            </td>
            <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(d.total_net ?? 0, d.currency)}</td>
            <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(d.total_vat ?? 0, d.currency)}</td>
            <td className="px-4 py-2 text-right font-medium">{formatMoney(d.total_gross ?? 0, d.currency)}</td>
            <td className="px-4 py-2 text-center">
              {outcomes.length > 0
                ? <span className="text-[10px]">
                    {outcomes.map((o, i) => (
                      <React.Fragment key={o.label}>
                        {i > 0 && <span className="text-muted-foreground/50"> · </span>}
                        <span className={o.tone}>{o.label}</span>
                      </React.Fragment>
                    ))}
                  </span>
                : <span className="text-[10px] text-muted-foreground/50">—</span>}
            </td>
            <td className="px-4 py-2 text-right">
              {!readOnly && workspaceId && (
                <div className="flex justify-end">
                  <InboundDocActionsMenu
                    doc={d}
                    workspaceId={workspaceId}
                    busy={busy === d.id}
                    crmCompanyId={d.issuer_vat ? crmByVat[d.issuer_vat.replace(/\D/g, '')] : undefined}
                    onRecordPayment={() => openPayments(d)}
                    onCreateOrder={() => setOrderDoc(d)}
                    hasOrder={ordered.has(d.id)}
                    onReceiveStock={() => setReceiveDoc(d)}
                    onDismiss={() => dismiss(d.id)}
                    onChanged={onChanged}
                  />
                </div>
              )}
            </td>
          </tr>
          );
        })}
      </tbody>
      {receiveDoc && workspaceId && (
        <ReceiveToWarehouseDialog
          doc={receiveDoc}
          workspaceId={workspaceId}
          onOpenChange={(v) => { if (!v) setReceiveDoc(null); }}
          onDone={() => { setReceiveDoc(null); onChanged(); }}
        />
      )}
      {orderDoc && workspaceId && (
        <NewOrderModal
          workspaceId={workspaceId}
          lockedCompanyId={orderDoc.issuer_vat ? crmByVat[orderDoc.issuer_vat.replace(/\D/g, '')] : undefined}
          preset={{ orderType: 'purchase', draft: false }}
          prefill={{ currency: orderDoc.currency, notes: `From myDATA ${orderDoc.series ?? ''}${orderDoc.aa ? ` ${orderDoc.aa}` : ''} · MARK ${orderDoc.mark}`.trim(), lines: orderLinesFromDoc(orderDoc), fromDocument: true, inboundDocumentId: orderDoc.id }}
          categories={categories}
          open
          onOpenChange={(v) => { if (!v) setOrderDoc(null); }}
          // The modal owns the document → order → expense → payment chain (and reports its own
          // failures), so there is nothing left to do here but refresh.
          onCreated={() => { setOrderDoc(null); onChanged(); }}
        />
      )}
      {payDoc && workspaceId && (
        <RecordPaymentDialog
          workspaceId={workspaceId}
          // Same form either way — it settles the expense if this document already became one,
          // and converts it on save if it hasn't.
          presetExpenseId={payDoc.created_supplier_bill_id ?? undefined}
          open
          onOpenChange={(v) => { if (!v) setPayDoc(null); }}
          onSaved={() => { setPayDoc(null); onChanged(); }}
        />
      )}
    </table>
  );
};

export default DocumentsPage;
