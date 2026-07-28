// Record an incoming supplier bill (AP side). Lighter than the invoice flow —
// suppliers send us pre-formed invoices with their totals, we just record them.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { financeService } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { ordersService } from '@/modules/finance/services/ordersService';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { parseDecimalOr } from '@/utils/decimal';

interface Supplier {
  type: 'contact' | 'company';
  id: string;
  label: string;
}

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Pre-select the supplier when opened from a supplier's CRM page. */
  prefill?: { supplier?: { companyId?: string | null; contactId?: string | null; name?: string | null } } | null;
}

export const NewSupplierBillDialog: React.FC<Props> = ({ workspaceId, open, onOpenChange, onCreated, prefill }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const prefillSupplier: Supplier | null = prefill?.supplier?.companyId
    ? { type: 'company', id: prefill.supplier.companyId, label: prefill.supplier.name ?? 'Supplier' }
    : prefill?.supplier?.contactId
      ? { type: 'contact', id: prefill.supplier.contactId, label: prefill.supplier.name ?? 'Supplier' }
      : null;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>([]);

  const [supplierBillNumber, setSupplierBillNumber] = useState('');
  const [currency, setCurrency] = useState<string>('EUR');
  const [subtotalNet, setSubtotalNet] = useState<string>('0');
  const [vatAmount, setVatAmount] = useState<string>('0');
  const [issuedAt, setIssuedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  // Optional 3-way match: link this bill to one of the supplier's purchase orders.
  const [poOptions, setPoOptions] = useState<Array<{ id: string; order_number: string | null; total: number }>>([]);
  const [matchedOrderId, setMatchedOrderId] = useState<string>('');

  // Draft persistence — survives navigating away + reopening; cleared on Save / Cancel.
  const clearDraft = useSessionDraft(
    `fin-supplier-bill:${workspaceId}`,
    open,
    { supplier, supplierBillNumber, currency, subtotalNet, vatAmount, issuedAt, dueAt, notes },
    (d) => {
      // A supplier passed in from the party page wins over any stale draft supplier.
      setSupplier(prefillSupplier ?? d?.supplier ?? null);
      setSupplierSearch('');
      setSupplierBillNumber(d?.supplierBillNumber ?? '');
      setCurrency(d?.currency ?? 'EUR');
      setSubtotalNet(d?.subtotalNet ?? '0');
      setVatAmount(d?.vatAmount ?? '0');
      setIssuedAt(d?.issuedAt ?? new Date().toISOString().slice(0, 10));
      setDueAt(d?.dueAt ?? '');
      setNotes(d?.notes ?? '');
    },
  );

  // Search across is_supplier=true rows only
  useEffect(() => {
    if (!open) return;
    const term = supplierSearch.trim();
    if (term.length < 2) {
      setSupplierOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase
          .from('crm_companies')
          .select('id, name')
          .eq('is_supplier', true)
          .ilike('name', `%${term}%`)
          .limit(8),
        supabase
          .from('crm_contacts')
          .select('id, name, first_name, last_name, email')
          .eq('is_supplier', true)
          .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(8),
      ]);
      const opts: Supplier[] = [];
      for (const c of companies.data ?? []) {
        opts.push({ type: 'company', id: c.id, label: `${c.name} (company)` });
      }
      for (const c of contacts.data ?? []) {
        const label = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id;
        opts.push({ type: 'contact', id: c.id, label: `${label}` });
      }
      setSupplierOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [supplierSearch, open]);

  // Load P&L categories (so a bill lands in per-category reporting) + apply the party-page prefill.
  useEffect(() => {
    if (!open) return;
    setCategoryId('');
    if (prefillSupplier) setSupplier(prefillSupplier);
    financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId]);

  // Load the chosen supplier's purchase orders so the bill can be matched (3-way match).
  useEffect(() => {
    setMatchedOrderId('');
    setPoOptions([]);
    if (!open || !supplier) return;
    let cancelled = false;
    (async () => {
      const companyId = supplier.type === 'company'
        ? supplier.id
        : await financeService.resolvePrimaryCompanyId(supplier.id).catch(() => null);
      if (!companyId || cancelled) return;
      try {
        const pos = await ordersService.listPurchaseOrdersForSupplier(workspaceId, companyId);
        if (!cancelled) setPoOptions(pos.map((p) => ({ id: p.id, order_number: p.order_number, total: p.total })));
      } catch { /* non-fatal — matching stays optional */ }
    })();
    return () => { cancelled = true; };
  }, [supplier, open, workspaceId]);

  const total = parseDecimalOr(subtotalNet, 0) + parseDecimalOr(vatAmount, 0);

  const handleSave = async () => {
    if (!supplier) {
      toast({ title: 'Pick a supplier', variant: 'destructive' });
      return;
    }
    if (parseDecimalOr(subtotalNet, 0) < 0 || parseDecimalOr(vatAmount, 0) < 0) {
      toast({ title: 'Amounts cannot be negative', variant: 'destructive' });
      return;
    }
    try {
      setBusy(true);
      // Business rollup: a supplier contact attached to a supplier company is
      // billed under the BUSINESS, not the person — same rule as customer docs.
      let supCompanyId = supplier.type === 'company' ? supplier.id : undefined;
      let supContactId = supplier.type === 'contact' ? supplier.id : undefined;
      if (supContactId && !supCompanyId) {
        const rolled = await financeService.resolvePrimaryCompanyId(supContactId).catch(() => null);
        if (rolled) { supCompanyId = rolled; supContactId = undefined; }
      }
      await financeService.createSupplierBill({
        workspaceId,
        supplierBillNumber: supplierBillNumber || undefined,
        supplierCompanyId: supCompanyId,
        supplierContactId: supContactId,
        currency,
        subtotalNet: Number(parseDecimalOr(subtotalNet, 0).toFixed(2)),
        vatAmount: Number(parseDecimalOr(vatAmount, 0).toFixed(2)),
        total: Number(total.toFixed(2)),
        issuedAt: issuedAt || undefined,
        dueAt: dueAt || undefined,
        notes: notes || undefined,
        orderId: matchedOrderId || undefined,
        categoryId: categoryId || null,
      });
      toast({ title: 'Supplier bill recorded' });
      clearDraft();
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message ?? 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record Supplier Bill</DialogTitle>
          <DialogDescription>
            Add an incoming bill from a supplier. Supplier must be marked <code>is_supplier</code> on its CRM record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Supplier *</Label>
            {supplier ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{supplier.label}</span>
                <Button size="sm" variant="ghost" onClick={() => setSupplier(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Search suppliers (only is_supplier=true)…"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                />
                {supplierOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
                    {supplierOptions.map((o) => (
                      <button
                        key={`${o.type}-${o.id}`}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSupplier(o);
                          setSupplierSearch('');
                          setSupplierOptions([]);
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {supplierSearch.trim().length >= 2 && supplierOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No matches. Mark a contact/company as <code>is_supplier</code> in the CRM first.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Supplier bill #</Label>
              <Input value={supplierBillNumber} onChange={(e) => setSupplierBillNumber(e.target.value)} placeholder="e.g. INV-2026/0042" />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Issued on</Label>
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Due on</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>

          {poOptions.length > 0 && (
            <div className="space-y-1">
              <Label>Match to purchase order <span className="text-muted-foreground font-normal">(optional — enables 3-way match)</span></Label>
              <Select value={matchedOrderId || '__none__'} onValueChange={(v) => setMatchedOrderId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="— No purchase order —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No purchase order —</SelectItem>
                  {poOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.order_number || p.id.slice(0, 8)} · {p.total.toFixed(2)} {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Category <span className="text-muted-foreground font-normal">(P&amp;L bucket)</span></Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {categories.length === 0
                  ? <div className="px-2 py-1 text-xs text-muted-foreground">Add categories in Settings</div>
                  : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { clearDraft(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
