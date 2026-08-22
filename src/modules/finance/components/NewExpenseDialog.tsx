// Record a business operating expense (rent, utilities, fees, …). An expense IS a supplier
// bill — the canonical spend record that feeds Payables (AP aging) + P&L per category. Party
// is optional. The "Paid now" toggle flips it between an open payable and a settled cost:
//   OFF → open payable (shows in AP with a due date)
//   ON  → also books the outgoing payment now (settled, drops out of AP, hits cash-out)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, ScanLine, Paperclip, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { foldForSearch } from '@/components/core/filters/types';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import {
  financeService, type PaymentMethod, type BankAccountBalance, type RecurringCadence,
} from '@/modules/finance/services/financeService';
import { ordersService, type OrderLinkTarget } from '@/modules/finance/services/ordersService';
import { OrderLinkPicker } from '@/modules/finance/components/OrderLinkPicker';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { crmBankAccountsAPI, type CrmBankAccount } from '@/services/crm.service';
import { QuickAddCompanyDialog } from '@/components/business/crm/QuickAddCompanyDialog';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { useEntitlements } from '@/hooks/useEntitlements';
import { receiptScanService, splitForForm, RECEIPT_ACCEPT, ReceiptTooLargeError } from '@/services/receiptScanService';
import { parseDecimalOr } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';

// A payee is a CRM company, a CRM person, or a one-off name.
// type 'adhoc' → a one-off payee not saved in CRM; `id` is null and `label` holds the typed name.
// `isSupplier` only sorts the search results — it is NOT a filter (see the search effect).
interface Party { type: 'company' | 'contact' | 'adhoc'; id: string | null; label: string; isSupplier?: boolean }

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `result.amountPaid` is the cash that ACTUALLY left an account (0 when saved as a payable).
   * The order screen needs it to draw the customer's on-account credit down by what was spent
   * on their job — it must never assume the form's total was paid.
   */
  onCreated: (result?: { billId: string; paymentId: string | null; amountPaid: number }) => void;
  /** Link the expense to an order (so it shows on that order) + seed the amount/description. Used by
   *  the order's "Add expense" to turn a line cost into a real supplier bill in one step. */
  orderId?: string;
  prefill?: {
    /** NET, VAT excluded — it lands in "Subtotal (net)". Pass `vatAmount` for the tax on it. */
    amount?: number;
    /**
     * VAT on `amount`. Required whenever the source of the prefill knows a rate: without it the
     * form opened at "net = the whole sum, VAT = 0", which books a VAT-bearing cost with its tax
     * folded into the net — the P&L cost is overstated and the recoverable VAT is lost. Callers
     * that pass a GROSS figure must split it before passing it, not dump it into `amount`.
     */
    vatAmount?: number;
    description?: string;
    categoryId?: string;
    /** Pre-select the payee: a CRM supplier company OR contact (+ display name), or a one-off name. */
    supplier?: { companyId?: string | null; contactId?: string | null; name?: string | null };
  };
}

export const NewExpenseDialog: React.FC<Props> = ({ workspaceId, open, onOpenChange, onCreated, orderId, prefill }) => {
  const { toast } = useToast();
  // Properties are only a sensible answer where the workspace actually sells/manages them.
  // `isModuleAvailable` fails open while loading, which is harmless here: a workspace without the
  // module has no properties, so the group renders nothing either way.
  const { isModuleAvailable } = useEntitlements();
  const realEstate = isModuleAvailable('real-estate');
  /**
   * The scanned receipt (#379). Held until the bill exists, then attached to it — a receipt has
   * nowhere to live before there is a bill to hang it on, and uploading it to a bill that the
   * operator then abandons would leave an orphan the reaper has to clean up.
   */
  const [receipt, setReceipt] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const receiptInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountBalance[]>([]);

  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [subtotalNet, setSubtotalNet] = useState<string>('0');
  const [vatAmount, setVatAmount] = useState<string>('0');
  const [issuedAt, setIssuedAt] = useState<string>(() => todayLocalISO());
  const [dueAt, setDueAt] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [paidNow, setPaidNow] = useState(true);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [repeat, setRepeat] = useState<'none' | RecurringCadence>('none');

  const [party, setParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [partyOptions, setPartyOptions] = useState<Party[]>([]);
  // Creating the BUSINESS payee is delegated to the shared QuickAddCompanyDialog (VAT/ΑΦΜ →
  // ΑΑΔΕ/ΓΕΜΗ/VIES → web research), so a supplier born here carries the same identity as one
  // added from CRM. Creating a PERSON payee stays inline — there is no registry for a person.
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  // The payee's own bank accounts — offered on a Bank Payment so you record which of THEIR banks
  // you paid to (managed on their CRM record → Tax & VAT → Bank Accounts).
  const [payeeBanks, setPayeeBanks] = useState<CrmBankAccount[]>([]);
  const [counterpartyBankId, setCounterpartyBankId] = useState<string>('');
  // What the cost is FOR — a project, a customer whose order it was incurred against, or a
  // purchase order this cost belongs to. ONE field, one answer — never a second "On purchase
  // order" control listing only the payee's own POs. That asks the same question twice and
  // cannot express the common case at all: freight and customs are billed by someone other
  // than the supplier whose order they belong to.
  const [link, setLink] = useState<OrderLinkTarget>({ kind: 'none' });
  // `supplier_bills.order_id` — the 3-way-match link. Either the order we were opened from, or the
  // one picked above. NOT `covers_order_id`, which is the demand side (see the picker's own note).
  const effectiveOrderId = orderId ?? (link.kind === 'cost_of_order' ? link.orderId : undefined);

  // A supplier passed in from the party page — used so the shared draft can't clobber the prefill.
  const prefillParty: Party | null = prefill?.supplier?.companyId
    ? { type: 'company', id: prefill.supplier.companyId, label: prefill.supplier.name || 'Supplier' }
    : prefill?.supplier?.contactId
      ? { type: 'contact', id: prefill.supplier.contactId, label: prefill.supplier.name || 'Supplier' }
      : prefill?.supplier?.name
        ? { type: 'adhoc', id: null, label: prefill.supplier.name }
        : null;

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === 'expense' || c.kind === 'both'),
    [categories],
  );
  const total = parseDecimalOr(subtotalNet, 0) + parseDecimalOr(vatAmount, 0);

  // Draft persistence — survives navigating away + reopening; cleared on Save / Cancel.
  // DISABLED in order mode: an order expense is seeded authoritatively from the line/order every
  // open, so a shared draft (from a prior general "Add expense") must never restore stale values
  // over the Order category / the line's supplier. Only the general expense form keeps a draft.
  const clearDraft = useSessionDraft(
    `fin-expense:${workspaceId}`,
    open && !orderId,
    { categoryId, description, reference, currency, subtotalNet, vatAmount, issuedAt, dueAt, notes, paidNow, bankAccountId, method, repeat, party },
    (d) => {
      setCategoryId(d?.categoryId ?? '');
      setDescription(d?.description ?? '');
      setReference(d?.reference ?? '');
      setCurrency(d?.currency ?? 'EUR');
      setSubtotalNet(d?.subtotalNet ?? '0');
      setVatAmount(d?.vatAmount ?? '0');
      setIssuedAt(d?.issuedAt ?? todayLocalISO());
      setDueAt(d?.dueAt ?? '');
      setNotes(d?.notes ?? '');
      setPaidNow(d?.paidNow ?? true);
      setBankAccountId(d?.bankAccountId ?? '');
      setMethod(d?.method ?? 'bank_transfer');
      setRepeat(d?.repeat ?? 'none');
      // Prefilled supplier (party page) wins over any stale draft party.
      setParty(prefillParty ?? d?.party ?? null);
      setPartySearch('');
    },
  );

  // Load expense categories + bank accounts when the dialog opens.
  useEffect(() => {
    if (!open || !workspaceId) return;
    void financeCategoriesService.list(workspaceId).then((cats) => {
      setCategories(cats);
      // Order-attached expense → the category is AUTHORITATIVE: the explicit prefill, else the
      // protected "Order" category. Overwrite (not `cur ||`) so a stale value from a prior open
      // of this (persistent) dialog never wins over the Order default.
      if (orderId) {
        const orderCat = cats.find((c) => c.is_system);
        setCategoryId(prefill?.categoryId || orderCat?.id || '');
      }
    }).catch(() => setCategories([]));
    // Balances (not just names) so the picker can show what's left in each account.
    void financeService.getBankAccountBalances(workspaceId).then((accts) => {
      setBankAccounts(accts);
      // Default to the workspace's default account when none picked yet.
      setBankAccountId((cur) => cur || accts.find((a) => a.is_default)?.bank_account_id || accts[0]?.bank_account_id || '');
    }).catch(() => setBankAccounts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, orderId]);

  // Seed when opened from an order's "Mark as paid" / "Add expense" (turning a line cost into a bill).
  // In ORDER MODE this is AUTHORITATIVE + resets the form to a clean state every open (the dialog is
  // persistent, so last-open values would otherwise linger): amount + supplier come straight from the
  // line/order, everything else resets to defaults. The Order category is applied by the load effect.
  useEffect(() => {
    if (!open) return;
    // Before the mode branches below — both of them `return` early, so anything that must run on
    // EVERY open belongs here. The create-business dialog is a child overlay, never part of the
    // draft: it should never be showing when this form opens.
    setCompanyDialogOpen(false);
    if (orderId) {
      setSubtotalNet(prefill?.amount != null ? String(prefill.amount) : '0');
      setVatAmount(prefill?.vatAmount != null ? String(prefill.vatAmount) : '0');
      setDescription(prefill?.description ?? '');
      setReference(''); setNotes(''); setCurrency('EUR'); setRepeat('none');
      setPaidNow(true); setDueAt('');
      setIssuedAt(todayLocalISO());
      // Supplier: set from the line/order, or CLEAR (so a prior line's supplier never carries over).
      if (prefill?.supplier?.companyId) setParty({ type: 'company', id: prefill.supplier.companyId, label: prefill.supplier.name || 'Supplier' });
      else if (prefill?.supplier?.contactId) setParty({ type: 'contact', id: prefill.supplier.contactId, label: prefill.supplier.name || 'Supplier' });
      else if (prefill?.supplier?.name) setParty({ type: 'adhoc', id: null, label: prefill.supplier.name });
      else setParty(null);
      setPartySearch('');
      return;
    }
    // General mode: only apply the fields that were prefilled (keeps the draft-restore behavior).
    if (!prefill) return;
    if (prefill.amount != null) {
      setSubtotalNet(String(prefill.amount));
      setVatAmount(prefill.vatAmount != null ? String(prefill.vatAmount) : '0');
    }
    if (prefill.description) setDescription(prefill.description);
    if (prefill.categoryId) setCategoryId(prefill.categoryId);
    if (prefill.supplier?.companyId) {
      setParty({ type: 'company', id: prefill.supplier.companyId, label: prefill.supplier.name || 'Supplier' });
    } else if (prefill.supplier?.contactId) {
      setParty({ type: 'contact', id: prefill.supplier.contactId, label: prefill.supplier.name || 'Supplier' });
    } else if (prefill.supplier?.name) {
      setParty({ type: 'adhoc', id: null, label: prefill.supplier.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, prefill?.amount, prefill?.vatAmount, prefill?.description, prefill?.categoryId, prefill?.supplier?.companyId, prefill?.supplier?.contactId, prefill?.supplier?.name]);

  // Load the picked payee's own bank accounts (for the Bank Payment "paid to their bank" selector).
  useEffect(() => {
    if (!open || !party || !party.id) { setPayeeBanks([]); return; }  // one-off payee has no CRM banks
    let cancelled = false;
    crmBankAccountsAPI.list(party.type === 'company' ? { companyId: party.id } : { contactId: party.id })
      .then((banks) => { if (!cancelled) setPayeeBanks(banks); })
      .catch(() => { if (!cancelled) setPayeeBanks([]); });
    return () => { cancelled = true; };
  }, [open, party]);

  // Clear the chosen payee bank if it's no longer valid (payee changed / not a bank payment).
  useEffect(() => {
    if (counterpartyBankId && !payeeBanks.some((b) => b.id === counterpartyBankId)) setCounterpartyBankId('');
  }, [payeeBanks, counterpartyBankId]);

  // 2.5 — a Bank Payment defaults to the payee's PRIMARY bank so reconciliation doesn't need a
  // manual pick every time (the point of storing per-party banks).
  useEffect(() => {
    if (method === 'bank_transfer' && !counterpartyBankId && payeeBanks.length) {
      const primary = payeeBanks.find((b) => b.is_primary);
      if (primary) setCounterpartyBankId(primary.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeBanks, method]);

  // Payee search — ANY CRM company OR person, not just records already flagged as suppliers.
  // Plenty of costs are paid to a person (a freelancer, a landlord, an accountant) or to a
  // company that was only ever tagged as a customer; requiring `is_supplier` up front made
  // those payees unreachable and left the picker looking company-only. Supplier-flagged rows
  // sort first so the common case still leads.
  useEffect(() => {
    if (!open) return;
    const term = partySearch.trim();
    if (term.length < 2) { setPartyOptions([]); return; }
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase.from('crm_companies').select('id, name, is_supplier')
          .ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(8),
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email, is_supplier')
          .ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(8),
      ]);
      const opts: Party[] = [];
      for (const c of companies.data ?? []) {
        opts.push({ type: 'company', id: c.id, label: `${c.name} (company)`, isSupplier: !!(c as any).is_supplier });
      }
      for (const c of contacts.data ?? []) {
        const label = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id;
        opts.push({ type: 'contact', id: c.id, label: `${label} (person)`, isSupplier: !!(c as any).is_supplier });
      }
      opts.sort((a, b) => Number(!!b.isSupplier) - Number(!!a.isSupplier));
      setPartyOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [partySearch, open]);

  // Pick a payee. Business rollup (the platform-wide rule, same as invoices / orders / supplier
  // credit notes): a PERSON attached to a company means the document belongs to that BUSINESS.
  // Resolved HERE, at pick time, so the operator sees who the bill is actually against instead
  // of it silently swapping on save. A standalone person stays the payee.
  const pickParty = async (o: Party) => {
    setPartySearch(''); setPartyOptions([]);
    if (o.type === 'contact' && o.id) {
      try {
        const companyId = await financeService.resolvePrimaryCompanyId(o.id);
        if (companyId) {
          const { data: comp } = await supabase.from('crm_companies').select('id, name').eq('id', companyId).maybeSingle();
          if (comp) {
            setParty({ type: 'company', id: comp.id as string, label: `${comp.name} (company)`, isSupplier: true });
            toast({
              title: 'Recorded against the business',
              description: `${o.label} is linked to ${comp.name} — the expense is booked to the business, not the person.`,
            });
            return;
          }
        }
      } catch { /* fall back to paying the person directly */ }
    }
    setParty(o);
  };

  // A supplier bill requires a counterparty (myDATA, statements, spend-per-supplier), and the
  // one created here used to be a name and two booleans — the same company added from CRM
  // arrived with its registered name, address, ΔΟΥ, ΚΑΔ, Γ.Ε.ΜΗ. number and website. Same table,
  // same business, a quarter of the record depending on which screen you were on. The shared
  // dialog does the identity lookup + the dedupe; we only adopt what it hands back.
  const adoptCreatedCompany = (company: { id: string; name: string }) => {
    setParty({ type: 'company', id: company.id, label: `${company.name} (company)`, isSupplier: true });
    setPartySearch(''); setPartyOptions([]);
  };

  // Quick-create a PERSON payee (freelancer, landlord, accountant…) — the counterpart of
  // `createParty` for costs paid to someone who isn't a business. Find-or-create by name so a
  // recurring cost reuses the same contact instead of spawning a duplicate every month. A fresh
  // contact has no company link, so it stays the payee (no rollup).
  const createContactParty = async () => {
    const name = partySearch.trim();
    if (name.length < 2) return;
    setCreatingContact(true);
    try {
      // Matched on `name_fold` (the generated `crm_fold(name)`), not raw `ilike`: that was
      // case-insensitive but accent-BLIND, so "Κώστας Παπάς" never found the stored
      // "ΚΩΣΤΑΣ ΠΑΠΑΣ" and this monthly find-or-create spawned a fresh payee every month
      // (#366 BU-3). Still an EQUALITY match — a find-or-create, not a search box.
      const existing = await supabase.from('crm_contacts').select('id, name')
        .eq('workspace_id', workspaceId).eq('name_fold', foldForSearch(name)).limit(1).maybeSingle();
      let id = existing.data?.id as string | undefined;
      if (!id) {
        const ins = await supabase.from('crm_contacts')
          // is_client explicitly false — that column DEFAULTS TO TRUE, so a payee created here
          // silently became a client too.
          .insert({ workspace_id: workspaceId, name, is_supplier: true, is_client: false } as any)
          .select('id').single();
        if (ins.error) throw ins.error;
        id = ins.data.id;
      } else {
        // Ensure the person is flagged as a supplier so they lead future searches. Checked
        // rather than discarded: supabase-js resolves on an RLS denial, so a rejected write
        // silently left them unflagged and buried in every later search (#347 audit).
        const { error: flagErr } = await supabase.from('crm_contacts')
          .update({ is_supplier: true } as any).eq('id', id);
        if (flagErr) throw flagErr;
      }
      // Existing contacts can already belong to a company — run the same rollup as a picked one.
      await pickParty({ type: 'contact', id: id!, label: `${name} (person)`, isSupplier: true });
    } catch (err: any) {
      toast({ title: 'Could not create contact', description: err?.message, variant: 'destructive' });
    } finally {
      setCreatingContact(false);
    }
  };

  const handleSave = async () => {
    if (!categoryId) { toast({ title: 'Pick a category', variant: 'destructive' }); return; }
    if (!party) { toast({ title: 'Pick or create a supplier / payee', variant: 'destructive' }); return; }
    if (total <= 0) { toast({ title: 'Amount must be positive', variant: 'destructive' }); return; }
    if (parseDecimalOr(subtotalNet, 0) < 0 || parseDecimalOr(vatAmount, 0) < 0) {
      toast({ title: 'Amounts cannot be negative', variant: 'destructive' }); return;
    }
    // Checked BEFORE any write. createRecurringExpense throws "A recurring expense needs a
    // supplier / payee" for a one-off `adhoc` payee — but it runs AFTER createExpense, so the
    // bill (and the payment, when "Paid now" is ticked) was already committed while the dialog
    // reported "Failed" and stayed armed. Pressing Save again booked a SECOND identical expense
    // and a second cash-out. The condition is knowable up front, so it is enforced up front.
    if (repeat !== 'none' && party?.type === 'adhoc') {
      toast({
        title: 'A repeating expense needs a saved supplier',
        description: 'One-off payees cannot repeat. Pick or create the supplier in CRM first, or set Repeat to "Does not repeat".',
        variant: 'destructive',
      });
      return;
    }
    try {
      setBusy(true);
      // Business rollup: a supplier contact attached to a supplier company is attributed to
      // the BUSINESS — same rule as supplier bills / customer docs.
      let cpCompanyId = party?.type === 'company' ? (party.id ?? undefined) : undefined;
      let cpContactId = party?.type === 'contact' ? (party.id ?? undefined) : undefined;
      // One-off payee not in CRM — recorded as a free-text supplier name on the bill.
      const adhocSupplierName = party?.type === 'adhoc' ? party.label : undefined;
      if (cpContactId && !cpCompanyId) {
        const rolled = await financeService.resolvePrimaryCompanyId(cpContactId).catch(() => null);
        if (rolled) { cpCompanyId = rolled; cpContactId = undefined; }
      }

      // Resolve "what is this for?". A customer with no order yet gets an empty draft raised so the
      // cost has something to hang off — an expense carries no line items, so unlike the order form
      // there is nothing to mirror onto it, and pricing it is the operator's next step.
      let coversOrderId: string | null = link.kind === 'sales_order' ? link.orderId : null;
      let linkNote: string | undefined;
      if (link.kind === 'customer') {
        coversOrderId = await ordersService.create({
          workspaceId,
          orderType: 'sales',
          status: 'draft',
          currency,
          customerCompanyId: link.party.party_type === 'company' ? link.party.id : null,
          customerContactId: link.party.party_type === 'contact' ? link.party.id : null,
          notes: `Raised for a cost booked against ${party.label}.`,
          items: [],
        });
        linkNote = `Draft order raised for ${link.party.name ?? 'the customer'} — add what they are buying.`;
      }
      // A cost booked ON an order is reported under that order's job — same inheritance a linked
      // sales order gets, so the expense doesn't float unattributed while its order has a project.
      const linkProjectId = link.kind === 'project'
        ? link.projectId
        : (link.kind === 'sales_order' || link.kind === 'cost_of_order' ? link.projectId : null);
      // Filing links. Neither changes a figure on the bill — they decide where it SHOWS UP: on the
      // rep's expense card, and on the building. Kept separate from `linkProjectId` because a
      // property is not a project and inferring one from the other invents a job nobody raised.
      const linkTripReportId = link.kind === 'trip' ? link.reportId : null;
      const linkPropertyId = link.kind === 'property' ? link.propertyId : null;

      const created = await financeService.createExpense({
        workspaceId,
        categoryId,
        description: description.trim() || undefined,
        reference: reference.trim() || undefined,
        supplierCompanyId: cpCompanyId,
        supplierContactId: cpContactId,
        supplierName: adhocSupplierName,
        orderId: effectiveOrderId,
        projectId: linkProjectId,
        coversOrderId,
        tripReportId: linkTripReportId,
        propertyId: linkPropertyId,
        currency,
        subtotalNet: parseDecimalOr(subtotalNet, 0),
        vatAmount: parseDecimalOr(vatAmount, 0),
        issuedAt: issuedAt || undefined,
        dueAt: paidNow ? undefined : (dueAt || undefined),
        notes: notes || undefined,
        paidNow,
        paidFromBankAccountId: paidNow ? (bankAccountId || null) : null,
        paymentMethod: method,
        counterpartyBankAccountId: paidNow && method === 'bank_transfer' ? (counterpartyBankId || null) : null,
        paidAt: paidNow ? new Date(issuedAt || Date.now()).toISOString() : undefined,
      });
      // "Repeat" → also register a recurring template; the first period's bill was just created,
      // subsequent periods are auto-generated by the finance-recurring-expenses-daily cron.
      // The bill above is COMMITTED. Anything that fails from here on is a partial success, and
      // must not leave the dialog looking like nothing happened — that is what turned one failed
      // recurring setup into a duplicated expense and a duplicated cash-out.
      let recurringError: string | null = null;
      if (repeat !== 'none') {
        try {
        await financeService.createRecurringExpense({
          workspaceId,
          categoryId,
          supplierCompanyId: cpCompanyId ?? null,
          supplierContactId: cpContactId ?? null,
          description: description.trim() || undefined,
          referencePrefix: reference.trim() || undefined,
          currency,
          subtotalNet: parseDecimalOr(subtotalNet, 0),
          vatAmount: parseDecimalOr(vatAmount, 0),
          cadence: repeat,
          dueDays: 0,
          nextRunAt: financeService.nextRecurrenceDate(issuedAt || todayLocalISO(), repeat),
          autoPay: paidNow,
          bankAccountId: paidNow ? (bankAccountId || null) : null,
          paymentMethod: method,
          notes: notes || undefined,
          // The repeat inherits the WHOLE "what is this for?" link, not part of it — every
          // generated bill lands on the same project / order / trip / property instead of the
          // first one being attributed and every one after it floating.
          // `run_due_recurring_expenses` stamps all four onto each bill it creates; a template
          // carrying only some of them would look correct forever, because a missing uuid is a
          // valid null and the bill is otherwise perfect.
          projectId: linkProjectId,
          orderId: effectiveOrderId ?? null,
          tripReportId: linkTripReportId,
          propertyId: linkPropertyId,
        });
        } catch (recErr: any) {
          recurringError = recErr?.message ?? 'the recurring template could not be created';
        }
      }
      toast({
        title: recurringError
          ? (paidNow ? 'Expense recorded & paid — repeat NOT set up' : 'Expense recorded — repeat NOT set up')
          : (paidNow ? 'Expense recorded & paid' : 'Expense recorded as payable'),
        variant: recurringError ? 'destructive' : undefined,
        description: [
          recurringError
            ? `This expense is saved. The repeat schedule was not created: ${recurringError}. Set it up from Recurring expenses — do NOT save this form again or you will book it twice.`
            : (repeat !== 'none'
              ? `Recurring ${repeat} — the next one generates automatically.`
              : (paidNow ? 'Booked as a paid cost — visible in Payables and Payments.' : 'Open in Payables (AP) until you mark it paid.')),
          linkNote,
        ].filter(Boolean).join(' '),
      });
      // The receipt goes on the bill that now exists. Best-effort and reported: the expense is
      // COMMITTED by this point, so a storage failure must not make the dialog look like nothing
      // happened — that shape is what turned one failed recurring setup into a duplicated cost.
      if (receipt) {
        try {
          await receiptScanService.attachToBill(created.billId, receipt);
        } catch (err: any) {
          toast({
            title: 'Expense saved, receipt not attached',
            description: `${err?.message ?? 'Upload failed'} — open the expense and attach it again. Do NOT re-save this form.`,
            variant: 'destructive',
          });
        }
      }
      clearDraft();
      // Cash actually moved only when a payment was booked — `paidNow` alone is the intent, not
      // the outcome (a zero-total bill books no payment).
      onCreated({ ...created, amountPaid: created.paymentId ? total : 0 });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message ?? 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Read a receipt into this form (#379).
   *
   * Prefills, never decides. Every field it touches stays editable and the operator is the one who
   * presses Save — a confident wrong reading is the failure mode of extraction, and the only thing
   * that catches it is a person looking at the paper.
   *
   * Two details that would otherwise be silent bugs:
   *   • The form's fields are NET and VAT; a receipt prints the GROSS. `splitForForm` derives the
   *     pair once, in one place — dropping a gross into "Subtotal (net)" books a VAT-bearing cost
   *     with its tax folded into the net, overstating the P&L cost and losing the recoverable VAT.
   *   • The date defaults HERE with `todayLocalISO()` when the receipt's own date was unreadable.
   *     The scanner deliberately returns null rather than a server "today", which is UTC and is
   *     yesterday for a Greek operator working before 03:00.
   */
  const scanReceipt = async (file: File) => {
    setScanning(true);
    setScanNote(null);
    try {
      const res = await receiptScanService.scan(workspaceId, file);
      const f = res.fields;
      setReceipt(file);
      if (res.status === 'failed') {
        setScanNote('That image could not be read — it is attached, but fill the figures in by hand.');
        return;
      }
      const { net, vat } = splitForForm(f);
      setSubtotalNet(String(net));
      setVatAmount(String(vat));
      if (f.currency) setCurrency(f.currency);
      setIssuedAt(f.doc_date ?? todayLocalISO());
      if (f.document_number) setReference(f.document_number);
      if (f.vendor) {
        // A one-off payee, not a CRM company: creating a supplier record from a petrol-station
        // receipt would fill the CRM with businesses nobody has a relationship with. The operator
        // can still search for a real supplier and replace it.
        setParty({ type: 'adhoc', id: null, label: f.vendor });
        setDescription((d) => d || f.vendor!);
      }
      // The category is a HINT and only applied when it names a category that already exists.
      // Inventing one from a receipt is how a chart of accounts fills up with "fuel", "Fuel" and
      // "petrol" as three separate lines in the P&L.
      if (f.category_hint) {
        const hit = expenseCats.find((c) => c.name.toLowerCase() === f.category_hint!.toLowerCase());
        if (hit) setCategoryId(hit.id);
      }
      const notes: string[] = [];
      if (!f.total_gross) notes.push('no total found');
      if (f.vat_amount === null) notes.push('no VAT line on the receipt — entered as 0');
      if (!f.doc_date) notes.push('date unreadable, defaulted to today');
      if (f.foots === false) notes.push('the printed net + VAT do not add up to the printed total');
      if (f.confidence < 0.6) notes.push('the image was hard to read');
      setScanNote(notes.length ? `Check these: ${notes.join('; ')}.` : null);
    } catch (err: any) {
      toast({
        title: 'Could not read that receipt',
        description: err instanceof ReceiptTooLargeError ? err.message : (err?.message ?? 'Try a clearer photo.'),
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
    {/* Every dismissal routes through here. clearDraft() used to run only on Cancel and on
        a successful save, so Esc, the X and an overlay click left the sessionStorage draft
        intact — the next open silently repopulated an abandoned payee, amount, category and
        Paid-now state, which is how an abandoned form becomes an accidental second booking. */}
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearDraft(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            A business cost (rent, utilities, fees…). Recorded as a categorized supplier bill — an open <strong>payable</strong> until paid, or settled now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Read the receipt first, correct it second. Placed above the form rather than beside a
              field because it fills several of them at once, and because on the paper-in-hand path
              it is the first thing the operator wants — typing is the fallback. */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2">
            <input
              ref={receiptInput}
              type="file" accept={RECEIPT_ACCEPT} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanReceipt(f); e.currentTarget.value = ''; }}
            />
            <Button type="button" size="sm" variant="secondary" disabled={busy || scanning}
              onClick={() => receiptInput.current?.click()}>
              {scanning
                ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Reading…</>
                : <><ScanLine className="h-3.5 w-3.5 mr-1" /> Scan a receipt</>}
            </Button>
            {receipt ? (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{receipt.name}</span>
                <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0"
                  title="Remove the receipt" onClick={() => { setReceipt(null); setScanNote(null); }}>
                  <X className="h-3 w-3" />
                </Button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Photo or PDF — the figures below get filled in for you to check.</span>
            )}
            {/* What the reader could NOT do is worth more than what it could. A silent partial
                prefill is how a missing VAT line becomes a cost booked gross. */}
            {scanNote && <span className="w-full text-[11px] text-amber-600 dark:text-amber-400">{scanNote}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder={expenseCats.length ? 'Pick a category' : 'No expense categories'} /></SelectTrigger>
                <SelectContent>
                  {expenseCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {expenseCats.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Add expense categories in Settings → Finance Categories (Import defaults).</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Reference / Bill #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional — e.g. DEH-2026/06" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Office rent — June 2026" />
          </div>

          <div className="space-y-1">
            <Label>Supplier / Payee * <span className="text-muted-foreground font-normal">(a company or a person)</span></Label>
            {party ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{party.label}{party.type === 'adhoc' && <span className="ml-1.5 text-[10px] text-muted-foreground">· one-off, not in CRM</span>}</span>
                <Button size="sm" variant="ghost" onClick={() => setParty(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Input placeholder="Search a company or a person, or type any payee name…" value={partySearch} onChange={(e) => setPartySearch(e.target.value)} />
                {partyOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
                    {partyOptions.map((o) => (
                      <button key={`${o.type}-${o.id}`} type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { void pickParty(o); }}>
                        <span>{o.label}</span>
                        {o.isSupplier && <span className="text-[10px] text-muted-foreground">supplier</span>}
                      </button>
                    ))}
                  </div>
                )}
                {partySearch.trim().length >= 2 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {/* Opens the shared business-identity dialog — VAT/ΑΦΜ lookup, dedupe, then
                        the create. Same control as CRM → Add company. */}
                    <Button type="button" size="sm" variant="outline" disabled={creatingContact} onClick={() => setCompanyDialogOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Create company “{partySearch.trim()}”
                    </Button>
                    {/* The payee is a person, not a business — books the bill against the contact. */}
                    <Button type="button" size="sm" variant="outline" disabled={creatingContact} onClick={createContactParty}>
                      {creatingContact ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Create person “{partySearch.trim()}”
                    </Button>
                    {/* One-off payee: recorded as a free-text name on the bill, no CRM record. */}
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => { setParty({ type: 'adhoc', id: null, label: partySearch.trim() }); setPartySearch(''); setPartyOptions([]); }}>
                      Use “{partySearch.trim()}” once <span className="ml-1 text-[10px] text-muted-foreground">not saved</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* An expense has no line items, so there is nothing to MERGE — this only ever attributes
              the cost: to a project, to the customer order it was incurred against, or to the
              purchase order it belongs to (freight, customs, an installer), which then carries it
              as one of its expenses. Not offered when we were opened FROM an order: that order is
              already the answer. */}
          <OrderLinkPicker
            workspaceId={workspaceId}
            value={link}
            onChange={setLink}
            currency={currency}
            allowMerge={false}
            allowCostOf={!orderId}
            allowTrip
            allowProperty={realEstate}
            label="What is this for? (optional)"
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Subtotal (net)</Label>
              <Input type="text" inputMode="decimal" value={subtotalNet} onChange={(e) => setSubtotalNet(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>VAT amount</Label>
              <Input type="text" inputMode="decimal" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Total</Label>
              <Input value={total.toFixed(2)} disabled />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!paidNow && (
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Repeat</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as 'none' | RecurringCadence)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">One-off (no repeat)</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="monthly">Every month</SelectItem>
                <SelectItem value="quarterly">Every quarter</SelectItem>
                <SelectItem value="yearly">Every year</SelectItem>
              </SelectContent>
            </Select>
            {repeat !== 'none' && (
              <p className="text-[11px] text-muted-foreground">
                Records this one now; the next {repeat === 'weekly' ? 'week' : repeat === 'monthly' ? 'month' : repeat === 'quarterly' ? 'quarter' : 'year'} onward auto-generates{paidNow ? ' and auto-pays' : ''}.
              </p>
            )}
          </div>

          {/* Paid-now toggle: settled cost vs open payable */}
          <div className="rounded-md border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Paid now</Label>
                <p className="text-[11px] text-muted-foreground">{paidNow ? 'Books the payment out of an account — settles immediately.' : 'Leaves it as an open payable in AP until you mark it paid.'}</p>
              </div>
              <Switch checked={paidNow} onCheckedChange={setPaidNow} />
            </div>
            {paidNow && (
              <PaidFromSelect
                workspaceId={workspaceId}
                value={bankAccountId}
                onChange={setBankAccountId}
                method={method}
                onMethodChange={setMethod}
                accounts={bankAccounts}
              />
            )}
            {/* Bank Payment → which of the payee's own banks you paid to. Optional; only shows
                once a payee with saved bank accounts is picked. */}
            {paidNow && method === 'bank_transfer' && payeeBanks.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Paid to their bank</Label>
                <Select value={counterpartyBankId || '__none__'} onValueChange={(v) => setCounterpartyBankId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Their bank (optional)…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not specified —</SelectItem>
                    {payeeBanks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bank_name}{b.iban ? ` · ${b.iban.slice(0, 8)}…` : ''}{b.is_primary ? ' (primary)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { clearDraft(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (paidNow ? 'Record & pay' : 'Record payable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Sibling, not a child of the expense dialog — nesting two Radix dialogs fights over the
        focus trap and the Esc handler. */}
    <QuickAddCompanyDialog
      open={companyDialogOpen}
      onOpenChange={setCompanyDialogOpen}
      workspaceId={workspaceId}
      initialName={partySearch.trim()}
      role="supplier"
      title="New supplier / payee"
      description="Look the VAT / ΑΦΜ up to pull the official name, address and registry details — or just type a name."
      onCreated={adoptCreatedCompany}
    />
    </>
  );
};
