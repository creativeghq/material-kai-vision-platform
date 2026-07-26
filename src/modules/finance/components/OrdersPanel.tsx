import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, ShoppingCart, Coins, CalendarDays, Trash2, Search, Truck, Banknote, FileText, Receipt, PackageCheck, ChevronDown, MoreHorizontal, CheckCircle2, Pencil, Package, FileClock, Building2, ArrowDownLeft, ArrowUpRight, Send, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  formatMoney, financeService, VAT_CATEGORIES, paymentMethodLabel,
  type PaymentWithAllocation,
} from '@/modules/finance/services/financeService';
import { statusTone } from '@/modules/finance/utils/statusTone';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { parseDecimal } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import { edgeErrorMessage } from '@/utils/edgeError';
import { flowEventService } from '@/services/flows/flowEventService';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { MoneyInput } from '@/components/core/ui/money-input';
import { TablePagination, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { FilterBar, type FilterGroupDef, type FilterValues } from '@/components/core/filters';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import { PaymentRowActions } from '@/modules/finance/components/PaymentRowActions';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL,
  type OrderType, type OrderStatus, type OrderPaymentStatus, type OrderListRow, type OrderItem, type Order,
  type ThreeWayMatch, type ThreeWayMatchStatus,
} from '@/modules/finance/services/ordersService';

/**
 * Orders filter every dimension in SQL (`search_orders` RPC), so NO field carries an accessor —
 * they are read out of the values bag and passed as RPC params, and the list keeps the server's
 * exact count. Date and total ranges run in SQL too — `search_orders` gained parameters for them
 * rather than have the browser post-filter a page, which would have made the count and the
 * paging lie. Currency sits next to the total range because a min/max across mixed currencies
 * is meaningless on its own.
 */
const ORDER_FILTER_GROUPS: FilterGroupDef[] = [
  {
    key: 'general', label: 'General', icon: ShoppingCart,
    fields: [
      { key: 'q', type: 'text', label: 'Search', placeholder: 'Party or number' },
      {
        key: 'order_type', type: 'select', label: 'Type',
        options: [{ value: 'sales', label: 'Sales' }, { value: 'purchase', label: 'Purchase' }],
      },
      {
        key: 'status', type: 'select', label: 'Status',
        options: (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
      },
      {
        // Collections segment — narrow the whole workspace to orders that still owe money.
        key: 'payment_status', type: 'select', label: 'Payment',
        description: 'Segment for collection — show only orders still to collect / pay.',
        options: (Object.keys(ORDER_PAYMENT_LABEL) as OrderPaymentStatus[]).map((s) => ({ value: s, label: ORDER_PAYMENT_LABEL[s] })),
      },
    ],
  },
  {
    key: 'amounts', label: 'Amounts', icon: Coins,
    fields: [
      { key: 'total', type: 'range', label: 'Order total', min: 0, max: 50000 },
      {
        key: 'currency', type: 'select', label: 'Currency',
        description: 'Pair with a total range — amounts are not comparable across currencies.',
        options: [{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }, { value: 'GBP', label: 'GBP' }],
      },
    ],
  },
  {
    key: 'dates', label: 'Dates', icon: CalendarDays,
    fields: [{ key: 'created_at', type: 'dateRange', label: 'Created' }],
  },
];

/** Map the values bag onto the RPC's filter parameters — used by both the list and the preview. */
function orderSearchParams(v: FilterValues) {
  const totalRange = (v.total as { min?: number; max?: number } | undefined) ?? {};
  const created = (v.created_at as { from?: string; to?: string } | undefined) ?? {};
  return {
    orderType: (v.order_type as OrderType | undefined) || undefined,
    status: (v.status as OrderStatus | undefined) || undefined,
    paymentStatus: (v.payment_status as OrderPaymentStatus | undefined) || undefined,
    createdFrom: created.from,
    createdTo: created.to,
    totalMin: totalRange.min,
    totalMax: totalRange.max,
    currency: (v.currency as string | undefined) || undefined,
  };
}

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
  // Outstanding € per order for the visible page (total − settled), so the list doubles as a
  // collections worklist. Keyed by order id; filled after each page load.
  const [outstandingById, setOutstandingById] = useState<Map<string, number>>(new Map());
  // Total MATCHING rows as counted by the server — the list itself only ever holds one page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  // `filterValues.q` is what the user is typing; `searchQ` is the debounced value the query
  // actually runs on, so a fast typist doesn't fire a round trip per keystroke.
  const search = (filterValues.q as string | undefined) ?? '';
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

  // Deep-link straight into ONE order: /finance?tab=doc_orders&order=<id>. Used by the AR/AP
  // aging tables' "Open order" button and by the purchase_order.received flow notification —
  // both previously landed on the bare list because nothing read this param.
  useEffect(() => {
    if (embedded) return;
    const target = searchParams.get('order');
    if (!target) return;
    setOpenId(target);
    const p = new URLSearchParams(searchParams);
    p.delete('order');
    setSearchParams(p, { replace: true });
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
        ...orderSearchParams(filterValues),
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
      // Outstanding for just this page — one batched query. Sales settle on money-in (positive
      // net), purchase on money-out (negative net), so we take the magnitude against the total.
      try {
        const settled = await ordersService.settledByOrder(res.rows.map((r) => r.id));
        setOutstandingById(new Map(res.rows.map((r) => {
          const net = Math.abs(settled.get(r.id) ?? 0);
          return [r.id, Math.round((Number(r.total) - net) * 100) / 100] as const;
        })));
      } catch { setOutstandingById(new Map()); }
    } catch (err: any) {
      toast({ title: 'Failed to load orders', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  // One key for every server-side filter parameter, so adding a dimension to the group def can't
  // leave the query stale the way an ad-hoc dependency list would.
  const filterKey = JSON.stringify(orderSearchParams(filterValues));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, companyId, contactId, projectId, filterKey, searchQ, page]);
  // A narrowed set is a different list — restart at the first page.
  useEffect(() => { setPage(1); }, [filterKey]);

  // Debounce the search box. Page 1 is set in the SAME tick as the new term so the query never
  // fires once for the stale page and again for page 1.
  useEffect(() => {
    const t = setTimeout(() => { setSearchQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // A different party/project scope is a different result set — start it at the first page.
  useEffect(() => { setPage(1); }, [companyId, contactId, projectId]);

  // The modal's live count comes from the server too (one row, exact total) — a client-side count
  // would only ever see the current page.
  const previewCount = async (v: FilterValues) => {
    const res = await ordersService.search({
      workspaceId, companyId, contactId, projectId,
      ...orderSearchParams(v),
      search: (v.q as string | undefined)?.trim() || undefined,
      limit: 1, offset: 0,
    });
    return res.count;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Orders
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filters only matter on the global Finance list. Inside a single party the list is
                short and already scoped — the dropdowns are just noise there. */}
            {!embedded && (
              <FilterBar
                groups={ORDER_FILTER_GROUPS}
                values={filterValues}
                onChange={(next) => { setFilterValues(next); setPage(1); }}
                previewCount={previewCount}
                searchPlaceholder="Party or number"
                title="Filter orders"
              />
            )}
            {/* One entry point, one dropdown — the order kind is an explicit choice in the menu
                (a "pre-order" is just a sales order saved as a draft). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New order <ChevronDown className="h-4 w-4 ml-1" /></Button>
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
        </CardHeader>
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
                  <th className="px-4 py-2 text-right" title="Still to collect (sales) or pay (purchase) — total minus settled">Outstanding</th>
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
                        <span className="text-xs capitalize text-muted-foreground">{r.order_type}</span>
                        {r.order_type === 'purchase' && r.three_way_match_status && (r.three_way_match_status === 'variance' || r.three_way_match_status === 'awaiting_bill') && (
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium ${MATCH_META[r.three_way_match_status].cls}`} title="3-way match status">
                            {MATCH_META[r.three_way_match_status].label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2"><span className={`text-xs ${statusTone(r.status)}`}>{ORDER_STATUS_LABEL[r.status]}</span></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{ORDER_PAYMENT_LABEL[r.payment_status]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(r.total), r.currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(() => {
                        const o = outstandingById.get(r.id);
                        if (o == null || o <= 0.005) return <span className="text-xs text-emerald-600">Settled</span>;
                        return <span className={r.order_type === 'sales' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-red-400 font-medium'}>{formatMoney(o, r.currency)}</span>;
                      })()}
                    </td>
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
  const [lineProdOpts, setLineProdOpts] = useState<Array<{ id: string; name: string; free?: number | null }>>([]);
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
      const prods = (data ?? []) as Array<{ id: string; name: string }>;
      // Surface free stock (on-hand − reserved) per result so availability is visible before picking.
      let freeByProduct = new Map<string, number>();
      if (isSales && prods.length) {
        const { data: wi } = await supabase.from('warehouse_items')
          .select('product_id, qty_on_hand, qty_reserved')
          .eq('workspace_id', workspaceId).in('product_id', prods.map((p) => p.id));
        for (const r of (wi ?? []) as any[]) {
          if (!r.product_id) continue;
          const free = (Number(r.qty_on_hand) || 0) - (Number(r.qty_reserved) || 0);
          freeByProduct.set(r.product_id, (freeByProduct.get(r.product_id) ?? 0) + free);
        }
      }
      setLineProdOpts(prods.map((p) => ({ ...p, free: isSales ? (freeByProduct.get(p.id) ?? 0) : null })));
    }, 200);
    return () => clearTimeout(t);
  }, [activeLine, items, open, isSales, workspaceId]);

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
        <DialogHeader><DialogTitle>{preset.draft ? 'New pre-order' : isSales ? 'New sales order' : 'New purchase order'}</DialogTitle><DialogDescription className="sr-only">Order form.</DialogDescription></DialogHeader>
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
                          <button key={p.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => pickProduct(i, p)}>
                            <span className="truncate">{p.name}</span>
                            {p.free != null && (
                              <span className={`shrink-0 text-[11px] tabular-nums ${p.free > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                {p.free > 0 ? `${p.free} free` : 'out of stock'}
                              </span>
                            )}
                          </button>
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
  // Bank accounts — used to label a payment row with the account name it moved through.
  const [bankAccounts, setBankAccounts] = useState<Awaited<ReturnType<typeof financeService.listBankAccounts>>>([]);
  // Order money splits cleanly by direction: money IN (from the customer) → RecordPaymentDialog;
  // money OUT (paying a supplier / any cost) → NewExpenseDialog (a supplier bill → Payables & P&L),
  // attached to the order + defaulted to the "Order" category. `expensePrefill` seeds it from a line/supplier.
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expensePrefill, setExpensePrefill] = useState<{ amount?: number; description?: string; categoryId?: string; supplier?: { companyId?: string | null; name?: string | null } } | null>(null);
  // Money-in modal (received / customer refund). `{ amount }` seeds it; null = closed.
  const [payInOpen, setPayInOpen] = useState<{ amount?: number } | null>(null);
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
    if (!orderId) { setOrder(null); setItems([]); setFin(null); setExpenseOpen(false); setPayInOpen(null); setListPrices(new Map()); setSupplierNames(new Map()); setSupplierPick(null); setSupExposure([]); setMatch(null); setApplicableCredit(0); return; }
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
  // Per-line "Mark as paid" — record a PAYMENT to this line's supplier (money out), NOT an expense.
  // Paying a supplier = money OUT = an expense (supplier bill → Payables & P&L), attached to this
  // order + defaulted to the "Order" category. All money-out on an order flows through this one form.
  // Per-line "Mark as paid": pre-fills the line cost + the line's supplier (operator adds one if absent).
  const openLinePayment = (it: { unit_cost: number | null; quantity: number; supplier_company_id: string | null }) => {
    const cost = it.unit_cost != null ? Math.round(Number(it.unit_cost) * Number(it.quantity) * 100) / 100 : 0;
    setExpensePrefill({
      amount: cost > 0 ? cost : undefined,
      description: `Order ${order?.order_number ?? order?.id.slice(0, 8) ?? ''} — supplier cost`,
      supplier: it.supplier_company_id ? { companyId: it.supplier_company_id, name: supplierNames.get(it.supplier_company_id) ?? null } : undefined,
    });
    setExpenseOpen(true);
  };

  // Pay a specific supplier straight from the "what we owe" rollup — same expense form, supplier + amount pre-filled.
  const openPaySupplier = (sup: { id: string; name: string }, owed: number) => {
    setExpensePrefill({
      amount: Math.round(Math.max(0, owed) * 100) / 100,
      description: `Order ${order?.order_number ?? order?.id.slice(0, 8) ?? ''} — ${sup.name}`,
      supplier: { companyId: sup.id, name: sup.name },
    });
    setExpenseOpen(true);
  };

  // How much of this order is settled, per the #280 allocation ledger (NOT `fin.received`, which only
  // sees cash tagged with `payments.order_id` and misses credit re-homed from an on-account payment).
  // Sales settle from money-in allocations, purchases from money-out. This mirrors
  // `recompute_order_payment_status`, so "outstanding" agrees with the order's payment_status.
  const orderSettled = () => (order?.order_type === 'sales' ? (fin?.settled_in ?? 0) : (fin?.settled_out ?? 0));

  // Settle this sales order from the customer's on-account credit — no new cash. Re-homes existing
  // "money in" onto the order (server-side, split-safe); the order flips to paid/partial via trigger.
  const applyCredit = async () => {
    if (!order) return;
    const outstanding = Math.max(0, Math.round((Number(order.total) - orderSettled()) * 100) / 100);
    const willApply = Math.min(applicableCredit, outstanding);
    if (willApply <= 0.005) return;
    if (!window.confirm(`Apply ${formatMoney(willApply, order.currency)} of ${order.customer_company_id || order.customer_contact_id ? 'this customer’s' : 'the'} account credit to this order? This settles the order from money the customer already paid — no cash moves. To record the cost of the goods, add an expense.`)) return;
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
          action_url: `/finance?tab=doc_orders&order=${order.id}`,
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
  const outstanding = order ? Math.max(0, Math.round((Number(order.total) - orderSettled()) * 100) / 100) : 0;
  const creditToApply = Math.min(applicableCredit, outstanding);
  // A sales order to a company (B2B) issues an invoice; to a bare contact (retail) a receipt.
  // myDATA finalises the exact document type at issue; this just labels the action correctly.
  const salesDocKind: 'invoice' | 'receipt' = order?.customer_company_id ? 'invoice' : 'receipt';
  // Remaining owed per supplier (from the what-we-owe rollup) → drives per-line "Mark paid" visibility:
  // once a line's supplier is fully settled, its "Mark paid" button hides (nothing left to pay).
  const supplierOwedById = new Map(supExposure.map((s) => [s.supplier_company_id, s.owed]));

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1400px] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Order {order?.order_number ?? order?.id.slice(0, 8)}</DialogTitle><DialogDescription className="sr-only">Order form.</DialogDescription></DialogHeader>
        {loading || !order ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Status + actions sit ON TOP of the products (then the document + totals below). */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-semibold capitalize ${order.order_type === 'sales' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>{order.order_type}</span>
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
                    {/* Money IN from the customer. */}
                    <DropdownMenuItem className="items-start" onClick={() => setPayInOpen({ amount: outstanding > 0.005 ? outstanding : undefined })}>
                      <ArrowDownLeft className="h-3.5 w-3.5 mr-2 mt-0.5 shrink-0 text-emerald-500" />
                      <span className="flex flex-col"><span>Record payment</span><span className="text-[10px] text-muted-foreground">Money received from the customer.</span></span>
                    </DropdownMenuItem>
                    {/* Money OUT — a supplier bill (Payables &amp; P&amp;L), attached to this order + "Order" category. */}
                    <DropdownMenuItem className="items-start" onClick={() => { setExpensePrefill({}); setExpenseOpen(true); }}>
                      <ArrowUpRight className="h-3.5 w-3.5 mr-2 mt-0.5 shrink-0 text-red-400" />
                      <span className="flex flex-col"><span>Add expense</span><span className="text-[10px] text-muted-foreground">Money out — pay a supplier / any cost for this order.</span></span>
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
                        <span className="inline-flex items-center gap-2">
                          <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5" onClick={() => setSupplierPick({ itemId: it.id, productId: it.product_id ?? null, label: it.description, currentId: it.supplier_company_id ?? null })}>
                            {supName ? <><Building2 className="h-2.5 w-2.5" /> {supName}</> : <><Plus className="h-2.5 w-2.5" /> supplier</>}
                          </button>
                          {/* Mark this line's cost as paid → records a supplier bill + payment on the order.
                              Hidden once the line's supplier is fully settled (owed ≤ 0 in the rollup). */}
                          {lineCost != null && lineCost > 0.005 && order.order_type === 'sales'
                            && !(it.supplier_company_id && (supplierOwedById.get(it.supplier_company_id) ?? 1) <= 0.005) && (
                            <button type="button" className="text-[10px] text-red-400 hover:text-foreground inline-flex items-center gap-0.5" title="Record a payment to this line's supplier" onClick={() => openLinePayment(it)}>
                              <Receipt className="h-2.5 w-2.5" /> Mark paid
                            </button>
                          )}
                        </span>
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
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    Net cash (in − out)
                    <span title="Cash in the bank now. It differs from Profit because part of the profit is still unpaid (customer / suppliers) and because VAT you've collected sits here until you remit it to the tax office.">ⓘ</span>
                  </div>
                  <div className={`text-sm font-semibold ${fin.profit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(fin.profit, order.currency)}</div>
                </div>
              </div>
            )}

            {/* The ladder — the middle rung between "profit earned" and "cash in bank". Makes the
                gap self-explaining (profit is earned on the sale; cash is only what's landed), so
                a profitable-but-uncollected order never reads as lost money. Sales only — payables
                already have the "Suppliers on this order" block below. */}
            {fin && order.order_type === 'sales' && orderMargin != null && (() => {
              const supplierOwed = supExposure.reduce((a, s) => a + Math.max(0, s.owed), 0);
              const hasGap = outstanding > 0.005 || supplierOwed > 0.005;
              if (!hasGap) return null;
              return (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
                  <div className="font-medium text-muted-foreground mb-1.5">Earned vs collected</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Margin earned (net)</span><span className={`tabular-nums ${orderMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{formatMoney(orderMargin, order.currency)}</span></div>
                  {outstanding > 0.005 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">— customer still to pay</span><span className="tabular-nums text-amber-600 dark:text-amber-400">{formatMoney(outstanding, order.currency)}</span></div>
                  )}
                  {supplierOwed > 0.005 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">— you still owe suppliers</span><span className="tabular-nums text-red-400">{formatMoney(supplierOwed, order.currency)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-border/50 pt-1 font-medium"><span>Cash in bank now</span><span className={`tabular-nums ${fin.profit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(fin.profit, order.currency)}</span></div>
                  <p className="text-[10px] text-muted-foreground pt-0.5">Profit is earned when you sell; cash is what's actually landed. The difference is unpaid balances plus VAT you're holding for the tax office — not lost money.</p>
                </div>
              );
            })()}

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
            {fin && (fin.payments.length > 0 || fin.creditApplied.length > 0) && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Payments &amp; expenses</div>
                {/* Credit re-homed onto this order from an on-account payment — no fresh cash, so it's
                    read-only here (to reverse it, un-apply from the source payment). Counts in Received. */}
                {fin.creditApplied.map((c) => (
                  <div key={c.allocation_id} className="flex items-start justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="min-w-0">
                      <span className="block truncate">
                        Applied from account credit
                        {c.counterparty_name && <span className="text-muted-foreground">{c.direction === 'in' ? ' · from ' : ' · to '}<span className="text-foreground/80">{c.counterparty_name}</span></span>}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{new Date(c.paid_at).toLocaleDateString()} · {c.direction === 'in' ? 'Payment' : 'Expense'} · account credit</span>
                    </span>
                    <span className={`tabular-nums shrink-0 ${c.direction === 'in' ? 'text-emerald-500' : 'text-red-400'}`}>{formatMoney(c.amount, c.currency)}</span>
                  </div>
                ))}
                {fin.payments.map((p) => {
                  const acctName = p.bank_account_id ? bankAccounts.find((a) => a.id === p.bank_account_id)?.name : null;
                  // Who the cash moved between: money-in came FROM the customer, money-out went TO the supplier.
                  const who = p.counterparty_name;
                  return (
                  <div key={p.id} className="flex items-start justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {p.reference || <span className="text-muted-foreground italic">No reason</span>}
                        {who
                          ? <span className="text-muted-foreground">{p.direction === 'in' ? ' · from ' : ' · to '}<span className="text-foreground/80">{who}</span></span>
                          : (p.direction === 'out' && <span className="text-muted-foreground italic"> · to (no supplier set)</span>)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()} · {p.direction === 'in' ? 'Payment' : 'Expense'}{p.method ? ` · ${paymentMethodLabel(p.method)}` : ''}{acctName ? ` · ${acctName}` : ''}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`tabular-nums ${p.direction === 'in' ? 'text-emerald-500' : 'text-red-400'}`}>{formatMoney(Number(p.amount), p.currency)}</span>
                      {/* Payment receipt (απόδειξη είσπραξης) — proof of money received, NOT a tax doc,
                          never sent to myDATA. Email it / copy a link / download the PDF. */}
                      <PaymentReceiptActions paymentId={p.id} direction={p.direction} className="border-r border-border/40 pr-1.5 mr-0.5" />
                      {/* Edit (modal) + Greek-law-correct delete/return — the SAME component used on the
                          party payments list, so editing a payment looks identical everywhere. */}
                      <PaymentRowActions
                        payment={{ ...p, workspace_id: order.workspace_id, allocations: [] } as unknown as PaymentWithAllocation}
                        workspaceId={order.workspace_id}
                        onChanged={() => { void load(order.id); onChanged(); }}
                      />
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
              Payments / Expenses above are real cash on this order (money received from the customer / paid out). Marking a catalog
              line delivered moves warehouse stock (sales out / purchase in) and auto-advances the status. The
              receipt/invoice is the separate Create document action.
            </p>

            {/* Order note — moved below payments to keep the top of the order clean. Captured when the
                order is placed; prints on the invoice + receipt. */}
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
    {/* All money-OUT on the order — supplier payment / cost — is a supplier bill (Payables & P&L),
        linked to this order + defaulted to the "Order" category. Opened blank (Record expense) or
        pre-filled from a line ("Mark as paid") / the what-we-owe rollup ("Pay"). */}
    {order && (
      <NewExpenseDialog
        workspaceId={order.workspace_id}
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        orderId={order.id}
        prefill={expensePrefill ?? undefined}
        onCreated={() => { setExpenseOpen(false); void load(order.id); onChanged(); }}
      />
    )}
    {/* Money IN from the customer — the standard Record Payment modal, attached to the order (settles
        its open invoice, or records order-tagged customer credit). Money out is NOT here (see above). */}
    {order && (
      <RecordPaymentDialog
        workspaceId={order.workspace_id}
        open={!!payInOpen}
        onOpenChange={(o) => { if (!o) setPayInOpen(null); }}
        orderId={order.id}
        initialCounterparty={{ companyId: order.customer_company_id, contactId: order.customer_contact_id }}
        defaultAmount={payInOpen?.amount}
        presetInvoiceId={(fin?.invoices ?? []).find((iv) => Number(iv.amount_due) > 0)?.id}
        issueDocLabel={(fin?.invoices.length ?? 0) === 0 ? `Also issue a ${salesDocKind} for this order` : undefined}
        onIssueDoc={createInvoice}
        onSaved={() => { setPayInOpen(null); void load(order.id); onChanged(); }}
      />
    )}
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
        <DialogHeader><DialogTitle>Supplier for “{label}”</DialogTitle><DialogDescription className="sr-only">Order form.</DialogDescription></DialogHeader>
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
