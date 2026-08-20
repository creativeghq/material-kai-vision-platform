/**
 * Cloud POS (Ταμειακή Online): a two-panel cash register (left =
 * transaction + numeric keypad, right = product/category catalog). Issues a myDATA
 * retail receipt — ΑΛΠ (11.1 Απόδειξη Λιανικής Πώλησης) or ΑΠΥ (11.2 Απόδειξη Παροχής
 * Υπηρεσιών) — records the cash/card/IRIS payment and prints. Reuses the existing
 * invoice + fiscal-submit + payment + cashier-shift (X/Z) machinery.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Trash2, Search, Printer, CheckCircle2, Wrench, Package,
  Delete, User, Wifi, CreditCard, ScanLine, X as XIcon, Plus, Minus,
  Mail, Smartphone, ShoppingBag,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { financeService, formatMoney, round2, extractNet, type BankAccountBalance } from '@/modules/finance/services/financeService';
import { vatOf } from '@/modules/finance/lib/vatMath';
import { posSessionService, type PosSession, type PosReport } from '@/modules/finance/services/posSessionService';
import { fiscalConnectorService, posTerminalService, type PosTerminal } from '@/services/fiscalConnectorService';
import { invoicingSetupService, type FinanceBranch } from '@/services/invoicingSetupService';
import { parseDecimal } from '@/utils/decimal';
import { edgeError } from '@/utils/edgeError';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { formatDate, formatTime } from '@/utils/datetime';

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

// Issuer identity printed on the thermal receipt header (from finance_settings).
interface Issuer {
  name: string; vat: string; tax_office: string; profession: string;
  address: string; street_number: string; postal_code: string; city: string; country: string;
  phone: string; email: string; gemi: string; company_type: string;
}

// Thermal printer paper width. Greek receipt rolls are 80mm or 58mm.
const PRINT_SIZES = { '80': '80mm', '58': '58mm' } as const;
type PrintSize = keyof typeof PRINT_SIZES;

// Document types selectable on the register (myDATA retail family).
// `label` (Greek) is the legal name printed on the receipt; `labelEn`/`shortEn`
// drive the English on-screen UI.
const DOC_TYPES = {
  '11.1': { code: '11.1', label: 'ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ ΠΩΛΗΣΗΣ', labelEn: 'Retail receipt', shortEn: 'Receipt' },
  '11.2': { code: '11.2', label: 'ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ', labelEn: 'Service receipt', shortEn: 'Service' },
} as const;
type DocType = keyof typeof DOC_TYPES;

type PayMethod = 'cash' | 'card' | 'iris';

/**
 * The AADE / myDATA payment-method code for a register payment.
 *
 * ONE derivation — never inline a second one at a call site. `method === 'cash' ? 3 : 7`
 * looks right and collapses IRIS to the card code, which declares **every IRIS receipt to
 * AADE as a card payment** and takes the Z-report payment-method breakdown with it.
 *
 *   3 = cash · 7 = card / e-POS · 8 = IRIS
 */
const AADE_PAYMENT_CODE: Record<PayMethod, 3 | 7 | 8> = { cash: 3, card: 7, iris: 8 };

/** The `payments.method` ledger value for a register payment — IRIS is not card. */
const LEDGER_METHOD: Record<PayMethod, 'cash' | 'card' | 'iris'> = { cash: 'cash', card: 'card', iris: 'iris' };
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
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();

  const [items, setItems] = useState<SellItem[]>([]);
  const [vatRate, setVatRate] = useState(24);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<'cash' | 'card' | 'iris'>('cash');
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  // EFT-POS terminals for the Law-5155 card/IRIS signature flow.
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [terminalId, setTerminalId] = useState<string>('');
  // Treasury accounts, so a POS sale is attributed to the cash drawer (cash) / acquirer (card).
  const [bankAccounts, setBankAccounts] = useState<BankAccountBalance[]>([]);
  const [awaiting, setAwaiting] = useState<{
    posSignatureId: string; invoiceId: string; number: string; total: number; currency: string;
    net: number; vat: number; method: 'card' | 'iris'; vatRate: number; docType: DocType; customerName: string | null;
    vatBreakdown?: { rate: number; net: number; vat: number; gross: number }[];
    lines: { name: string; qty: number; unit_price: number; line_vat: number }[];
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
    invoiceId: string;
    number: string; total: number; currency: string; mark: string | null;
    uid: string | null; qrUrl: string | null;
    net: number; vat: number; method: 'cash' | 'card' | 'iris'; issuedAt: string;
    vatBreakdown?: { rate: number; net: number; vat: number; gross: number }[];
    vatRate: number; docType: DocType; customerName: string | null;
    lines: { name: string; qty: number; unit_price: number; line_vat: number }[];
  } | null>(null);
  const [issuer, setIssuer] = useState<Issuer | null>(null);
  const [printSize, setPrintSize] = useState<PrintSize>('80');
  const [emailing, setEmailing] = useState(false);

  // ── Register UI state ─────────────────────────────────────────────────────
  const [docType, setDocType] = useState<DocType>('11.1');
  const [docTypeOpen, setDocTypeOpen] = useState(false);
  const [display, setDisplay] = useState('');         // numeric keypad entry
  const [pendingQty, setPendingQty] = useState<number | null>(null); // set by the `*` key
  const [issueOpen, setIssueOpen] = useState(false);  // payment / options confirm dialog
  const [customer, setCustomer] = useState<{ type: 'company' | 'contact'; id: string; name: string } | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<{ party_type: string; party_id: string; display_name: string }[]>([]);
  // Mobile: the register and the catalog each take the full width — switch between them.
  const [mobilePane, setMobilePane] = useState<'register' | 'catalog'>('register');

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: prices }, { data: fs }, br, banks] = await Promise.all([
        supabase
          .from('product_prices')
          .select('list_price, currency, unit, product:products(id, name, item_type, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category, mydata_income_classification_type_retail, mydata_income_classification_category_retail)')
          .eq('workspace_id', activeWorkspaceId)
          // #374 — one till button per PRODUCT. Without this the grid repeats a product once
          // per priced variant, and the operator cannot tell the buttons apart. Selling a
          // specific variant from the POS needs a picker on the button, which is its own job.
          .is('variant_key', null),
        supabase.from('finance_settings').select(
          'default_vat_rate, business_name, business_vat, business_tax_office, business_profession, business_address, business_street_number, business_postal_code, business_city, business_country, business_phone, business_email, business_gemi, business_company_type',
        ).eq('workspace_id', activeWorkspaceId).maybeSingle(),
        invoicingSetupService.listBranches(activeWorkspaceId).catch(() => [] as FinanceBranch[]),
        financeService.getBankAccountBalances(activeWorkspaceId).catch(() => [] as BankAccountBalance[]),
      ]);
      if (cancelled) return;
      setBranches(br);
      setBankAccounts(banks);
      setIssuer(fs ? {
        name: [fs.business_name, fs.business_company_type].filter(Boolean).join(' ') || (fs.business_name ?? ''),
        vat: fs.business_vat ?? '', tax_office: fs.business_tax_office ?? '', profession: fs.business_profession ?? '',
        address: fs.business_address ?? '', street_number: fs.business_street_number ?? '',
        postal_code: fs.business_postal_code ?? '', city: fs.business_city ?? '', country: fs.business_country ?? '',
        phone: fs.business_phone ?? '', email: fs.business_email ?? '', gemi: fs.business_gemi ?? '',
        company_type: fs.business_company_type ?? '',
      } : null);
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
          // The POS issues RETAIL receipts (11.x), so the retail classification wins here;
          // the wholesale pair is the fallback for products that only carry one.
          inc_type: r.product.mydata_income_classification_type_retail
            ?? r.product.mydata_income_classification_type ?? null,
          inc_cat: r.product.mydata_income_classification_category_retail
            ?? r.product.mydata_income_classification_category ?? null,
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
  /**
   * Totals, computed PER LINE at that line's own VAT rate.
   *
   * Each cart line already snapshots `line_vat` at the moment it was added, the line-item
   * table renders it, and the thermal receipt prints it per row — but nothing used it for
   * arithmetic. Every rate in the basket was taxed at whatever `vatRate` the keypad happened
   * to be showing at the end. So ringing up a 24% item and then switching to 6% printed
   * "24%" beside line 1 while the ΑΝΑΛΥΣΗ ΦΠΑ block below declared the whole sale at 6% —
   * wrong VAT remitted, on a document that contradicts itself in print.
   *
   * `byRate` also gives the receipt a real per-rate VAT analysis, which is what a mixed-rate
   * Greek retail receipt is required to show.
   */
  const totals = useMemo(() => {
    const byRate = new Map<number, { net: number; vat: number; gross: number }>();
    for (const l of cart) {
      const rate = Number.isFinite(l.line_vat) ? l.line_vat : vatRate;
      // Rounded per line, in the same order `pos_issue_receipt` rounds: unit net, then line net,
      // then VAT on that rounded net. The previous version accumulated UNROUNDED line values and
      // rounded once per rate bucket, which is a different number — a basket could preview 24.18
      // and store 24.19 off the same cart. Whatever the register shows must be what myDATA gets.
      const unitNet = round2(vatInclusive ? extractNet(l.unit_price, rate) : l.unit_price);
      const net = round2(unitNet * l.qty);
      const vat = vatOf(net, rate);
      const e = byRate.get(rate) ?? { net: 0, vat: 0, gross: 0 };
      e.net += net; e.vat += vat; e.gross += net + vat;
      byRate.set(rate, e);
    }
    const buckets = [...byRate.entries()]
      .map(([rate, v]) => ({ rate, net: round2(v.net), vat: round2(v.vat), gross: round2(v.gross) }))
      .sort((a, b) => b.rate - a.rate);
    // `invoices.vat_rate` is a single NOT NULL column, so a mixed basket has no truthful
    // value for it. The dominant rate by net is the least-wrong summary; the authoritative
    // per-rate figures live on invoice_items (net_value / vat_amount), which this page now
    // populates.
    const dominant = buckets.reduce<{ rate: number; net: number } | null>(
      (best, b) => (!best || b.net > best.net ? { rate: b.rate, net: b.net } : best), null);
    return {
      net: round2(buckets.reduce((s, b) => s + b.net, 0)),
      vat: round2(buckets.reduce((s, b) => s + b.vat, 0)),
      total: round2(buckets.reduce((s, b) => s + b.gross, 0)),
      byRate: buckets,
      dominantRate: dominant?.rate ?? vatRate,
    };
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
      await posSessionService.open(activeWorkspaceId, parseInt(branchCode, 10) || 0, parseDecimal(raw) ?? 0);
      await loadSession();
      toast({ title: 'Shift opened' });
    } catch (e: any) { toast({ title: 'Could not open shift', description: e?.message, variant: 'destructive' }); }
  };
  const cashMove = async (direction: 'in' | 'out') => {
    if (!session || !activeWorkspaceId) return;
    const raw = window.prompt(`Cash ${direction === 'in' ? 'in (pay-in)' : 'out (pay-out)'} amount?`, '0');
    if (raw === null) return;
    const amt = parseDecimal(raw) ?? NaN;  // EU-format aware ("1.234,50" → 1234.5)
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
      const z = await posSessionService.close(session.id, raw.trim() ? (parseDecimal(raw) ?? undefined) : undefined);
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
      id: `manual-${Date.now()}`, name: docType === '11.2' ? 'Service' : 'Item',
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
      // ONE round trip, ONE transaction: allocate the legal ΑΑΔΕ number, write the header, write
      // the lines. Previously these were three separate calls, so anything failing after the first
      // (RLS rejection, validation, dropped connection, closed tab) left a permanent GAP in the
      // legal series — and a failure after the second left an `issued` invoice, holding a legal
      // number, with zero items. The counter increment is a plain UPDATE, so inside the function it
      // simply rolls back with everything else.
      //
      // The header totals come back DERIVED FROM THE STORED LINES, so Σ lines = subtotal_net always
      // holds. myDATA rejects a document whose lines do not foot. (audit #271 items 4 and 6)
      const { data: issued, error: issErr } = await supabase.rpc('pos_issue_receipt', {
        p_workspace_id: activeWorkspaceId,
        p_session_id: session!.id,
        p_doc_code: docType, // 11.1 ΑΛΠ or 11.2 ΑΠΥ
        p_branch_code: parseInt(branchCode, 10) || 0,
        p_items: cart.map((l) => ({
          product_id: l.id.startsWith('manual-') ? null : l.id,
          description: l.name,
          quantity: l.qty,
          unit_price: l.unit_price,
          // The LINE's own rate, not whatever the keypad currently shows.
          vat_rate: Number.isFinite(l.line_vat) ? l.line_vat : vatRate,
          vat_category: l.vat_category,
          inc_type: l.inc_type,
          inc_cat: l.inc_cat,
        })),
        p_vat_inclusive: vatInclusive,
        p_currency: currency,
        // ONE derivation — see AADE_PAYMENT_CODE. Was `method === 'cash' ? 3 : 7`, which
        // declared every IRIS receipt to AADE as a card payment.
        p_payment_method_code: AADE_PAYMENT_CODE[method],
        p_customer_company_id: customer?.type === 'company' ? customer.id : null,
        p_customer_contact_id: customer?.type === 'contact' ? customer.id : null,
        p_has_shipping: movementDoc,
        p_vehicle_number: movementDoc ? (movVehicle || null) : null,
        p_ship_to: movementDoc ? (movShipTo || null) : null,
        p_move_purpose: movementDoc ? '1' : null,
      });
      if (issErr) throw issErr;
      const invoice = Array.isArray(issued) ? issued[0] : issued;
      if (!invoice?.invoice_id) throw new Error('Receipt was not issued');

      const snapshot = {
        invoiceId: invoice.invoice_id as string,
        // Everything printed on the customer's receipt is what the database actually stored,
        // read back from the same transaction that stored it — not a client-side recomputation
        // that could round differently.
        number: invoice.internal_number as string,
        total: Number(invoice.total), currency,
        net: Number(invoice.net), vat: Number(invoice.vat),
        vatRate, docType, customerName: customer?.name ?? null,
        // Per-rate buckets so the receipt can print a real ΑΝΑΛΥΣΗ ΦΠΑ for a mixed basket
        // instead of one row at whatever rate the keypad last showed.
        vatBreakdown: (invoice.by_rate ?? []) as { rate: number; net: number; vat: number; gross: number }[],
        lines: cart.map((l) => ({ name: l.name, qty: l.qty, unit_price: l.unit_price, line_vat: l.line_vat })),
      };

      setIssueOpen(false);

      // Law 5155 — card/IRIS on a registered terminal must be SIGNED, charged, then finalized.
      if (method !== 'cash' && selectedTerminal) {
        const res = await fiscalConnectorService.submitInvoice(snapshot.invoiceId, {
          posPayment: { terminal_id: selectedTerminal.terminal_id, pos_nsp_id: selectedTerminal.pos_nsp_id, payment_type: AADE_PAYMENT_CODE[method] },
        });
        if (res?.fiscal?.status === 'awaiting_payment') {
          const { data: sig } = await supabase
            .from('pos_signatures').select('id')
            .eq('invoice_id', snapshot.invoiceId).eq('status', 'awaiting_payment')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          setAwaiting({
            posSignatureId: (sig as any)?.id ?? '', invoiceId: snapshot.invoiceId,
            method: method as 'card' | 'iris', ...snapshot,
          });
          resetSale();
          toast({ title: 'Receipt signed — charge the terminal', description: 'Complete the card payment on the EFT-POS device, then confirm.' });
          return;
        }
        await finalizeSale(snapshot.invoiceId, snapshot, method as 'card' | 'iris', res?.fiscal?.mark ?? null);
        return;
      }

      let mark: string | null = null;
      try {
        const res = await fiscalConnectorService.submitInvoice(snapshot.invoiceId);
        mark = res?.fiscal?.mark ?? null;
      } catch { /* surfaced on the document page */ }
      await finalizeSale(snapshot.invoiceId, snapshot, method, mark);
    } catch (err: any) {
      toast({ title: 'Failed to issue receipt', description: err?.message, variant: 'destructive' });
    } finally { setIssuing(false); }
  };

  const resetSale = () => { setCart([]); setMovementDoc(false); setMovVehicle(''); setMovShipTo(''); setCustomer(null); setDisplay(''); setPendingQty(null); };

  const finalizeSale = async (
    invoiceId: string,
    snapshot: {
      number: string; total: number; currency: string; net: number; vat: number;
      vatRate: number; docType: DocType; customerName: string | null;
      vatBreakdown?: { rate: number; net: number; vat: number; gross: number }[];
      lines: { name: string; qty: number; unit_price: number; line_vat: number }[];
    },
    paidMethod: 'cash' | 'card' | 'iris',
    mark: string | null,
  ) => {
    if (!activeWorkspaceId) return;
    // Whether the two side-effects that MUST happen actually did. A receipt handed to a
    // customer while either of these silently failed is worse than a visible error, because
    // nothing downstream ever reports the gap.
    let paymentRecorded = true;
    let paymentError: string | null = null;
    let stockMoved = true;
    try {
      // Attribute the takings to the register's cash drawer (cash) / card acquirer account (card),
      // so end-of-day bank reconciliation can tie POS revenue to an account. Fall back to default.
      const wantKind = paidMethod === 'cash' ? 'cash' : 'card';
      const acct = bankAccounts.find((b) => b.is_active && b.kind === wantKind)
        ?? bankAccounts.find((b) => b.is_default)
        ?? null;
      await financeService.recordPayment({
        workspaceId: activeWorkspaceId, direction: 'in', amount: snapshot.total, currency: snapshot.currency,
        // IRIS is its own method — recording it as 'card' made the ledger disagree with the
        // fiscal document and skewed the Z-report breakdown.
        method: LEDGER_METHOD[paidMethod],
        bankAccountId: acct?.bank_account_id ?? null,
        allocations: [{ target_id: invoiceId, target_type: 'invoice', amount: snapshot.total }],
      });
    } catch (e) {
      // NOT non-fatal. This is the only place a POS sale's takings are recorded. Swallowing
      // it meant the customer walked out with a printed, myDATA-marked receipt while the
      // invoice stayed amount_due = total forever — and the cashier's Z report reconciled
      // expected cash against a `payments` row that does not exist, so the variance was
      // wrong every time and nothing said so.
      paymentRecorded = false;
      paymentError = e instanceof Error ? e.message : String(e);
      console.error('[pos] recordPayment failed', e);
    }
    // The fiscal MARK/UID/QR are persisted on the invoice by finance-issue-invoice; re-read
    // them so the printed receipt carries the authoritative values (mark arg is a fast path).
    let uid: string | null = null; let qrUrl: string | null = null; let finalMark = mark;
    try {
      const { data: inv } = await supabase.from('invoices')
        .select('fiscal_mark, fiscal_uid, fiscal_qr_url').eq('id', invoiceId).maybeSingle();
      if (inv) { finalMark = inv.fiscal_mark ?? mark; uid = inv.fiscal_uid ?? null; qrUrl = inv.fiscal_qr_url ?? null; }
    } catch { /* non-fatal — fall back to the passed mark */ }
    // Every POS sale becomes a (completed, paid, delivered) sales order — best-effort.
    // This RPC is the ONLY stock-out path a POS sale has. mark_invoice_issued cannot
    // compensate: it runs only on status='draft' invoices and this page inserts 'issued'
    // directly, and invoices.move_stock defaults false and is never set here. Swallowing a
    // failure left stock on hand high after the goods physically left the shop, which then
    // feeds reorder points, the low-stock KPI and forecast_demand.
    try {
      const { error: orderErr } = await supabase.rpc('generate_order_from_invoice', { p_invoice_id: invoiceId, p_mark_delivered: true });
      if (orderErr) throw new Error(orderErr.message);
    } catch (e) {
      stockMoved = false;
      console.error('[pos] generate_order_from_invoice failed — stock not moved', e);
    }
    setResult({ ...snapshot, invoiceId, mark: finalMark, uid, qrUrl, method: paidMethod, issuedAt: formatDate(new Date(), { withTime: true }) });
    resetSale();

    // The receipt is legally issued either way — never pretend otherwise — but say plainly
    // when a side-effect did not land, while the cashier can still act on it.
    if (!paymentRecorded || !stockMoved) {
      const missing = [
        !paymentRecorded ? 'the payment was NOT recorded — enter it manually in Finance → Payments' : null,
        !stockMoved ? 'stock was NOT reduced for these items' : null,
      ].filter(Boolean).join('; ');
      toast({
        title: 'Receipt issued — needs attention',
        description: `${finalMark ? `MARK ${finalMark}. ` : ''}${missing}.${paymentError ? ` (${paymentError})` : ''}`,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Receipt issued', description: finalMark ? `MARK ${finalMark}` : 'Saved (myDATA pending)' });
    }
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

  // ── Share by email (ΑΠΟΣΤΟΛΗ) — reuses the finance-send-invoice-email function. ──
  const sendEmail = async (to?: string) => {
    if (!result) return;
    setEmailing(true);
    try {
      const { data, error } = await supabase.functions.invoke('finance-send-invoice-email', {
        body: { invoice_id: result.invoiceId, ...(to ? { to } : {}) },
      });
      if (error) {
        if (await handleEmailSendError(error, { workspaceId: activeWorkspaceId, feature: 'invoice' })) return;
        throw await edgeError(error);
      }
      const res = data as { ok?: boolean; sent_to?: string; error?: string };
      // No customer email on file → ask for an address once and retry.
      if (!res?.ok && /no customer email/i.test(res?.error ?? '')) {
        const addr = window.prompt('Send receipt to email address:', '');
        if (addr && addr.trim()) { setEmailing(false); return sendEmail(addr.trim()); }
        toast({ title: 'No email address', variant: 'destructive' });
        return;
      }
      if (!res?.ok) throw new Error(res?.error ?? 'Email send failed');
      toast({ title: 'Receipt sent', description: res.sent_to });
    } catch (err: any) {
      toast({ title: 'Could not send', description: err?.message, variant: 'destructive' });
    } finally { setEmailing(false); }
  };

  // Keypad button
  const Key: React.FC<{ onClick: () => void; className?: string; children: React.ReactNode }> = ({ onClick, className, children }) => (
    <button type="button" onClick={onClick}
      className={`flex min-h-[3.25rem] items-center justify-center rounded-md text-xl font-medium transition-colors active:scale-[0.98] ${className ?? 'bg-neutral-700 text-white hover:bg-neutral-600'}`}>
      {children}
    </button>
  );

  const dt = DOC_TYPES[docType];

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Point of Sale" description="Online register — retail / service receipt → myDATA." badge="POS" />

      {/* cashier shift bar (open/close, cash drawer, X/Z report) */}
      <div className="px-3 sm:px-6 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-4 py-2 text-sm">
          {session ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">Shift open</span>
                <span className="text-xs text-muted-foreground">since {formatTime(session.opened_at)} · float {formatMoney(session.opening_float, currency)}</span>
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

      {/* Mobile pane switch — register and catalog each take the full width on phones. */}
      <div className="px-3 pt-3 lg:hidden">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-card p-1">
          <button type="button" onClick={() => setMobilePane('register')}
            className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${mobilePane === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            <CreditCard className="h-4 w-4" /> Register
            {cart.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{cart.length}</Badge>}
          </button>
          <button type="button" onClick={() => setMobilePane('catalog')}
            className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${mobilePane === 'catalog' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            <ShoppingBag className="h-4 w-4" /> Products
          </button>
        </div>
      </div>

      {/* ── Two-panel register ── */}
      <div className="grid grid-cols-1 gap-3 p-3 sm:p-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* LEFT — transaction + keypad (dark register) */}
        <div className={`overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-white ${mobilePane === 'register' ? '' : 'hidden'} lg:block`}>
          {/* top bar */}
          <div className="flex items-center gap-2 bg-neutral-950/60 px-3 py-2">
            <button type="button" onClick={() => setDocTypeOpen(true)}
              className="flex flex-col items-center rounded-md bg-emerald-600 px-3 py-1 text-sm font-bold leading-tight hover:bg-emerald-500">
              {dt.shortEn}
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
            {dt.labelEn}{customer ? ` · ${customer.name}` : ''}
          </div>

          {/* line-items table */}
          <div className="min-h-[180px]">
            <div className="grid grid-cols-[1fr_64px_36px_48px_72px] gap-1 bg-neutral-950 px-3 py-1.5 text-[11px] font-semibold text-neutral-300">
              <span>DESCRIPTION</span><span className="text-right">PRICE</span><span className="text-center">*</span><span className="text-right">VAT%</span><span className="text-right">TOTAL</span>
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
              {issuing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ISSUE'}
            </Key>
          </div>
        </div>

        {/* RIGHT — product / category catalog (light) */}
        <Card className={`overflow-hidden ${mobilePane === 'catalog' ? '' : 'hidden'} lg:block`}>
          <CardContent className="space-y-3 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products & services…" className="pl-10" />
            </div>
            {loading || wsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p>No products with a price for the register.</p>
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
            {/* Mobile: jump back to the register after adding items. */}
            {cart.length > 0 && (
              <button type="button" onClick={() => setMobilePane('register')}
                className="flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground lg:hidden">
                <span className="text-sm font-medium">{cart.reduce((s, l) => s + l.qty, 0)} items in register</span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">{formatMoney(totals.total, currency)} <CreditCard className="h-4 w-4" /></span>
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Doc-type modal (retail / service receipt) ── */}
      <Dialog open={docTypeOpen} onOpenChange={setDocTypeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Select Document Type</DialogTitle><DialogDescription className="sr-only">Point-of-sale action.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {(Object.keys(DOC_TYPES) as DocType[]).map((k) => (
              <button key={k} type="button" onClick={() => { setDocType(k); setDocTypeOpen(false); }}
                className={`w-full rounded-md border p-3 text-left hover:border-primary ${docType === k ? 'border-primary bg-primary/5' : 'border-border/60'}`}>
                <div className="font-semibold">{DOC_TYPES[k].labelEn}</div>
                <div className="text-xs text-muted-foreground">myDATA {k}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Customer attach modal ── */}
      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Customer (Optional)</DialogTitle><DialogDescription className="sr-only">Point-of-sale action.</DialogDescription></DialogHeader>
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
          <DialogHeader><DialogTitle>{dt.labelEn} · {formatMoney(totals.total, currency)}</DialogTitle><DialogDescription className="sr-only">Point-of-sale action.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Net</span><span>{formatMoney(totals.net, currency)}</span></div>
              {/* Label the actual rate(s) in the basket, not the keypad's current setting —
                  a mixed basket used to read "VAT (6%)" over a figure that was not 6%. */}
              <div className="flex justify-between text-muted-foreground">
                <span>VAT ({totals.byRate.length > 1 ? 'mixed' : `${totals.byRate[0]?.rate ?? vatRate}%`})</span>
                <span>{formatMoney(totals.vat, currency)}</span>
              </div>
              {totals.byRate.length > 1 && totals.byRate.map((b) => (
                <div key={b.rate} className="flex justify-between text-xs text-muted-foreground pl-3">
                  <span>· {b.rate}% on {formatMoney(b.net, currency)}</span>
                  <span>{formatMoney(b.vat, currency)}</span>
                </div>
              ))}
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
              <label htmlFor="pospage-payment" className="text-xs text-muted-foreground">Payment</label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger id="pospage-payment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="iris">IRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method !== 'cash' && terminals.length > 0 && (
              <div className="space-y-1">
                <label htmlFor="pospage-terminal-signed-payment" className="text-xs text-muted-foreground">Terminal (signed payment)</label>
                <Select value={terminalId} onValueChange={setTerminalId}>
                  <SelectTrigger id="pospage-terminal-signed-payment"><SelectValue /></SelectTrigger>
                  <SelectContent>{terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.label} · {t.terminal_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {method !== 'cash' && terminals.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No EFT-POS terminal registered — this card receipt will transmit without a terminal signature. Add one in Finance → Settings → Documents.</p>
            )}

            <label htmlFor="pospage-vat-inclusive" className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
              <span>Prices include VAT</span>
              <Checkbox id="pospage-vat-inclusive" checked={vatInclusive} onCheckedChange={(v) => setVatInclusive(v === true)} />
            </label>
            <label htmlFor="pospage-movement-doc" className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
              <span>Constitutes a movement document</span>
              <Checkbox id="pospage-movement-doc" checked={movementDoc} onCheckedChange={(v) => setMovementDoc(v === true)} />
            </label>
            {movementDoc && (
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Vehicle number" className="h-8 text-xs" value={movVehicle} onChange={(e) => setMovVehicle(e.target.value)} placeholder="Vehicle no." />
                <Input aria-label="Ship to" className="h-8 text-xs" value={movShipTo} onChange={(e) => setMovShipTo(e.target.value)} placeholder="Ship to" />
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

      {/* ── Held card/IRIS receipt (Law-5155) — charge the terminal, then finalize → MARK ── */}
      <Dialog open={!!awaiting} onOpenChange={(o) => !o && cancelAwaiting()}>
        <DialogContent className="max-h-[92vh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {awaiting?.method === 'iris' ? <Smartphone className="h-5 w-5 text-primary" /> : <CreditCard className="h-5 w-5 text-primary" />}
              {awaiting?.method === 'iris' ? 'IRIS payment' : 'Card payment'}
            </DialogTitle><DialogDescription className="sr-only">Point-of-sale action.</DialogDescription>
          </DialogHeader>
          {awaiting && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                <div className="text-xs text-muted-foreground">Receipt {awaiting.number}</div>
                <div className="text-3xl font-semibold tabular-nums">{formatMoney(awaiting.total, awaiting.currency)}</div>
              </div>
              <p className="text-xs text-muted-foreground">
                Charge the amount on the POS terminal
                {selectedTerminal ? <> (<span className="font-mono">{selectedTerminal.label}</span>)</> : null}. Once approved,
                press <strong>SETTLE POS</strong> to finalize the {awaiting.method === 'iris' ? 'IRIS' : 'card'} payment and send it to myDATA.
              </p>
              <div className="space-y-1">
                <label htmlFor="pospage-terminal-transaction-code-optional" className="text-xs text-muted-foreground">Terminal transaction code (optional)</label>
                <Input id="pospage-terminal-transaction-code-optional" className="h-9 font-mono text-xs" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="from the POS receipt" />
              </div>
              <div className="flex flex-col gap-2">
                <Button size="lg" className="h-12 w-full text-base font-semibold" onClick={chargeAndComplete} disabled={completing}>
                  {completing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5" />} SETTLE POS
                </Button>
                <Button variant="ghost" className="w-full" onClick={cancelAwaiting} disabled={completing}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Success dialog — action grid (print / email / new) ── */}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-h-[92vh] max-w-sm overflow-y-auto">
          <div className="space-y-4 py-1 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <div>
              <div className="text-sm font-medium">Document created</div>
              <div className="text-xs text-muted-foreground"># {result?.number}</div>
            </div>
            <div className="text-3xl font-semibold tabular-nums">{result ? formatMoney(result.total, result.currency) : ''}</div>
            {result?.mark
              ? <Badge variant="outline" className="font-mono text-[11px]">SENT TO myDATA · MARK {result.mark}</Badge>
              : <Badge variant="outline">myDATA pending</Badge>}

            {/* Thermal printer paper size */}
            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <Printer className="h-3.5 w-3.5" /> Paper size
              <Select value={printSize} onValueChange={(v: PrintSize) => setPrintSize(v)}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRINT_SIZES) as PrintSize[]).map((k) => (
                    <SelectItem key={k} value={k}>{PRINT_SIZES[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => window.print()}>
                <Printer className="h-5 w-5" /> <span className="text-xs">PRINT</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => sendEmail()} disabled={emailing}>
                {emailing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />} <span className="text-xs">SEND</span>
              </Button>
            </div>
            <Button className="h-12 w-full text-base font-semibold" onClick={() => setResult(null)}>NEW</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* X/Z report modal */}
      {zReport && (
        <Dialog open onOpenChange={() => setZReport(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{zReport.status === 'closed' ? `Z report #${zReport.z_number}` : 'X report (live)'}</DialogTitle><DialogDescription className="sr-only">Point-of-sale action.</DialogDescription></DialogHeader>
            <div className="space-y-1 text-sm">
              <Row label="Receipts" value={String(zReport.receipt_count)} />
              <Row label="Total sales" value={formatMoney(zReport.total_sales, currency)} />
              {Object.entries(zReport.by_payment || {}).map(([k, v]) => <Row key={k} label={`· ${k}`} value={formatMoney(v as number, currency)} muted />)}
              <div className="border-t border-border/60 my-1" />
              {(zReport.by_vat || []).map((r, i) => <Row key={i} label={`VAT ${r.rate}%`} value={`net ${formatMoney(r.net, currency)} · vat ${formatMoney(r.vat, currency)}`} muted />)}
              <div className="border-t border-border/60 my-1" />
              <Row label="Opening float" value={formatMoney(zReport.opening_float, currency)} />
              <Row label="Cash in / Out" value={`${formatMoney(zReport.cash_in, currency)} / ${formatMoney(zReport.cash_out, currency)}`} />
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

      {/* Thermal-friendly receipt — hidden on screen, the ONLY thing printed.
          Width + font follow the selected paper size (80mm / 58mm). */}
      <style>{`
        #pos-receipt { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #pos-receipt, #pos-receipt * { visibility: visible !important; }
          #pos-receipt {
            display: block !important; position: absolute; left: 0; top: 0;
            width: ${PRINT_SIZES[printSize]};
            padding: ${printSize === '58' ? '3mm 3mm' : '4mm 5mm'};
            font-family: 'Courier New', monospace;
            font-size: ${printSize === '58' ? '10px' : '12px'};
            line-height: 1.35; color: #000;
          }
          #pos-receipt .r-row { display: flex; justify-content: space-between; gap: 6px; }
          #pos-receipt .r-sep { border-top: 1px dashed #000; margin: 4px 0; }
          #pos-receipt .r-c { text-align: center; }
          #pos-receipt .r-b { font-weight: 700; }
          @page { size: ${PRINT_SIZES[printSize]} auto; margin: 0; }
        }
      `}</style>
      {result && (() => {
        const payLabel = result.method === 'cash' ? 'Μετρητά' : result.method === 'iris' ? 'IRIS' : 'Κάρτα';
        const addrLine = [
          [issuer?.address, issuer?.street_number].filter(Boolean).join(' '),
          issuer?.city, issuer?.postal_code, issuer?.country,
        ].filter(Boolean).join(' ');
        const num2 = (n: number) => Number(n ?? 0).toFixed(2);
        return (
          <div id="pos-receipt" aria-hidden="true">
            <div className="r-c r-b" style={{ fontSize: printSize === '58' ? 12 : 14 }}>{DOC_TYPES[result.docType].label}</div>
            <div className="r-c">----------</div>

            {/* Issuer */}
            {issuer && (
              <div className="r-c" style={{ marginTop: 4 }}>
                {issuer.name && <div className="r-b">{issuer.name}</div>}
                {issuer.profession && <div>{issuer.profession}</div>}
                <div>ΑΦΜ: {issuer.vat || '—'}{issuer.tax_office ? ` ΔΟΥ: ${issuer.tax_office}` : ''}</div>
                {addrLine && <div>{addrLine}</div>}
                {(issuer.phone || issuer.email) && <div>{[issuer.phone, issuer.email].filter(Boolean).join('  ')}</div>}
                {issuer.gemi && <div>Γ.Ε.ΜΗ.: {issuer.gemi}</div>}
              </div>
            )}
            <div className="r-c">---</div>

            {/* Number + date */}
            <div className="r-row"><span>Αριθμός: {result.number}</span></div>
            <div className="r-row"><span>{result.issuedAt}</span></div>

            {/* Lines */}
            <div className="r-sep" />
            <div className="r-row r-b"><span>ΠΕΡΙΓΡΑΦΗ</span><span>ΑΞΙΕΣ</span></div>
            <div className="r-sep" />
            {result.lines.map((l, i) => (
              <div className="r-row" key={i}>
                <span>{num2(l.qty)} x {l.name} {l.line_vat}%</span>
                <span>{formatMoney(l.unit_price * l.qty, result.currency)}</span>
              </div>
            ))}
            <div className="r-sep" />

            {/* Totals */}
            <div className="r-row"><span>ΚΑΘΑΡΗ ΑΞΙΑ</span><span>{formatMoney(result.net, result.currency)}</span></div>
            <div className="r-row"><span>ΣΥΝΟΛΟ ΦΠΑ</span><span>{formatMoney(result.vat, result.currency)}</span></div>
            <div className="r-row r-b"><span>ΣΥΝΟΛΙΚΗ ΑΞΙΑ</span><span>{formatMoney(result.total, result.currency)}</span></div>
            <div className="r-row"><span>Τρόπος πληρωμής</span><span>{payLabel}</span></div>

            {/* VAT analysis */}
            <div className="r-c r-b" style={{ marginTop: 6 }}>== ΑΝΑΛΥΣΗ ΦΠΑ ==</div>
            <div className="r-row" style={{ fontSize: printSize === '58' ? 9 : 11 }}>
              <span>ΚΑΘΑΡΗ €</span><span>ΦΠΑ %</span><span>ΠΟΣΟ ΦΠΑ €</span><span>ΤΕΛΙΚΗ €</span>
            </div>
            {/* One row PER RATE. A mixed-rate basket previously printed a single row at
                whatever rate the keypad last showed, contradicting the per-line VAT% printed
                above it. Falls back to the single-rate row for receipts issued before this
                change, whose snapshot has no breakdown. */}
            {(result.vatBreakdown?.length
              ? result.vatBreakdown
              : [{ rate: result.vatRate, net: result.net, vat: result.vat, gross: result.total }]
            ).map((b) => (
              <div className="r-row" key={b.rate}>
                <span>{num2(b.net)}</span><span>{num2(b.rate)}</span><span>{num2(b.vat)}</span><span>{num2(b.gross)}</span>
              </div>
            ))}
            {(result.vatBreakdown?.length ?? 0) > 1 && (
              <div className="r-row r-b">
                <span>{num2(result.net)}</span><span>ΣΥΝ.</span><span>{num2(result.vat)}</span><span>{num2(result.total)}</span>
              </div>
            )}

            <div className="r-c r-b" style={{ marginTop: 6 }}>ΕΥΧΑΡΙΣΤΟΥΜΕ</div>

            {/* myDATA provenance */}
            <div className="r-sep" />
            {result.mark
              ? <div style={{ wordBreak: 'break-all' }}>MARK: {result.mark}</div>
              : <div>ΥΠΟΒΟΛΗ ΣΤΟ myDATA: ΣΕ ΕΞΕΛΙΞΗ</div>}
            {result.uid && <div style={{ wordBreak: 'break-all' }}>UID: {result.uid}</div>}
            <div style={{ marginTop: 2 }}>ΠΑΡΟΧΟΣ ΗΛ. ΤΙΜΟΛΟΓΗΣΗΣ: NOVUS</div>

            {/* Authenticity */}
            {result.qrUrl && (
              <div className="r-c" style={{ marginTop: 6 }}>
                <div>ΕΛΕΓΧΟΣ ΑΥΘΕΝΤΙΚΟΤΗΤΑΣ:</div>
                <div style={{ wordBreak: 'break-all', marginBottom: 4 }}>{result.qrUrl}</div>
                <QRCodeSVG value={result.qrUrl} size={printSize === '58' ? 96 : 120} level="M" />
              </div>
            )}
          </div>
        );
      })()}
      {connectEmailGate}
    </div>
  );
};

export default PosPage;
