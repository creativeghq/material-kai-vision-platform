// Manual "ad-hoc" invoice creation. Distinct from issuing-from-quote (that flow
// lives on the QuoteDetailAdminPage as IssueInvoiceButton). Use this for sales
// that never went through the Quotes pipeline.
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Tag } from 'lucide-react';
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
import { invoicingSetupService } from '@/services/invoicingSetupService';

interface Customer {
  type: 'contact' | 'company';
  id: string;
  label: string;
}

interface LineItem {
  description: string;
  sku: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  income_classification_type: string;
  income_classification_category: string;
  expanded?: boolean;
}

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
}

const emptyLine = (): LineItem => ({
  description: '',
  sku: '',
  quantity: '1',
  unit_price: '0',
  unit_cost: '',
  income_classification_type: '',
  income_classification_category: '',
});

export const NewInvoiceDialog: React.FC<Props> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Customer
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);

  // Invoice header
  const [currency, setCurrency] = useState<string>('EUR');
  const [vatRate, setVatRate] = useState<string>('24');
  const [paymentTermsDays, setPaymentTermsDays] = useState<string>('30');
  const [notes, setNotes] = useState('');
  const [issueNow, setIssueNow] = useState(true);

  // Line items
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // myDATA document type + income-classification catalog (image 7/8)
  const [documentType, setDocumentType] = useState<string>('1.1');
  const [docTypes, setDocTypes] = useState<{ code: string; description: string }[]>([]);
  const [incTypes, setIncTypes] = useState<{ code: string; description: string }[]>([]);
  const [incCats, setIncCats] = useState<{ code: string; description: string }[]>([]);
  const [docDefaults, setDocDefaults] = useState<Record<string, { type: string | null; category: string | null }>>({});
  const [withholdings, setWithholdings] = useState<{ code: string; description: string; rate: number | null }[]>([]);
  const [withholdingCode, setWithholdingCode] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setCustomer(null);
    setCustomerSearch('');
    setCurrency('EUR');
    setVatRate('24');
    setPaymentTermsDays('30');
    setNotes('');
    setLines([emptyLine()]);
    setIssueNow(true);
  }, [open]);

  // Load the enabled doc types (+ per-type default classification) and the income catalog.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [allTypes, enabled, ic, cat, wh] = await Promise.all([
        invoicingSetupService.listReference('invoice_type'),
        invoicingSetupService.getDocTypeSettings(workspaceId),
        invoicingSetupService.listReference('income_classification_type'),
        invoicingSetupService.listReference('income_classification_category'),
        invoicingSetupService.listReference('withholding_tax'),
      ]);
      setWithholdings(wh.map((w) => ({ code: w.code, description: w.description, rate: w.rate })));
      setWithholdingCode('');
      // Only types the workspace enabled; if none configured, show all.
      const enabledCodes = Object.values(enabled).filter((e) => e.enabled).map((e) => e.code);
      const visible = enabledCodes.length ? allTypes.filter((t) => enabledCodes.includes(t.code)) : allTypes;
      setDocTypes(visible.map((t) => ({ code: t.code, description: t.description })));
      setIncTypes(ic.map((t) => ({ code: t.code, description: t.description })));
      setIncCats(cat.map((t) => ({ code: t.code, description: t.description })));
      setDocDefaults(Object.fromEntries(Object.values(enabled).map((e) => [e.code, { type: e.default_income_classification_type, category: e.default_income_classification_category }])));
      if (visible.length && !visible.some((t) => t.code === '1.1')) setDocumentType(visible[0].code);
    })();
  }, [open, workspaceId]);

  // Default each line's classification from the selected doc type's default.
  const applyDocDefault = (code: string) => {
    const def = docDefaults[code];
    if (def?.type) setLines((ls) => ls.map((l) => l.income_classification_type ? l : { ...l, income_classification_type: def.type!, income_classification_category: def.category ?? l.income_classification_category }));
  };

  // Customer search (contacts + companies)
  useEffect(() => {
    if (!open) return;
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      const [contacts, companies] = await Promise.all([
        supabase
          .from('crm_contacts')
          .select('id, name, first_name, last_name, email')
          .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(8),
        supabase
          .from('crm_companies')
          .select('id, name, email')
          .ilike('name', `%${term}%`)
          .limit(8),
      ]);
      const opts: Customer[] = [];
      for (const c of contacts.data ?? []) {
        const label = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id;
        opts.push({ type: 'contact', id: c.id, label: `${label}` });
      }
      for (const c of companies.data ?? []) {
        opts.push({ type: 'company', id: c.id, label: `${c.name} (company)` });
      }
      setCustomerOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [customerSearch, open]);

  const updateLine = (idx: number, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const totals = (() => {
    let subtotal = 0;
    for (const l of lines) {
      const q = parseFloat(l.quantity) || 0;
      const p = parseFloat(l.unit_price) || 0;
      subtotal += q * p;
    }
    const vr = parseFloat(vatRate) || 0;
    const vatAmount = subtotal * (vr / 100);
    const wh = withholdings.find((w) => w.code === withholdingCode);
    const withheld = wh?.rate ? subtotal * (Number(wh.rate) / 100) : 0;
    return { subtotal, vatAmount, withheld, total: subtotal + vatAmount - withheld };
  })();

  const handleSave = async () => {
    if (!customer) {
      toast({ title: 'Pick a customer', variant: 'destructive' });
      return;
    }
    const cleanLines = lines.filter((l) => l.description.trim() && parseFloat(l.quantity) > 0);
    if (cleanLines.length === 0) {
      toast({ title: 'Add at least one line item', variant: 'destructive' });
      return;
    }

    try {
      setBusy(true);

      const { data: number, error: numErr } = await supabase.rpc('next_invoice_number', {
        p_workspace_id: workspaceId,
      });
      if (numErr) throw numErr;

      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + (parseInt(paymentTermsDays, 10) || 30));

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          workspace_id: workspaceId,
          internal_number: number,
          customer_contact_id: customer.type === 'contact' ? customer.id : null,
          customer_company_id: customer.type === 'company' ? customer.id : null,
          status: issueNow ? 'issued' : 'draft',
          currency,
          subtotal_net: Number(totals.subtotal.toFixed(2)),
          vat_rate: Number(vatRate),
          vat_amount: Number(totals.vatAmount.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          payment_terms_days: parseInt(paymentTermsDays, 10) || 30,
          notes: notes || null,
          document_type: documentType,
          total_withheld_amount: Number((totals.withheld || 0).toFixed(2)),
          issued_at: issueNow ? new Date().toISOString() : null,
          due_at: issueNow ? dueAt.toISOString().slice(0, 10) : null,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      const itemsPayload = cleanLines.map((l) => {
        const q = parseFloat(l.quantity);
        const p = parseFloat(l.unit_price);
        const c = l.unit_cost.trim() ? parseFloat(l.unit_cost) : null;
        return {
          invoice_id: invoice.id,
          description: l.description.trim(),
          sku: l.sku.trim() || null,
          quantity: q,
          unit_price: p,
          unit_cost_snapshot: c,
          line_total: Number((q * p).toFixed(2)),
          income_classification_type: l.income_classification_type || null,
          income_classification_category: l.income_classification_category || null,
        };
      });

      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      toast({ title: 'Invoice created', description: number as string });
      onCreated(invoice.id);
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message ?? 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Manual invoice (not tied to a quote). For accepted quotes, use "Issue invoice" from the quote page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document type (myDATA) */}
          <div className="space-y-1">
            <Label>Document type (myDATA)</Label>
            <Select value={documentType} onValueChange={(v) => { setDocumentType(v); applyDocDefault(v); }}>
              <SelectTrigger><SelectValue placeholder="Select document type…" /></SelectTrigger>
              <SelectContent>
                {(docTypes.length ? docTypes : [{ code: '1.1', description: 'Sales Invoice' }]).map((t) => (
                  <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer *</Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{customer.label}</span>
                <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Search contacts or companies…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {customerOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
                    {customerOptions.map((o) => (
                      <button
                        key={`${o.type}-${o.id}`}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setCustomer(o);
                          setCustomerSearch('');
                          setCustomerOptions([]);
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <div className="space-y-1">
              <Label>VAT %</Label>
              <Input type="number" step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Terms (days)</Label>
              <Input type="number" min="0" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <input
                id="issue_now"
                type="checkbox"
                checked={issueNow}
                onChange={(e) => setIssueNow(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="issue_now" className="text-sm">Issue now</Label>
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-left w-28">SKU</th>
                    <th className="px-2 py-2 text-right w-20">Qty</th>
                    <th className="px-2 py-2 text-right w-28">Unit price</th>
                    <th className="px-2 py-2 text-right w-28">Unit cost</th>
                    <th className="px-2 py-2 text-right w-24">Line</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const lineTotal = (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0);
                    return (
                      <React.Fragment key={idx}>
                      <tr className="border-b border-border/30">
                        <td className="px-2 py-1">
                          <Input value={l.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} placeholder="Description" className="h-8" />
                        </td>
                        <td className="px-2 py-1">
                          <Input value={l.sku} onChange={(e) => updateLine(idx, 'sku', e.target.value)} className="h-8" />
                        </td>
                        <td className="px-2 py-1">
                          <Input type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className="h-8 text-right" />
                        </td>
                        <td className="px-2 py-1">
                          <Input type="number" step="0.01" min="0" value={l.unit_price} onChange={(e) => updateLine(idx, 'unit_price', e.target.value)} className="h-8 text-right" />
                        </td>
                        <td className="px-2 py-1">
                          <Input type="number" step="0.01" min="0" value={l.unit_cost} onChange={(e) => updateLine(idx, 'unit_cost', e.target.value)} placeholder="—" className="h-8 text-right" />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{lineTotal.toFixed(2)}</td>
                        <td className="px-1 py-1">
                          <div className="flex items-center gap-0.5">
                            <Button size="sm" variant="ghost" title="Income classification (myDATA)"
                              className={l.income_classification_type ? 'text-primary' : ''}
                              onClick={() => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, expanded: !x.expanded } : x))}>
                              <Tag className="h-3 w-3" />
                            </Button>
                            {lines.length > 1 && (
                              <Button size="sm" variant="ghost" onClick={() => removeLine(idx)}><Trash2 className="h-3 w-3" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {l.expanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={7} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-muted-foreground">Characterization (myDATA income classification)</span>
                              <Select value={l.income_classification_type || undefined} onValueChange={(v) => updateLine(idx, 'income_classification_type', v)}>
                                <SelectTrigger className="h-8 w-72"><SelectValue placeholder="Income type…" /></SelectTrigger>
                                <SelectContent>{incTypes.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={l.income_classification_category || undefined} onValueChange={(v) => updateLine(idx, 'income_classification_category', v)}>
                                <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Income category…" /></SelectTrigger>
                                <SelectContent>{incCats.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="text-sm">
                  <tr><td colSpan={5} className="px-2 py-1 text-right text-muted-foreground">Subtotal</td><td className="px-2 py-1 text-right tabular-nums">{totals.subtotal.toFixed(2)}</td><td /></tr>
                  <tr><td colSpan={5} className="px-2 py-1 text-right text-muted-foreground">VAT ({vatRate}%)</td><td className="px-2 py-1 text-right tabular-nums">{totals.vatAmount.toFixed(2)}</td><td /></tr>
                  {totals.withheld > 0 && (
                    <tr><td colSpan={5} className="px-2 py-1 text-right text-muted-foreground">Withholding (φόρος)</td><td className="px-2 py-1 text-right tabular-nums text-amber-600">-{totals.withheld.toFixed(2)}</td><td /></tr>
                  )}
                  <tr><td colSpan={5} className="px-2 py-1 text-right font-medium">Total</td><td className="px-2 py-1 text-right font-medium tabular-nums">{totals.total.toFixed(2)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              "Unit cost" is the cost-of-goods snapshot used for profit calc. Leave empty if you don't track it for this line.
            </p>
          </div>

          {/* Withholding tax (Φόροι Παραστατικού) — applied on the net, reduces the total */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Φόροι / Withholding tax</Label>
            <Select value={withholdingCode || 'none'} onValueChange={(v) => setWithholdingCode(v === 'none' ? '' : v)}>
              <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {withholdings.map((w) => <SelectItem key={w.code} value={w.code}>{w.description}{w.rate ? ` — ${w.rate}%` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes (not on PDF)" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
