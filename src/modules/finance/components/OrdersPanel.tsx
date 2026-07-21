import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, ShoppingCart, Trash2, Search, Truck, Banknote, FileText, Receipt, PackageCheck, ChevronDown, MoreHorizontal, CheckCircle2, Pencil, Package, FileClock, Building2, ArrowDownLeft, ArrowUpRight, Send, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, financeService, VAT_CATEGORIES, paymentMethodLabel } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { parseDecimal } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import { edgeErrorMessage } from '@/utils/edgeError';
import { flowEventService } from '@/services/flows/flowEventService';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { MoneyInput } from '@/components/core/ui/money-input';
import { TablePagination, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL,
  type OrderType, type OrderStatus, type OrderListRow, type OrderItem, type Order,
  type ThreeWayMatch, type ThreeWayMatchStatus,
} from '@/modules/finance/services/ordersService';

const STATUS_TONE: Record<OrderStatus, string> = {
  draft: 'secondary', confirmed: 'outline', partially_fulfilled: 'outline', fulfilled: 'default', cancelled: 'destructive',
};

type Party = { type: 'company' | 'contact'; id: string; name: string; vat?: string | null; sub?: string | null };
const pctOf = (code: string) => VAT_CATEGORIES.find((v) => v.code === code)?.pct ?? 0;
const DEFAULT_VAT_CODE = '1'; // 24%
const vatCodeOf = (pct?: number | null) => VAT_CATEGORIES.find((v) => v.pct === (pct ?? 0))?.code ?? DEFAULT_VAT_CODE;

// Units of measure for a line (sqm, item, …). Stored as a code on the line + carried to the invoice.
const UNIT_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'item', label: 'item' }, { code: 'm2', label: 'm²' }, { code: 'm', label: 'm' },
  { code: 'kg', label: 'kg' }, { code: 'lt', label: 'lt' }, { code: 'hour', label: 'hour' },
  { code: 'set', label: 'set' }, { code: 'box', label: 'box' }, { code: 'pallet', label: 'pallet' },
];
const DEFAULT_UNIT = 'item';

/** Orders list + create — mounted as the first Finance → Documents tab. */
export const OrdersPanel: React.FC<{
  workspaceId: string; companyId?: string; contactId?: string; projectId?: string;
  /** The embedded party's role, when mounted inside a CRM contact/company page. Gates which
      order kinds the New-order menu offers (customer → sell, supplier → buy). Omit on the
      global Finance list / project tab — there's no single party, so both kinds stay. */
  partyRoles?: { customer: boolean; supplier: boolean };
}> = ({ workspaceId, companyId, contactId, projectId, partyRoles }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<OrderListRow[]>([]);
  // Total MATCHING rows as counted by the server — the list itself only ever holds one page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeF, setTypeF] = useState<'all' | OrderType>('all');
  const [statusF, setStatusF] = useState<'all' | OrderStatus>('all');
  // `search` is what the user is typing; `searchQ` is the debounced value the query actually runs
  // on, so a fast typist doesn't fire a round trip per keystroke.
  const [search, setSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  // What the New-order dropdown chose: sales/purchase + whether it's a draft (pre-order).
  const [createPreset, setCreatePreset] = useState<{ orderType: OrderType; draft: boolean }>({ orderType: 'sales', draft: false });
  const [openId, setOpenId] = useState<string | null>(null);
  // Finance categories — for classifying an order (income for sales, expense for purchase). Loaded
  // once here and passed to the create + detail dialogs so an order carries a category like invoices do.
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  // Inside a CRM party (company/contact) the list is already scoped — hide the filter cluster.
  const embedded = !!(companyId || contactId);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!workspaceId) return;
    void financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
  }, [workspaceId]);

  const openCreate = (orderType: OrderType, draft: boolean) => { setCreatePreset({ orderType, draft }); setCreateOpen(true); };

  // #251 App Launcher deep-link: /finance?tab=orders&new=order opens the New (sales) order flow.
  // Only in the standalone finance list — never when embedded in a project/party tab.
  useEffect(() => {
    if (embedded) return;
    if (searchParams.get('new') === 'order') {
      setCreatePreset({ orderType: 'sales', draft: false });
      setCreateOpen(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [embedded, searchParams, setSearchParams]);

  // Role-aware New-order menu. No role context (global Finance list / project tab) or an
  // unclassified party → offer both kinds, unchanged. A customer-only party can't be a
  // supplier we buy from, so Purchase is hidden — and vice versa.
  const roleUnset = !partyRoles || (!partyRoles.customer && !partyRoles.supplier);
  const showSales = roleUnset || !!partyRoles?.customer;
  const showPurchase = roleUnset || !!partyRoles?.supplier;

  // Everything — filters, free text, paging AND the party-name join — runs in SQL, so the browser
  // only ever holds one page and the filters always cover the WHOLE workspace, not a capped slice.
  const load = async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const res = await ordersService.search({
        workspaceId, companyId, contactId, projectId,
        orderType: typeF === 'all' ? undefined : typeF,
        status: statusF === 'all' ? undefined : statusF,
        search: searchQ || undefined,
        limit: TABLE_PAGE_SIZE,
        offset: (page - 1) * TABLE_PAGE_SIZE,
      });
      // A delete / refresh can shrink the set past the current page. Land on the new last page
      // instead of stranding the user on an empty one; the page change re-runs this load.
      const clamped = clampPage(page, res.count);
      if (clamped !== page) { setPage(clamped); return; }
      setRows(res.rows);
      setTotal(res.count);
    } catch (err: any) {
      toast({ title: 'Failed to load orders', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, companyId, contactId, projectId, typeF, statusF, searchQ, page]);

  // Debounce the search box. Page 1 is set in the SAME tick as the new term so the query never
  // fires once for the stale page and again for page 1.
  useEffect(() => {
    const t = setTimeout(() => { setSearchQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // A different party/project scope is a different result set — start it at the first page.
  useEffect(() => { setPage(1); }, [companyId, contactId, projectId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Orders</h3>
          <p className="text-xs text-muted-foreground">Sales &amp; purchase orders. Invoices, payments, dispatch and profit all hang off an order.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          {/* Filters only matter on the global Finance list. Inside a single party the list is
              short and already scoped — the dropdowns are just noise there. */}
          {!embedded && (
            <>
              <div className="space-y-1">
                <Label className="block text-[10px] text-muted-foreground">Type</Label>
                <Select value={typeF} onValueChange={(v: any) => { setTypeF(v); setPage(1); }}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="block text-[10px] text-muted-foreground">Status</Label>
                <Select value={statusF} onValueChange={(v: any) => { setStatusF(v); setPage(1); }}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="block text-[10px] text-muted-foreground">Search</Label>
                <Input placeholder="Party or number" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
              </div>
            </>
          )}
          {/* One entry point, one dropdown — the order kind is an explicit choice in the menu
              (a "pre-order" is just a sales order saved as a draft). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New order <ChevronDown className="h-4 w-4 ml-1" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {showSales && (
                <DropdownMenuItem onClick={() => openCreate('sales', false)}>
                  <ShoppingCart className="h-3.5 w-3.5 mr-2" /> Sales order
                </DropdownMenuItem>
              )}
              {showPurchase && (
                <DropdownMenuItem onClick={() => openCreate('purchase', false)}>
                  <Package className="h-3.5 w-3.5 mr-2" /> Purchase order
                </DropdownMenuItem>
              )}
              {/* Pre-order is a sales draft — only offered where selling is offered. */}
              {showSales && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => openCreate('sales', true)}>
                    <FileClock className="h-3.5 w-3.5 mr-2" /> Pre-order <span className="ml-1 text-[10px] text-muted-foreground">(draft)</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {searchQ
                ? `No orders match “${searchQ}”.`
                : 'No orders yet. An accepted quote creates one automatically, or add one above.'}
            </div>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Order</th>
                  <th className="px-4 py-2 text-left">Party</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Payment</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td className="px-4 py-2 font-mono text-xs">{r.order_number ?? r.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">{r.party_name ?? '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] capitalize">{r.order_type}</Badge>
                        {r.order_type === 'purchase' && r.three_way_match_status && (r.three_way_match_status === 'variance' || r.three_way_match_status === 'awaiting_bill') && (
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium ${MATCH_META[r.three_way_match_status].cls}`} title="3-way match status">
                            {MATCH_META[r.three_way_match_status].label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2"><Badge variant={STATUS_TONE[r.status] as any} className="text-[10px]">{ORDER_STATUS_LABEL[r.status]}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{ORDER_PAYMENT_LABEL[r.payment_status]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(r.total), r.currency)}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination page={page} total={total} onPageChange={setPage} label="orders" />
            </>
          )}
        </CardContent>
      </Card>

      <NewOrderModal
        workspaceId={workspaceId}
        lockedCompanyId={companyId}
        lockedContactId={contactId}
        preset={createPreset}
        categories={categories}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); void load(); }}
      />
      <OrderDetailDialog orderId={openId} categories={categories} open={openId !== null} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
};

// ---------------------------------------------------------------------------

type Line = { product_id?: string | null; description: string; quantity: number; unit_price: number; unit_cost: number | null; unit_code: string; vat_code: string; available?: number | null; supplier_company_id?: string | null };
const blankLine = (): Line => ({ description: '', quantity: 1, unit_price: 0, unit_cost: null, unit_code: DEFAULT_UNIT, vat_code: DEFAULT_VAT_CODE, available: null, supplier_company_id: null });


const NewOrderModal: React.FC<{
  workspaceId: string;
  /** When the modal is opened from inside a CRM party, that party is pre-selected and locked. */
  lockedCompanyId?: string;
  lockedContactId?: string;
  /** Chosen from the New-order dropdown: sell vs buy + draft (pre-order) vs confirmed. */
  preset: { orderType: OrderType; draft: boolean };
  categories: FinanceCategory[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}> = ({ workspaceId, lockedCompanyId, lockedContactId, preset, categories, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const orderType = preset.orderType;
  const [party, setParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [partyOpts, setPartyOpts] = useState<Party[]>([]);
  const [items, setItems] = useState<Line[]>([blankLine()]);
  // Per-line product lookup — the Description field IS a catalog search.
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [lineProdOpts, setLineProdOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectOpts, setProjectOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [currency, setCurrency] = useState('EUR');
  const [categoryId, setCategoryId] = useState('none');
  const [expectedDate, setExpectedDate] = useState('');
  // Order note from whoever places the order (e.g. delivery/pickup instructions). Prints on the
  // invoice + payment receipt and is visible on the order in the backend.
  const [notes, setNotes] = useState('');
  // Order-level discount off the net — a % or a flat cash amount (applied proportionally so VAT stays exact).
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');

  const isSales = orderType === 'sales';
  // Sales orders are income, purchase orders are expense — offer the matching category kinds.
  const catOptions = categories.filter((c) => c.kind === (isSales ? 'income' : 'expense') || c.kind === 'both');

  useEffect(() => {
    if (!open) return;
    setParty(null); setPartySearch(''); setPartyOpts([]); setActiveLine(null); setLineProdOpts([]);
    setProject(null); setProjectSearch(''); setProjectOpts([]); setCurrency('EUR');
    setCategoryId('none'); setExpectedDate('');
    setDiscountType('percent'); setDiscountValue('');
    setItems([blankLine()]);
    // Opened from inside a CRM party → that party IS the order's party (customer for a sales
    // order, supplier for a purchase order). Pre-select + lock it so the user isn't re-searching.
    if (lockedCompanyId) {
      void supabase.from('crm_companies').select('id, name, vat_number, email').eq('id', lockedCompanyId).maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setParty({ type: 'company', id: data.id, name: data.name, vat: data.vat_number,
            sub: [data.vat_number ? `VAT ${data.vat_number}` : null, data.email, 'Company'].filter(Boolean).join(' · ') });
        });
    } else if (lockedContactId) {
      void supabase.from('crm_contacts').select('id, name, vat_number, email').eq('id', lockedContactId).maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setParty({ type: 'contact', id: data.id, name: data.name, vat: data.vat_number,
            sub: [data.vat_number ? `VAT ${data.vat_number}` : null, data.email, 'Contact'].filter(Boolean).join(' · ') });
        });
    }
  }, [open, lockedCompanyId, lockedContactId]);

  // Project search (optional link — workspace-scoped).
  useEffect(() => {
    if (!open) return;
    const term = projectSearch.trim();
    if (term.length < 2) { setProjectOpts([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('workspace_id', workspaceId).ilike('name', `%${term}%`).limit(8);
      setProjectOpts((data ?? []) as Array<{ id: string; name: string }>);
    }, 200);
    return () => clearTimeout(t);
  }, [projectSearch, open, workspaceId]);

  // CRM party search — by name, VAT, or email (companies + contacts).
  useEffect(() => {
    if (!open) return;
    const term = partySearch.trim();
    if (term.length < 2) { setPartyOpts([]); return; }
    const like = `%${term}%`;
    const t = setTimeout(async () => {
      const [c, p] = await Promise.all([
        supabase.from('crm_companies').select('id, name, vat_number, email')
          .or(`name.ilike.${like},vat_number.ilike.${like},email.ilike.${like}`).limit(8),
        supabase.from('crm_contacts').select('id, name, vat_number, email')
          .or(`name.ilike.${like},vat_number.ilike.${like},email.ilike.${like}`).limit(8),
      ]);
      const opts: Party[] = [];
      for (const r of (c.data ?? []) as any[]) opts.push({ type: 'company', id: r.id, name: r.name, vat: r.vat_number, sub: [r.vat_number ? `VAT ${r.vat_number}` : null, r.email, 'Company'].filter(Boolean).join(' · ') });
      for (const r of (p.data ?? []) as any[]) opts.push({ type: 'contact', id: r.id, name: r.name, vat: r.vat_number, sub: [r.vat_number ? `VAT ${r.vat_number}` : null, r.email, 'Contact'].filter(Boolean).join(' · ') });
      setPartyOpts(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [partySearch, open]);

  // Per-line product lookup — typing in a line's Description searches the catalog.
  useEffect(() => {
    if (!open || activeLine === null) return;
    const term = (items[activeLine]?.description ?? '').trim();
    if (term.length < 2) { setLineProdOpts([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name').ilike('name', `%${term}%`).limit(8);
      setLineProdOpts((data ?? []) as Array<{ id: string; name: string }>);
    }, 200);
    return () => clearTimeout(t);
  }, [activeLine, items, open]);

  const setItem = (i: number, patch: Partial<Line>) => setItems((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setItems((ls) => [...ls, blankLine()]);
  const removeLine = (i: number) => setItems((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);
  const pickProduct = async (i: number, p: { id: string; name: string }) => {
    setItem(i, { product_id: p.id, description: p.name });
    setActiveLine(null); setLineProdOpts([]);
    // Customer-aware pricing: the resolver applies this customer's level/discount off retail
    // (sales) → unit price + cost + unit; purchase → cost as both. So the order reflects the
    // catalog and the customer's deal out of the box. All still editable.
    try {
      const pr = await ordersService.resolveLinePricing({
        workspaceId, productId: p.id, orderType,
        companyId: party?.type === 'company' ? party.id : null,
        contactId: party?.type === 'contact' ? party.id : null,
      });
      setItems((ls) => ls.map((l, idx) => {
        if (idx !== i) return l;
        const next: Line = { ...l, available: pr.available, supplier_company_id: pr.supplier_company_id };
        if (pr.unit_cost != null) next.unit_cost = pr.unit_cost;
        if (pr.measurement_unit_code) next.unit_code = pr.measurement_unit_code;
        if (pr.unit_price != null && (!l.unit_price || l.unit_price === 0)) next.unit_price = pr.unit_price;
        return next;
      }));
    } catch { /* pricing is best-effort — line still works with manual cost/price */ }
  };

  const calc = items.map((l) => {
    const net = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
    const vat = net * pctOf(l.vat_code) / 100;
    return { net, vat, gross: net + vat };
  });
  const rawNet = calc.reduce((a, c) => a + c.net, 0);
  // Order-level discount → an effective % applied uniformly to every line (a flat amount becomes an
  // equivalent %), so it allocates proportionally and VAT stays exact. Mirrors computeOrderLines().
  const dv = discountType && isSales ? (parseDecimal(discountValue) ?? 0) : 0;
  const effDiscountPct = dv <= 0 ? 0
    : discountType === 'percent' ? Math.min(100, Math.max(0, dv))
    : (rawNet > 0 ? Math.min(100, Math.max(0, (dv / rawNet) * 100)) : 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const discCalc = items.map((l) => {
    const net = r2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 - effDiscountPct / 100));
    return { net, vat: r2(net * pctOf(l.vat_code) / 100) };
  });
  const netTotal = r2(discCalc.reduce((a, c) => a + c.net, 0));
  const vatTotal = r2(discCalc.reduce((a, c) => a + c.vat, 0));
  const grossTotal = r2(netTotal + vatTotal);
  const discountAmount = r2(r2(rawNet) - netTotal);
  // Margin = revenue − cost across lines that carry a cost. null when no line has cost yet. The
  // discount reduces revenue, so it reduces margin by the same net amount.
  const anyCost = items.some((l) => l.unit_cost != null);
  const marginTotal = anyCost
    ? items.reduce((a, l) => a + ((Number(l.unit_price) || 0) - (Number(l.unit_cost) || 0)) * (Number(l.quantity) || 0), 0) - discountAmount
    : null;

  // status: 'draft' = pre-order (not yet committed); 'confirmed' = a live order.
  const save = async (status: OrderStatus) => {
    if (!party) { toast({ title: isSales ? 'Pick a customer' : 'Pick a supplier', variant: 'destructive' }); return; }
    const clean = items.filter((it) => it.description.trim() && (Number(it.quantity) || 0) > 0);
    if (clean.length === 0) { toast({ title: 'Add at least one product', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      // A contact who belongs to a business is attributed to the BUSINESS (same as quotes/invoices).
      let coId: string | null = party.type === 'company' ? party.id : null;
      let ctId: string | null = party.type === 'contact' ? party.id : null;
      if (ctId) {
        const rolled = await financeService.resolvePrimaryCompanyId(ctId).catch(() => null);
        if (rolled) { coId = rolled; ctId = null; }
      }
      await ordersService.create({
        workspaceId,
        orderType,
        status,
        currency,
        projectId: project?.id ?? null,
        categoryId: categoryId === 'none' ? null : categoryId,
        expectedPaymentDate: expectedDate || null,
        discountType: isSales && dv > 0 ? discountType : null,
        discountValue: isSales && dv > 0 ? dv : 0,
        notes: notes.trim() || null,
        customerCompanyId: isSales ? coId : null,
        customerContactId: isSales ? ctId : null,
        supplierCompanyId: !isSales ? coId : null,
        supplierContactId: !isSales ? ctId : null,
        items: clean.map((it) => ({
          product_id: it.product_id ?? null,
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          // Purchase: what we pay the supplier IS our cost.
          unit_cost: isSales ? it.unit_cost : (Number(it.unit_price) || 0),
          supplier_company_id: it.supplier_company_id ?? null,
          measurement_unit_code: it.unit_code,
          vat_percent: pctOf(it.vat_code),
          vat_category: parseInt(it.vat_code, 10) || undefined,
        })),
      });
      toast({ title: status === 'draft' ? 'Pre-order saved' : 'Order created' });
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{preset.draft ? 'New pre-order' : isSales ? 'New sales order' : 'New purchase order'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{isSales ? 'Customer *' : 'Supplier *'}</Label>
            {party ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{party.name}{party.sub ? <span className="text-xs text-muted-foreground"> · {party.sub}</span> : null}</span>
                {/* Locked to this party when created from inside its page — no re-search needed. */}
                {!lockedCompanyId && !lockedContactId && <Button size="sm" variant="ghost" onClick={() => setParty(null)}>Change</Button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-7" placeholder={`Search ${isSales ? 'customers' : 'suppliers'} by name, VAT or email…`} value={partySearch} onChange={(e) => setPartySearch(e.target.value)} />
                {partyOpts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                    {partyOpts.map((o) => (
                      <button key={`${o.type}:${o.id}`} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setParty(o); setPartySearch(''); setPartyOpts([]); }}>
                        <div>{o.name}</div>
                        {o.sub && <div className="text-[10px] text-muted-foreground">{o.sub}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Project (optional)</Label>
              {project ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <span className="text-sm">{project.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => setProject(null)}>Change</Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-7" placeholder="Link a project…" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} />
                  {projectOpts.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                      {projectOpts.map((o) => (
                        <button key={o.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setProject(o); setProjectSearch(''); setProjectOpts([]); }}>{o.name}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

          {/* Classify + set when we expect to be paid — so the order shows a category and can AGE in
              Receivables/Payables even before it's invoiced (both carry onto the invoice/bill). */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {catOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expected payment date</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              {/* A pre-order stays out of Receivables/Payables until a deposit is recorded, so the
                  expected date won't age until then — flag it so the operator isn't surprised. */}
              {preset.draft && expectedDate && (
                <p className="text-[11px] text-amber-600">Pre-orders age in Receivables only after a deposit is recorded.</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> New Product</Button>
            </div>
            <div className="rounded-md border border-border/60 overflow-x-auto">
              {/* Sales shows a separate Cost column (for margin); a purchase order's price IS the cost. */}
              <div className={`grid ${isSales ? 'grid-cols-[1fr_52px_62px_82px_82px_88px_84px_24px]' : 'grid-cols-[1fr_52px_62px_82px_88px_84px_24px]'} gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground min-w-[640px]`}>
                <span>Product</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">{isSales ? 'Unit price' : 'Cost/unit'}</span>{isSales && <span className="text-right">Cost/unit</span>}<span className="text-right">VAT</span><span className="text-right">Line total</span><span />
              </div>
              {items.map((l, i) => {
                // #3 — selling a stocked catalog line for more than we have on hand.
                const short = isSales && l.product_id && l.available != null && Number(l.quantity) > l.available;
                return (
                <React.Fragment key={i}>
                <div className={`grid ${isSales ? 'grid-cols-[1fr_52px_62px_82px_82px_88px_84px_24px]' : 'grid-cols-[1fr_52px_62px_82px_88px_84px_24px]'} items-center gap-2 border-t border-border/40 px-2 py-1.5 min-w-[640px]`}>
                  <div className="relative">
                    <Input className="h-8 text-sm" value={l.description}
                      onChange={(e) => { setItem(i, { description: e.target.value, product_id: null }); setActiveLine(i); }}
                      onFocus={() => setActiveLine(i)}
                      placeholder="Search a product or type a new one…" />
                    {activeLine === i && lineProdOpts.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                        {lineProdOpts.map((p) => (
                          <button key={p.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => pickProduct(i, p)}>{p.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <MoneyInput className="h-8 text-right text-sm px-1" displayDecimals={null} value={l.quantity} onValueChange={(v) => setItem(i, { quantity: v ?? 0 })} />
                  <Select value={l.unit_code} onValueChange={(v) => setItem(i, { unit_code: v })}>
                    <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {/* Sales: unit price. Purchase: this IS the cost (mirror into unit_cost on save). */}
                  <MoneyInput className="h-8 text-right text-sm px-1" value={l.unit_price} onValueChange={(v) => setItem(i, { unit_price: v ?? 0 })} />
                  {isSales && (
                    <MoneyInput className="h-8 text-right text-sm px-1" placeholder="—" value={l.unit_cost} onValueChange={(v) => setItem(i, { unit_cost: v })} title="What this costs us — auto-filled from the catalog, editable" />
                  )}
                  <Select value={l.vat_code} onValueChange={(v) => setItem(i, { vat_code: v })}>
                    <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-right text-sm tabular-nums">{formatMoney(calc[i]?.gross ?? 0)}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {short && (
                  <div className="px-2 pb-1.5 -mt-0.5 text-[11px] text-amber-600 flex items-center gap-1 min-w-[640px]">
                    <PackageCheck className="h-3 w-3" /> Only {l.available} in stock — ordering {Number(l.quantity)}. You can still proceed (back-order); a purchase order restocks it.
                  </div>
                )}
                </React.Fragment>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{isSales ? 'Pick a catalog product to auto-fill the customer’s price, cost & unit (this customer’s discount is applied). Editable.' : 'A purchase order’s unit price is what we pay the supplier (= our cost). Pick a catalog product to auto-fill it.'} Catalog lines link to the warehouse — delivery moves stock.</p>
          </div>

          <div className="space-y-1">
            <Label>Order note (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isSales ? 'e.g. Customer will pick up today — call on arrival.' : 'e.g. Deliver to the back entrance before noon.'}
            />
            <p className="text-[11px] text-muted-foreground">Prints on the invoice and the payment receipt, and stays visible on the order here.</p>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Order-level discount off the net (sales only): a % or a flat cash amount. */}
            {isSales ? (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Discount (optional)</Label>
                <div className="flex items-center gap-1.5">
                  <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                    <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">{currency}</SelectItem>
                    </SelectContent>
                  </Select>
                  <MoneyInput className="h-8 w-28 text-right text-sm px-2" placeholder="0" value={discountValue === '' ? null : (parseDecimal(discountValue) ?? null)} onValueChange={(v) => setDiscountValue(v == null ? '' : String(v))} />
                  {effDiscountPct > 0 && (
                    <span className="text-[11px] text-muted-foreground">≈ {effDiscountPct.toFixed(effDiscountPct < 10 ? 1 : 0)}% off</span>
                  )}
                </div>
              </div>
            ) : <div />}
            <div className="flex flex-col items-end gap-0.5 text-sm">
              {discountAmount > 0 && (
                <div className="flex justify-between gap-8 w-56"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-emerald-600">−{formatMoney(discountAmount)}</span></div>
              )}
              <div className="flex justify-between gap-8 w-56"><span className="text-muted-foreground">Net</span><span className="tabular-nums">{formatMoney(netTotal)}</span></div>
              <div className="flex justify-between gap-8 w-56"><span className="text-muted-foreground">VAT</span><span className="tabular-nums">{formatMoney(vatTotal)}</span></div>
              <div className="flex justify-between gap-8 w-56 font-semibold border-t border-border/60 pt-0.5"><span>Total</span><span className="tabular-nums">{formatMoney(grossTotal)}</span></div>
              {marginTotal != null && <div className="flex justify-between gap-8 w-56"><span className="text-muted-foreground">Margin</span><span className={`tabular-nums ${marginTotal >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(marginTotal)}</span></div>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {/* The kind was chosen in the New-order dropdown: draft → pre-order, else a live order. */}
          <Button onClick={() => save(preset.draft ? 'draft' : 'confirmed')} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {preset.draft ? 'Save pre-order' : 'Create order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

// 3-way match verdict → badge label + tone. Shared by the PO list row and detail panel.
const MATCH_META: Record<ThreeWayMatchStatus, { label: string; cls: string }> = {
  no_lines:         { label: 'No lines',         cls: 'text-muted-foreground border-border' },
  awaiting_receipt: { label: 'Awaiting receipt', cls: 'text-sky-600 border-sky-500/40' },
  awaiting_bill:    { label: 'Awaiting bill',    cls: 'text-amber-600 border-amber-500/40' },
  matched:          { label: 'Matched',          cls: 'text-emerald-600 border-emerald-500/40' },
  variance:         { label: 'Variance',         cls: 'text-destructive border-destructive/40' },
};

const OrderDetailDialog: React.FC<{ orderId: string | null; categories: FinanceCategory[]; open: boolean; onClose: () => void; onChanged: () => void }> = ({ orderId, categories, open, onClose, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [fin, setFin] = useState<Awaited<ReturnType<typeof ordersService.getOrderFinance>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  // When set, the pay panel is editing an existing payment (update) rather than recording a new one.
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState('');
  // The order only deals in REAL cash: money in (a payment received) or money out (a payment sent).
  const [payDir, setPayDir] = useState<'in' | 'out'>('in');
  // Optional: issue the order's receipt/invoice in the same step as recording money in.
  const [payIssueDoc, setPayIssueDoc] = useState(false);
  // Money in carries a reason; money out is attached to a supplier (so it registers what we pay them).
  const [payReason, setPayReason] = useState('');
  const [paySupplier, setPaySupplier] = useState<{ id: string; name: string } | null>(null);
  const [paySupplierSearch, setPaySupplierSearch] = useState('');
  const [paySupplierOpts, setPaySupplierOpts] = useState<Array<{ id: string; name: string }>>([]);
  // Which cash/bank account the money lands in (or leaves from) + how it moved. Without an account
  // the payment floats unattached and never shows up in the /finance bank balances.
  const [bankAccounts, setBankAccounts] = useState<Awaited<ReturnType<typeof financeService.listBankAccounts>>>([]);
  const [payAccountId, setPayAccountId] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Line[]>([]);
  // Catalog list prices for the order's products → summarised as a discount total below.
  const [listPrices, setListPrices] = useState<Map<string, number>>(new Map());
  // Per-LINE supplier (who supplies this line / who we owe) → settable inline on any line.
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());
  const [supplierPick, setSupplierPick] = useState<{ itemId: string; productId: string | null; label: string; currentId: string | null } | null>(null);
  // What we owe each supplier on this order (line cost grouped by supplier − money already paid out).
  const [supExposure, setSupExposure] = useState<Awaited<ReturnType<typeof ordersService.getOrderSupplierExposure>>>([]);
  // Audit trail of payment edits/deletes on this order (finance-manager-readable only).
  const [payAudit, setPayAudit] = useState<Awaited<ReturnType<typeof ordersService.listOrderPaymentAudit>>>([]);
  const [showPayAudit, setShowPayAudit] = useState(false);
  // Purchase-order 3-way match (PO × goods received × supplier bill).
  const [match, setMatch] = useState<ThreeWayMatch | null>(null);
  // Customer's on-account credit that could settle this sales order without new cash (#credit-apply).
  const [applicableCredit, setApplicableCredit] = useState(0);

  const load = async (id: string) => {
    try {
      setLoading(true);
      const res = await ordersService.get(id);
      const productIds = res.items.map((it) => it.product_id).filter(Boolean) as string[];
      const supplierIds = res.items.map((it) => it.supplier_company_id).filter(Boolean) as string[];
      const [finance, lp, names, exposure, accounts, audit] = await Promise.all([
        ordersService.getOrderFinance(id),
        ordersService.getListPrices(productIds).catch(() => new Map<string, number>()),
        ordersService.getCompanyNames(supplierIds).catch(() => new Map<string, string>()),
        ordersService.getOrderSupplierExposure(id).catch(() => []),
        financeService.listBankAccounts(res.order.workspace_id).catch(() => []),
        ordersService.listOrderPaymentAudit(id).catch(() => []),
      ]);
      setOrder(res.order); setItems(res.items); setFin(finance); setListPrices(lp); setSupplierNames(names); setSupExposure(exposure);
      setBankAccounts(accounts); setPayAudit(audit);
      setMatch(res.order.order_type === 'purchase'
        ? await ordersService.getThreeWayMatch(id).catch(() => null)
        : null);
      // How much on-account credit could be applied to this sales order (drives the "apply credit" banner).
      setApplicableCredit(res.order.order_type === 'sales'
        ? await ordersService.getApplicableCredit(id, res.order.workspace_id).catch(() => 0)
        : 0);
    } catch (err: any) {
      toast({ title: 'Failed to load order', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!orderId) { setOrder(null); setItems([]); setFin(null); setPayOpen(false); setListPrices(new Map()); setSupplierNames(new Map()); setSupplierPick(null); setSupExposure([]); setMatch(null); setApplicableCredit(0); return; }
    void load(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const changeStatus = async (status: OrderStatus) => {
    if (!order) return;
    setSaving(true);
    try {
      await ordersService.setStatus(order.id, status);
      setOrder({ ...order, status });
      onChanged();
      toast({ title: `Marked ${ORDER_STATUS_LABEL[status]}` });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Set the order's finance category / expected payment date / note (classify + let it age pre-invoice).
  const saveMeta = async (patch: { categoryId?: string | null; expectedPaymentDate?: string | null; notes?: string | null }) => {
    if (!order) return;
    setSaving(true);
    try {
      await ordersService.updateMeta(order.id, patch);
      setOrder({
        ...order,
        ...('categoryId' in patch ? { category_id: patch.categoryId ?? null } : {}),
        ...('expectedPaymentDate' in patch ? { expected_payment_date: patch.expectedPaymentDate ?? null } : {}),
        ...('notes' in patch ? { notes: patch.notes ?? null } : {}),
      });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Failed to update order', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Set a line's delivered quantity; the order's fulfilment status auto-advances
  // (none → confirmed, some → partially delivered, all → completed).
  const setLineDelivered = async (itemId: string, qty: number) => {
    if (!order) return;
    setSaving(true);
    try {
      await ordersService.setDelivery(order.id, [{ itemId, quantityDelivered: qty }]);
      await load(order.id); onChanged();
    } catch (err: any) {
      toast({ title: 'Failed to update delivery', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // #6/#7 — set the supplier on an order line (who we owe for it).
  const setLineSupplier = async (itemId: string, productId: string | null, supplierCompanyId: string | null) => {
    setSaving(true);
    try {
      await ordersService.setOrderItemSupplier(itemId, supplierCompanyId, productId);
      setSupplierPick(null);
      if (order) await load(order.id);
    } catch (err: any) {
      toast({ title: 'Failed to set supplier', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Record real cash ON the order: money in (a payment received) or money out (a payment sent).
  // The payment trigger recomputes payment_status; getOrderFinance refreshes Received/Paid/Profit.
  // Default to the workspace's default account (or the first), so the money lands somewhere real.
  const defaultAccountId = () => (bankAccounts.find((a) => a.is_default) ?? bankAccounts[0])?.id ?? '';
  // The payment method follows the account: a Cash account moved cash, a Card account a card, a
  // Bank/online account a transfer (by default). So the operator picks WHERE the money lands and
  // the HOW is inferred — the method picker only surfaces for accounts where it's genuinely
  // ambiguous (bank/online/other can be transfer vs cheque vs card).
  const METHOD_FOR_KIND: Record<string, string> = { cash: 'cash', card: 'card', bank: 'bank_transfer', online: 'bank_transfer', other: 'other' };
  const accountKind = (id: string): string => bankAccounts.find((a) => a.id === id)?.kind ?? '';
  const methodForAccount = (id: string): string => METHOD_FOR_KIND[accountKind(id)] ?? 'cash';
  const openPay = (dir: 'in' | 'out') => {
    if (!order) return;
    setEditingPaymentId(null);
    setPayDir(dir);
    setPayIssueDoc(false);
    setPayReason(''); setPaySupplier(null); setPaySupplierSearch(''); setPaySupplierOpts([]);
    setPayAccountId(defaultAccountId()); setPayMethod(methodForAccount(defaultAccountId()));
    // Money out: no prefill — the operator types what they're actually paying (which supplier +
    // how much is their call, not the whole order balance). Money in: prefill the remaining
    // receivable (rounded to cents so no float dust), a sensible "customer pays the balance" default.
    setPayAmt(dir === 'out' ? '' : String(Math.max(0, Math.round((Number(order.total) - (fin?.received ?? 0)) * 100) / 100)));
    setPayOpen(true);
  };

  // Pay a specific supplier straight from the "what we owe" rollup — money out, pre-filled.
  const openPaySupplier = (sup: { id: string; name: string }, owed: number) => {
    setEditingPaymentId(null);
    setPayDir('out'); setPayIssueDoc(false); setPayReason('');
    setPaySupplier(sup); setPaySupplierSearch(''); setPaySupplierOpts([]);
    setPayAccountId(defaultAccountId()); setPayMethod(methodForAccount(defaultAccountId()));
    setPayAmt(String(Math.max(0, owed)));
    setPayOpen(true);
  };

  // No account yet → create a "Cash" account on the fly so the user is never blocked.
  const createCashAccount = async () => {
    if (!order) return;
    setCreatingAccount(true);
    try {
      const acct = await financeService.createBankAccount({ workspaceId: order.workspace_id, name: 'Cash', kind: 'cash', currency: order.currency });
      setBankAccounts((prev) => [...prev, acct]);
      setPayAccountId(acct.id); setPayMethod('cash');
    } catch (err: any) {
      toast({ title: 'Could not create account', description: err?.message, variant: 'destructive' });
    } finally { setCreatingAccount(false); }
  };

  // Supplier search for money-out (CRM companies flagged supplier).
  useEffect(() => {
    if (!payOpen || payDir !== 'out' || paySupplier) { return; }
    const t = paySupplierSearch.trim();
    if (t.length < 2) { setPaySupplierOpts([]); return; }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('crm_companies').select('id, name').eq('is_supplier', true).ilike('name', `%${t}%`).limit(8);
      setPaySupplierOpts((data ?? []) as Array<{ id: string; name: string }>);
    }, 200);
    return () => clearTimeout(h);
  }, [paySupplierSearch, payOpen, payDir, paySupplier]);
  const recordPay = async () => {
    if (!order) return;
    const amt = parseDecimal(payAmt);
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (!payReason.trim()) { toast({ title: 'Add a reason', description: 'Every cash movement needs a reason so the payment is traceable (e.g. pre-payment, deposit, balance).', variant: 'destructive' }); return; }
    if (!payAccountId) { toast({ title: 'Pick an account', description: 'Choose which cash/bank account the money lands in (or leaves from) so it shows in your finance balances.', variant: 'destructive' }); return; }
    if (payDir === 'out' && !paySupplier) { toast({ title: 'Pick the supplier', description: 'Money out is registered against a supplier so we track what we paid them.', variant: 'destructive' }); return; }
    // Issue the order's receipt/invoice in the same step — works both when recording NEW money in
    // and when editing an existing payment (as long as the order has no document yet). Whether it's
    // a receipt (private contact) or an invoice (business) is driven by salesDocKind.
    const alsoIssue = payIssueDoc && payDir === 'in' && order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0;
    setSaving(true);
    try {
      if (editingPaymentId) {
        // Edit in place — keep the original paid_at, correct the fields, and keep any single
        // invoice/bill allocation in sync (handled in the service).
        await ordersService.updateOrderPayment({
          paymentId: editingPaymentId, orderId: order.id,
          direction: payDir, amount: amt, reference: payReason.trim(), method: payMethod || null,
          bankAccountId: payAccountId,
          counterpartyCompanyId: payDir === 'out' ? (paySupplier?.id ?? null) : (order.customer_company_id ?? null),
          counterpartyContactId: payDir === 'in' ? (order.customer_contact_id ?? null) : null,
        });
      } else {
        // Money in → settle the order's open invoice(s); money out → cash to the supplier
        // (we don't auto-settle supplier bills, which may span multiple suppliers).
        const targets = payDir === 'in'
          ? (fin?.invoices ?? []).filter((iv) => Number(iv.amount_due) > 0).map((iv) => ({ id: iv.id, amount_due: Number(iv.amount_due), type: 'invoice' as const }))
          : [];
        await ordersService.recordOrderPayment({
          order: { id: order.id, workspace_id: order.workspace_id, currency: order.currency, customer_company_id: order.customer_company_id, customer_contact_id: order.customer_contact_id },
          direction: payDir, amount: amt, reference: payReason.trim(), method: payMethod || null,
          bankAccountId: payAccountId, supplierCompanyId: paySupplier?.id ?? null, targets,
        });
      }
      const wasEdit = !!editingPaymentId;
      setPayOpen(false); setPayAmt(''); setEditingPaymentId(null);
      // Cash sale: issue the order's receipt/invoice from the same step, then open it to transmit.
      if (alsoIssue) { await createInvoice(); return; }
      await load(order.id);
      onChanged();
      toast({ title: wasEdit ? 'Payment updated' : (payDir === 'in' ? 'Money in recorded' : 'Money out recorded') });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Settle this sales order from the customer's on-account credit — no new cash. Re-homes existing
  // "money in" onto the order (server-side, split-safe); the order flips to paid/partial via trigger.
  const applyCredit = async () => {
    if (!order) return;
    const outstanding = Math.max(0, Math.round((Number(order.total) - (fin?.received ?? 0)) * 100) / 100);
    const willApply = Math.min(applicableCredit, outstanding);
    if (willApply <= 0.005) return;
    if (!window.confirm(`Apply ${formatMoney(willApply, order.currency)} of ${order.customer_company_id || order.customer_contact_id ? 'this customer’s' : 'the'} account credit to this order? No new money is recorded — the existing credit is used.`)) return;
    setSaving(true);
    try {
      const applied = await ordersService.applyCreditToOrder(order.id, order.workspace_id, willApply);
      await load(order.id);
      onChanged();
      toast({ title: applied > 0 ? `Applied ${formatMoney(applied, order.currency)} from credit` : 'Nothing to apply' });
    } catch (err: any) {
      toast({ title: 'Failed to apply credit', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Edit an existing payment: pre-fill the pay panel from the row and flip it into update mode.
  const editPay = async (p: { id: string; direction: 'in' | 'out'; amount: number; reference: string | null; method: string | null; bank_account_id: string | null; counterparty_company_id: string | null }) => {
    setEditingPaymentId(p.id);
    setPayDir(p.direction);
    setPayIssueDoc(false);
    setPayAmt(String(p.amount));
    setPayReason(p.reference ?? '');
    setPayMethod(p.method || 'cash');
    setPayAccountId(p.bank_account_id ?? defaultAccountId());
    setPaySupplierSearch(''); setPaySupplierOpts([]);
    // Money out is attached to a supplier — restore the chip so the user sees who it pays.
    if (p.direction === 'out' && p.counterparty_company_id) {
      const name = supplierNames.get(p.counterparty_company_id);
      if (name) { setPaySupplier({ id: p.counterparty_company_id, name }); }
      else {
        setPaySupplier({ id: p.counterparty_company_id, name: '…' });
        const { data } = await supabase.from('crm_companies').select('name').eq('id', p.counterparty_company_id).maybeSingle();
        if (data?.name) setPaySupplier({ id: p.counterparty_company_id, name: data.name });
      }
    } else {
      setPaySupplier(null);
    }
    setPayOpen(true);
  };

  // Delete a payment off the order (reverses the cash). Trigger recomputes payment_status on delete.
  const deletePay = async (p: { id: string; amount: number; currency: string; direction: 'in' | 'out' }) => {
    if (!order) return;
    if (!window.confirm(`Delete this ${p.direction === 'in' ? 'money in' : 'money out'} of ${formatMoney(Number(p.amount), p.currency)}? This removes the cash from the order and your finance balances.`)) return;
    setSaving(true);
    try {
      await ordersService.deleteOrderPayment(p.id, order.id);
      if (editingPaymentId === p.id) { setPayOpen(false); setEditingPaymentId(null); }
      await load(order.id);
      onChanged();
      toast({ title: 'Payment deleted' });
    } catch (err: any) {
      toast({ title: 'Failed to delete', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // #3 — edit the order's line items (only while it has no invoice yet).
  const editable = !!order && order.status !== 'cancelled' && order.status !== 'fulfilled' && (fin?.invoices.length ?? 0) === 0;
  const startEdit = () => {
    setEditItems(items.map((it) => ({ product_id: it.product_id, description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), unit_cost: it.unit_cost, unit_code: it.measurement_unit_code || DEFAULT_UNIT, vat_code: vatCodeOf(it.vat_percent), supplier_company_id: it.supplier_company_id, available: null })));
    setEditing(true);
    // Pull on-hand for catalog lines so the edit grid can warn on over-stock (sales).
    const pids = items.map((it) => it.product_id).filter(Boolean) as string[];
    if (pids.length && order) {
      void ordersService.getAvailableStock(pids, order.workspace_id).then((stock) => {
        setEditItems((ls) => ls.map((l) => (l.product_id ? { ...l, available: stock.get(l.product_id) ?? null } : l)));
      }).catch(() => { /* best-effort */ });
    }
  };
  const setEditItem = (i: number, patch: Partial<Line>) => setEditItems((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const saveItems = async () => {
    if (!order) return;
    const clean = editItems.filter((l) => l.description.trim() && (Number(l.quantity) || 0) > 0);
    if (clean.length === 0) { toast({ title: 'Add at least one product', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await ordersService.updateItems(order.id, order.workspace_id, clean.map((l) => ({
        product_id: l.product_id ?? null, description: l.description, quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
        unit_cost: order.order_type === 'purchase' ? (Number(l.unit_price) || 0) : l.unit_cost,
        supplier_company_id: l.supplier_company_id ?? null,
        measurement_unit_code: l.unit_code,
        vat_percent: pctOf(l.vat_code), vat_category: parseInt(l.vat_code, 10) || undefined,
      })), { type: order.discount_type, value: Number(order.discount_value) || 0 });
      setEditing(false);
      await load(order.id); onChanged();
      toast({ title: 'Order updated' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // #2 — raise a draft invoice from this (manual/quote-less) sales order, then open it to issue.
  const createInvoice = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('generate_invoice_from_order', { p_order: order.id });
      if (error) throw error;
      await load(order.id); onChanged();
      toast({ title: `Draft ${salesDocKind === 'receipt' ? 'receipt' : 'invoice'} created`, description: 'Review it, then issue & transmit to myDATA.' });
      if (data) navigate(`/finance/invoices/${data}`);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // #5 — purchase order: record the supplier bill + receive goods into the warehouse.
  const recordBill = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('generate_supplier_bill_from_order', { p_order: order.id });
      if (error) throw error;
      await load(order.id); onChanged();
      toast({ title: 'Supplier bill recorded' });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const receiveWarehouse = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('receive_order_into_warehouse', { p_order: order.id });
      if (error) throw error;
      await load(order.id); onChanged();
      toast({ title: 'Received', description: `${data ?? 0} warehouse line(s) updated` });
      // #237 — notify via Flows that the PO arrived (allocations flipped to reserved).
      if (order.order_type === 'purchase') {
        const { data: u } = await supabase.auth.getUser();
        void flowEventService.emit('purchase_order.received', {
          user_id: u?.user?.id ?? null,
          title: `Purchase order ${order.order_number ?? order.id.slice(0, 8)} received`,
          body: `${data ?? 0} warehouse line(s) updated`,
          action_url: `/finance?tab=orders&order=${order.id}`,
          order_id: order.id,
          order_number: order.order_number,
          supplier_id: order.supplier_company_id,
          workspace_id: order.workspace_id,
        });
      }
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  // #237 A3 — email the purchase order to the supplier (PDF), mark it placed.
  const sendToSupplier = async () => {
    if (!order) return;
    if (!order.supplier_company_id && !order.supplier_contact_id) {
      toast({ title: 'No supplier', description: 'This purchase order has no supplier set.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-purchase-sheet-pdf', {
        body: { order_id: order.id, send: true },
      });
      if (error) {
        if (await handleEmailSendError(error, { workspaceId: order.workspace_id, feature: 'purchase order' })) return;
        throw new Error(await edgeErrorMessage(error, 'Failed to send purchase order'));
      }
      if (!data?.success) throw new Error(data?.error || 'Failed to send purchase order');
      await load(order.id); onChanged();
      toast({
        title: 'Sent to supplier',
        description: data.recipient ? `Purchase order emailed to ${data.recipient}.` : 'Purchase order generated.',
      });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  // Order margin = Σ (unit_price − unit_cost) × qty over lines that carry a cost. null = no cost yet.
  const anyCost = items.some((it) => it.unit_cost != null);
  const orderMargin = order && anyCost
    ? items.reduce((a, it) => a + ((Number(it.unit_price) || 0) - (Number(it.unit_cost) || 0)) * (Number(it.quantity) || 0), 0)
    : null;
  // Total discount given vs the catalog list price (shown once at the bottom, not per line).
  const discountTotal = order
    ? items.reduce((a, it) => {
        const list = it.product_id ? listPrices.get(it.product_id) : undefined;
        return list && list > Number(it.unit_price) ? a + (list - Number(it.unit_price)) * Number(it.quantity) : a;
      }, 0)
    : 0;
  // Explicit order-level discount the operator entered = original line net (price × qty, pre-discount)
  // minus the stored (post-discount) subtotal_net. Shown as its own line so net < price×qty is explained.
  const orderDiscountAmount = order
    ? Math.round((items.reduce((a, it) => a + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0) - Number(order.subtotal_net)) * 100) / 100
    : 0;
  const outstanding = order ? Math.max(0, Math.round((Number(order.total) - (fin?.received ?? 0)) * 100) / 100) : 0;
  const creditToApply = Math.min(applicableCredit, outstanding);
  // A sales order to a company (B2B) issues an invoice; to a bare contact (retail) a receipt.
  // myDATA finalises the exact document type at issue; this just labels the action correctly.
  const salesDocKind: 'invoice' | 'receipt' = order?.customer_company_id ? 'invoice' : 'receipt';

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1400px] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Order {order?.order_number ?? order?.id.slice(0, 8)}</DialogTitle></DialogHeader>
        {loading || !order ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Status + actions sit ON TOP of the products (then the document + totals below). */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">{order.order_type}</Badge>
              <span className="text-xs text-muted-foreground">{ORDER_PAYMENT_LABEL[order.payment_status]}</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={order.status} onValueChange={(v: any) => changeStatus(v)}>
                  <SelectTrigger className="h-8 w-44 text-xs" disabled={saving}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={saving}>
                      <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Actions <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {/* The order moves REAL cash only: money in (received) / money out (sent). */}
                    <DropdownMenuItem className="items-start" onClick={() => openPay('in')}>
                      <ArrowDownLeft className="h-3.5 w-3.5 mr-2 mt-0.5 shrink-0 text-emerald-500" />
                      <span className="flex flex-col"><span>Record money in</span><span className="text-[10px] text-muted-foreground">Cash received from the customer.</span></span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="items-start" onClick={() => openPay('out')}>
                      <ArrowUpRight className="h-3.5 w-3.5 mr-2 mt-0.5 shrink-0 text-red-400" />
                      <span className="flex flex-col"><span>Record money out</span><span className="text-[10px] text-muted-foreground">Cash paid to the supplier / refunded.</span></span>
                    </DropdownMenuItem>
                    {/* Settle from the customer's on-account credit — no new cash movement. */}
                    {order.order_type === 'sales' && creditToApply > 0.005 && (
                      <DropdownMenuItem className="items-start" onClick={applyCredit}>
                        <Banknote className="h-3.5 w-3.5 mr-2 mt-0.5 shrink-0 text-emerald-500" />
                        <span className="flex flex-col"><span>Pay from account credit</span><span className="text-[10px] text-muted-foreground">Use {formatMoney(creditToApply, order.currency)} of this customer’s existing credit.</span></span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 && (
                      <DropdownMenuItem onClick={createInvoice}>
                        <FileText className="h-3.5 w-3.5 mr-2" /> {salesDocKind === 'receipt' ? 'Create receipt' : 'Create invoice'}
                      </DropdownMenuItem>
                    )}
                    {order.order_type === 'purchase' && (
                      <DropdownMenuItem onClick={sendToSupplier}>
                        <Send className="h-3.5 w-3.5 mr-2" /> Send to supplier
                      </DropdownMenuItem>
                    )}
                    {order.order_type === 'purchase' && (fin?.supplierBills.length ?? 0) === 0 && (
                      <DropdownMenuItem onClick={recordBill}>
                        <Receipt className="h-3.5 w-3.5 mr-2" /> Record supplier bill
                      </DropdownMenuItem>
                    )}
                    {order.order_type === 'purchase' && order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                      <DropdownMenuItem onClick={receiveWarehouse}>
                        <PackageCheck className="h-3.5 w-3.5 mr-2" /> Receive into warehouse
                      </DropdownMenuItem>
                    )}
                    {editable && !editing && (
                      <DropdownMenuItem onClick={startEdit}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit items
                      </DropdownMenuItem>
                    )}
                    {order.order_type === 'sales' && (
                      <DropdownMenuItem onClick={() => navigate('/finance?tab=doc_dispatch')}>
                        <Truck className="h-3.5 w-3.5 mr-2" /> Dispatch board
                      </DropdownMenuItem>
                    )}
                    {order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => changeStatus('fulfilled')}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark completed
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* On-account credit available to settle this order without new cash. Shows whenever the
                customer has unapplied "money in" and the order still has a balance. */}
            {order.order_type === 'sales' && applicableCredit > 0.005 && outstanding > 0.005 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                <span className="text-sm flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>This customer has <span className="font-semibold">{formatMoney(applicableCredit, order.currency)}</span> on account — settle this order from it, no new cash needed.</span>
                </span>
                <Button size="sm" className="h-8" onClick={applyCredit} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Apply ${formatMoney(creditToApply, order.currency)}`}
                </Button>
              </div>
            )}

            {/* Classification + expected payment — settable before the order is invoiced so it shows
                a category and ages in Receivables/Payables (both carry onto the invoice/bill). */}
            <div className="flex flex-wrap items-end gap-4 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Category</Label>
                <Select value={order.category_id ?? 'none'} onValueChange={(v) => void saveMeta({ categoryId: v === 'none' ? null : v })} disabled={saving}>
                  <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="No category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {/* Keep a since-deactivated category selectable so its value doesn't render blank. */}
                    {order.category_id && !categories.some((c) => c.id === order.category_id) && (
                      <SelectItem value={order.category_id}>Current category (inactive)</SelectItem>
                    )}
                    {categories.filter((c) => c.kind === (order.order_type === 'sales' ? 'income' : 'expense') || c.kind === 'both').map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Expected payment date</Label>
                <Input type="date" className="h-8 w-44 text-xs" value={order.expected_payment_date ?? ''} disabled={saving}
                  onChange={(e) => void saveMeta({ expectedPaymentDate: e.target.value || null })} />
              </div>
              {/* A pre-order (draft) only surfaces in Receivables/Payables once real cash has moved on
                  it — so an expected date on a deposit-less pre-order won't age yet. Say so. */}
              {order.status === 'draft' && (fin?.received ?? 0) === 0 && (fin?.paid_out ?? 0) === 0 ? (
                <p className="text-[11px] text-amber-600 max-w-xs">This pre-order appears in Receivables/Payables once a deposit is recorded — until then the expected date won’t age.</p>
              ) : (
                <p className="text-[11px] text-muted-foreground max-w-xs">Un-invoiced orders age in Receivables/Payables against the expected payment date.</p>
              )}
            </div>

            {/* Order note — captured when the order is placed; prints on the invoice + receipt. */}
            <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <Label className="text-[10px] text-muted-foreground">Order note</Label>
              <Textarea
                key={order.id}
                rows={2}
                defaultValue={order.notes ?? ''}
                disabled={saving}
                placeholder="Note from whoever placed the order — e.g. pickup / delivery instructions. Prints on the invoice & receipt."
                className="text-sm"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (order.notes ?? null)) void saveMeta({ notes: v });
                }}
              />
            </div>

            {!editing ? (
              <>
                <div className="rounded-md border border-border/60 overflow-x-auto">
                  <div className="grid grid-cols-[minmax(240px,1.7fr)_44px_52px_120px_82px_92px_84px_94px_88px_84px_96px] gap-2 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground min-w-[1040px]">
                    <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Delivered</span><span className="text-right" title="Sell price per unit (excl. VAT)">Price</span><span className="text-right" title="Net = price × qty (excl. VAT)">Net</span><span className="text-right" title="Cost per unit — what this costs us">Cost</span><span className="text-right" title="Cost total = cost/unit × qty">Cost total</span><span className="text-right" title="Profit = net − cost total (excl. VAT)">Profit</span><span className="text-right" title="VAT amount on this line">VAT</span><span className="text-right" title="Total = net + VAT">Total</span>
                  </div>
                  {items.map((it) => {
                    const gross = Number(it.net_value) + Number(it.vat_amount);
                    const unitLabel = UNIT_OPTIONS.find((u) => u.code === it.measurement_unit_code)?.label ?? (it.measurement_unit_code || '—');
                    const supName = it.supplier_company_id ? supplierNames.get(it.supplier_company_id) : undefined;
                    const lineCost = it.unit_cost != null ? Number(it.unit_cost) * Number(it.quantity) : null;
                    const lineProfit = lineCost != null ? Number(it.net_value) - lineCost : null;
                    const del = Number(it.quantity_delivered); const q = Number(it.quantity);
                    const delTone = del >= q && q > 0 ? 'text-emerald-600' : del > 0 ? 'text-amber-600' : 'text-muted-foreground';
                    return (
                    <div key={it.id} className="grid grid-cols-[minmax(240px,1.7fr)_44px_52px_120px_82px_92px_84px_94px_88px_84px_96px] gap-2 border-t border-border/40 px-3 py-1.5 text-sm items-center min-w-[1040px]">
                      <span className="min-w-0">
                        <span className="block truncate">{it.description}{!it.update_warehouse && <span className="ml-1 text-[10px] text-muted-foreground">(off-warehouse)</span>}</span>
                        {/* #6/#7 — who supplies this line (and therefore who we owe). Any line, catalog or ad-hoc. */}
                        <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5" onClick={() => setSupplierPick({ itemId: it.id, productId: it.product_id ?? null, label: it.description, currentId: it.supplier_company_id ?? null })}>
                          {supName ? <><Building2 className="h-2.5 w-2.5" /> {supName}</> : <><Plus className="h-2.5 w-2.5" /> supplier</>}
                        </button>
                      </span>
                      <span className="text-right tabular-nums">{Number(it.quantity)}</span>
                      <span className="text-muted-foreground text-xs">{unitLabel}</span>
                      {/* Delivered: inline-editable (reads like text, box on hover/focus) + quick menu.
                          Tone: green = fully delivered, amber = partial. Status auto-advances. */}
                      <div className="flex items-center justify-end gap-0.5">
                        <Input key={`${it.id}-${it.quantity_delivered}`}
                          className={`h-6 w-9 text-right text-xs px-0.5 tabular-nums border-0 shadow-none bg-transparent rounded hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-1 ${delTone}`}
                          type="number" step="1" min="0" defaultValue={del} disabled={saving}
                          onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== del) void setLineDelivered(it.id, v); }} />
                        <span className="text-[10px] text-muted-foreground">/ {q}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className="h-3 w-3" /></button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => void setLineDelivered(it.id, q)}>Mark fully delivered</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void setLineDelivered(it.id, Math.ceil(q / 2))}>Mark half delivered</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void setLineDelivered(it.id, 0)}>Mark not delivered</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <span className="text-right tabular-nums" title={Number(it.discount_pct) > 0 ? `List ${formatMoney(Number(it.unit_price), order.currency)} · ${Number(it.discount_pct)}% off` : 'Sell price per unit (excl. VAT)'}>
                        {Number(it.discount_pct) > 0 && Number(it.quantity) > 0
                          ? formatMoney(Number(it.net_value) / Number(it.quantity), order.currency)
                          : formatMoney(Number(it.unit_price), order.currency)}
                      </span>
                      <span className="text-right tabular-nums" title="Net = price × qty (excl. VAT, after discount)">{formatMoney(Number(it.net_value), order.currency)}</span>
                      <span className="text-right tabular-nums text-muted-foreground" title="Cost per unit">{it.unit_cost != null ? formatMoney(Number(it.unit_cost), order.currency) : '—'}</span>
                      <span className="text-right tabular-nums text-muted-foreground" title="Cost total (cost/unit × qty) — what this line costs us">{lineCost != null ? formatMoney(lineCost, order.currency) : '—'}</span>
                      <span className={`text-right tabular-nums ${lineProfit == null ? 'text-muted-foreground' : lineProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`} title="Profit on this line (excl. VAT) + margin % of net">
                        {lineProfit != null ? formatMoney(lineProfit, order.currency) : '—'}
                        {lineProfit != null && Number(it.net_value) > 0 && (
                          <span className="block text-[9px] text-muted-foreground">{Math.round((lineProfit / Number(it.net_value)) * 100)}%</span>
                        )}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground" title={`VAT ${Number(it.vat_percent ?? 0)}%`}>{formatMoney(Number(it.vat_amount), order.currency)}</span>
                      <span className="text-right tabular-nums font-medium" title="Line total incl. VAT (price × qty + VAT)">{formatMoney(gross, order.currency)}</span>
                    </div>
                    );
                  })}
                </div>
                {/* Totals — order-document style, below the table. Discount is summarised here
                    (once), not as a per-line column. */}
                <div className="flex flex-col items-end gap-0.5 text-sm">
                  {discountTotal > 0 && (
                    <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">Discount (off list)</span><span className="tabular-nums text-emerald-600">−{formatMoney(discountTotal, order.currency)}</span></div>
                  )}
                  {orderDiscountAmount > 0.005 && (
                    <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">Discount{order.discount_type === 'percent' ? ` (${Number(order.discount_value)}%)` : ''}</span><span className="tabular-nums text-emerald-600">−{formatMoney(orderDiscountAmount, order.currency)}</span></div>
                  )}
                  <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">Net (excl. VAT)</span><span className="tabular-nums">{formatMoney(Number(order.subtotal_net), order.currency)}</span></div>
                  <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">VAT</span><span className="tabular-nums">{formatMoney(Number(order.vat_amount), order.currency)}</span></div>
                  <div className="flex justify-between gap-8 w-60 font-semibold border-t border-border/60 pt-0.5"><span>Total (incl. VAT)</span><span className="tabular-nums">{formatMoney(Number(order.total), order.currency)}</span></div>
                  {orderMargin != null && (
                    <div className="flex justify-between gap-8 w-60 font-medium"><span className="text-muted-foreground">Profit (excl. VAT)</span><span className={`tabular-nums ${orderMargin >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(orderMargin, order.currency)}{Number(order.subtotal_net) > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">{Math.round((orderMargin / Number(order.subtotal_net)) * 100)}%</span>}</span></div>
                  )}
                </div>

                {/* 3-way match — purchase orders only: PO cost × goods received × supplier bill. */}
                {order.order_type === 'purchase' && match && match.match_status !== 'no_lines' && (
                  <div className="mt-4 rounded-md border border-border/60 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">3-way match</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${MATCH_META[match.match_status].cls}`}>
                        {MATCH_META[match.match_status].label}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">PO cost × goods received × supplier bill</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-muted/40 p-2">
                        <div className="text-muted-foreground">Ordered (PO net)</div>
                        <div className="tabular-nums font-medium">{formatMoney(match.po_net, order.currency)}</div>
                      </div>
                      <div className="rounded bg-muted/40 p-2">
                        <div className="text-muted-foreground">Received</div>
                        <div className="tabular-nums font-medium">{match.received_qty} / {match.ordered_qty}</div>
                      </div>
                      <div className="rounded bg-muted/40 p-2">
                        <div className="text-muted-foreground">Billed{match.bill_count > 0 ? ` (${match.bill_count})` : ''}</div>
                        <div className="tabular-nums font-medium">{formatMoney(match.bill_net, order.currency)}</div>
                      </div>
                    </div>
                    {match.variances.length > 0 && (
                      <ul className="space-y-0.5 text-[11px] text-destructive">
                        {match.variances.map((v, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {v.type === 'amount'
                              ? `Bill net ${formatMoney(v.bill_net, order.currency)} vs PO ${formatMoney(v.po_net, order.currency)} (${v.delta >= 0 ? '+' : ''}${formatMoney(v.delta, order.currency)})`
                              : `Received ${v.received} vs ordered ${v.ordered} (${v.delta >= 0 ? '+' : ''}${v.delta})`}
                          </li>
                        ))}
                      </ul>
                    )}
                    {match.match_status === 'awaiting_bill' && (
                      <p className="text-[11px] text-muted-foreground">Goods received — record the supplier bill and match it to this PO to complete the check.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-border/60">
                <div className="grid grid-cols-[1fr_52px_60px_80px_80px_84px_24px] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>Product</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Price</span><span className="text-right">Cost</span><span className="text-right">VAT</span><span />
                </div>
                {editItems.map((l, i) => {
                  const short = order.order_type === 'sales' && l.product_id && l.available != null && (Number(l.quantity) || 0) > l.available;
                  return (
                  <React.Fragment key={i}>
                  <div className="grid grid-cols-[1fr_52px_60px_80px_80px_84px_24px] items-center gap-2 border-t border-border/40 px-2 py-1.5">
                    <Input className="h-8 text-sm" value={l.description} onChange={(e) => setEditItem(i, { description: e.target.value, product_id: null })} placeholder="Product…" />
                    <MoneyInput className="h-8 text-right text-sm px-1" displayDecimals={null} value={l.quantity} onValueChange={(v) => setEditItem(i, { quantity: v ?? 0 })} />
                    <Select value={l.unit_code} onValueChange={(v) => setEditItem(i, { unit_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <MoneyInput className="h-8 text-right text-sm px-1" value={l.unit_price} onValueChange={(v) => setEditItem(i, { unit_price: v ?? 0 })} />
                    <MoneyInput className="h-8 text-right text-sm px-1" placeholder="—" value={l.unit_cost} onValueChange={(v) => setEditItem(i, { unit_cost: v })} />
                    <Select value={l.vat_code} onValueChange={(v) => setEditItem(i, { vat_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setEditItems((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  {short && (
                    <div className="px-2 pb-1.5 -mt-0.5 text-[11px] text-amber-600 flex items-center gap-1">
                      <PackageCheck className="h-3 w-3" /> Only {l.available} in stock — ordering {Number(l.quantity)}.
                    </div>
                  )}
                  </React.Fragment>
                  );
                })}
                <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/40">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditItems((ls) => [...ls, blankLine()])}><Plus className="h-3.5 w-3.5 mr-1" /> New Product</Button>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                    <Button size="sm" onClick={saveItems} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save items'}</Button>
                  </div>
                </div>
              </div>
            )}

            {payOpen && (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium flex items-center gap-1">
                    {editingPaymentId && <span className="text-muted-foreground">Edit ·</span>}
                    {payDir === 'in' ? <><ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" /> Money in (received)</> : <><ArrowUpRight className="h-3.5 w-3.5 text-red-400" /> Money out (sent)</>}
                  </span>
                  <Input className="h-8 w-28 text-right text-sm" type="text" inputMode="decimal" placeholder="0.00" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                  <span className="text-xs text-muted-foreground">{order.currency}</span>
                  <Button size="sm" onClick={recordPay} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (editingPaymentId ? 'Update' : 'Save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setPayOpen(false); setEditingPaymentId(null); }}>Cancel</Button>
                </div>
                {/* Money out: which supplier we're paying (so it registers against them) + a reason. */}
                {payDir === 'out' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {paySupplier ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs"><Building2 className="h-3 w-3" /> {paySupplier.name}
                        <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => setPaySupplier(null)}>✕</button>
                      </span>
                    ) : (
                      <div className="relative">
                        <Input className="h-8 w-56 text-sm" value={paySupplierSearch} onChange={(e) => setPaySupplierSearch(e.target.value)} placeholder="Pay which supplier? Search…" />
                        {paySupplierOpts.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                            {paySupplierOpts.map((s) => (
                              <button key={s.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPaySupplier(s); setPaySupplierSearch(''); setPaySupplierOpts([]); }}>{s.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Required for every cash movement: which account it hits, how it moved, and why.
                    Without an account the money floats unattached and never shows in finance balances. */}
                <div className="flex items-center gap-2 flex-wrap">
                  {bankAccounts.length > 0 ? (
                    <Select value={payAccountId} onValueChange={(v) => { setPayAccountId(v); setPayMethod(methodForAccount(v)); }}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Account…" /></SelectTrigger>
                      <SelectContent>{bankAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.currency !== order.currency ? ` · ${a.currency}` : ''}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={createCashAccount} disabled={creatingAccount}>
                      {creatingAccount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Create cash account</>}
                    </Button>
                  )}
                  {/* No method dropdown — the method is inferred from the account (a bank account →
                      bank transfer, a cash account → cash). The saved payment still carries it. */}
                  <Input className="h-8 w-52 text-sm" value={payReason} onChange={(e) => setPayReason(e.target.value)} placeholder={payDir === 'in' ? 'Reason (e.g. pre-payment, deposit)' : 'Reason (e.g. deposit to supplier)'} />
                </div>
                {/* Cash sale: record the money AND issue the order's receipt/invoice in one step. */}
                {payDir === 'in' && order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 && (
                  <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-0.5">
                    <Checkbox checked={payIssueDoc} onCheckedChange={(v) => setPayIssueDoc(v === true)} />
                    {editingPaymentId ? 'Issue' : 'Also issue'} a {salesDocKind === 'receipt' ? 'receipt' : 'invoice'} for this order (opens it to review &amp; transmit)
                    <span className="text-muted-foreground">— {order.customer_company_id ? 'business → invoice' : 'private → receipt'}</span>
                  </label>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {payIssueDoc
                    ? `${editingPaymentId ? 'Updates the payment' : 'Records the cash'} and creates the ${salesDocKind === 'receipt' ? 'receipt' : 'invoice'} draft — review &amp; transmit it next.`
                    : <>Just the cash movement — no document. Tick the box above, or use Actions → {salesDocKind === 'receipt' ? 'Create receipt' : 'Create invoice'}, to issue one.</>}
                </p>
              </div>
            )}

            {/* Realised cash on the order — money actually received minus money actually paid out.
                (Distinct from the order's Profit-margin above, which is revenue − cost on the lines.) */}
            {fin && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Received</div>
                  <div className="text-sm font-semibold text-emerald-500">{formatMoney(fin.received, order.currency)}</div>
                </div>
                <div className="rounded-md border border-border/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid to suppliers</div>
                  <div className="text-sm font-semibold text-red-400">{formatMoney(fin.paid_out, order.currency)}</div>
                </div>
                <div className="rounded-md border border-border/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Net cash (in − out)</div>
                  <div className={`text-sm font-semibold ${fin.profit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(fin.profit, order.currency)}</div>
                </div>
              </div>
            )}

            {/* What we owe suppliers on this order — line costs grouped by the line's supplier,
                minus money-out already paid to them. "Pay" pre-fills a money-out for the balance. */}
            {supExposure.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Suppliers on this order — what we owe</div>
                {supExposure.map((s) => (
                  <div key={s.supplier_company_id} className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {s.name}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-[11px] text-muted-foreground">
                        {s.has_vat
                          ? `cost ${formatMoney(s.cost_net, order.currency)} + ${formatMoney(s.cost - s.cost_net, order.currency)} VAT = ${formatMoney(s.cost, order.currency)} · paid ${formatMoney(s.paid, order.currency)}`
                          : `cost ${formatMoney(s.cost, order.currency)} · paid ${formatMoney(s.paid, order.currency)}`}
                      </span>
                      <span className={s.owed > 0.005 ? 'text-red-400 font-medium' : 'text-emerald-500'}>
                        {s.owed > 0.005 ? `owe ${formatMoney(s.owed, order.currency)}` : s.owed < -0.005 ? `overpaid ${formatMoney(-s.owed, order.currency)}` : 'settled'}
                      </span>
                      {s.owed > 0.005 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => openPaySupplier({ id: s.supplier_company_id, name: s.name }, s.owed)}>
                          <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Attached invoices */}
            {fin && fin.invoices.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Invoices</div>
                {fin.invoices.map((iv) => (
                  <div key={iv.id} className="flex justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="font-mono text-xs">{iv.internal_number ?? iv.id.slice(0, 8)} · {humanizeLabel(iv.status)}</span>
                    <span className="tabular-nums">{formatMoney(Number(iv.total), iv.currency)} <span className="text-[10px] text-muted-foreground">due {formatMoney(Number(iv.amount_due), iv.currency)}</span></span>
                  </div>
                ))}
              </div>
            )}

            {/* Attached supplier bills (purchase orders) */}
            {fin && fin.supplierBills.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Supplier bills</div>
                {fin.supplierBills.map((b) => (
                  <div key={b.id} className="flex justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="font-mono text-xs">{b.supplier_bill_number ?? b.id.slice(0, 8)} · {humanizeLabel(b.status)}</span>
                    <span className="tabular-nums">{formatMoney(Number(b.total), b.currency)} <span className="text-[10px] text-muted-foreground">due {formatMoney(Number(b.amount_due), b.currency)}</span></span>
                  </div>
                ))}
              </div>
            )}

            {/* Attached payments */}
            {fin && fin.payments.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Payments</div>
                {fin.payments.map((p) => {
                  const acctName = p.bank_account_id ? bankAccounts.find((a) => a.id === p.bank_account_id)?.name : null;
                  // Who the cash moved between: money-in came FROM the customer, money-out went TO the supplier.
                  const who = p.counterparty_name;
                  return (
                  <div key={p.id} className={`flex items-start justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0 ${editingPaymentId === p.id ? 'bg-muted/30' : ''}`}>
                    <span className="min-w-0">
                      <span className="block truncate">
                        {p.reference || <span className="text-muted-foreground italic">No reason</span>}
                        {who
                          ? <span className="text-muted-foreground">{p.direction === 'in' ? ' · from ' : ' · to '}<span className="text-foreground/80">{who}</span></span>
                          : (p.direction === 'out' && <span className="text-muted-foreground italic"> · to (no supplier set)</span>)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()} · {p.direction === 'in' ? 'Money in' : 'Money out'}{p.method ? ` · ${paymentMethodLabel(p.method)}` : ''}{acctName ? ` · ${acctName}` : ''}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`tabular-nums ${p.direction === 'in' ? 'text-emerald-500' : 'text-red-400'}`}>{formatMoney(Number(p.amount), p.currency)}</span>
                      {/* Payment receipt (απόδειξη είσπραξης) — proof of money received, NOT a tax doc,
                          never sent to myDATA. Email it / copy a link / download the PDF. */}
                      <PaymentReceiptActions paymentId={p.id} direction={p.direction} className="border-r border-border/40 pr-1.5 mr-0.5" />
                      <button type="button" title="Edit payment" className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={saving} onClick={() => void editPay(p)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Delete payment" className="text-muted-foreground hover:text-destructive disabled:opacity-40" disabled={saving} onClick={() => void deletePay(p)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Audit trail of payment edits/deletes (finance-manager-readable). Collapsed by default. */}
            {payAudit.length > 0 && (
              <div className="rounded-md border border-border/60">
                <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowPayAudit((v) => !v)}>
                  <span>Payment history ({payAudit.length})</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPayAudit ? 'rotate-180' : ''}`} />
                </button>
                {showPayAudit && payAudit.map((a) => {
                  const oldAmt = Number(a.old_row?.amount); const newAmt = a.new_row ? Number(a.new_row.amount) : null;
                  const dir = (a.new_row?.direction ?? a.old_row?.direction) === 'in' ? 'In' : 'Out';
                  return (
                    <div key={a.id} className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                      <span className={a.action === 'delete' ? 'text-red-400 font-medium' : 'text-amber-500 font-medium'}>{a.action === 'delete' ? 'Deleted' : 'Edited'}</span>
                      {' '}{dir} ·{' '}
                      {a.action === 'update' && newAmt != null && oldAmt !== newAmt
                        ? <>{formatMoney(oldAmt, order.currency)} → {formatMoney(newAmt, order.currency)}</>
                        : formatMoney(oldAmt, order.currency)}
                      {' '}· {new Date(a.changed_at).toLocaleString()}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Money in / money out above is real cash on this order (a payment received / sent). Marking a catalog
              line delivered moves warehouse stock (sales out / purchase in) and auto-advances the status. The
              receipt/invoice is the separate Create document action.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {supplierPick && (
        <SupplierPickerDialog
          label={supplierPick.label}
          currentName={supplierPick.currentId ? (supplierNames.get(supplierPick.currentId) ?? null) : null}
          onClose={() => setSupplierPick(null)}
          onPick={(companyId) => void setLineSupplier(supplierPick.itemId, supplierPick.productId, companyId)}
        />
      )}
    </Dialog>
    {connectEmailGate}
    </>
  );
};

// Pick (or clear) the supplier we buy a product from — searches CRM companies flagged as suppliers.
const SupplierPickerDialog: React.FC<{
  label: string; currentName: string | null;
  onClose: () => void; onPick: (companyId: string | null) => void;
}> = ({ label, currentName, onClose, onPick }) => {
  const [term, setTerm] = useState('');
  const [opts, setOpts] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) { setOpts([]); return; }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('crm_companies').select('id, name').eq('is_supplier', true).ilike('name', `%${t}%`).limit(8);
      setOpts((data ?? []) as Array<{ id: string; name: string }>);
    }, 200);
    return () => clearTimeout(h);
  }, [term]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Supplier for “{label}”</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {currentName && (
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" /> {currentName}</span>
              <Button size="sm" variant="ghost" onClick={() => onPick(null)}>Clear</Button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7" placeholder="Search supplier companies…" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          {opts.length > 0 && (
            <div className="rounded-md border border-border/60 divide-y divide-border/40">
              {opts.map((o) => (
                <button key={o.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onPick(o.id)}>{o.name}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Only CRM companies marked as suppliers appear. Set the role on the company if it’s missing.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
