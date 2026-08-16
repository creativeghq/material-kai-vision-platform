/**
 * Standalone "Record payment".
 *  - Received: money in from a customer — optionally "for" an open invoice (marks it partly/fully
 *    settled) or an open order (a deposit / a payment on something not invoiced yet); with neither
 *    it records as on-account customer credit. One picker, because those are one question.
 *  - Refund/Return: money out to a customer (e.g. against a credit note).
 *  - Paid an expense: money out settling an EXISTING expense (supplier bill), including the ones
 *    that came from the Expenses Inbox (myDATA received documents).
 *
 * It settles; it never books. A received document that is not an expense yet is booked by
 * "Add to Expenses", whose form carries a "Mark as paid" tick — so the money always has an order
 * behind it. Converting a document HERE produced a paid bill with nothing to 3-way match.
 * Carries a finance category + method + back-datable date.
 *
 * The expense option settles a bill that already exists — it never creates one. Creating a NEW
 * cost is still NewExpenseDialog; going through here instead would double-count the payable.
 * The reverse direction (open an expense, see/attach its payments) is ExpensePaymentsDialog.
 *
 * `presetExpenseId` PRE-FILLS it (Payables → Pay, the Expenses Inbox row, "Record a payment"
 * inside ExpensePaymentsDialog): same form, same controls, the target simply starts selected and
 * still changeable. This is the ONLY money-out-against-a-bill form.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type Invoice, type PaymentMethod, type BankAccountBalance, type PayableExpense } from '@/modules/finance/services/financeService';
import { ordersService, type OrderBalance, type OrderListRow } from '@/modules/finance/services/ordersService';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { salesDocumentKindLabel, type SalesDocumentKind } from '@/modules/finance/utils/salesDocumentKind';
import { parseDecimal } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';

// 'supplier' = money OUT to the counterparty of a PURCHASE order, and the ONLY direction a
// purchase order offers. You do not receive money from someone you are buying from, so the
// customer-side types are not reachable when side='supplier'.
type Kind = 'received' | 'refund' | 'expense' | 'supplier';

export const RecordPaymentDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  /** Tie the payment to a specific party when there's no allocation target
   *  (e.g. opened from a CRM party page → records as customer credit). */
  initialCounterparty?: { contactId?: string | null; companyId?: string | null } | null;
  /** Attach the payment to an order (tags order_id → shows + settles on that order) and seed the
   *  amount / target invoice. Used so the order's "Record payment" uses THIS modal, not an inline view. */
  orderId?: string;
  /** The order's human number (ORD-2026-0005), shown in the "For" picker so the operator can see
   *  WHICH order the default target is. Label only — `orderId` is what binds the payment. */
  orderLabel?: string;
  defaultAmount?: number;
  presetInvoiceId?: string;
  /** Settle THIS expense (a `supplier_bills` id): opens on the money-out branch with the expense
   *  already selected in the picker. Prefill, not a lock — it can be changed like any other. */
  presetExpenseId?: string;
  /** When set (order-attached, received, no invoice yet), the fiscal document can be issued in the
   *  same step. `fiscalDocKind` is the kind the SHARED buyer rule resolved — this dialog never
   *  re-derives it — and `onIssueDoc` runs after the payment is recorded. */
  fiscalDocKind?: SalesDocumentKind;
  fiscalDocReason?: string;
  onIssueDoc?: (kind?: SalesDocumentKind) => Promise<void>;
  /** Which side of the trade this payment is. 'supplier' = money OUT to the party we're buying
   *  from (a purchase order). Defaults to 'customer' — money in from whoever we sold to. */
  side?: 'customer' | 'supplier';
  /** Open supplier bills this payment may settle — only meaningful with side='supplier'. Passed in
   *  by the caller that already loaded them rather than re-fetched here. */
  payableBills?: Array<{ id: string; supplier_bill_number: string | null; amount_due: number; currency: string }>;
  /**
   * Currency of the ORDER this payment is being recorded against.
   *
   * Without it the reset below forced 'EUR' on open and the picker rendered only for
   * kind==='received', so every purchase-order payment submitted EUR. record_payment_fx books the
   * unallocated remainder onto the order ONLY when the currencies match — deliberately, rather
   * than booking a cross-currency remainder at a guess — so GBP 500 on a GBP purchase order was
   * stored as EUR 500, the guard correctly declined, NO allocation row was created, and the order
   * showed Unpaid with full Outstanding forever while the cash sat in the bank ledger.
   */
  orderCurrency?: string;
}> = ({ workspaceId, open, onOpenChange, onSaved, initialCounterparty, orderId, orderLabel, defaultAmount, presetInvoiceId, presetExpenseId, fiscalDocKind, fiscalDocReason, onIssueDoc, side = 'customer', payableBills = [], orderCurrency }) => {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>('received');
  const [amount, setAmount] = useState('');
  // Foreign-currency settlement: the money can arrive in a currency the invoice isn't in.
  // `fxRate` converts payment → invoice (what the allocation is worth), `fxRateToBase` converts
  // payment → workspace base, which is what makes realized FX gain/loss computable.
  const [currency, setCurrency] = useState('EUR');
  const [fxRate, setFxRate] = useState('1');
  const [fxRateToBase, setFxRateToBase] = useState('1');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(() => todayLocalISO());
  const [categoryId, setCategoryId] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // Settle target invoice id ('' = unallocated). Refund uses its own invoice picker below.
  const [invoiceId, setInvoiceId] = useState<string>(''); // refund target
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>(''); // received allocation target
  const [issueCreditNote, setIssueCreditNote] = useState(true);
  /**
   * ONE decision about what document this payment produces. Recording money and issuing a
   * document are separate acts — a deposit taken before delivery, or a part-payment against an
   * already-issued invoice, should often produce nothing at all. Previously this was two
   * independent switches ("Send receipt" + "Also issue a …") whose combination was ambiguous.
   *  - `none`             — record the money only.
   *  - `payment_receipt`  — email a payment receipt (απόδειξη είσπραξης). NOT sent to myDATA.
   *  - `fiscal_invoice`   — issue a τιμολόγιο (1.1).
   *  - `fiscal_receipt`   — issue a retail receipt / ΑΛΠ (11.1).
   *
   * The two fiscal rows used to be ONE row whose kind the buyer rule picked, which is right by
   * default and wrong whenever the operator knows better — a business buying for private use
   * takes an ΑΛΠ. They are separate rows now, and the same asymmetry as the order menu applies:
   * a buyer with no ΑΦΜ is offered the receipt only, because AADE rejects a τιμολόγιο issued to a
   * consumer, while the reverse is legal and simply costs them the VAT deduction. `fiscalDocKind`
   * carries that fact — 'receipt' means the shared rule found no VAT identity.
   */
  type IssueChoice = 'none' | 'payment_receipt' | 'fiscal_invoice' | 'fiscal_receipt';
  const [issueChoice, setIssueChoice] = useState<IssueChoice>('payment_receipt');
  const issuesFiscal = issueChoice === 'fiscal_invoice' || issueChoice === 'fiscal_receipt';
  /** What the picked row actually issues — the argument `onIssueDoc` is given. */
  const pickedFiscalKind: SalesDocumentKind | undefined = issueChoice === 'fiscal_invoice'
    ? 'invoice' : issueChoice === 'fiscal_receipt' ? 'receipt' : undefined;
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountBalance[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  // Order to attach the payment to (drives orders.payment_status). Offered inside the same
  // "For" picker as the invoices, and only when the caller didn't already fix an order
  // (OrdersPanel passes `orderId`).
  const [orders, setOrders] = useState<OrderListRow[]>([]);
  const [pickedOrderId, setPickedOrderId] = useState<string>('');
  /** Canonical settlement position per listed order — `get_order_settlements`, never re-derived. */
  const [orderBalances, setOrderBalances] = useState<Map<string, OrderBalance>>(new Map());
  // Money-out against an existing expense (supplier bill) — including the ones that came from
  // the myDATA Inbox, which is how most of them arrive.
  const [expenses, setExpenses] = useState<PayableExpense[]>([]);
  /** The `supplier_bills` id this payment settles. */
  const [expenseId, setExpenseId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  /** Which of the order's open supplier bills this money settles (side='supplier'). */
  const [billId, setBillId] = useState('');
  const selectedBill = payableBills.find((b) => b.id === billId) ?? null;
  const showOrderPicker = kind === 'received' && !orderId;
  /**
   * What "None" MEANS depends on where the dialog was opened, and the label used to claim the
   * standalone meaning in both places.
   *
   * Standalone it is on-account credit. Opened FROM an order the payment already carries
   * `order_id`, and `record_payment_fx` books everything not allocated to a document as an
   * allocation ON THAT ORDER (capped at what it still owes) — which is exactly what
   * `get_order_settlements` counts. So "None" there settles the order and the money is never loose;
   * "None — unallocated credit" read as "this payment will not touch the order" on the one screen
   * where it always does.
   */
  const noTargetLabel = orderId
    ? `The order itself${orderLabel ? ` — ${orderLabel}` : ''}`
    : 'None — unallocated credit';
  const effectiveOrderId = orderId ?? (pickedOrderId || undefined);
  /**
   * Settling a cost that ALREADY exists — entered only from that cost's own row (an expense in
   * Payables, a document in the Inbox), which is why it always arrives with a target. It is NOT
   * selectable from the Type list: paying a supplier is the opposite side of the trade from
   * collecting from a customer, and offering it as a third option there invited picking the
   * wrong direction. Recording a NEW cost is a different act and lives in NewExpenseDialog,
   * which books the bill and the cash together — this form can only pay what is already booked.
   */
  const payingExpense = !!presetExpenseId;
  // The expense picker only makes sense in the general context. Opened for a specific order /
  // invoice the dialog is customer-scoped, and mixing a supplier cost into that flow would
  // attach it to the wrong side of the trade.
  const allowExpense = payingExpense && !orderId && !presetInvoiceId;

  useEffect(() => {
    if (!open) return;
    setKind(payingExpense ? 'expense' : side === 'supplier' ? 'supplier' : 'received');
    setBillId('');
    // Paying a bill is a bank transfer far more often than cash; the general flow starts on cash
    // because it is a counter-side collection.
    setAmount(defaultAmount != null && defaultAmount > 0 ? String(defaultAmount) : ''); setMethod(payingExpense ? 'bank_transfer' : 'cash'); setPaidAt(todayLocalISO());
    setCategoryId(''); setReference(''); setNotes('');
    setCurrency(orderCurrency || 'EUR'); setFxRate('1'); setFxRateToBase('1');
    setTargetInvoiceId(presetInvoiceId ?? '');
    setInvoiceId('');
    setIssueCreditNote(true);
    setIssueChoice('payment_receipt');
    setPickedOrderId('');
    setOrderBalances(new Map());
    setExpenseId(presetExpenseId ?? '');
    (async () => {
      // Open expenses for the money-out branch. Scoped to the party when the dialog was opened
      // from one, same rule as the invoice picker.
      if (allowExpense) {
        // The SAME list the picker always offers. A preset only decides which entry starts
        // selected — it never narrows what you can pick instead.
        const partyScoped = !!(initialCounterparty?.companyId || initialCounterparty?.contactId);
        const billRows = await financeService.listPayableExpenses(workspaceId).catch(() => [] as PayableExpense[]);
        let bills = partyScoped
          ? billRows.filter((e) =>
              (initialCounterparty!.companyId && e.supplier_company_id === initialCounterparty!.companyId) ||
              (initialCounterparty!.contactId && e.supplier_contact_id === initialCounterparty!.contactId))
          : billRows;
        // A preset can fall outside those lists — an already-settled bill, or a document past the
        // picker's limit. Pull it in so the form opens on it instead of on nothing.
        if (presetExpenseId && !bills.some((e) => e.id === presetExpenseId)) {
          const one = await financeService.getPayableExpense(presetExpenseId).catch(() => null);
          if (one) bills = [one, ...bills];
        }
        setExpenses(bills);
      } else { setExpenses([]); }
      const [cats, invs, banks, ords] = await Promise.all([
        financeCategoriesService.list(workspaceId).catch(() => []),
        // Include paid invoices too — a refund is usually against an already-settled invoice.
        financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'overdue', 'paid'], limit: 200 }).catch(() => []),
        // Balances, so the picker shows what's in each account at the point of choosing.
        financeService.getBankAccountBalances(workspaceId).catch(() => [] as BankAccountBalance[]),
        // Open sales orders to attach the payment to — scoped to the party when opened from one.
        orderId
          ? Promise.resolve([] as OrderListRow[])
          : ordersService.list({ workspaceId, orderType: 'sales', companyId: initialCounterparty?.companyId ?? undefined, contactId: initialCounterparty?.contactId ?? undefined }).catch(() => [] as OrderListRow[]),
      ]);
      setCategories(cats);
      // Same "pull the preset in" treatment the expense list above already gets. The invoice
      // query is scoped to status ['issued','partially_paid','overdue','paid'] with limit 200,
      // so a DRAFT invoice — or any invoice past the 200-row cap — was never in this array.
      // InvoiceDetailPage renders "Record payment" on drafts (it gates only on void /
      // credit_noted), so selectedTarget resolved to null, allocations stayed [], and the money
      // was booked as unallocated on-account credit while the toast said "Payment recorded" and
      // amount_due never moved.
      let invoiceRows = invs;
      if (presetInvoiceId && !invoiceRows.some((i) => i.id === presetInvoiceId)) {
        const one = await financeService.getInvoice(presetInvoiceId).catch(() => null);
        if (one) invoiceRows = [one as unknown as Invoice, ...invoiceRows];
      }
      setInvoices(invoiceRows);
      setBankAccounts(banks);
      // Attachable = not cancelled, and still owed something. What each one still owes comes from
      // the shared SQL derivation — the picker must never offer `total` as "what's left" on a
      // part-paid order.
      //
      // The "still owed" test reads that derivation too. It used to read the CACHED
      // `orders.payment_status` column, so the gate and the figure beside it came from two
      // different answers: an order the ledger still showed as owing was dropped from the list
      // entirely whenever the column had drifted to 'paid' — and the one screen that could have
      // recorded the money to correct it was the screen refusing to offer it.
      const live = ords.filter((o) => o.status !== 'cancelled');
      const bals = live.length
        ? await ordersService.orderBalances(live.map((o) => o.id)).catch(() => new Map<string, OrderBalance>())
        : new Map<string, OrderBalance>();
      // No balance row means the derivation could not be read, not that the order is settled — keep
      // it and let the operator decide. An unknown is not a zero.
      const attachable = live.filter((o) => (bals.get(o.id)?.outstanding ?? Number(o.total)) > 0.005);
      setOrders(attachable);
      setOrderBalances(bals);
      // Default to the workspace's default account so cash location is always captured.
      setBankAccountId(banks.find((b) => b.is_default)?.bank_account_id ?? '');
    })();
  }, [open, workspaceId, presetExpenseId, presetInvoiceId]);

  // Received → open invoices. Refund → any issued invoice (usually paid).
  // When opened from a party page (initialCounterparty set) the picker is HARD-SCOPED to that
  // party — otherwise the list showed every customer's invoices and picking the wrong one silently
  // reattributed the payment to a different customer (Tier 0.2 data-integrity fix).
  const pickableInvoices = useMemo(() => {
    const base = kind === 'refund' ? invoices : invoices.filter((i) => Number(i.amount_due) > 0);
    if (!initialCounterparty?.companyId && !initialCounterparty?.contactId) return base;
    return base.filter((i) =>
      (initialCounterparty.companyId && i.customer_company_id === initialCounterparty.companyId) ||
      (initialCounterparty.contactId && i.customer_contact_id === initialCounterparty.contactId));
  }, [invoices, kind, initialCounterparty]);
  const selectedInvoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);
  const selectedTarget = useMemo(() => invoices.find((i) => i.id === targetInvoiceId) ?? null, [invoices, targetInvoiceId]);
  /** What the money must end up in: the invoice being settled, else the workspace base. */
  const settleCurrency = (kind === 'received' ? selectedTarget?.currency : null) ?? 'EUR';
  const foreign = kind === 'received' && currency !== settleCurrency;

  /**
   * ONE "For" control. What money-in can be applied to is an invoice OR an order OR nothing —
   * three options on the same axis, so they belong in ONE list. Split them into two adjacent
   * selects ("On order" + "For") and they read as unrelated questions, letting a payment point at
   * an order and a different customer's invoice at the same time. Picking one clears the other.
   * `none` is the explicit un-pick (on-account credit); Radix cannot carry '' as an item value,
   * hence the sentinel.
   */
  const forValue = targetInvoiceId ? `inv:${targetInvoiceId}` : pickedOrderId ? `ord:${pickedOrderId}` : 'none';

  const pickFor = (v: string) => {
    if (v === 'none') { setTargetInvoiceId(''); setPickedOrderId(''); return; }
    const id = v.slice(4);
    if (v.startsWith('inv:')) {
      setPickedOrderId('');
      setTargetInvoiceId(id);
      if (amount) return;
      const inv = invoices.find((i) => i.id === id);
      if (inv) setAmount(String(inv.amount_due));
    } else {
      setTargetInvoiceId('');
      setPickedOrderId(id);
      if (amount) return;
      // Seed with what the order still owes, not its total — the derived number, never a
      // locally recomputed one.
      const b = orderBalances.get(id);
      if (b) setAmount(String(b.outstanding));
    }
  };

  type ExpenseOption = {
    value: string; label: string; due: number; currency: string; expense: PayableExpense;
  };
  const expenseOptions = useMemo<ExpenseOption[]>(() => expenses.map((e) => ({
    value: e.id,
    label: `${e.supplier_bill_number ?? 'Expense'}${e.party_name ? ` · ${e.party_name}` : ''}`,
    due: e.amount_due, currency: e.currency, expense: e,
  })), [expenses]);

  const selectedOption = useMemo(
    () => expenseOptions.find((o) => o.value === expenseId) ?? null,
    [expenseOptions, expenseId]);

  // Preset selection prefills the amount once its row has loaded — same value `pickExpense`
  // would set, without duplicating the rule or overwriting anything already typed.
  useEffect(() => {
    if (!open || !expenseId || amount) return;
    const o = expenseOptions.find((x) => x.value === expenseId);
    if (o) setAmount(String(o.due));
  }, [open, expenseId, amount, expenseOptions]);

  /**
   * Default the currency from whatever this payment is settling.
   *
   * The picker below used to render only for `received`, so on a refund or a supplier payment
   * `currency` kept its reset value 'EUR' and was passed to recordPayment unchanged — a refund of
   * a USD invoice booked a EUR cash-out, so the refund and the invoice it reverses ended up in
   * different currencies. `received` is excluded here on purpose: money genuinely can arrive in a
   * currency the invoice is not in, which is what the FX rate inputs exist for.
   */
  useEffect(() => {
    if (!open) return;
    const target =
      kind === 'refund' ? selectedInvoice?.currency :
      kind === 'supplier' ? selectedBill?.currency :
      kind === 'expense' ? selectedOption?.currency :
      null;
    if (target && target !== currency) setCurrency(target);
    // `currency` is deliberately absent from the deps: including it would fight the user's own
    // manual override on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, selectedInvoice?.currency, selectedBill?.currency, selectedOption?.currency]);

  const pickExpense = (value: string) => {
    setExpenseId(value);
    const o = expenseOptions.find((x) => x.value === value);
    // Always re-seed to what this one still owes — a stale amount carried over from a
    // previously selected expense is exactly how the wrong number gets paid.
    if (o) setAmount(String(o.due));
  };

  const pickRefundInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv && !amount) setAmount(String((inv as any).total ?? inv.amount_due));
  };

  const save = async () => {
    const amt = parseDecimal(amount);
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (kind === 'refund' && issueCreditNote && !invoiceId) {
      toast({ title: 'Pick the invoice to credit', description: 'A refund issues a credit note against an invoice. Choose it, or turn off the credit note.', variant: 'destructive' });
      return;
    }
    if (kind === 'expense' && !selectedOption) {
      toast({ title: 'Pick the expense', description: 'Choose which expense this payment settles.', variant: 'destructive' });
      return;
    }
    if (kind === 'expense' && selectedOption && amt > selectedOption.due + 0.01) {
      toast({
        title: 'Amount exceeds what is due',
        description: `That expense only has ${formatMoney(selectedOption.due, selectedOption.currency)} outstanding.`,
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      // Settling an expense goes through the one money-out path, so the allocation and the
      // bill's settled state are derived exactly as they are everywhere else. An inbox
      // document becomes an expense first — the conversion RPC is idempotent, so this never
      // creates a second payable for the same document.
      if (kind === 'expense' && selectedOption) {
        const billId = selectedOption.expense.id;
        await financeService.paySupplierBill({
          workspaceId,
          supplierBillId: billId,
          amount: amt,
          method,
          paidAt: new Date(paidAt).toISOString(),
          bankAccountId: bankAccountId || null,
          reference: reference || null,
          notes: notes || null,
          // Blank = inherit the expense's own P&L category rather than clearing it.
          categoryId: categoryId || null,
        });
        toast({
          title: 'Payment recorded',
          description: amt >= selectedOption.due ? 'The expense is settled.' : 'The expense is partly paid.',
        });
        onSaved(); onOpenChange(false);
        return;
      }

      // Refund: first issue the credit note (5.1 correlated) so myDATA nets the original invoice.
      let creditNoteRef: string | null = null;
      let creditNoteFiscalError: string | undefined;
      if (kind === 'refund' && issueCreditNote && invoiceId) {
        const cn = await financeService.createCreditNote({
          workspaceId,
          invoiceId,
          amount: amt,
          reason: reference || notes || 'Refund / Return',
          correlated: true,
          submitFiscal: true,
        });
        creditNoteRef = cn.credit_note_id;
        creditNoteFiscalError = cn.fiscal_error;
      }

      // A caller that named a target invoice MEANS it. If the row still cannot be resolved after
      // the fetch above, silently degrading to unallocated on-account credit is the worst
      // available outcome: the money is booked, "Payment recorded" is toasted, and the invoice's
      // amount_due never moves — the operator believes it is settled. Refuse instead.
      if (kind === 'received' && presetInvoiceId && targetInvoiceId === presetInvoiceId && !selectedTarget) {
        toast({
          title: 'Could not load that invoice',
          description: 'The payment was NOT recorded. Reopen this from the invoice and try again — '
            + 'recording it now would book unallocated credit instead of settling the invoice.',
          variant: 'destructive',
        });
        setBusy(false);
        return;
      }

      const direction = kind === 'received' ? 'in' : 'out';

      // Build the allocation + resolve the counterparty from the chosen invoice.
      let allocations: Array<{ target_id: string; target_type: 'invoice' | 'supplier_bill'; amount: number; amount_doc?: number; fx_rate?: number }> = [];
      let counterpartyCompanyId: string | null = null;
      let counterpartyContactId: string | null = null;
      if (kind === 'refund') {
        counterpartyCompanyId = selectedInvoice?.customer_company_id ?? null;
        counterpartyContactId = selectedInvoice?.customer_contact_id ?? null;
      } else if (kind === 'received' && selectedTarget) {
        // `amt` is in the PAYMENT currency; what it settles on the invoice is amt × rate. Passing
        // both lets the RPC compute realized FX gain/loss instead of silently assuming parity.
        const rate = foreign ? (parseDecimal(fxRate) ?? 0) : 1;
        if (foreign && rate <= 0) { toast({ title: 'Enter a valid exchange rate', variant: 'destructive' }); setBusy(false); return; }
        const applied = Math.round(amt * rate * 100) / 100;
        allocations = [{ target_id: selectedTarget.id, target_type: 'invoice', amount: applied, amount_doc: amt, fx_rate: rate }];
        counterpartyCompanyId = selectedTarget.customer_company_id ?? null;
        counterpartyContactId = selectedTarget.customer_contact_id ?? null;
      } else if (kind === 'supplier' && selectedBill) {
        // Never over-allocate: a bill takes at most what it still owes, the rest stays as
        // order-tagged money out (the same rule the money-in branch follows).
        allocations = [{ target_id: selectedBill.id, target_type: 'supplier_bill', amount: Math.min(amt, Number(selectedBill.amount_due)) }];
      }

      // No target chosen (unallocated / on-account) → tie it to the party the
      // dialog was opened for so it still rolls up under that customer.
      if (!counterpartyCompanyId && !counterpartyContactId && initialCounterparty) {
        counterpartyCompanyId = initialCounterparty.companyId ?? null;
        counterpartyContactId = initialCounterparty.contactId ?? null;
      }

      await financeService.recordPayment({
        workspaceId,
        direction,
        amount: amt,
        currency,
        fxRateToBase: parseDecimal(fxRateToBase) ?? 1,
        method,
        paidAt: new Date(paidAt).toISOString(),
        categoryId: categoryId || null,
        reference: reference || (creditNoteRef ? `Refund · CN ${creditNoteRef.slice(0, 8)}` : kind === 'refund' ? 'Refund' : null),
        notes: notes || null,
        counterpartyCompanyId,
        counterpartyContactId,
        allocations,
        bankAccountId: bankAccountId || null,
        orderId: effectiveOrderId ?? null,
        sendReceipt: kind === 'received' && issueChoice === 'payment_receipt',
      });
      // Order-attached: also create the order's receipt/invoice when asked (best-effort — the
      // payment is already recorded; a doc-issue hiccup shouldn't roll it back).
      if (issuesFiscal && onIssueDoc) { try { await onIssueDoc(pickedFiscalKind); } catch { /* issue separately from Actions */ } }
      if (creditNoteFiscalError) {
        // Cash-out logged + credit note created, but myDATA transmission failed —
        // don't pretend it's filed. Operator must retransmit from the credit-note list.
        toast({
          title: 'Refund recorded — myDATA transmission failed',
          description: `The credit note was created and the cash-out logged, but it was NOT accepted by myDATA: ${creditNoteFiscalError}. Retransmit it from the credit notes list.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: kind === 'refund' ? 'Refund recorded' : 'Payment recorded',
          description: creditNoteRef ? 'Credit note issued to myDATA and the cash-out logged.' : undefined,
        });
      }
      onSaved(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription className="sr-only">
            {payingExpense ? 'Settle an existing expense or a received myDATA document.' : 'Record a customer payment or a refund.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Paying an expense is money OUT to a supplier — the other side of the trade, not a
                third flavour of "record a payment from a customer". It is entered from the
                cost's own row instead of hiding as an option in this list, so the two
                directions can't be picked by accident. When that action opened this dialog the
                Type is fixed, so the control is a label rather than a select that can only
                un-choose itself. */}
            <div className="space-y-1">
              <Label>Type</Label>
              {payingExpense ? (
                <div className="flex h-10 items-center rounded-md border border-border/60 bg-muted/40 px-3 text-sm">
                  Paying an expense
                </div>
              ) : side === 'supplier' ? (
                // A purchase order goes one way: we pay the supplier. There is deliberately no
                // money-in option here — you do not get paid by someone you are buying from.
                <div className="flex h-10 items-center rounded-md border border-border/60 bg-muted/40 px-3 text-sm">
                  Paid to supplier
                </div>
              ) : (
                <Select value={kind} onValueChange={(v: any) => { setKind(v); setTargetInvoiceId(''); setInvoiceId(''); setExpenseId(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Received from customer</SelectItem>
                    <SelectItem value="refund">Refund / Return (to customer)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <div className="flex gap-2">
                <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {/* Shown for EVERY direction. It used to render only for `received`, so on a
                    refund or a supplier payment the state stayed at its reset value 'EUR' and was
                    passed straight to recordPayment — refunding a USD invoice booked a EUR
                    cash-out, leaving the refund and the invoice it reverses in different
                    currencies. The effect above defaults it from the selected target. */}
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['EUR', 'USD', 'GBP', 'CHF'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {foreign && (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Rate → {settleCurrency}</Label>
                <Input type="text" inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">1 {currency} = X {settleCurrency}{selectedTarget ? ' — what this settles on the invoice' : ''}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate → EUR (base)</Label>
                <Input type="text" inputMode="decimal" value={fxRateToBase} onChange={(e) => setFxRateToBase(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">drives realized FX gain/loss</p>
              </div>
            </div>
          )}

          {kind === 'expense' && (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <Label>Expense being paid</Label>
              <Select value={expenseId} onValueChange={pickExpense}>
                <SelectTrigger><SelectValue placeholder="Pick the expense this payment settles…" /></SelectTrigger>
                <SelectContent>
                  {expenseOptions.length === 0
                    ? <div className="px-2 py-1 text-xs text-muted-foreground">No unpaid expenses</div>
                    : expenseOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                        {` — ${formatMoney(o.due, o.currency)} due`}
                        {o.expense.inbox ? ' · Inbox' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedOption?.expense?.inbox && (
                <p className="text-[11px] text-muted-foreground">
                  From the Inbox — {selectedOption.expense.inbox.issuer_name ?? selectedOption.expense.inbox.issuer_vat ?? 'received document'}
                  {' · '}<span className="font-mono">MARK {selectedOption.expense.inbox.mark}</span>.{' '}
                  {formatMoney(selectedOption.expense.total, selectedOption.expense.currency)} total, {formatMoney(selectedOption.expense.amount_due, selectedOption.expense.currency)} still due.
                </p>
              )}
              {expenseOptions.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nothing to pay. A new cost is booked with “Add expense”; a received document is booked from Documents → Expenses (Inbox) with “Add to Expenses”.
                </p>
              )}
            </div>
          )}

          {kind === 'supplier' && (
            <div className="space-y-1">
              <Label>For (optional)</Label>
              <Select value={billId} onValueChange={setBillId}>
                <SelectTrigger><SelectValue placeholder="None — just money paid on this order" /></SelectTrigger>
                <SelectContent>
                  {payableBills.length === 0
                    ? <div className="px-2 py-1 text-xs text-muted-foreground">No open supplier bill on this order</div>
                    : payableBills.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.supplier_bill_number ?? b.id.slice(0, 8)} — {formatMoney(Number(b.amount_due), b.currency)} due
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {selectedBill
                  ? 'Settling this bill will mark it paid when fully covered.'
                  : 'Leave empty to log the money against the order without settling a specific bill.'}
              </p>
            </div>
          )}

          {kind === 'received' && (
            <div className="space-y-1">
              <Label>For (optional)</Label>
              <Select value={forValue} onValueChange={pickFor}>
                <SelectTrigger><SelectValue placeholder={noTargetLabel} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{noTargetLabel}</SelectItem>
                  {pickableInvoices.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Invoices</SelectLabel>
                      {pickableInvoices.map((i) => (
                        <SelectItem key={i.id} value={`inv:${i.id}`}>{i.internal_number} — due {Number(i.amount_due).toFixed(2)}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {/* Orders are the SAME question as invoices — what is this money for — so they
                      share the list. `orders` is already party-scoped when the dialog was opened
                      from a customer, so this shows that customer's orders only. */}
                  {showOrderPicker && orders.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Orders</SelectLabel>
                      {orders.map((o) => {
                        const b = orderBalances.get(o.id);
                        return (
                          <SelectItem key={o.id} value={`ord:${o.id}`}>
                            {o.order_number ?? o.id.slice(0, 8)}{o.party_name ? ` · ${o.party_name}` : ''}
                            {b ? ` — ${formatMoney(b.outstanding, b.currency)} outstanding` : ` — ${formatMoney(Number(o.total), o.currency)}`}
                            {o.payment_status === 'partial' ? ' · part-paid' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  )}
                  {pickableInvoices.length === 0 && !(showOrderPicker && orders.length > 0) && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">{orderId ? 'No invoice on this order yet' : 'No open invoices or orders'}</div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {selectedTarget
                  ? 'Settling this invoice will mark it paid when fully covered.'
                  : pickedOrderId
                    ? 'Attaches the payment to this order and updates its paid status. Use this for a deposit or a payment on an order not yet invoiced.'
                    : orderId
                      ? 'Recorded against this order and counted towards what it still owes — not held as loose credit. Pick an invoice only to settle a specific one.'
                      : 'Leave as None to hold the money as on-account customer credit.'}
              </p>
            </div>
          )}

          {kind === 'received' && (
            <div className="space-y-1 rounded-md border border-border/60 p-3">
              <Label>Document to issue</Label>
              <Select value={issueChoice} onValueChange={(v: any) => setIssueChoice(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No document — just record the money</SelectItem>
                  <SelectItem value="payment_receipt">Payment receipt — email only, not sent to myDATA</SelectItem>
                  {/* Offered only when the caller says a sales document is still possible.
                      Invoice is withheld from a buyer with no ΑΦΜ — not a preference we can
                      honour, since AADE rejects that document and generate_invoice_from_order
                      refuses it too. */}
                  {fiscalDocKind === 'invoice' && (
                    <SelectItem value="fiscal_invoice">Issue an invoice (τιμολόγιο) to myDATA</SelectItem>
                  )}
                  {fiscalDocKind && (
                    <SelectItem value="fiscal_receipt">Issue a retail receipt (ΑΛΠ) to myDATA</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {issuesFiscal
                  ? <>
                      <strong>{salesDocumentKindLabel(pickedFiscalKind!)}</strong> is transmitted to myDATA and cannot be deleted — correcting it needs a credit note.
                      {fiscalDocReason ? ` ${fiscalDocReason}` : ''}
                      {/* Say the cost of overriding the derived kind, rather than letting a
                          silent pick take the buyer's VAT deduction away. */}
                      {pickedFiscalKind === 'receipt' && fiscalDocKind === 'invoice'
                        ? ' This buyer has a VAT number — a retail receipt is legal, but they cannot deduct the VAT.'
                        : ''}
                    </>
                  : issueChoice === 'payment_receipt'
                    ? 'Proof the money was received. Not a sales document — nothing is filed with AADE.'
                    : 'Nothing is issued or emailed. Use this for a deposit you will invoice later, or a part-payment on an invoice that already exists.'}
              </p>
            </div>
          )}

          {kind === 'refund' && (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <div className="space-y-1">
                <Label>Invoice to credit</Label>
                <Select value={invoiceId} onValueChange={pickRefundInvoice}>
                  <SelectTrigger><SelectValue placeholder="Pick the invoice being refunded…" /></SelectTrigger>
                  <SelectContent>
                    {pickableInvoices.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No invoices</div>
                      : pickableInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — {Number((i as any).total ?? 0).toFixed(2)}{(i as any).fiscal_mark ? ' · MARK' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>Issue credit note to myDATA (nets the invoice)</span>
                <Switch checked={issueCreditNote} onCheckedChange={setIssueCreditNote} />
              </label>
              <p className="text-[11px] text-muted-foreground">
                {issueCreditNote
                  ? 'A 5.1 credit note is transmitted against the invoice, then the cash-out is logged.'
                  : 'Only the cash-out is recorded — no credit note is issued.'}
              </p>
            </div>
          )}

          <PaidFromSelect
            workspaceId={workspaceId}
            label={kind === 'received' ? 'Deposit to account' : 'Pay from account'}
            value={bankAccountId}
            onChange={setBankAccountId}
            method={method}
            onMethodChange={setMethod}
            accounts={bankAccounts}

          />
          {bankAccounts.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No accounts yet — add bank/cash accounts in Settings → Accounts to track where money sits.</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {categories.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">Add categories in Settings</div>
                    : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / Cheque no. / Credit note" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
