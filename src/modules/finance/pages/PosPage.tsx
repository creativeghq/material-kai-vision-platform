/**
 * #205 — lightweight cloud POS. Sell goods/services to a walk-in (B2C), issue a myDATA
 * simplified retail receipt (11.1), record the cash/card payment, print. No customer
 * required; a VAT-exempt seller just sets the default VAT rate to 0. Reuses the existing
 * invoice + fiscal-submit + payment machinery — a receipt is an invoice with
 * document_type='11.1'.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Plus, Minus, Trash2, Search, ShoppingCart, Printer, CheckCircle2, Wrench, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';
import { invoicingSetupService, type FinanceBranch } from '@/services/invoicingSetupService';

interface SellItem {
  id: string;
  name: string;
  item_type: 'good' | 'service';
  unit_price: number;
  currency: string;
  unit: string | null;
  vat_category: number | null;
  inc_type: string | null;
  inc_cat: string | null;
}
interface CartLine extends SellItem { qty: number; }

const round2 = (n: number) => Math.round(n * 100) / 100;

const PosPage: React.FC = () => {
  const { toast } = useToast();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();

  const [items, setItems] = useState<SellItem[]>([]);
  const [vatRate, setVatRate] = useState(24);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  const [branchCode, setBranchCode] = useState('0');
  const [vatInclusive, setVatInclusive] = useState(true); // retail prices usually include VAT
  // The receipt also constitutes a movement/delivery document.
  const [movementDoc, setMovementDoc] = useState(false);
  const [movVehicle, setMovVehicle] = useState('');
  const [movShipTo, setMovShipTo] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState<{ number: string; total: number; currency: string; mark: string | null } | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: prices }, { data: fs }, br] = await Promise.all([
        supabase
          .from('product_prices')
          .select('list_price, currency, unit, product:products(id, name, item_type, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category)')
          .eq('workspace_id', activeWorkspaceId),
        supabase.from('finance_settings').select('default_vat_rate').eq('workspace_id', activeWorkspaceId).maybeSingle(),
        invoicingSetupService.listBranches(activeWorkspaceId).catch(() => [] as FinanceBranch[]),
      ]);
      if (cancelled) return;
      setBranches(br);
      const sell: SellItem[] = (prices ?? [])
        .filter((r: any) => r.product && r.list_price != null)
        .map((r: any) => ({
          id: r.product.id,
          name: r.product.name,
          item_type: r.product.item_type ?? 'good',
          unit_price: Number(r.list_price),
          currency: r.currency ?? 'EUR',
          unit: r.unit ?? null,
          vat_category: r.product.mydata_vat_category ?? null,
          inc_type: r.product.mydata_income_classification_type ?? null,
          inc_cat: r.product.mydata_income_classification_category ?? null,
        }));
      setItems(sell);
      if (fs?.default_vat_rate != null) setVatRate(Number(fs.default_vat_rate));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const currency = cart[0]?.currency ?? items[0]?.currency ?? 'EUR';
  const totals = useMemo(() => {
    const sum = round2(cart.reduce((s, l) => s + l.unit_price * l.qty, 0));
    if (vatInclusive) {
      const net = round2(sum / (1 + vatRate / 100));
      return { net, vat: round2(sum - net), total: sum };
    }
    const vat = round2(sum * vatRate / 100);
    return { net: sum, vat, total: round2(sum + vat) };
  }, [cart, vatRate, vatInclusive]);

  const add = (it: SellItem) => setCart((c) => {
    const ex = c.find((l) => l.id === it.id);
    return ex ? c.map((l) => l.id === it.id ? { ...l, qty: l.qty + 1 } : l) : [...c, { ...it, qty: 1 }];
  });
  const setQty = (id: string, delta: number) => setCart((c) => c.flatMap((l) => l.id === id ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l]));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  const issue = async () => {
    if (!activeWorkspaceId || cart.length === 0) return;
    setIssuing(true);
    try {
      const { data: numRows, error: numErr } = await supabase.rpc('next_document_number', {
        p_workspace_id: activeWorkspaceId, p_doc_code: '11.1', p_branch_code: parseInt(branchCode, 10) || 0,
      });
      if (numErr) throw numErr;
      const num = Array.isArray(numRows) ? numRows[0] : numRows;

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          workspace_id: activeWorkspaceId,
          internal_number: num?.formatted,
          series: num?.series ?? null,
          series_number: num?.number ?? null,
          branch_code: parseInt(branchCode, 10) || 0,
          status: 'issued',
          document_type: '11.1', // myDATA retail receipt
          // myDATA payment method: 3=cash, 7=POS/card (was defaulting to 5=on-credit).
          payment_method_code: method === 'cash' ? 3 : 7,
          currency,
          subtotal_net: totals.net,
          vat_rate: vatRate,
          vat_amount: totals.vat,
          total: totals.total,
          issued_at: new Date().toISOString(),
          has_shipping: movementDoc,
          vehicle_number: movementDoc ? (movVehicle || null) : null,
          ship_to: movementDoc ? (movShipTo || null) : null,
          move_purpose: movementDoc ? '1' : null,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // When prices include VAT, store the NET unit price so per-line myDATA VAT is correct.
      const itemsPayload = cart.map((l) => {
        const unitNet = vatInclusive ? round2(l.unit_price / (1 + vatRate / 100)) : l.unit_price;
        return {
          invoice_id: invoice.id,
          product_id: l.id,
          description: l.name,
          quantity: l.qty,
          unit_price: unitNet,
          line_total: round2(unitNet * l.qty),
          vat_category: l.vat_category,
          income_classification_type: l.inc_type,
          income_classification_category: l.inc_cat,
        };
      });
      const { error: itErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itErr) throw itErr;

      // Transmit the 11.1 to myDATA (best-effort — receipt still valid locally if offline).
      let mark: string | null = null;
      try {
        const res = await fiscalConnectorService.submitInvoice(invoice.id);
        mark = res?.fiscal?.mark ?? null;
      } catch { /* surfaced on the document page */ }

      // Record the payment (receipt is paid on issue) so it shows settled.
      try {
        await financeService.recordPayment({
          workspaceId: activeWorkspaceId, direction: 'in', amount: totals.total, currency,
          method: method === 'cash' ? 'cash' : 'card',
          allocations: [{ target_id: invoice.id, target_type: 'invoice', amount: totals.total }],
        });
      } catch { /* non-fatal */ }

      setResult({ number: num?.formatted as string, total: totals.total, currency, mark });
      setCart([]);
      setMovementDoc(false); setMovVehicle(''); setMovShipTo('');
      toast({ title: 'Receipt issued', description: mark ? `MARK ${mark}` : 'Saved (myDATA pending)' });
    } catch (err: any) {
      toast({ title: 'Failed to issue receipt', description: err?.message, variant: 'destructive' });
    } finally { setIssuing(false); }
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Point of Sale" description="Quick B2C sale → myDATA retail receipt (11.1)." badge="POS" />

      <div className="grid grid-cols-1 gap-4 p-3 sm:p-6 lg:grid-cols-[1fr_360px]">
        {/* Item picker */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products & services…" className="pl-10" />
          </div>
          {loading || wsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No priced items. Add prices to products (Materials) or services (Finance → Settings → Services).</CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((it) => (
                <button key={it.id} type="button" onClick={() => add(it)}
                  className="rounded-lg border border-border/60 bg-card p-3 text-left hover:border-primary hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                    {it.item_type === 'service' ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />} {it.item_type}
                  </div>
                  <div className="mt-1 text-sm font-medium line-clamp-2">{it.name}</div>
                  <div className="mt-1 text-sm text-primary">{formatMoney(it.unit_price, it.currency)}{it.unit ? <span className="text-muted-foreground">/{it.unit}</span> : ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4" /> Cart</div>

            {result ? (
              <div className="space-y-3 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <div className="text-sm font-medium">Receipt {result.number} issued</div>
                <div className="text-2xl font-semibold">{formatMoney(result.total, result.currency)}</div>
                {result.mark ? <Badge variant="outline" className="font-mono text-[11px]">MARK {result.mark}</Badge> : <Badge variant="outline">myDATA pending</Badge>}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                  <Button className="flex-1" onClick={() => setResult(null)}>New sale</Button>
                </div>
              </div>
            ) : cart.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Tap items to add them.</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[40vh] overflow-auto">
                  {cart.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{formatMoney(l.unit_price, l.currency)} × {l.qty}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setQty(l.id, -1)}><Minus className="h-3 w-3" /></button>
                        <span className="w-6 text-center">{l.qty}</span>
                        <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setQty(l.id, 1)}><Plus className="h-3 w-3" /></button>
                        <button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => removeLine(l.id)}><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <div className="w-16 text-right font-medium">{formatMoney(l.unit_price * l.qty, l.currency)}</div>
                    </div>
                  ))}
                </div>

                {branches.length > 1 && (
                  <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                    <span className="text-muted-foreground">Establishment</span>
                    <Select value={branchCode} onValueChange={setBranchCode}>
                      <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.branch_code)}>#{b.branch_code} {b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <label className={`flex items-center justify-between text-xs text-muted-foreground cursor-pointer${branches.length > 1 ? '' : ' border-t border-border/60 pt-2'}`}>
                  <span>Prices include VAT</span>
                  <input type="checkbox" checked={vatInclusive} onChange={(e) => setVatInclusive(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between text-xs text-muted-foreground cursor-pointer">
                  <span>Constitutes a movement document</span>
                  <input type="checkbox" checked={movementDoc} onChange={(e) => setMovementDoc(e.target.checked)} />
                </label>
                {movementDoc && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-8 text-xs" value={movVehicle} onChange={(e) => setMovVehicle(e.target.value)} placeholder="Vehicle no." />
                    <Input className="h-8 text-xs" value={movShipTo} onChange={(e) => setMovShipTo(e.target.value)} placeholder="Ship to" />
                  </div>
                )}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Net</span><span>{formatMoney(totals.net, currency)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>VAT ({vatRate}%)</span><span>{formatMoney(totals.vat, currency)}</span></div>
                  <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Payment</label>
                  <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full" onClick={issue} disabled={issuing}>
                  {issuing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue receipt · {formatMoney(totals.total, currency)}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PosPage;
