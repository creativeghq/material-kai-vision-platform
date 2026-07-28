/**
 * #204 — dedicated Finance documents list with a document-type left nav, mirroring the
 * operator's accounting tool. Invoices / Receipts (11.x) come from `invoices`; Credit
 * notes from `credit_notes`. Each row carries status + an mD (myDATA transmitted) flag +
 * the shared 3-dots action menu. Delivery/goods-receipt notes (`delivery_notes`) and the
 * Expenses inbox (`inbound_documents`) are fully wired surfaces alongside invoices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Loader2, Plus, FileText, Receipt, Wallet, Tags, Repeat, Pause, Play, Trash2, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { financeService, formatMoney, paymentMethodLabel, type Invoice, type CreditNote, type PaymentWithAllocation, type SupplierBill, type SupplierBillStatus, type RecurringExpense } from '@/modules/finance/services/financeService';
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
import { NewCreditNoteDialog } from '@/modules/finance/components/NewCreditNoteDialog';
import { QuickCategoryDialog } from '@/modules/finance/components/QuickCategoryDialog';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { MydataSyncDialog } from '@/modules/finance/components/MydataSyncDialog';
import { DispatchBoard } from '@/modules/finance/components/DispatchBoard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import { warehouseService, type WarehouseItem, type Warehouse } from '@/services/warehouseService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { parseDecimalOr } from '@/utils/decimal';
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
  <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
    <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
    <SelectContent>
      <SelectItem value={NONE}><span className="text-muted-foreground">Uncategorized</span></SelectItem>
      {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
    </SelectContent>
  </Select>
);

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
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>([]);
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
      const [inv, cn, inb, pmts, dns, chq, cats, bills] = await Promise.all([
        // Paged client-side below, so the fetch cap is a safety ceiling, not a page size —
        // 200 silently hid older documents once a workspace crossed it.
        financeService.listInvoices({ workspaceId: activeWorkspaceId, limit: 1000 }),
        financeService.listCreditNotes({ workspaceId: activeWorkspaceId }),
        inboundService.list(activeWorkspaceId).catch(() => []),
        financeService.listPayments({ workspaceId: activeWorkspaceId, limit: 1000 }).catch(() => []),
        deliveryNotesService.list(activeWorkspaceId).catch(() => []),
        chequesService.list(activeWorkspaceId).catch(() => []),
        financeCategoriesService.list(activeWorkspaceId).catch(() => [] as FinanceCategory[]),
        // Only the Expenses tab renders the recorded-bill spend log — skip the query elsewhere.
        type === 'expenses'
          ? financeService.listSupplierBills({ workspaceId: activeWorkspaceId }).catch(() => [] as SupplierBill[])
          : Promise.resolve([] as SupplierBill[]),
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
      setSupplierBills(bills);
      setPayments(pmts);
      setDeliveryNotes(dns);
      setCheques(chq);
    } catch (err: any) {
      toast({ title: 'Failed to load documents', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activeWorkspaceId]);

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
      case 'expenses': return inbound;
      case 'payments': return payments;
      case 'delivery_notes': return deliveryNotes;
      case 'cheques': return cheques;
      default: return [];
    }
  }, [type, invoices, creditNotes, inbound, payments, deliveryNotes, cheques]);

  const filterGroups = useMemo(
    () => buildDocumentFilters(type as DocFilterType, { rows: baseRows, categories: sideCategories, categoryName }),
    [type, baseRows, sideCategories, categoryMap],
  );
  const { values: filterValues, setValues: setFilterValues, filtered: activeRows, previewCount } =
    useFilters<any>(baseRows, filterGroups);

  // Switching document type carries no meaningful filter state across — start clean.
  useEffect(() => { setFilterValues({}); setPage(1); }, [type]);
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
        <Button size="sm" onClick={() => setRecordPaymentOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Record payment</Button>
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
                  <InboundTable rows={paginate(filteredInbound, page)} financeBase={financeBase} workspaceId={activeWorkspaceId} readOnly={!canOperateFinance} onChanged={load} categories={sideCategories} categoryName={categoryName} />
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
                        <tr key={i.id} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`${financeBase}/invoices/${i.id}`)}>
                          <td className="px-4 py-2 font-mono text-xs">{i.internal_number}</td>
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
            {/* Only OPEN (unpaid) bills live here — once a bill is paid, its cash-out shows in the
                Payments tab instead (the money ledger). Keeps Expenses = "what you still owe". */}
            {type === 'expenses' && !loading && (() => {
              const openBills = supplierBills.filter((b) => b.status !== 'paid' && Number(b.amount_due) > 0.005);
              return openBills.length > 0 ? <RecordedExpensesCard rows={openBills} categoryName={categoryName} /> : null;
            })()}
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

/** Open (unpaid) supplier bills shown under the myDATA inbox on the Expenses tab — what you still
 *  owe. These `supplier_bills` also age in Payables (AP). Once paid, a bill drops off here and its
 *  cash-out appears in the Payments tab (the money ledger). */
const RecordedExpensesCard: React.FC<{ rows: SupplierBill[]; categoryName: (id: any) => string }> = ({ rows, categoryName }) => {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);
  return (
    <Card>
      <div className="border-b border-border/60 px-4 py-2.5">
        <div className="text-sm font-semibold">Open bills you owe</div>
        <p className="text-[11px] text-muted-foreground">Unpaid supplier bills — these age in Payables (AP). Once paid, a bill moves to the Payments tab as a “Paid” cash-out.</p>
      </div>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Reference</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Due</th>
              <th className="px-4 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginate(rows, page).map((b) => (
              <tr key={b.id} className="border-b border-border/30 hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">{b.supplier_bill_number || <span className="text-muted-foreground">{b.notes ? b.notes.slice(0, 40) : '—'}</span>}</td>
                <td className="px-4 py-2">{b.issued_at ? new Date(b.issued_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{categoryName((b as any).category_id)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(b.total, b.currency)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatMoney(b.amount_due, b.currency)}</td>
                <td className="px-4 py-2 text-center"><span className={`text-[10px] ${statusTone(b.status)}`}>{humanizeLabel(b.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination page={page} total={rows.length} onPageChange={setPage} label="bills" />
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
        <th className="px-4 py-2 text-left">Method</th>
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
                ? <Link to={`${financeBase}?tab=doc_orders&order=${p.order_id}`} className="text-primary hover:underline text-xs">{p.order_number ?? 'open'}</Link>
                : <span className="text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-2">{p.method ? paymentMethodLabel(p.method) : '—'}</td>
            <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]" title={p.reference ?? undefined}>
              {p.reference ?? (p.category_id ? categoryName(p.category_id) : '—')}
            </td>
            <td className="px-4 py-2 text-right font-medium">
              {formatMoney(p.amount, p.currency)}
              {p.credit_number && onAccount > 0.005 && (
                <span className="block text-[10px] font-normal text-muted-foreground">{p.credit_number} · {formatMoney(onAccount, p.currency)} on account</span>
              )}
            </td>
            <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(allocated, p.currency)}</td>
            <td className="px-4 py-2 text-right"><PaymentReceiptActions paymentId={p.id} direction={p.direction} /></td>
          </tr>
        );
      })}
    </tbody>
  </table>
  );
};

const InboundTable: React.FC<{ rows: InboundDocument[]; financeBase: string; workspaceId: string | null; readOnly: boolean; onChanged: () => void; categories: FinanceCategory[]; categoryName: (id: any) => string }> = ({ rows, workspaceId, readOnly, onChanged, categories, categoryName }) => {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = React.useState<InboundDocument | null>(null);
  const [localCat, setLocalCat] = React.useState<Record<string, string | null>>({});

  const createBill = async (id: string) => {
    setBusy(id);
    try { await inboundService.toSupplierBill(id); toast({ title: 'Supplier bill created' }); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
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
          <th className="px-4 py-2 text-left">Issuer</th>
          <th className="px-4 py-2 text-left">Type</th>
          <th className="px-4 py-2 text-left">Category</th>
          <th className="px-4 py-2 text-right">Total</th>
          <th className="px-4 py-2 text-center">Status</th>
          <th className="px-4 py-2 text-right" />
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const cat = d.id in localCat ? localCat[d.id] : (d.category_id ?? null);
          return (
          <tr key={d.id} className="border-b border-border/30">
            <td className="px-4 py-2">{d.issue_date ? new Date(d.issue_date).toLocaleDateString() : '—'}</td>
            <td className="px-4 py-2">
              <div className="font-medium">{d.issuer_name ?? '—'}</div>
              <div className="text-xs text-muted-foreground font-mono">{d.issuer_vat ?? ''}</div>
            </td>
            <td className="px-4 py-2"><span className="text-xs text-muted-foreground">{d.doc_type ?? '—'}</span></td>
            <td className="px-4 py-2">
              {readOnly
                ? <span className="text-xs text-muted-foreground">{categoryName(cat)}</span>
                : <CategoryCell value={cat} options={categories} onChange={(v) => setCategory(d.id, v)} />}
            </td>
            <td className="px-4 py-2 text-right font-medium">{formatMoney(d.total_gross ?? 0, d.currency)}</td>
            <td className="px-4 py-2 text-center"><span className={`text-[10px] ${statusTone(d.status)}`}>{humanizeLabel(d.status)}</span></td>
            <td className="px-4 py-2 text-right">
              {!readOnly && workspaceId && (
                <div className="flex justify-end">
                  <InboundDocActionsMenu
                    doc={d}
                    workspaceId={workspaceId}
                    busy={busy === d.id}
                    onCreateBill={() => createBill(d.id)}
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
    const active = lines.map((_, i) => ({ i, r: rows[i] })).filter(({ r }) => r && r.mode !== 'skip' && parseDecimalOr(r.qty, 0) > 0);
    if (active.length === 0) { toast({ title: 'Nothing to receive', description: 'Match or create at least one line.', variant: 'destructive' }); return; }
    const needsCreate = active.some(({ r }) => r.mode === '__create');
    if (needsCreate && !targetWh) { toast({ title: 'Pick a target warehouse', description: 'New stock items need a warehouse.', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const mappings: { item_id: string; quantity: number }[] = [];
      let created = 0;
      for (const { r } of active) {
        const qty = parseDecimalOr(r.qty, 0);
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
          <DialogTitle>Receive into warehouse — {doc.issuer_name ?? doc.issuer_vat ?? doc.mark}</DialogTitle><DialogDescription className="sr-only">Receive this document's lines into the warehouse.</DialogDescription>
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
                      <Input className="h-8 text-xs text-right" type="text" inputMode="decimal"
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
