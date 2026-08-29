/**
 * New credit note from the Credit-notes list. Pick the invoice it corrects, then credit
 * its specific lines (full or partial quantity). The note is created against the invoice,
 * nets its balance, and optionally transmits. Falls back to a whole-amount credit for legacy
 * invoices that have no stored line items.
 *
 * The myDATA type FOLLOWS THE CREDITED DOCUMENT and is decided by `issue_credit_note`, not
 * here: 11.4 for a retail receipt (11.x), otherwise 5.1 when the invoice carries a MARK and
 * 5.2 when it does not. The exemption category and the per-line taxes are copied from the
 * credited invoice line by the same RPC — never restated by this form.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { financeService, formatMoney, round2, VAT_CATEGORIES, type Invoice } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

interface InvItem {
  id: string; description: string; sku: string | null; unit: string | null; product_id: string | null;
  quantity: number; unit_price: number; net_value: number; vat_amount: number; vat_category: number | null;
  income_classification_type: string | null; income_classification_category: string | null;
}
interface LineState { include: boolean; creditQty: string; }
/** How much of each invoice line earlier credit notes have already taken (#351 B4). */
type CreditedQty = Record<string, number>;

const pctOfCat = (cat: number | null) => VAT_CATEGORIES.find((v) => v.code === String(cat ?? ''))?.pct ?? 0;

export const NewCreditNoteDialog: React.FC<{
  workspaceId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
  /** Credit THIS invoice: opened from the invoice itself, so its picker starts on it and its
   *  lines are loaded straight away. A prefill — the invoice can still be changed. */
  presetInvoiceId?: string;
}> = ({ workspaceId, open, onOpenChange, onCreated, presetInvoiceId }) => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [items, setItems] = useState<InvItem[]>([]);
  const [lineState, setLineState] = useState<Record<string, LineState>>({});
  const [credited, setCredited] = useState<CreditedQty>({});
  const [creditedTotal, setCreditedTotal] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [amount, setAmount] = useState('');     // legacy fallback (no line items)
  const [reason, setReason] = useState('');
  const [submitFiscal, setSubmitFiscal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInvoiceId(''); setAmount(''); setReason(''); setSubmitFiscal(false); setItems([]); setLineState({});
    setCredited({}); setCreditedTotal(0);
    financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'paid', 'overdue'], limit: 300 })
      .then((rows) => { setInvoices(rows); return rows; })
      .catch(() => { setInvoices([]); return [] as Invoice[]; })
      // Opened from an invoice → select it once its row is in hand, which also loads its lines.
      // The rows are passed IN. `pick` used to read the `invoices` state, but this callback
      // closes over the render that scheduled the fetch — where `invoices` is still [] — so
      // `invoices.find(...)` was always undefined. Opened from an invoice, that meant
      // "Transmit to myDATA (5.1)" defaulted OFF even for a MARKed invoice, and the fallback
      // Amount was left blank.
      .then((rows) => { if (presetInvoiceId && rows.some((i) => i.id === presetInvoiceId)) void pick(presetInvoiceId, rows); });
  }, [open, workspaceId, presetInvoiceId]);

  const invoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);

  /** `rows` overrides the `invoices` state for callers that have the freshly-fetched list but
   *  whose closure predates the state update (see the preset effect above). */
  const pick = async (id: string, rows?: Invoice[]) => {
    setInvoiceId(id);
    const inv = (rows ?? invoices).find((i) => i.id === id);
    setSubmitFiscal(!!(inv as any)?.fiscal_mark);
    setItemsLoading(true);
    try {
      const { data } = await supabase.from('invoice_items')
        .select('id, description, sku, unit, product_id, quantity, unit_price, net_value, vat_amount, vat_category, income_classification_type, income_classification_category')
        .eq('invoice_id', id);
      const lineRows = (data ?? []) as InvItem[];
      setItems(lineRows);

      /**
       * What earlier credit notes already took (#351 B4).
       *
       * The default used to be full quantity on every line, and the clamp only ever looked at the
       * request in front of it. So crediting 6 of 10 and then reopening this form offered all 10
       * again - cumulatively EUR 198.40 of credit notes against a EUR 124 invoice, each a valid
       * transmitted legal document. `issue_credit_note` now refuses to go past the invoice total,
       * but a form that offers a quantity the server will reject is still a form that lies.
       */
      const { data: priorRows, error: priorErr } = await supabase.from('credit_note_items')
        .select('source_invoice_item_id, quantity, credit_notes!inner(invoice_id)')
        .eq('credit_notes.invoice_id', id);
      // A failed read is NOT "nothing has been credited" - that is the assumption this whole
      // finding is about. Offer nothing rather than offer a duplicate.
      if (priorErr) throw priorErr;
      const already: CreditedQty = {};
      for (const r of (priorRows ?? []) as Array<{ source_invoice_item_id: string | null; quantity: number }>) {
        if (!r.source_invoice_item_id) continue;
        already[r.source_invoice_item_id] = round2((already[r.source_invoice_item_id] ?? 0) + Number(r.quantity ?? 0));
      }
      setCredited(already);
      setCreditedTotal(Number((inv as any)?.amount_credited ?? 0));

      // default: credit what is LEFT on each line, and leave a fully-credited line out.
      const ls: Record<string, LineState> = {};
      for (const r of lineRows) {
        const left = round2(Math.max(0, Number(r.quantity) - (already[r.id] ?? 0)));
        ls[r.id] = { include: left > 0, creditQty: String(left) };
      }
      setLineState(ls);
      if (lineRows.length === 0) {
        setAmount(String(round2(Math.max(0, Number(inv?.total ?? 0) - Number((inv as any)?.amount_credited ?? 0)))));
      }
    } catch (err) {
      console.error('[credit-note] could not load what has already been credited', err);
      setItems([]); setCredited({}); setCreditedTotal(0);
      toast({
        title: 'Could not load this invoice',
        description: 'What has already been credited is unknown, so nothing is offered. Try again.',
        variant: 'destructive',
      });
    }
    finally { setItemsLoading(false); }
  };

  const setLine = (id: string, patch: Partial<LineState>) => setLineState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  // Build the credit lines + running totals from the selected invoice items.
  const computed = useMemo(() => {
    let net = 0, vat = 0;
    const lines = items.flatMap((it) => {
      const st = lineState[it.id];
      if (!st?.include) return [];
      const cq = parseDecimalOr(st.creditQty, 0);
      if (cq <= 0) return [];
      // Capped at the REMAINING quantity (#351 B4) - `it.quantity` is what was invoiced, which is
      // not what is still creditable once an earlier note took part of it.
      const remaining = round2(Math.max(0, Number(it.quantity) - (credited[it.id] ?? 0)));
      if (remaining <= 0) return [];
      const ratio = it.quantity > 0 ? Math.min(cq, remaining) / it.quantity : 1;
      const lineNet = round2(Number(it.net_value) * ratio);
      const lineVat = round2(Number(it.vat_amount) * ratio);
      net = round2(net + lineNet); vat = round2(vat + lineVat);
      return [{
        source_invoice_item_id: it.id, product_id: it.product_id, description: it.description,
        sku: it.sku, unit: it.unit, quantity: Math.min(cq, remaining), unit_price: Number(it.unit_price),
        net_value: lineNet, vat_amount: lineVat, vat_category: it.vat_category, vat_percent: pctOfCat(it.vat_category),
        income_classification_type: it.income_classification_type, income_classification_category: it.income_classification_category,
      }];
    });
    return { lines, net, vat, total: round2(net + vat) };
  }, [items, lineState, credited]);

  const hasItems = items.length > 0;
  const legacyAmount = parseDecimalOr(amount, 0);
  const effectiveTotal = hasItems ? computed.total : legacyAmount;

  const cur = invoice?.currency;
  /** What is still creditable. The server refuses anything past it; the form must not offer it. */
  const headroom = invoice ? round2(Math.max(0, Number(invoice.total) - creditedTotal)) : 0;

  const save = async () => {
    if (!invoiceId) { toast({ title: 'Pick an invoice', variant: 'destructive' }); return; }
    if (!reason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    if (hasItems && computed.lines.length === 0) { toast({ title: 'Select at least one line to credit', variant: 'destructive' }); return; }
    if (!hasItems && legacyAmount <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    // Refused here as well as in `issue_credit_note` (#351 B4) — the RPC is the boundary, this is
    // the operator being told before a legal document is attempted rather than after.
    if (invoice && effectiveTotal > headroom) {
      toast({
        title: 'More than this invoice has left to credit',
        description: `${formatMoney(headroom, cur)} of ${formatMoney(Number(invoice.total), cur)} is still creditable; this note is for ${formatMoney(effectiveTotal, cur)}.`,
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      await financeService.createCreditNote({
        invoiceId, amount: effectiveTotal, currency: invoice?.currency, reason: reason.trim(),
        correlated: !!(invoice as any)?.fiscal_mark, submitFiscal,
        lines: hasItems ? computed.lines : undefined,
      });
      toast({ title: 'Credit note issued' });
      onCreated(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Credit Note</DialogTitle><DialogDescription className="sr-only">Issue a credit note against an existing invoice.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Against invoice *</Label>
            <Select value={invoiceId} onValueChange={pick}>
              <SelectTrigger><SelectValue placeholder="Pick the invoice to credit…" /></SelectTrigger>
              <SelectContent>
                {invoices.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No issued invoices</div>
                  : invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — {formatMoney(i.total, i.currency)}{(i as any).fiscal_mark ? ' · MARK' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            {invoice && (
              <p className="text-[11px] text-muted-foreground">
                {String((invoice as any).document_type ?? '').startsWith('11.')
                  ? 'Retail credit note (11.4) — a retail receipt is reversed by 11.4, not by a credit invoice.'
                  : (invoice as any).fiscal_mark
                    ? 'Correlated 5.1 credit note (references the invoice MARK).'
                    : 'Non-correlated 5.2 (the invoice has no myDATA MARK).'} Crediting the full invoice flips it to credit_noted.
              </p>
            )}
            {/* What is LEFT to credit, stated (#351 B4). `amount_credited` is the platform's one
                derivation of it; this only formats it. */}
            {invoice && creditedTotal > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {formatMoney(creditedTotal, cur)} of {formatMoney(Number(invoice.total), cur)} has already been credited
                on this invoice &mdash; {formatMoney(round2(Math.max(0, Number(invoice.total) - creditedTotal)), cur)} left.
              </p>
            )}
          </div>

          {/* Line selection */}
          {invoiceId && (
            itemsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : hasItems ? (
              <div className="space-y-1">
                <Label>Lines to credit</Label>
                <div className="rounded-md border border-border/60">
                  <div className="grid grid-cols-[24px_1fr_70px_56px_84px_84px] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                    <span /><span>Description</span><span className="text-right">Invoiced</span><span className="text-right">Credit</span><span className="text-right">VAT</span><span className="text-right">Net</span>
                  </div>
                  {items.map((it) => {
                    const st = lineState[it.id] ?? { include: false, creditQty: '0' };
                    const cq = parseDecimalOr(st.creditQty, 0);
                    const alreadyQty = credited[it.id] ?? 0;
                    const remaining = round2(Math.max(0, Number(it.quantity) - alreadyQty));
                    const ratio = it.quantity > 0 ? Math.min(cq, remaining) / it.quantity : 1;
                    const lineNet = round2(Number(it.net_value) * (st.include ? ratio : 0));
                    return (
                      <div key={it.id} className="grid grid-cols-[24px_1fr_70px_56px_84px_84px] items-center gap-2 border-t border-border/40 px-2 py-1.5 text-sm">
                        <Checkbox checked={st.include} disabled={remaining <= 0} onCheckedChange={(v) => setLine(it.id, { include: v === true })} />
                        <span className="truncate">
                          {it.description}
                          {alreadyQty > 0 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              &middot; {alreadyQty} already credited{remaining <= 0 ? ' (nothing left)' : ''}
                            </span>
                          )}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">{Number(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</span>
                        <Input className="h-7 text-right text-xs" type="text" inputMode="decimal" value={st.creditQty} disabled={!st.include || remaining <= 0} onChange={(e) => setLine(it.id, { creditQty: e.target.value })} />
                        <span className="text-right tabular-nums text-muted-foreground">{pctOfCat(it.vat_category)}%</span>
                        <span className="text-right tabular-nums">{formatMoney(lineNet, cur)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-4 pt-1 text-sm">
                  <span className="text-muted-foreground">Net {formatMoney(computed.net, cur)}</span>
                  <span className="text-muted-foreground">VAT {formatMoney(computed.vat, cur)}</span>
                  <span className="font-semibold">Total {formatMoney(computed.total, cur)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Amount (gross) — legacy invoice without stored lines</Label>
                <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )
          )}

          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer return — chipped tile" />
          </div>

          {invoice && (invoice as any).fiscal_mark && (
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Transmit to myDATA</div>
                <p className="text-xs text-muted-foreground">Correlated to the invoice MARK.</p>
              </div>
              <Switch checked={submitFiscal} onCheckedChange={setSubmitFiscal} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue credit note · {formatMoney(effectiveTotal, cur)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
