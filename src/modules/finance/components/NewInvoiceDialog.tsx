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
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invoicingSetupService } from '@/services/invoicingSetupService';
import { servicesService, type ServiceItem } from '@/modules/finance/services/servicesService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

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
  product_id?: string | null;       // set when the line came from a service/product
  vat_category?: number | null;      // myDATA VAT category for this line (e.g. a service)
  expanded?: boolean;
}

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
}

// Group myDATA document types by family so the dropdown isn't one long flat list.
const DOC_FAMILY: Record<string, string> = {
  '1': 'Sales invoices', '2': 'Service invoices', '3': 'Proof of expense',
  '5': 'Credit notes', '6': 'Self-billing', '7': 'Contracts', '8': 'Rents / special',
  '9': 'Delivery notes', '11': 'Retail receipts', '13': 'Retail / expenses',
  '14': 'Cross-border', '15': 'Contractor', '16': 'Other', '17': 'Other',
};
function groupDocTypes(types: { code: string; description: string }[]) {
  const groups = new Map<string, { code: string; description: string }[]>();
  for (const t of types) {
    const fam = String(t.code).split('.')[0];
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam)!.push(t);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([family, items]) => ({ family, label: DOC_FAMILY[family] ?? `Type ${family}.x`, items }));
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
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  // Invoice with shipping (Τιμολόγιο - Δελτίο Αποστολής)
  const [hasShipping, setHasShipping] = useState(false);
  const [shipFrom, setShipFrom] = useState('');
  const [transportDate, setTransportDate] = useState('');
  const [transportTime, setTransportTime] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [movePurpose, setMovePurpose] = useState('1');
  const [responsible, setResponsible] = useState('');
  const [shipTo, setShipTo] = useState('');

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
    setHasShipping(false); setShipFrom(''); setTransportDate(''); setTransportTime(''); setVehicleNumber(''); setMovePurpose('1'); setResponsible(''); setShipTo('');
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
      servicesService.list(workspaceId).then(setServices).catch(() => setServices([]));
      financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
      setCategoryId('');
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

  // #203 — drop a service in as a prefilled line (price + VAT + classification from the service).
  const addServiceLine = (serviceId: string) => {
    const s = services.find((x) => x.id === serviceId);
    if (!s) return;
    setLines((prev) => {
      const next = [...prev];
      const line: LineItem = {
        description: s.name,
        sku: '',
        quantity: '1',
        unit_price: s.list_price != null ? String(s.list_price) : '0',
        unit_cost: '',
        income_classification_type: s.income_classification_type ?? '',
        income_classification_category: s.income_classification_category ?? '',
        product_id: s.id,
        vat_category: s.vat_category,
      };
      // Replace a single empty starter row, otherwise append.
      if (next.length === 1 && !next[0].description.trim()) return [line];
      return [...next, line];
    });
  };

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
          category_id: categoryId || null,
          has_shipping: hasShipping,
          ship_from: hasShipping ? (shipFrom || null) : null,
          transport_date: hasShipping && transportDate ? transportDate : null,
          transport_time: hasShipping ? (transportTime || null) : null,
          vehicle_number: hasShipping ? (vehicleNumber || null) : null,
          move_purpose: hasShipping ? movePurpose : null,
          responsible: hasShipping ? (responsible || null) : null,
          ship_to: hasShipping ? (shipTo || null) : null,
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
          product_id: l.product_id || null,
          vat_category: l.vat_category ?? null,
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
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Manual invoice (not tied to a quote). For accepted quotes, use "Issue invoice" from the quote page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header: customer (left) · document type + category (right) */}
          <div className="grid gap-4 md:grid-cols-2">
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
                          onClick={() => { setCustomer(o); setCustomerSearch(''); setCustomerOptions([]); }}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Document type (myDATA)</Label>
                <Select value={documentType} onValueChange={(v) => { setDocumentType(v); applyDocDefault(v); }}>
                  <SelectTrigger><SelectValue placeholder="Select document type…" /></SelectTrigger>
                  <SelectContent>
                    {groupDocTypes(docTypes.length ? docTypes : [{ code: '1.1', description: 'Sales Invoice' }]).map((g) => (
                      <React.Fragment key={g.family}>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{g.label}</div>
                        {g.items.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
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

          {/* Invoice with shipping (Τιμολόγιο - Δελτίο Αποστολής) */}
          <div className="rounded-md border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Invoice with shipping</div>
                <p className="text-xs text-muted-foreground">Combined invoice + delivery note — adds transport details (Δελτίο Αποστολής).</p>
              </div>
              <Switch checked={hasShipping} onCheckedChange={setHasShipping} />
            </div>
            {hasShipping && (
              <div className="grid gap-3 md:grid-cols-2">
                {/* Loading place */}
                <div className="space-y-1">
                  <Label className="text-xs">Loading place (Τόπος φόρτωσης)</Label>
                  <Input className="h-8 text-xs" value={shipFrom} onChange={(e) => setShipFrom(e.target.value)} placeholder="Our HQ / address" />
                </div>
                {/* Delivery place */}
                <div className="space-y-1">
                  <Label className="text-xs">Delivery place (Τόπος αποστολής)</Label>
                  <Input className="h-8 text-xs" value={shipTo} onChange={(e) => setShipTo(e.target.value)} placeholder="Delivery address" />
                </div>
                {/* Transport */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Transport date</Label>
                    <Input type="date" className="h-8 text-xs" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time</Label>
                    <Input type="time" className="h-8 text-xs" value={transportTime} onChange={(e) => setTransportTime(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle no.</Label>
                    <Input className="h-8 text-xs" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="ΝΑΧ-1234" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Responsible</Label>
                    <Input className="h-8 text-xs" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Driver / handler" />
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Purpose (Σκοπός)</Label>
                  <Select value={movePurpose} onValueChange={setMovePurpose}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Sale</SelectItem>
                      <SelectItem value="2">2 — Sale on behalf of third party</SelectItem>
                      <SelectItem value="3">3 — Sampling</SelectItem>
                      <SelectItem value="4">4 — Exhibition</SelectItem>
                      <SelectItem value="5">5 — Return</SelectItem>
                      <SelectItem value="6">6 — Movement between premises</SelectItem>
                      <SelectItem value="7">7 — Consignment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Line items</Label>
              <div className="flex items-center gap-2">
                {services.length > 0 && (
                  <Select value="" onValueChange={addServiceLine}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="+ Add service" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.list_price != null ? ` — ${s.list_price} ${s.currency}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
              </div>
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
                    <tr><td colSpan={5} className="px-2 py-1 text-right text-muted-foreground">Withholding</td><td className="px-2 py-1 text-right tabular-nums text-amber-600">-{totals.withheld.toFixed(2)}</td><td /></tr>
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
            <Label className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Withholding tax</Label>
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
