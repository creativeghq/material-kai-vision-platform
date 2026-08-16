/**
 * Record a SUPPLIER credit note (πιστωτικό προμηθευτή):
 * full line items (product/description/qty/unit price/VAT), keyed either to a recorded
 * supplier bill (nets its payable) OR standalone to a supplier directly, with issue date,
 * category, mark-as-paid and the supplier's myDATA MARK for reconciliation. The supplier
 * issues + transmits to myDATA; on our side we RECORD it so AP is reduced.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Plus, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { financeService, formatMoney, round2, VAT_CATEGORIES, type SupplierBill } from '@/modules/finance/services/financeService';
import { vatOf } from '@/modules/finance/lib/vatMath';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { parseDecimalOr } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';

type Supplier = { type: 'company' | 'contact'; id: string; label: string };
interface Line { id: string; description: string; qty: string; unitPrice: string; vatCode: string; }

const newLine = (): Line => ({ id: Math.random().toString(36).slice(2), description: '', qty: '1', unitPrice: '', vatCode: '1' });
const pctOf = (code: string) => VAT_CATEGORIES.find((v) => v.code === code)?.pct ?? 0;

export const NewSupplierCreditNoteDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  /** Preselect a bill (from the AP row action); when omitted the operator picks a bill or a supplier. */
  supplierBillId?: string;
}> = ({ workspaceId, open, onOpenChange, onCreated, supplierBillId }) => {
  const { toast } = useToast();
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [billId, setBillId] = useState('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');

  // standalone supplier picker
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supSearch, setSupSearch] = useState('');
  const [supOptions, setSupOptions] = useState<Supplier[]>([]);

  const [issueDate, setIssueDate] = useState(() => todayLocalISO());
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [reason, setReason] = useState('');
  const [externalMark, setExternalMark] = useState('');
  const [markPaid, setMarkPaid] = useState(false);
  const [busy, setBusy] = useState(false);

  // Draft persistence — survives navigating away + reopening; cleared on Save / Cancel.
  const clearDraft = useSessionDraft(
    `fin-supplier-credit-note:${workspaceId}:${supplierBillId ?? 'standalone'}`,
    open,
    { billId, categoryId, supplier, issueDate, lines, reason, externalMark, markPaid },
    (d) => {
      setBillId(d?.billId ?? (supplierBillId ?? ''));
      setCategoryId(d?.categoryId ?? '');
      setSupplier(d?.supplier ?? null);
      setSupSearch('');
      setIssueDate(d?.issueDate ?? todayLocalISO());
      setLines(d?.lines ?? [newLine()]);
      setReason(d?.reason ?? '');
      setExternalMark(d?.externalMark ?? '');
      setMarkPaid(d?.markPaid ?? false);
    },
  );

  // Load the supplier-bill + category lists when the dialog opens (billId itself is
  // restored above, so the loader no longer overrides it).
  useEffect(() => {
    if (!open) return;
    financeService.listSupplierBills({ workspaceId, status: ['received', 'partially_paid', 'paid', 'overdue', 'disputed'] })
      .then(setBills)
      .catch(() => setBills([]));
    financeCategoriesService.list(workspaceId).then((c) => setCategories(c.filter((x) => x.kind === 'expense' || x.kind === 'both'))).catch(() => setCategories([]));
  }, [open, workspaceId]);

  // supplier search (standalone mode — only when no bill linked)
  useEffect(() => {
    const term = supSearch.trim();
    if (term.length < 2 || billId) { setSupOptions([]); return; }
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase.from('crm_companies').select('id, name').eq('is_supplier', true)
          .ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(6),
        supabase.from('crm_contacts').select('id, name, first_name, last_name').eq('is_supplier', true)
          .ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(6),
      ]);
      const opts: Supplier[] = [];
      for (const c of companies.data ?? []) opts.push({ type: 'company', id: (c as any).id, label: `${(c as any).name} (company)` });
      for (const c of contacts.data ?? []) opts.push({ type: 'contact', id: (c as any).id, label: (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' ') || (c as any).id });
      setSupOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [supSearch, billId]);

  const bill = useMemo(() => bills.find((b) => b.id === billId), [bills, billId]);
  const currency = bill?.currency ?? 'EUR';

  const computed = useMemo(() => {
    let net = 0, vat = 0;
    const payloadLines = lines
      .filter((l) => l.description.trim() && parseDecimalOr(l.unitPrice, 0) > 0)
      .map((l) => {
        const qty = parseDecimalOr(l.qty, 0);
        const lineNet = round2(qty * parseDecimalOr(l.unitPrice, 0));
        const pct = pctOf(l.vatCode);
        const lineVat = vatOf(lineNet, pct);
        net = round2(net + lineNet); vat = round2(vat + lineVat);
        return {
          description: l.description.trim(), quantity: qty, unit_price: parseDecimalOr(l.unitPrice, 0),
          net_value: lineNet, vat_amount: lineVat, vat_category: parseInt(l.vatCode, 10), vat_percent: pct,
        };
      });
    return { payloadLines, net, vat, total: round2(net + vat) };
  }, [lines]);

  const setLine = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => l.id === id ? { ...l, ...patch } : l));
  const addLine = () => setLines((ls) => [...ls, newLine()]);
  const removeLine = (id: string) => setLines((ls) => ls.length > 1 ? ls.filter((l) => l.id !== id) : ls);

  const save = async () => {
    if (!billId && !supplier) { toast({ title: 'Pick a supplier bill or a supplier', variant: 'destructive' }); return; }
    if (computed.payloadLines.length === 0) { toast({ title: 'Add at least one line', description: 'Each line needs a description and a price.', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      // Business rollup: a standalone supplier credit note keyed to a PERSON who is
      // attached to a company is attributed to the BUSINESS, not the person.
      let effSupplier = billId ? null : supplier;
      if (effSupplier && effSupplier.type === 'contact') {
        const rolled = await financeService.resolvePrimaryCompanyId(effSupplier.id).catch(() => null);
        if (rolled) {
          const { data: comp } = await supabase.from('crm_companies').select('id, name').eq('id', rolled).maybeSingle();
          if (comp) effSupplier = { type: 'company', id: comp.id as string, label: (comp.name as string) ?? effSupplier.label };
        }
      }
      await financeService.issueSupplierCreditNote({
        workspaceId,
        supplierBillId: billId || null,
        supplier: effSupplier,
        currency,
        issuedAt: new Date(issueDate).toISOString(),
        categoryId: categoryId || null,
        markPaid,
        reason: reason.trim() || undefined,
        externalMark: externalMark.trim() || undefined,
        lines: computed.payloadLines,
      });
      toast({ title: 'Supplier credit note recorded', description: billId ? 'Payable reduced.' : 'Standalone note recorded.' });
      clearDraft();
      onCreated(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    // Every dismissal routes through here. clearDraft() used to run only on Cancel and on
    // a successful save, so Esc, the X and an overlay click left the sessionStorage draft
    // intact — the next open silently repopulated an abandoned payee, amount, category and
    // Paid-now state, which is how an abandoned form becomes an accidental second booking.
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearDraft(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Supplier Credit Note</DialogTitle><DialogDescription className="sr-only">Record a credit note received from a supplier.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {/* Bill link OR standalone supplier */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Against supplier bill</Label>
              <Select value={billId || '__none'} onValueChange={(v) => { setBillId(v === '__none' ? '' : v); if (v !== '__none') setSupplier(null); }} disabled={!!supplierBillId}>
                <SelectTrigger><SelectValue placeholder="Optional — link a recorded bill" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Standalone (no bill) —</SelectItem>
                  {bills.map((b) => <SelectItem key={b.id} value={b.id}>{b.supplier_bill_number ?? b.id.slice(0, 8)} — {formatMoney(b.total, b.currency)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{billId ? 'Supplier' : 'Supplier *'}</Label>
              {billId ? (
                <Input disabled value={(bill as any)?.supplier_name ?? 'From the linked bill'} />
              ) : supplier ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-sm">
                  <span className="truncate">{supplier.label}</span>
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSupplier(null)}>Change</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-7" placeholder="Search supplier…" value={supSearch} onChange={(e) => setSupSearch(e.target.value)} />
                  {supOptions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                      {supOptions.map((o) => (
                        <button key={`${o.type}-${o.id}`} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setSupplier(o); setSupSearch(''); setSupOptions([]); }}>{o.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Issue date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={categoryId || '__none'} onValueChange={(v) => setCategoryId(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Supplier MARK</Label>
              <Input value={externalMark} onChange={(e) => setExternalMark(e.target.value)} placeholder="myDATA MARK (optional)" />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
            </div>
            <div className="rounded-md border border-border/60">
              <div className="grid grid-cols-[1fr_60px_84px_88px_84px_28px] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">VAT</span><span className="text-right">Line total</span><span />
              </div>
              {lines.map((l) => {
                const qty = parseDecimalOr(l.qty, 0); const up = parseDecimalOr(l.unitPrice, 0);
                // net + the SAME rounded VAT that gets stored, so the previewed line total can no
                // longer disagree by a cent with the payload built above.
                const lineNet = round2(qty * up); const lineTotal = round2(lineNet + vatOf(lineNet, pctOf(l.vatCode)));
                return (
                  <div key={l.id} className="grid grid-cols-[1fr_60px_84px_88px_84px_28px] items-center gap-2 border-t border-border/40 px-2 py-1.5">
                    <Input className="h-8 text-sm" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} placeholder="Item / Reason" />
                    <Input className="h-8 text-right text-sm" type="text" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} />
                    <Input className="h-8 text-right text-sm" type="text" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} placeholder="0.00" />
                    <Select value={l.vatCode} onValueChange={(v) => setLine(l.id, { vatCode: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <span className="text-right text-sm tabular-nums">{formatMoney(lineTotal, currency)}</span>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(l.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 text-sm">
            <span className="text-muted-foreground">Net {formatMoney(computed.net, currency)}</span>
            <span className="text-muted-foreground">VAT {formatMoney(computed.vat, currency)}</span>
            <span className="font-semibold">Total {formatMoney(computed.total, currency)}</span>
          </div>

          <div className="space-y-1">
            <Label>Reason / Notes</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Returned goods / Pricing correction" />
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Mark as paid</div>
              <p className="text-xs text-muted-foreground">The credit was settled in cash/offset rather than reducing an open bill.</p>
            </div>
            <Switch checked={markPaid} onCheckedChange={setMarkPaid} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { clearDraft(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Record · {formatMoney(computed.total, currency)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
