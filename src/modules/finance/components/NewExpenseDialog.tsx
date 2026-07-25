// Record a business operating expense (rent, utilities, fees, …). An expense IS a supplier
// bill — the canonical spend record that feeds Payables (AP aging) + P&L per category. Party
// is optional. The "Paid now" toggle flips it between an open payable and a settled cost:
//   OFF → open payable (shows in AP with a due date)
//   ON  → also books the outgoing payment now (settled, drops out of AP, hits cash-out)
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import {
  financeService, type PaymentMethod, type BankAccountBalance, type RecurringCadence,
} from '@/modules/finance/services/financeService';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { crmBankAccountsAPI, type CrmBankAccount } from '@/services/crm.service';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { parseDecimalOr } from '@/utils/decimal';

// type 'adhoc' → a one-off payee not saved in CRM; `id` is null and `label` holds the typed name.
interface Party { type: 'company' | 'contact' | 'adhoc'; id: string | null; label: string }

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Link the expense to an order (so it shows on that order) + seed the amount/description. Used by
   *  the order's "Add expense" to turn a line cost into a real supplier bill in one step. */
  orderId?: string;
  prefill?: {
    amount?: number;
    description?: string;
    categoryId?: string;
    /** Pre-select the payee: a CRM supplier (companyId + display name) or a one-off name. */
    supplier?: { companyId?: string | null; name?: string | null };
  };
}

export const NewExpenseDialog: React.FC<Props> = ({ workspaceId, open, onOpenChange, onCreated, orderId, prefill }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountBalance[]>([]);

  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [subtotalNet, setSubtotalNet] = useState<string>('0');
  const [vatAmount, setVatAmount] = useState<string>('0');
  const [issuedAt, setIssuedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [paidNow, setPaidNow] = useState(true);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [repeat, setRepeat] = useState<'none' | RecurringCadence>('none');

  const [party, setParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [partyOptions, setPartyOptions] = useState<Party[]>([]);
  const [creatingParty, setCreatingParty] = useState(false);
  // The payee's own bank accounts — offered on a Bank Payment so you record which of THEIR banks
  // you paid to (managed on their CRM record → Tax & VAT → Bank Accounts).
  const [payeeBanks, setPayeeBanks] = useState<CrmBankAccount[]>([]);
  const [counterpartyBankId, setCounterpartyBankId] = useState<string>('');

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === 'expense' || c.kind === 'both'),
    [categories],
  );
  const total = parseDecimalOr(subtotalNet, 0) + parseDecimalOr(vatAmount, 0);

  // Draft persistence — survives navigating away + reopening; cleared on Save / Cancel.
  const clearDraft = useSessionDraft(
    `fin-expense:${workspaceId}`,
    open,
    { categoryId, description, reference, currency, subtotalNet, vatAmount, issuedAt, dueAt, notes, paidNow, bankAccountId, method, repeat, party },
    (d) => {
      setCategoryId(d?.categoryId ?? '');
      setDescription(d?.description ?? '');
      setReference(d?.reference ?? '');
      setCurrency(d?.currency ?? 'EUR');
      setSubtotalNet(d?.subtotalNet ?? '0');
      setVatAmount(d?.vatAmount ?? '0');
      setIssuedAt(d?.issuedAt ?? new Date().toISOString().slice(0, 10));
      setDueAt(d?.dueAt ?? '');
      setNotes(d?.notes ?? '');
      setPaidNow(d?.paidNow ?? true);
      setBankAccountId(d?.bankAccountId ?? '');
      setMethod(d?.method ?? 'bank_transfer');
      setRepeat(d?.repeat ?? 'none');
      setParty(d?.party ?? null);
      setPartySearch('');
    },
  );

  // Load expense categories + bank accounts when the dialog opens.
  useEffect(() => {
    if (!open || !workspaceId) return;
    void financeCategoriesService.list(workspaceId).then((cats) => {
      setCategories(cats);
      // Order-attached expense → default to the protected "Order" category (unless one is prefilled).
      if (orderId && !prefill?.categoryId) {
        const orderCat = cats.find((c) => c.is_system);
        if (orderCat) setCategoryId((cur) => cur || orderCat.id);
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

  // Seed amount/description/category/payee when opened from an order's "Mark as paid" / "Add expense"
  // (turning a line cost into a real bill). Keyed on the prefill amount too, so re-opening for a
  // different line re-seeds.
  useEffect(() => {
    if (!open || !prefill) return;
    if (prefill.amount != null) { setSubtotalNet(String(prefill.amount)); setVatAmount('0'); }
    if (prefill.description) setDescription(prefill.description);
    if (prefill.categoryId) setCategoryId(prefill.categoryId);
    if (prefill.supplier?.companyId) {
      setParty({ type: 'company', id: prefill.supplier.companyId, label: prefill.supplier.name || 'Supplier' });
    } else if (prefill.supplier?.name) {
      setParty({ type: 'adhoc', id: null, label: prefill.supplier.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, prefill?.amount, prefill?.supplier?.companyId, prefill?.supplier?.name]);

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

  // Optional supplier/payee search (suppliers only).
  useEffect(() => {
    if (!open) return;
    const term = partySearch.trim();
    if (term.length < 2) { setPartyOptions([]); return; }
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase.from('crm_companies').select('id, name').eq('is_supplier', true).ilike('name', `%${term}%`).limit(8),
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email').eq('is_supplier', true)
          .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`).limit(8),
      ]);
      const opts: Party[] = [];
      for (const c of companies.data ?? []) opts.push({ type: 'company', id: c.id, label: `${c.name} (company)` });
      for (const c of contacts.data ?? []) {
        const label = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id;
        opts.push({ type: 'contact', id: c.id, label });
      }
      setPartyOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [partySearch, open]);

  // Quick-create a supplier from the typed name (supplier bills require a counterparty —
  // for myDATA / statements / spend-per-supplier). Find-or-create by name to avoid dupes.
  const createParty = async () => {
    const name = partySearch.trim();
    if (name.length < 2) return;
    setCreatingParty(true);
    try {
      const existing = await supabase.from('crm_companies').select('id, name')
        .eq('workspace_id', workspaceId).ilike('name', name).limit(1).maybeSingle();
      let id = existing.data?.id as string | undefined;
      if (!id) {
        const ins = await supabase.from('crm_companies')
          .insert({ workspace_id: workspaceId, name, is_supplier: true } as any)
          .select('id').single();
        if (ins.error) throw ins.error;
        id = ins.data.id;
      } else {
        // Ensure it's flagged as a supplier so it shows in future searches.
        await supabase.from('crm_companies').update({ is_supplier: true } as any).eq('id', id);
      }
      setParty({ type: 'company', id: id!, label: `${name} (company)` });
      setPartySearch(''); setPartyOptions([]);
    } catch (err: any) {
      toast({ title: 'Could not create supplier', description: err?.message, variant: 'destructive' });
    } finally {
      setCreatingParty(false);
    }
  };

  const handleSave = async () => {
    if (!categoryId) { toast({ title: 'Pick a category', variant: 'destructive' }); return; }
    if (!party) { toast({ title: 'Pick or create a supplier / payee', variant: 'destructive' }); return; }
    if (total <= 0) { toast({ title: 'Amount must be positive', variant: 'destructive' }); return; }
    if (parseDecimalOr(subtotalNet, 0) < 0 || parseDecimalOr(vatAmount, 0) < 0) {
      toast({ title: 'Amounts cannot be negative', variant: 'destructive' }); return;
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
      await financeService.createExpense({
        workspaceId,
        categoryId,
        description: description.trim() || undefined,
        reference: reference.trim() || undefined,
        supplierCompanyId: cpCompanyId,
        supplierContactId: cpContactId,
        supplierName: adhocSupplierName,
        orderId,
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
      if (repeat !== 'none') {
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
          nextRunAt: financeService.nextRecurrenceDate(issuedAt || new Date().toISOString().slice(0, 10), repeat),
          autoPay: paidNow,
          bankAccountId: paidNow ? (bankAccountId || null) : null,
          paymentMethod: method,
          notes: notes || undefined,
        });
      }
      toast({
        title: paidNow ? 'Expense recorded & paid' : 'Expense recorded as payable',
        description: repeat !== 'none'
          ? `Recurring ${repeat} — the next one generates automatically.`
          : (paidNow ? 'Booked as a paid cost — visible in Payables and Payments.' : 'Open in Payables (AP) until you mark it paid.'),
      });
      clearDraft();
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message ?? 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            A business cost (rent, utilities, fees…). Recorded as a categorized supplier bill — an open <strong>payable</strong> until paid, or settled now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
              <Label>Reference / bill #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional — e.g. DEH-2026/06" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Office rent — June 2026" />
          </div>

          <div className="space-y-1">
            <Label>Supplier / payee *</Label>
            {party ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{party.label}{party.type === 'adhoc' && <span className="ml-1.5 text-[10px] text-muted-foreground">· one-off, not in CRM</span>}</span>
                <Button size="sm" variant="ghost" onClick={() => setParty(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Input placeholder="Search a supplier, or type any payee name…" value={partySearch} onChange={(e) => setPartySearch(e.target.value)} />
                {partyOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
                    {partyOptions.map((o) => (
                      <button key={`${o.type}-${o.id}`} type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { setParty(o); setPartySearch(''); setPartyOptions([]); }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {partySearch.trim().length >= 2 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={creatingParty} onClick={createParty}>
                      {creatingParty ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Create supplier “{partySearch.trim()}”
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
  );
};
