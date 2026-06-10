/**
 * New credit note from the Credit-notes list. Pick the invoice it corrects, then credit
 * its specific lines (full or partial quantity) — Oxygen pistotika_new parity. The note is
 * created against the invoice (myDATA 5.1 correlated when the invoice has a MARK, else 5.2),
 * nets the invoice balance, and optionally transmits. Falls back to a whole-amount credit
 * for legacy invoices that have no stored line items.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
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

interface InvItem {
  id: string; description: string; sku: string | null; unit: string | null; product_id: string | null;
  quantity: number; unit_price: number; net_value: number; vat_amount: number; vat_category: number | null;
  income_classification_type: string | null; income_classification_category: string | null;
}
interface LineState { include: boolean; creditQty: string; }

const pctOfCat = (cat: number | null) => VAT_CATEGORIES.find((v) => v.code === String(cat ?? ''))?.pct ?? 0;

export const NewCreditNoteDialog: React.FC<{
  workspaceId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [items, setItems] = useState<InvItem[]>([]);
  const [lineState, setLineState] = useState<Record<string, LineState>>({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [amount, setAmount] = useState('');     // legacy fallback (no line items)
  const [reason, setReason] = useState('');
  const [submitFiscal, setSubmitFiscal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInvoiceId(''); setAmount(''); setReason(''); setSubmitFiscal(false); setItems([]); setLineState({});
    financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'paid', 'overdue'], limit: 300 })
      .then(setInvoices).catch(() => setInvoices([]));
  }, [open, workspaceId]);

  const invoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);

  const pick = async (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    setSubmitFiscal(!!(inv as any)?.fiscal_mark);
    setItemsLoading(true);
    try {
      const { data } = await supabase.from('invoice_items')
        .select('id, description, sku, unit, product_id, quantity, unit_price, net_value, vat_amount, vat_category, income_classification_type, income_classification_category')
        .eq('invoice_id', id);
      const rows = (data ?? []) as InvItem[];
      setItems(rows);
      // default: credit every line at full quantity
      const ls: Record<string, LineState> = {};
      for (const r of rows) ls[r.id] = { include: true, creditQty: String(r.quantity) };
      setLineState(ls);
      if (rows.length === 0) setAmount(String(inv?.total ?? ''));
    } catch { setItems([]); }
    finally { setItemsLoading(false); }
  };

  const setLine = (id: string, patch: Partial<LineState>) => setLineState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  // Build the credit lines + running totals from the selected invoice items.
  const computed = useMemo(() => {
    let net = 0, vat = 0;
    const lines = items.flatMap((it) => {
      const st = lineState[it.id];
      if (!st?.include) return [];
      const cq = parseFloat(st.creditQty) || 0;
      if (cq <= 0) return [];
      const ratio = it.quantity > 0 ? Math.min(cq, it.quantity) / it.quantity : 1;
      const lineNet = round2(Number(it.net_value) * ratio);
      const lineVat = round2(Number(it.vat_amount) * ratio);
      net = round2(net + lineNet); vat = round2(vat + lineVat);
      return [{
        source_invoice_item_id: it.id, product_id: it.product_id, description: it.description,
        sku: it.sku, unit: it.unit, quantity: Math.min(cq, it.quantity), unit_price: Number(it.unit_price),
        net_value: lineNet, vat_amount: lineVat, vat_category: it.vat_category, vat_percent: pctOfCat(it.vat_category),
        income_classification_type: it.income_classification_type, income_classification_category: it.income_classification_category,
      }];
    });
    return { lines, net, vat, total: round2(net + vat) };
  }, [items, lineState]);

  const hasItems = items.length > 0;
  const legacyAmount = parseFloat(amount) || 0;
  const effectiveTotal = hasItems ? computed.total : legacyAmount;

  const save = async () => {
    if (!invoiceId) { toast({ title: 'Pick an invoice', variant: 'destructive' }); return; }
    if (!reason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    if (hasItems && computed.lines.length === 0) { toast({ title: 'Select at least one line to credit', variant: 'destructive' }); return; }
    if (!hasItems && legacyAmount <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
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

  const cur = invoice?.currency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New credit note</DialogTitle></DialogHeader>
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
                {(invoice as any).fiscal_mark ? 'Correlated 5.1 credit note (references the invoice MARK).' : 'Non-correlated 5.2 (the invoice has no myDATA MARK).'} Crediting the full invoice flips it to credit_noted.
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
                    const cq = parseFloat(st.creditQty) || 0;
                    const ratio = it.quantity > 0 ? Math.min(cq, it.quantity) / it.quantity : 1;
                    const lineNet = round2(Number(it.net_value) * (st.include ? ratio : 0));
                    return (
                      <div key={it.id} className="grid grid-cols-[24px_1fr_70px_56px_84px_84px] items-center gap-2 border-t border-border/40 px-2 py-1.5 text-sm">
                        <input type="checkbox" checked={st.include} onChange={(e) => setLine(it.id, { include: e.target.checked })} />
                        <span className="truncate">{it.description}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{Number(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</span>
                        <Input className="h-7 text-right text-xs" type="number" step="0.01" min="0" max={Number(it.quantity)} value={st.creditQty} disabled={!st.include} onChange={(e) => setLine(it.id, { creditQty: e.target.value })} />
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
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
                <div className="text-sm font-medium">Transmit to myDATA (5.1)</div>
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
