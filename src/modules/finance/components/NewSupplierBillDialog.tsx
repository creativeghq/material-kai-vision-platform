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
import { useSessionDraft } from '@/hooks/useSessionDraft';

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
}

export const NewSupplierBillDialog: React.FC<Props> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

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

  // Draft persistence — survives navigating away + reopening; cleared on Save / Cancel.
  const clearDraft = useSessionDraft(
    `fin-supplier-bill:${workspaceId}`,
    open,
    { supplier, supplierBillNumber, currency, subtotalNet, vatAmount, issuedAt, dueAt, notes },
    (d) => {
      setSupplier(d?.supplier ?? null);
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

  const total = (parseFloat(subtotalNet) || 0) + (parseFloat(vatAmount) || 0);

  const handleSave = async () => {
    if (!supplier) {
      toast({ title: 'Pick a supplier', variant: 'destructive' });
      return;
    }
    if (parseFloat(subtotalNet) < 0 || parseFloat(vatAmount) < 0) {
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
        subtotalNet: Number((parseFloat(subtotalNet) || 0).toFixed(2)),
        vatAmount: Number((parseFloat(vatAmount) || 0).toFixed(2)),
        total: Number(total.toFixed(2)),
        issuedAt: issuedAt || undefined,
        dueAt: dueAt || undefined,
        notes: notes || undefined,
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
          <DialogTitle>Record supplier bill</DialogTitle>
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
              <Input type="number" step="0.01" min="0" value={subtotalNet} onChange={(e) => setSubtotalNet(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>VAT amount</Label>
              <Input type="number" step="0.01" min="0" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
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
