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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { financeService, formatMoney, round2, extractNet } from '@/modules/finance/services/financeService';
import { posSessionService, type PosSession, type PosReport } from '@/modules/finance/services/posSessionService';
import { fiscalConnectorService, posTerminalService, type PosTerminal } from '@/services/fiscalConnectorService';
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

// Compact label/value row for the X/Z report.
const Row: React.FC<{ label: string; value: string; muted?: boolean; danger?: boolean }> = ({ label, value, muted, danger }) => (
  <div className={`flex justify-between ${muted ? 'text-xs text-muted-foreground' : ''}`}>
    <span>{label}</span>
    <span className={danger ? 'text-destructive font-medium' : muted ? '' : 'font-medium'}>{value}</span>
  </div>
);

const PosPage: React.FC = () => {
  const { toast } = useToast();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();

  const [items, setItems] = useState<SellItem[]>([]);
  const [vatRate, setVatRate] = useState(24);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<'cash' | 'card' | 'iris'>('cash');
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  // #185 EFT-POS terminals for the Law-5155 card/IRIS signature flow.
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [terminalId, setTerminalId] = useState<string>('');
  // A held card/IRIS receipt awaiting the physical terminal charge (then CompletionPosInvoices).
  const [awaiting, setAwaiting] = useState<{
    posSignatureId: string; invoiceId: string; number: string; total: number; currency: string;
    net: number; vat: number; method: 'card' | 'iris'; lines: { name: string; qty: number; unit_price: number }[];
  } | null>(null);
  const [txnId, setTxnId] = useState('');
  const [completing, setCompleting] = useState(false);
  const [branchCode, setBranchCode] = useState('0');
  const [vatInclusive, setVatInclusive] = useState(true); // retail prices usually include VAT
  // The receipt also constitutes a movement/delivery document.
  const [movementDoc, setMovementDoc] = useState(false);
  const [movVehicle, setMovVehicle] = useState('');
  const [movShipTo, setMovShipTo] = useState('');
  const [issuing, setIssuing] = useState(false);
  // #207 cloud vPOS — the open cashier shift; receipts are blocked until one is open.
  const [session, setSession] = useState<PosSession | null>(null);
  const [zReport, setZReport] = useState<PosReport | null>(null);
  const [result, setResult] = useState<{
    number: string; total: number; currency: string; mark: string | null;
    net: number; vat: number; method: 'cash' | 'card' | 'iris'; issuedAt: string;
    lines: { name: string; qty: number; unit_price: number }[];
  } | null>(null);

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
      const net = round2(extractNet(sum, vatRate));
      return { net, vat: round2(sum - net), total: sum };
    }
    const vat = round2(sum * vatRate / 100);
    return { net: sum, vat, total: round2(sum + vat) };
  }, [cart, vatRate, vatInclusive]);

  // ── Cloud vPOS shift ──────────────────────────────────────────────────────
  const loadSession = async () => {
    if (!activeWorkspaceId) return;
    try { setSession(await posSessionService.getOpen(activeWorkspaceId, parseInt(branchCode, 10) || 0)); }
    catch { /* non-fatal */ }
  };
  useEffect(() => { void loadSession(); /* eslint-disable-next-line */ }, [activeWorkspaceId, branchCode]);

  // #185 load the registered EFT-POS terminals for this branch (card/IRIS signature flow).
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await posTerminalService.listActive(activeWorkspaceId, parseInt(branchCode, 10) || 0);
        if (cancelled) return;
        setTerminals(t);
        setTerminalId((cur) => (t.some((x) => x.id === cur) ? cur : (t[0]?.id ?? '')));
      } catch { /* non-fatal — falls back to direct transmit */ }
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId, branchCode]);

  const selectedTerminal = useMemo(() => terminals.find((t) => t.id === terminalId) ?? null, [terminals, terminalId]);

  const openShift = async () => {
    if (!activeWorkspaceId) return;
    const raw = window.prompt('Opening cash float?', '0');
    if (raw === null) return;
    try {
      await posSessionService.open(activeWorkspaceId, parseInt(branchCode, 10) || 0, parseFloat(raw) || 0);
      await loadSession();
      toast({ title: 'Shift opened' });
    } catch (e: any) { toast({ title: 'Could not open shift', description: e?.message, variant: 'destructive' }); }
  };
  const cashMove = async (direction: 'in' | 'out') => {
    if (!session || !activeWorkspaceId) return;
    const raw = window.prompt(`Cash ${direction === 'in' ? 'in (pay-in)' : 'out (pay-out)'} amount?`, '0');
    if (raw === null) return;
    const amt = parseFloat(raw);
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Invalid amount', variant: 'destructive' }); return; }
    const reason = window.prompt('Reason (optional)?', '') || undefined;
    try { await posSessionService.recordCash(session.id, activeWorkspaceId, direction, amt, reason); toast({ title: 'Recorded' }); }
    catch (e: any) { toast({ title: 'Failed', description: e?.message, variant: 'destructive' }); }
  };
  const showX = async () => {
    if (!session) return;
    try { setZReport(await posSessionService.report(session.id)); }
    catch (e: any) { toast({ title: 'Failed', description: e?.message, variant: 'destructive' }); }
  };
  const closeShift = async () => {
    if (!session) return;
    const raw = window.prompt('Counted cash in drawer at close?', '');
    if (raw === null) return;
    try {
      const z = await posSessionService.close(session.id, raw.trim() ? parseFloat(raw) : undefined);
      setZReport(z);
      await loadSession();
      toast({ title: `Z report #${z.z_number} — shift closed` });
    } catch (e: any) { toast({ title: 'Could not close shift', description: e?.message, variant: 'destructive' }); }
  };

  const add = (it: SellItem) => setCart((c) => {
    const ex = c.find((l) => l.id === it.id);
    return ex ? c.map((l) => l.id === it.id ? { ...l, qty: l.qty + 1 } : l) : [...c, { ...it, qty: 1 }];
  });
  const setQty = (id: string, delta: number) => setCart((c) => c.flatMap((l) => l.id === id ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l]));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  const issue = async () => {
    if (!activeWorkspaceId || cart.length === 0) return;
    if (!session) { toast({ title: 'Open a shift first', description: 'Start a cashier shift before issuing receipts.', variant: 'destructive' }); return; }
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
          pos_session_id: session.id, // link the receipt to the open shift (Z report)
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
        const unitNet = vatInclusive ? round2(extractNet(l.unit_price, vatRate)) : l.unit_price;
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

      const snapshot = {
        number: num?.formatted as string, total: totals.total, currency,
        net: totals.net, vat: totals.vat,
        lines: cart.map((l) => ({ name: l.name, qty: l.qty, unit_price: l.unit_price })),
      };

      // #185 Law 5155 — a card/IRIS receipt on a registered terminal must be SIGNED, the
      // terminal charged, then finalized to AADE. Hold here with the provider signature.
      if (method !== 'cash' && selectedTerminal) {
        const res = await fiscalConnectorService.submitInvoice(invoice.id, {
          posPayment: { terminal_id: selectedTerminal.terminal_id, pos_nsp_id: selectedTerminal.pos_nsp_id, payment_type: method === 'iris' ? 8 : 7 },
        });
        if (res?.fiscal?.status === 'awaiting_payment') {
          // The pos_signatures row was created server-side; look it up to drive the charge step.
          const { data: sig } = await supabase
            .from('pos_signatures').select('id')
            .eq('invoice_id', invoice.id).eq('status', 'awaiting_payment')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          setAwaiting({
            posSignatureId: (sig as any)?.id ?? '', invoiceId: invoice.id,
            method: method as 'card' | 'iris', ...snapshot,
          });
          setCart([]); setMovementDoc(false); setMovVehicle(''); setMovShipTo('');
          toast({ title: 'Receipt signed — charge the terminal', description: 'Complete the card payment on the EFT-POS device, then confirm.' });
          return;
        }
        // Connector didn't hold (e.g. no signature returned) — fall through to settle directly.
        await finalizeSale(invoice.id, snapshot, method as 'card' | 'iris', res?.fiscal?.mark ?? null);
        return;
      }

      // Cash (or card without a registered terminal): transmit straight to myDATA + settle.
      let mark: string | null = null;
      try {
        const res = await fiscalConnectorService.submitInvoice(invoice.id);
        mark = res?.fiscal?.mark ?? null;
      } catch { /* surfaced on the document page */ }
      await finalizeSale(invoice.id, snapshot, method, mark);
    } catch (err: any) {
      toast({ title: 'Failed to issue receipt', description: err?.message, variant: 'destructive' });
    } finally { setIssuing(false); }
  };

  // Record the payment (receipt is paid on issue) + show the success/receipt state.
  const finalizeSale = async (
    invoiceId: string,
    snapshot: { number: string; total: number; currency: string; net: number; vat: number; lines: { name: string; qty: number; unit_price: number }[] },
    paidMethod: 'cash' | 'card' | 'iris',
    mark: string | null,
  ) => {
    if (!activeWorkspaceId) return;
    try {
      await financeService.recordPayment({
        workspaceId: activeWorkspaceId, direction: 'in', amount: snapshot.total, currency: snapshot.currency,
        method: paidMethod === 'cash' ? 'cash' : 'card',
        allocations: [{ target_id: invoiceId, target_type: 'invoice', amount: snapshot.total }],
      });
    } catch { /* non-fatal */ }
    setResult({ ...snapshot, mark, method: paidMethod, issuedAt: new Date().toLocaleString() });
    setCart([]);
    setMovementDoc(false); setMovVehicle(''); setMovShipTo('');
    toast({ title: 'Receipt issued', description: mark ? `MARK ${mark}` : 'Saved (myDATA pending)' });
  };

  // #185 — the terminal charge cleared; finalize the held receipt → CompletionPosInvoices → AADE.
  const chargeAndComplete = async () => {
    if (!awaiting) return;
    setCompleting(true);
    try {
      const res = await fiscalConnectorService.completePos({
        pos_signature_id: awaiting.posSignatureId || undefined,
        invoice_id: awaiting.invoiceId,
        transaction_id: txnId.trim() || `manual-${Date.now()}`,
        payment_amount: awaiting.total,
      });
      if (!res?.ok) throw new Error(res?.error ?? 'POS completion failed');
      const mark = res?.fiscal?.mark ?? null;
      await finalizeSale(awaiting.invoiceId, awaiting, awaiting.method, mark);
      setAwaiting(null); setTxnId('');
    } catch (err: any) {
      toast({ title: 'Could not finalize receipt', description: err?.message, variant: 'destructive' });
    } finally { setCompleting(false); }
  };

  const cancelAwaiting = () => { setAwaiting(null); setTxnId(''); };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Point of Sale" description="Quick B2C sale → myDATA retail receipt (11.1)." badge="POS" />

      {/* #207 cloud vPOS — cashier shift bar (open/close, cash drawer, X/Z report) */}
      <div className="px-3 sm:px-6 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-4 py-2 text-sm">
          {session ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">Shift open</span>
                <span className="text-xs text-muted-foreground">since {new Date(session.opened_at).toLocaleTimeString()} · float {formatMoney(session.opening_float, currency)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => cashMove('in')}>Cash in</Button>
                <Button size="sm" variant="ghost" onClick={() => cashMove('out')}>Cash out</Button>
                <Button size="sm" variant="outline" onClick={showX}>X report</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={closeShift}>Close (Z)</Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">No open shift — receipts are blocked until a shift is opened.</span>
              <Button size="sm" onClick={openShift}>Open shift</Button>
            </>
          )}
        </div>
      </div>

      {/* X/Z report modal */}
      {zReport && (
        <Dialog open onOpenChange={() => setZReport(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{zReport.status === 'closed' ? `Z report #${zReport.z_number}` : 'X report (live)'}</DialogTitle></DialogHeader>
            <div className="space-y-1 text-sm">
              <Row label="Receipts" value={String(zReport.receipt_count)} />
              <Row label="Total sales" value={formatMoney(zReport.total_sales, currency)} />
              {Object.entries(zReport.by_payment || {}).map(([k, v]) => <Row key={k} label={`· ${k}`} value={formatMoney(v as number, currency)} muted />)}
              <div className="border-t border-border/60 my-1" />
              {(zReport.by_vat || []).map((r, i) => <Row key={i} label={`VAT ${r.rate}%`} value={`net ${formatMoney(r.net, currency)} · vat ${formatMoney(r.vat, currency)}`} muted />)}
              <div className="border-t border-border/60 my-1" />
              <Row label="Opening float" value={formatMoney(zReport.opening_float, currency)} />
              <Row label="Cash in / out" value={`${formatMoney(zReport.cash_in, currency)} / ${formatMoney(zReport.cash_out, currency)}`} />
              <Row label="Expected cash" value={formatMoney(zReport.expected_cash, currency)} />
              {zReport.counted_cash != null && <Row label="Counted cash" value={formatMoney(zReport.counted_cash, currency)} />}
              {zReport.cash_variance != null && <Row label="Variance" value={formatMoney(zReport.cash_variance, currency)} danger={zReport.cash_variance !== 0} />}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => window.print()}>Print</Button>
              <Button onClick={() => setZReport(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Thermal-friendly receipt — hidden on screen, the ONLY thing printed (the Print
          button calls window.print(); the @media print rules below blank everything else). */}
      <style>{`
        #pos-receipt { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #pos-receipt, #pos-receipt * { visibility: visible !important; }
          #pos-receipt { display: block !important; position: absolute; left: 0; top: 0; width: 80mm; padding: 6mm 4mm; font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>
      {result && (
        <div id="pos-receipt" aria-hidden="true">
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>ΑΠΟΔΕΙΞΗ / RECEIPT</div>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>No. {result.number}</div>
          <div>{result.issuedAt}</div>
          <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
            {result.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{l.qty} × {l.name}</span>
                <span>{formatMoney(l.unit_price * l.qty, result.currency)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Net</span><span>{formatMoney(result.net, result.currency)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT</span><span>{formatMoney(result.vat, result.currency)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}><span>TOTAL</span><span>{formatMoney(result.total, result.currency)}</span></div>
          <div style={{ marginTop: 4 }}>Paid: {result.method === 'cash' ? 'Cash' : result.method === 'iris' ? 'IRIS' : 'Card'}</div>
          {result.mark && <div style={{ marginTop: 6, wordBreak: 'break-all' }}>MARK: {result.mark}</div>}
          <div style={{ textAlign: 'center', marginTop: 8 }}>Thank you!</div>
        </div>
      )}

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

            {awaiting ? (
              // #185 held card/IRIS receipt — the terminal charge happens on the physical device;
              // confirm it (capturing the bank transaction id) to finalize the receipt to AADE.
              <div className="space-y-3 py-2">
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <div className="font-medium">Receipt {awaiting.number} signed</div>
                  <div className="mt-1 text-2xl font-semibold">{formatMoney(awaiting.total, awaiting.currency)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Charge {formatMoney(awaiting.total, awaiting.currency)} on the EFT-POS terminal
                    {selectedTerminal ? <> (<span className="font-mono">{selectedTerminal.label}</span>)</> : null}. When it approves,
                    confirm below to transmit the {awaiting.method === 'iris' ? 'IRIS' : 'card'} receipt to myDATA.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Terminal transaction ID (optional)</label>
                  <Input className="h-8 text-xs font-mono" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="from the terminal receipt" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={cancelAwaiting} disabled={completing}>Cancel</Button>
                  <Button className="flex-1" onClick={chargeAndComplete} disabled={completing}>
                    {completing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Charge cleared — finalize
                  </Button>
                </div>
              </div>
            ) : result ? (
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
                      <SelectItem value="iris">IRIS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* #185 EFT-POS terminal picker — only for card/IRIS, only if terminals are registered. */}
                {method !== 'cash' && terminals.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Terminal (signed payment)</label>
                    <Select value={terminalId} onValueChange={setTerminalId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.label} · {t.terminal_id}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {method !== 'cash' && terminals.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No EFT-POS terminal registered — this card receipt will transmit without a terminal signature. Add one in Finance → Settings → Documents.</p>
                )}

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
