/**
 * #205 / #207 — cloud POS (Ταμειακή Online), rebuilt to mirror the Oxygen vPOS
 * register layout: a two-panel cash register (left = transaction + numeric keypad,
 * right = product/category catalog). Issues a myDATA retail receipt — ΑΛΠ (11.1
 * Απόδειξη Λιανικής Πώλησης) or ΑΠΥ (11.2 Απόδειξη Παροχής Υπηρεσιών) — records the
 * cash/card/IRIS payment and prints. Reuses the existing invoice + fiscal-submit +
 * payment + cashier-shift (X/Z) machinery; only the UI was reshaped to match Oxygen.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Loader2, Trash2, Search, Printer, CheckCircle2, Wrench, Package,
  Delete, User, Wifi, CreditCard, ScanLine, X as XIcon, Plus, Minus,
} from 'lucide-react';
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
interface CartLine extends SellItem { qty: number; line_vat: number; }

// Document types selectable on the register (myDATA retail family).
const DOC_TYPES = {
  '11.1': { code: 'ΑΛΠ', label: 'ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ ΠΩΛΗΣΗΣ' },
  '11.2': { code: 'ΑΠΥ', label: 'ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ' },
} as const;
type DocType = keyof typeof DOC_TYPES;
const VAT_RATES = [24, 13, 6, 0];

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
  const [awaiting, setAwaiting] = useState<{
    posSignatureId: string; invoiceId: string; number: string; total: number; currency: string;
    net: number; vat: number; method: 'card' | 'iris'; lines: { name: string; qty: number; unit_price: number }[];
  } | null>(null);
  const [txnId, setTxnId] = useState('');
  const [completing, setCompleting] = useState(false);
  const [branchCode, setBranchCode] = useState('0');
  const [vatInclusive, setVatInclusive] = useState(true); // retail prices usually include VAT
  const [movementDoc, setMovementDoc] = useState(false);
  const [movVehicle, setMovVehicle] = useState('');
  const [movShipTo, setMovShipTo] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [session, setSession] = useState<PosSession | null>(null);
  const [zReport, setZReport] = useState<PosReport | null>(null);
  const [result, setResult] = useState<{
    number: string; total: number; currency: string; mark: string | null;
    net: number; vat: number; method: 'cash' | 'card' | 'iris'; issuedAt: string;
    lines: { name: string; qty: number; unit_price: number }[];
  } | null>(null);

  // ── Register UI state (Oxygen-style) ──────────────────────────────────────
  const [docType, setDocType] = useState<DocType>('11.1');
  const [docTypeOpen, setDocTypeOpen] = useState(false);
  const [display, setDisplay] = useState('');         // numeric keypad entry
  const [pendingQty, setPendingQty] = useState<number | null>(null); // set by the `*` key
  const [issueOpen, setIssueOpen] = useState(false);  // payment / options confirm dialog
  const [customer, setCustomer] = useState<{ type: 'company' | 'contact'; id: string; name: string } | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<{ party_type: string; party_id: string; display_name: string }[]>([]);

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

  // ── Cart + keypad ─────────────────────────────────────────────────────────
  // Tapping a product adds it. A typed amount on the keypad overrides the price;
  // a `*` quantity prefix sets the qty. Falls back to the product's own price/1.
  const add = (it: SellItem) => {
    const override = parseFloat(display);
    const usePrice = Number.isFinite(override) && override > 0 ? round2(override) : it.unit_price;
    const qty = pendingQty ?? 1;
    setCart((c) => {
      if (!Number.isFinite(override) || override <= 0) {
        const ex = c.find((l) => l.id === it.id);
        if (ex) return c.map((l) => l.id === it.id ? { ...l, qty: l.qty + qty } : l);
      }
      return [...c, { ...it, unit_price: usePrice, qty, line_vat: vatRate }];
    });
    setDisplay(''); setPendingQty(null);
  };
  // Free-price line from the keypad (no product) — e.g. punch 12.50 and add it.
  const addManualLine = (): boolean => {
    const amt = parseFloat(display);
    if (!Number.isFinite(amt) || amt <= 0) return false;
    const qty = pendingQty ?? 1;
    setCart((c) => [...c, {
      id: `manual-${Date.now()}`, name: docType === '11.2' ? 'Υπηρεσία' : 'Είδος',
      item_type: docType === '11.2' ? 'service' : 'good', unit_price: round2(amt),
      currency, unit: null, vat_category: null, inc_type: null, inc_cat: null, qty, line_vat: vatRate,
    }]);
    setDisplay(''); setPendingQty(null);
    return true;
  };
  const setQty = (id: string, delta: number) => setCart((c) => c.flatMap((l) => l.id === id ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l]));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  const keyDigit = (d: string) => setDisplay((s) => (s === '0' ? '' : s) + d);
  const keyDot = () => setDisplay((s) => s.includes('.') ? s : (s || '0') + '.');
  const keyBack = () => setDisplay((s) => s.slice(0, -1));
  const keyClear = () => { setDisplay(''); setPendingQty(null); };
  const keyTimes = () => { const v = parseFloat(display); if (Number.isFinite(v) && v > 0) { setPendingQty(v); setDisplay(''); } };
  const cycleVat = () => setVatRate((r) => { const i = VAT_RATES.indexOf(r); return VAT_RATES[(i + 1) % VAT_RATES.length]; });

  // ── Customer attach ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!custOpen || !activeWorkspaceId) return;
    const q = custQuery.trim();
    if (q.length < 2) { setCustResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('vw_finance_parties')
        .select('party_type, party_id, display_name')
        .eq('workspace_id', activeWorkspaceId).ilike('display_name', `%${q}%`).limit(10);
      if (!cancelled) setCustResults((data as any) ?? []);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [custQuery, custOpen, activeWorkspaceId]);

  // ── Issue ─────────────────────────────────────────────────────────────────
  const openIssue = () => {
    if (!session) { toast({ title: 'Open a shift first', description: 'Start a cashier shift before issuing receipts.', variant: 'destructive' }); return; }
    // A pending keypad amount with an empty cart becomes a single quick-sale line.
    if (cart.length === 0) {
      if (!addManualLine()) { toast({ title: 'Nothing to sell', description: 'Tap a product or punch an amount first.', variant: 'destructive' }); return; }
    }
    setIssueOpen(true);
  };

  const issue = async () => {
    if (!activeWorkspaceId || cart.length === 0) return;
    setIssuing(true);
    try {
      const { data: numRows, error: numErr } = await supabase.rpc('next_document_number', {
        p_workspace_id: activeWorkspaceId, p_doc_code: docType, p_branch_code: parseInt(branchCode, 10) || 0,
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
          pos_session_id: session!.id,
          document_type: docType, // 11.1 ΑΛΠ or 11.2 ΑΠΥ
          customer_company_id: customer?.type === 'company' ? customer.id : null,
          customer_contact_id: customer?.type === 'contact' ? customer.id : null,
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

      const itemsPayload = cart.map((l) => {
        const unitNet = vatInclusive ? round2(extractNet(l.unit_price, vatRate)) : l.unit_price;
        return {
          invoice_id: invoice.id,
          product_id: l.id.startsWith('manual-') ? null : l.id,
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

      setIssueOpen(false);

      // #185 Law 5155 — card/IRIS on a registered terminal must be SIGNED, charged, then finalized.
      if (method !== 'cash' && selectedTerminal) {
        const res = await fiscalConnectorService.submitInvoice(invoice.id, {
          posPayment: { terminal_id: selectedTerminal.terminal_id, pos_nsp_id: selectedTerminal.pos_nsp_id, payment_type: method === 'iris' ? 8 : 7 },
        });
        if (res?.fiscal?.status === 'awaiting_payment') {
          const { data: sig } = await supabase
            .from('pos_signatures').select('id')
            .eq('invoice_id', invoice.id).eq('status', 'awaiting_payment')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          setAwaiting({
            posSignatureId: (sig as any)?.id ?? '', invoiceId: invoice.id,
            method: method as 'card' | 'iris', ...snapshot,
          });
          resetSale();
          toast({ title: 'Receipt signed — charge the terminal', description: 'Complete the card payment on the EFT-POS device, then confirm.' });
          return;
        }
        await finalizeSale(invoice.id, snapshot, method as 'card' | 'iris', res?.fiscal?.mark ?? null);
        return;
      }

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

  const resetSale = () => { setCart([]); setMovementDoc(false); setMovVehicle(''); setMovShipTo(''); setCustomer(null); setDisplay(''); setPendingQty(null); };

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
    resetSale();
    toast({ title: 'Receipt issued', description: mark ? `MARK ${mark}` : 'Saved (myDATA pending)' });
  };

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

  // Keypad button
  const Key: React.FC<{ onClick: () => void; className?: string; children: React.ReactNode }> = ({ onClick, className, children }) => (
    <button type="button" onClick={onClick}
      className={`flex items-center justify-center rounded-md text-xl font-medium transition-colors active:scale-[0.98] ${className ?? 'bg-neutral-700 text-white hover:bg-neutral-600'}`}>
      {children}
    </button>
  );

  const dt = DOC_TYPES[docType];

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Point of Sale" description="Ταμειακή Online — ΑΛΠ / ΑΠΥ retail receipt → myDATA." badge="POS" />

      {/* cashier shift bar (open/close, cash drawer, X/Z report) */}
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

      {/* ── Two-panel register ── */}
      <div className="grid grid-cols-1 gap-3 p-3 sm:p-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* LEFT — transaction + keypad (dark, like Oxygen) */}
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-white">
          {/* top bar */}
          <div className="flex items-center gap-2 bg-neutral-950/60 px-3 py-2">
            <button type="button" onClick={() => setDocTypeOpen(true)}
              className="flex flex-col items-center rounded-md bg-emerald-600 px-3 py-1 text-sm font-bold leading-tight hover:bg-emerald-500">
              {dt.code}
            </button>
            <div className="flex items-center gap-2 text-neutral-400">
              <CreditCard className={`h-4 w-4 ${selectedTerminal ? 'text-emerald-400' : ''}`} />
              <Wifi className="h-4 w-4 text-emerald-400" />
              <ScanLine className="h-4 w-4" />
            </div>
            <div className="ml-auto rounded bg-neutral-700 px-3 py-1 text-right text-lg font-semibold tabular-nums">
              {formatMoney(totals.total, currency)}
            </div>
          </div>
          <div className="bg-neutral-800 px-3 py-1 text-center text-[11px] font-semibold tracking-wide text-neutral-300">
            {dt.label}{customer ? ` · ${customer.name}` : ''}
          </div>

          {/* line-items table */}
          <div className="min-h-[180px]">
            <div className="grid grid-cols-[1fr_64px_36px_48px_72px] gap-1 bg-neutral-950 px-3 py-1.5 text-[11px] font-semibold text-neutral-300">
              <span>ΠΕΡΙΓΡΑΦΗ</span><span className="text-right">ΤΙΜΗ</span><span className="text-center">*</span><span className="text-right">ΦΠΑ%</span><span className="text-right">ΣΥΝΟΛΟ</span>
            </div>
            <div className="max-h-[34vh] divide-y divide-neutral-800 overflow-auto bg-white text-neutral-900">
              {cart.length === 0 ? (
                <div className="px-3 py-10 text-center text-xs text-neutral-400">—</div>
              ) : cart.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_64px_36px_48px_72px] items-center gap-1 px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-1 truncate">
                    <button type="button" onClick={() => removeLine(l.id)} className="text-neutral-400 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    <span className="truncate">{l.name}</span>
                  </div>
                  <span className="text-right tabular-nums">{formatMoney(l.unit_price, l.currency)}</span>
                  <span className="flex items-center justify-center gap-0.5">
                    <button type="button" onClick={() => setQty(l.id, -1)} className="text-neutral-400 hover:text-neutral-900"><Minus className="h-3 w-3" /></button>
                    {l.qty}
                    <button type="button" onClick={() => setQty(l.id, 1)} className="text-neutral-400 hover:text-neutral-900"><Plus className="h-3 w-3" /></button>
                  </span>
                  <span className="text-right tabular-nums">{l.line_vat}%</span>
                  <span className="text-right font-medium tabular-nums">{formatMoney(l.unit_price * l.qty, l.currency)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* keypad */}
          <div className="grid grid-cols-[1fr_1fr_1fr_84px] gap-1.5 bg-neutral-900 p-2">
            {/* amount display spans first 3 cols */}
            <div className="col-span-3 flex items-center justify-end rounded-md bg-neutral-950 px-4 py-3 text-2xl font-semibold tabular-nums">
              {pendingQty ? <span className="mr-2 text-sm text-neutral-400">{pendingQty} ×</span> : null}
              {display || '0.00'}
            </div>
            <Key onClick={keyBack} className="bg-red-500/90 text-white hover:bg-red-500"><Delete className="h-5 w-5" /></Key>

            <Key onClick={() => keyDigit('7')}>7</Key>
            <Key onClick={() => keyDigit('8')}>8</Key>
            <Key onClick={() => keyDigit('9')}>9</Key>
            <Key onClick={() => setCustOpen(true)} className="bg-neutral-700 text-white hover:bg-neutral-600"><User className="h-5 w-5" /></Key>

            <Key onClick={() => keyDigit('4')}>4</Key>
            <Key onClick={() => keyDigit('5')}>5</Key>
            <Key onClick={() => keyDigit('6')}>6</Key>
            <Key onClick={keyTimes} className="bg-neutral-700 text-white hover:bg-neutral-600">*</Key>

            <Key onClick={() => keyDigit('1')}>1</Key>
            <Key onClick={() => keyDigit('2')}>2</Key>
            <Key onClick={() => keyDigit('3')}>3</Key>
            <Key onClick={cycleVat} className="bg-sky-600 text-white hover:bg-sky-500 text-base font-semibold">{vatRate.toFixed(2)} %</Key>

            <Key onClick={() => keyDigit('0')}>0</Key>
            <Key onClick={keyDot}>.</Key>
            <Key onClick={keyClear} className="bg-neutral-700 text-white hover:bg-neutral-600">x</Key>
            <Key onClick={openIssue} className="bg-emerald-600 text-white hover:bg-emerald-500 text-base font-bold">
              {issuing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ΕΚΔΟΣΗ'}
            </Key>
          </div>
        </div>

        {/* RIGHT — product / category catalog (light) */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-3 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Αναζήτηση προϊόντων & υπηρεσιών…" className="pl-10" />
            </div>
            {loading || wsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p>Δεν υπάρχουν προϊόντα με τιμή στην ταμειακή.</p>
                <p className="mt-1 text-xs">Add prices to products (Materials) or services (Finance → Settings → Services). You can still punch a free amount on the keypad.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((it) => (
                  <button key={it.id} type="button" onClick={() => add(it)}
                    className="flex flex-col rounded-lg border border-border/60 bg-card p-3 text-left transition-colors hover:border-primary hover:bg-muted/40">
                    <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                      {it.item_type === 'service' ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />} {it.item_type}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium">{it.name}</div>
                    <div className="mt-auto pt-1 text-sm text-primary">{formatMoney(it.unit_price, it.currency)}{it.unit ? <span className="text-muted-foreground">/{it.unit}</span> : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Doc-type modal (ΑΛΠ / ΑΠΥ) ── */}
      <Dialog open={docTypeOpen} onOpenChange={setDocTypeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Επιλέξτε Τύπο Παραστατικού</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(Object.keys(DOC_TYPES) as DocType[]).map((k) => (
              <button key={k} type="button" onClick={() => { setDocType(k); setDocTypeOpen(false); }}
                className={`w-full rounded-md border p-3 text-left hover:border-primary ${docType === k ? 'border-primary bg-primary/5' : 'border-border/60'}`}>
                <div className="font-semibold">{DOC_TYPES[k].code}</div>
                <div className="text-xs text-muted-foreground">{DOC_TYPES[k].label}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Customer attach modal ── */}
      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Πελάτης (προαιρετικά)</DialogTitle></DialogHeader>
          {customer && (
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
              <span>{customer.name}</span>
              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setCustomer(null)}><XIcon className="h-4 w-4" /></button>
            </div>
          )}
          <Input autoFocus value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="Search customer name…" />
          <div className="max-h-64 divide-y divide-border/40 overflow-auto">
            {custResults.map((r) => (
              <button key={`${r.party_type}-${r.party_id}`} type="button"
                onClick={() => { setCustomer({ type: r.party_type as any, id: r.party_id, name: r.display_name }); setCustOpen(false); setCustQuery(''); }}
                className="block w-full px-2 py-2 text-left text-sm hover:bg-muted/40">{r.display_name}</button>
            ))}
            {custQuery.trim().length >= 2 && custResults.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No matches.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Issue (payment + options) dialog ── */}
      <Dialog open={issueOpen} onOpenChange={(o) => !o && setIssueOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dt.code} · {formatMoney(totals.total, currency)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Net</span><span>{formatMoney(totals.net, currency)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>VAT ({vatRate}%)</span><span>{formatMoney(totals.vat, currency)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
            </div>

            {branches.length > 1 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Establishment</span>
                <Select value={branchCode} onValueChange={setBranchCode}>
                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.branch_code)}>#{b.branch_code} {b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

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

            {method !== 'cash' && terminals.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Terminal (signed payment)</label>
                <Select value={terminalId} onValueChange={setTerminalId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.label} · {t.terminal_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {method !== 'cash' && terminals.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No EFT-POS terminal registered — this card receipt will transmit without a terminal signature. Add one in Finance → Settings → Documents.</p>
            )}

            <label className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
              <span>Prices include VAT</span>
              <input type="checkbox" checked={vatInclusive} onChange={(e) => setVatInclusive(e.target.checked)} />
            </label>
            <label className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
              <span>Constitutes a movement document</span>
              <input type="checkbox" checked={movementDoc} onChange={(e) => setMovementDoc(e.target.checked)} />
            </label>
            {movementDoc && (
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-8 text-xs" value={movVehicle} onChange={(e) => setMovVehicle(e.target.value)} placeholder="Vehicle no." />
                <Input className="h-8 text-xs" value={movShipTo} onChange={(e) => setMovShipTo(e.target.value)} placeholder="Ship to" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)} disabled={issuing}>Cancel</Button>
            <Button onClick={issue} disabled={issuing}>
              {issuing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue · {formatMoney(totals.total, currency)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Held card/IRIS receipt (Law-5155 terminal charge) ── */}
      <Dialog open={!!awaiting} onOpenChange={(o) => !o && cancelAwaiting()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt {awaiting?.number} signed</DialogTitle></DialogHeader>
          {awaiting && (
            <div className="space-y-3">
              <div className="text-2xl font-semibold">{formatMoney(awaiting.total, awaiting.currency)}</div>
              <p className="text-xs text-muted-foreground">
                Charge {formatMoney(awaiting.total, awaiting.currency)} on the EFT-POS terminal
                {selectedTerminal ? <> (<span className="font-mono">{selectedTerminal.label}</span>)</> : null}. When it approves,
                confirm below to transmit the {awaiting.method === 'iris' ? 'IRIS' : 'card'} receipt to myDATA.
              </p>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Terminal transaction ID (optional)</label>
                <Input className="h-8 text-xs font-mono" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="from the terminal receipt" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelAwaiting} disabled={completing}>Cancel</Button>
            <Button onClick={chargeAndComplete} disabled={completing}>
              {completing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Charge cleared — finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Success dialog ── */}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-sm">
          <div className="space-y-3 py-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <div className="text-sm font-medium">Receipt {result?.number} issued</div>
            <div className="text-2xl font-semibold">{result ? formatMoney(result.total, result.currency) : ''}</div>
            {result?.mark ? <Badge variant="outline" className="font-mono text-[11px]">MARK {result.mark}</Badge> : <Badge variant="outline">myDATA pending</Badge>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
              <Button className="flex-1" onClick={() => setResult(null)}>New sale</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Thermal-friendly receipt — hidden on screen, the ONLY thing printed. */}
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
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{DOC_TYPES[docType].code} / RECEIPT</div>
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
    </div>
  );
};

export default PosPage;
