import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { round2 as r2 } from '@/utils/decimal';
import { vatOf } from '@/modules/finance/lib/vatMath';
import { MYDATA_EXEMPTION_CATEGORIES, mydataExemptionLabel } from '@/lib/mydataExemptionCategories';
import { suggestVatExemption, type ExemptionSuggestion, type SupplyKind } from '@/modules/finance/utils/vatExemptionRules';
import { Loader2, Plus, ShoppingCart, Coins, CalendarDays, Trash2, Search, Truck, Banknote, FileText, Receipt, PackageCheck, ChevronDown, MoreHorizontal, CheckCircle2, Pencil, Package, FileClock, Building2, ArrowDownLeft, ArrowUpRight, Send, AlertTriangle, RotateCcw, PackagePlus, Link2, Unlink, Layers, MessageSquare, ShieldCheck, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import { OrderCustomsCard } from '@/modules/finance/components/OrderCustomsCard';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useQuotaErrorHandler } from '@/hooks/useQuotaErrorHandler';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import {
  formatMoney, financeService, VAT_CATEGORIES,
  type PaymentWithAllocation, type PaymentMethod,
} from '@/modules/finance/services/financeService';
import {
  salesDocumentKindFor,
  salesDocumentKindReason,
  type BuyerIdentity,
  type SalesDocumentKind,
} from '@/modules/finance/utils/salesDocumentKind';
import { statusTone } from '@/modules/finance/utils/statusTone';
import { splitByVatRate, splitGrossLikeTotals } from '@/modules/finance/utils/vatSplit';
import { warehouseService } from '@/services/warehouseService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { OrderLinkPicker } from '@/modules/finance/components/OrderLinkPicker';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { LinkExpenseToOrderDialog } from '@/modules/finance/components/LinkExpenseToOrderDialog';
import { entityTemplatesService } from '@/services/entityTemplatesService';
import { buildOrderPrefill, type OrderPrefill } from '@/services/templates/registry';
import { SaveAsTemplateDialog } from '@/components/features/templates/SaveAsTemplateDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';
import { linkOrderToDocument } from '@/modules/finance/utils/inboundToOrder';
import { activeCover, customerAssetsService, warrantyEndDate, type OrderAssetRow, type WarrantyKind } from '@/services/customerAssetsService';
import { parseDecimal } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import { edgeErrorMessage } from '@/utils/edgeError';
import { flowEventService } from '@/services/flows/flowEventService';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { MoneyInput } from '@/components/core/ui/money-input';
import { TablePagination, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { FilterBar, type FilterGroupDef, type FilterValues } from '@/components/core/filters';
import { UNITS } from '@/lib/units';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import { PaymentRowActions } from '@/modules/finance/components/PaymentRowActions';
import { formatDate } from '@/utils/datetime';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL,
  type OrderType, type OrderStatus, type OrderPaymentStatus, type OrderListRow, type OrderItem, type Order,
  type ThreeWayMatch, type ThreeWayMatchStatus, type OrderLinkTarget, type OrderBalance,
} from '@/modules/finance/services/ordersService';
import { invoiceGenerationErrorMessage } from '@/modules/finance/utils/invoiceGateMessage';

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

// Units of measure for a line. Derived from the canonical list in src/lib/units.ts — never a
// local array, which is how 'item' here comes to disagree with quotes' 'pcs' and ingestion's 'sqm'.
const UNIT_OPTIONS: Array<{ code: string; label: string }> =
  UNITS.map((u) => ({ code: u.key, label: u.label }));
const DEFAULT_UNIT = 'pcs';

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
  /** Full derived settlement per order — outstanding AND the payment_status the ledger implies. */
  const [balanceById, setBalanceById] = useState<Map<string, OrderBalance | null>>(new Map());
  /** True when the settlement RPC failed. Unknown must never render as settled. */
  const [balancesFailed, setBalancesFailed] = useState(false);
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
  const navigate = useNavigate();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';

  useEffect(() => {
    if (!workspaceId) return;
    void financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
  }, [workspaceId]);

  const openCreate = (orderType: OrderType, draft: boolean) => { setCreatePreset({ orderType, draft }); setCreateOpen(true); };

  /**
   * Order template prefill (#322). Same reasoning as `reorderPrefill` right below: the template
   * fills the ordinary New-order form rather than inserting a row, so numbering, stock reservation,
   * three-way match and the order-created notification all still fire, and today's party and
   * prices are a decision rather than a copy.
   */
  const [templatePrefill, setTemplatePrefill] = useState<OrderPrefill | null>(null);

  // App Launcher deep-link: /finance?tab=doc_orders&new=order opens the New (sales) order flow;
  // `&template=<id>` seeds it from a saved order template.
  // Only in the standalone finance list — never when embedded in a project/party tab.
  useEffect(() => {
    if (embedded) return;
    if (searchParams.get('new') !== 'order') return;
    const templateId = searchParams.get('template');
    const p = new URLSearchParams(searchParams);
    p.delete('new');
    p.delete('template');
    setSearchParams(p, { replace: true });

    if (!templateId) {
      setTemplatePrefill(null);
      setCreatePreset({ orderType: 'sales', draft: false });
      setCreateOpen(true);
      return;
    }
    void (async () => {
      let pre: OrderPrefill | null = null;
      try {
        const tpl = await entityTemplatesService.get(templateId);
        pre = tpl ? await buildOrderPrefill(tpl.payload as never) : null;
      } catch {
        // A template that will not load must not block raising an order by hand.
        pre = null;
      }
      setTemplatePrefill(pre);
      setCreatePreset({ orderType: pre?.orderType ?? 'sales', draft: false });
      setCreateOpen(true);
    })();
  }, [embedded, searchParams, setSearchParams]);

  // Deep-link `?tab=doc_orders&order=<id>`: orders have their own page, so forward there instead
  // of opening a modal over the list. Notification action_urls stored in the DB carry this shape,
  // so the redirect has to stay for them to keep working.
  useEffect(() => {
    if (embedded) return;
    const target = searchParams.get('order');
    if (!target) return;
    navigate(`${financeBase}/orders/${target}`, { replace: true });
  }, [embedded, searchParams, navigate, financeBase]);

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
      // Outstanding for just this page — one batched query. The figure is derived in SQL by
      // `get_order_settlements` (the same definition behind the payment badge), so this row can
      // never show "Paid" next to a non-zero balance again.
      try {
        const balances = await ordersService.orderBalances(res.rows.map((r) => r.id));
        // Keep the WHOLE balance. `payment_status` is derived by the same SQL that derives
        // `outstanding`, and it was being fetched and thrown away while the Payment column
        // rendered the CACHED orders.payment_status beside it — the exact 'Paid next to a
        // non-zero Outstanding' condition finance.order_payment_status_drift exists to detect.
        setBalanceById(new Map(res.rows.map((r) => [r.id, balances.get(r.id) ?? null] as const)));
        setBalancesFailed(false);
      } catch (balErr) {
        // NEVER map unknown to zero. The cell below treated a missing entry the same as a
        // settled one, so a single failed RPC — an RLS change, a timeout, a bad id batch —
        // rendered EVERY order green 'Settled' with no error at all, and the collections
        // worklist reported the whole ledger as collected.
        setBalanceById(new Map());
        setBalancesFailed(true);
        console.error('[OrdersPanel] orderBalances failed — outstanding is unknown, not zero:', balErr);
      }
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

  // A different party/project scope is a different result set — start it at the first page, and
  // drop any open order with it (this panel is embedded in the CRM party pages, so following the
  // detail modal's party link swaps the scope underneath an otherwise still-open modal).
  useEffect(() => { setPage(1); setOpenId(null); }, [companyId, contactId, projectId]);

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
          <CardTitle className="flex items-center gap-2">
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
                  <tr
                    key={r.id}
                    className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                    // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                    // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                    // row is invalid ARIA and yields a focus stop with no name.
                    onClick={() => setOpenId(r.id)}
                  >
                    <td className="px-4 py-2 font-mono text-xs">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.order_number ?? r.id.slice(0, 8)}</button>
                    </td>
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
                    {/* The DERIVED payment status, not the cached orders.payment_status column —
                        the derived one was already in hand and discarded. */}
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {balancesFailed
                        ? <span title="Settlement could not be loaded">—</span>
                        : ORDER_PAYMENT_LABEL[(balanceById.get(r.id)?.payment_status ?? r.payment_status) as keyof typeof ORDER_PAYMENT_LABEL]}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(r.total), r.currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(() => {
                        // Unknown is not settled (F2), a cancelled order is not debt (F24), and a
                        // NEGATIVE outstanding is an over-payment that get_order_settlements
                        // deliberately returns and both screens used to hide (F21).
                        if (balancesFailed) {
                          return <span className="text-xs text-muted-foreground" title="Could not load settlement — this is NOT a statement that the order is settled">—</span>;
                        }
                        const bal = balanceById.get(r.id);
                        const o = bal?.outstanding;
                        if (o == null) {
                          return <span className="text-xs text-muted-foreground" title="No settlement figure for this order">—</span>;
                        }
                        if (r.status === 'cancelled') {
                          return <span className="text-xs text-muted-foreground" title="Cancelled — not collectable">—</span>;
                        }
                        if (o < -0.005) {
                          return <span className="text-xs font-medium text-purple-600 dark:text-purple-400" title="More has been settled than this order is worth">Overpaid {formatMoney(Math.abs(o), r.currency)}</span>;
                        }
                        if (o <= 0.005) return <span className="text-xs text-emerald-600">Settled</span>;
                        return <span className={r.order_type === 'sales' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-red-400 font-medium'}>{formatMoney(o, r.currency)}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{formatDate(r.created_at)}</td>
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
        // `vat_percent` → the form's `vat_code` happens here, where VAT_CATEGORIES lives; the
        // template adapter deliberately does not carry a second copy of that vocabulary.
        prefill={templatePrefill ? {
          currency: templatePrefill.currency,
          notes: templatePrefill.notes,
          lines: templatePrefill.lines.map(({ vat_percent, ...rest }) => ({ ...rest, vat_code: vatCodeOf(vat_percent) })),
        } : undefined}
        categories={categories}
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setTemplatePrefill(null); }}
        onCreated={() => { setCreateOpen(false); setTemplatePrefill(null); void load(); }}
      />
      <OrderDetailDialog orderId={openId} categories={categories} open={openId !== null} onClose={() => setOpenId(null)} onChanged={() => void load()} onOpenOrder={(id) => setOpenId(id)} />
    </div>
  );
};

// ---------------------------------------------------------------------------

export type Line = { product_id?: string | null; description: string; quantity: number; unit_price: number; unit_cost: number | null; unit_code: string; vat_code: string; available?: number | null; supplier_company_id?: string | null };
const blankLine = (): Line => ({ description: '', quantity: 1, unit_price: 0, unit_cost: null, unit_code: DEFAULT_UNIT, vat_code: DEFAULT_VAT_CODE, available: null, supplier_company_id: null });


export const NewOrderModal: React.FC<{
  workspaceId: string;
  /** When the modal is opened from inside a CRM party, that party is pre-selected and locked. */
  lockedCompanyId?: string;
  lockedContactId?: string;
  /** Chosen from the New-order dropdown: sell vs buy + draft (pre-order) vs confirmed. */
  preset: { orderType: OrderType; draft: boolean };
  /**
   * Seed the form from a document that already describes the order — today a myDATA received
   * document, whose lines ARE what the supplier says we bought.
   *
   * With `fromDocument`, the figures are the supplier's and the form stops pretending otherwise:
   * quantity, price, unit and VAT are read-only and lines can be neither added nor removed —
   * composing a different order here would just make the order disagree with the document that
   * is its own evidence. The ONE edit that stays is linking a line to a catalog product, because
   * `product_id` is what lets the goods reach the warehouse: `receive_order_into_warehouse`
   * cannot stock a line without one.
   */
  prefill?: {
    currency?: string | null;
    notes?: string | null;
    /** `original_unit_price`/`original_unit_cost` (set when re-ordering) let the form offer the
     *  source order's figures back — the one thing the old separate "Duplicate order" action did. */
    lines?: Array<Partial<Line> & { description: string; original_unit_price?: number; original_unit_cost?: number | null }>;
    /** Lock the figures to the source document (see above). */
    fromDocument?: boolean;
    /** Source myDATA document — its AI line→stock matches pre-select the product pickers. */
    inboundDocumentId?: string;
  };
  categories: FinanceCategory[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Receives the new order's id, so a caller can link it to the record it came from. */
  onCreated: (orderId: string) => void;
}> = ({ workspaceId, lockedCompanyId, lockedContactId, preset, prefill, categories, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const orderType = preset.orderType;
  const [party, setParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [partyOpts, setPartyOpts] = useState<Party[]>([]);
  const [items, setItems] = useState<Line[]>([blankLine()]);
  // Per-line product lookup — the Description field IS a catalog search.
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [lineProdOpts, setLineProdOpts] = useState<Array<{ id: string; name: string; free?: number | null; outsideCatalog?: boolean }>>([]);
  // What this order is FOR — a project, a customer (new or existing order), or an existing order of
  // the same kind to merge into. One field; `save` resolves it.
  const [link, setLink] = useState<OrderLinkTarget>({ kind: 'none' });
  const [currency, setCurrency] = useState('EUR');
  const [categoryId, setCategoryId] = useState('none');
  const [expectedDate, setExpectedDate] = useState('');
  // Order note from whoever places the order (e.g. delivery/pickup instructions). Prints on the
  // invoice + payment receipt and is visible on the order in the backend.
  const [notes, setNotes] = useState('');
  // Order-level discount off the net — a % or a flat cash amount (applied proportionally so VAT stays exact).
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');

  // Seeded from a supplier's document: its figures are evidence, so they are shown, not edited.
  const locked = !!prefill?.fromDocument;
  /** Re-order pricing: today's resolved prices (default) or the ones the source order carried.
   *  One control, not a separate "Duplicate order" menu item. */
  const [pricingMode, setPricingMode] = useState<'today' | 'original'>('today');
  const repricedLines = useMemo(
    () => (prefill?.lines ?? []).filter((l) => l.original_unit_price != null && Math.abs(Number(l.unit_price ?? 0) - Number(l.original_unit_price)) > 0.005),
    [prefill?.lines],
  );
  /**
   * Stable signature of the prefill's CONTENT, used as the reset effect's dependency.
   *
   * Both call sites pass an inline object literal, so `prefill` itself is a new reference on every
   * parent render — depending on it made the form reset while the operator was typing in it.
   */
  const prefillKey = useMemo(
    () => (prefill ? JSON.stringify({
      c: prefill.currency ?? null,
      n: prefill.notes ?? null,
      d: prefill.fromDocument ?? false,
      i: prefill.inboundDocumentId ?? null,
      l: (prefill.lines ?? []).map((l) => [l.description, l.product_id ?? null, l.quantity ?? null, l.unit_price ?? null, l.unit_cost ?? null]),
    }) : ''),
    [prefill],
  );
  const applyPricingMode = (mode: 'today' | 'original') => {
    setPricingMode(mode);
    const src = prefill?.lines ?? [];
    // Matched on a STABLE key, not array index. The re-order form allows add and remove, so after
    // deleting or inserting a line the index mapping wrote the wrong source line's price and cost
    // onto every line below it — under an affordance that promises the original figures.
    const keyOf = (l: { product_id?: string | null; description?: string }) =>
      `${l.product_id ?? ''}::${(l.description ?? '').trim().toLowerCase()}`;
    const byKey = new Map<string, typeof src[number]>();
    for (const sl of src) if (!byKey.has(keyOf(sl))) byKey.set(keyOf(sl), sl);
    setItems((ls) => ls.map((l) => {
      const s = byKey.get(keyOf(l));
      if (!s || s.original_unit_price == null) return l;
      return mode === 'original'
        ? { ...l, unit_price: Number(s.original_unit_price), unit_cost: s.original_unit_cost ?? l.unit_cost }
        : { ...l, unit_price: Number(s.unit_price ?? l.unit_price), unit_cost: s.unit_cost ?? l.unit_cost };
    }));
  };
  /** Locked mode searches the catalog from its own box, since the description is no longer typed. */
  const [linkSearch, setLinkSearch] = useState('');
  /** Catalog name per linked line — the line keeps the SUPPLIER's wording, so the match is shown
   *  alongside it rather than replacing it. */
  const [linkedNames, setLinkedNames] = useState<Record<number, string>>({});
  // Goods on a received document have already arrived, so receiving is the default, not an
  // afterthought — otherwise the order exists and the stock silently doesn't.
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [receiveNow, setReceiveNow] = useState(true);
  // A supplier's document is often already paid by the time it reaches the Inbox, so settling it
  // is a tick on the form that books it — not a second trip through a second dialog. Same shape
  // as NewExpenseDialog's "Paid now": OFF leaves an open payable in AP.
  const [paidNow, setPaidNow] = useState(false);
  const [payBankAccountId, setPayBankAccountId] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');

  const isSales = orderType === 'sales';
  // Sales orders are income, purchase orders are expense — offer the matching category kinds.
  const catOptions = categories.filter((c) => c.kind === (isSales ? 'income' : 'expense') || c.kind === 'both');

  // A received document is not always a purchase of its own: freight, customs and an installer are
  // costs OF a purchase already recorded. Those get booked ON that order — one field decides which
  // it is, instead of a second menu entry the operator has to know about before opening this form.
  // Only offered where the answer can actually be written: the expense lives on the document.
  const costOfPossible = locked && !isSales && !!prefill?.inboundDocumentId;
  const attachingToOrder = link.kind === 'cost_of_order';

  // A merge target was found FOR a specific party and currency. Change either and it is no longer a
  // legal target — the RPC would reject it on save, but silently keeping a stale chip on screen
  // would make that look like a bug rather than the consequence of the edit.
  useEffect(() => {
    setLink((cur) => (cur.kind === 'merge_order' ? { kind: 'none' } : cur));
  }, [party?.id, party?.type, currency]);

  useEffect(() => {
    if (!open) return;
    setParty(null); setPartySearch(''); setPartyOpts([]); setActiveLine(null); setLineProdOpts([]);
    setLink({ kind: 'none' }); setCurrency('EUR');
    setCategoryId('none'); setExpectedDate('');
    setDiscountType('percent'); setDiscountValue('');
    setCurrency(prefill?.currency || 'EUR');
    setNotes(prefill?.notes || '');
    setItems(prefill?.lines?.length
      ? prefill.lines.map((l) => ({ ...blankLine(), ...l }))
      : [blankLine()]);
    setPricingMode('today');
    setLinkSearch(''); setLinkedNames({}); setReceiveNow(true); setWarehouseId('');
    setPaidNow(false); setPayBankAccountId(''); setPayMethod('bank_transfer');

    // Where the goods land. Only purchase orders stock anything, so don't ask on a sales order.
    if (!isSales) {
      void supabase.from('warehouses').select('id, name, is_default')
        .eq('workspace_id', workspaceId).order('is_default', { ascending: false }).order('name')
        .then(({ data }) => {
          const rows = (data ?? []) as Array<{ id: string; name: string; is_default: boolean }>;
          setWarehouses(rows);
          setWarehouseId(rows.find((w) => w.is_default)?.id ?? rows[0]?.id ?? '');
        });
    }

    // Pre-link each supplier line to stock we already carry. This reuses the matches the inbound
    // sync already produced (`warehouse_pending_items`, matched by `match_pending_items_for_document`)
    // rather than running a second, differently-behaved matcher here.
    const docId = prefill?.inboundDocumentId;
    if (docId) {
      void supabase.from('warehouse_pending_items')
        .select('line_index, matched_product_id, name')
        .eq('inbound_document_id', docId)
        .not('matched_product_id', 'is', null)
        .then(({ data }) => {
          const rows = (data ?? []) as Array<{ line_index: number; matched_product_id: string; name: string | null }>;
          if (rows.length === 0) return;
          setItems((ls) => ls.map((l, i) => {
            const m = rows.find((r) => r.line_index === i);
            return m ? { ...l, product_id: m.matched_product_id } : l;
          }));
          setLinkedNames(Object.fromEntries(rows.map((r) => [r.line_index, r.name ?? 'Matched product'])));
        });
    }
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
    // `prefill` is passed as an INLINE OBJECT LITERAL at both call sites, so its identity changes
    // on every render of the parent — any re-render of OrderDetailDialog while this form was open
    // re-ran the reset and silently wiped items, currency, notes, category, expected date, pricing
    // mode and every catalog link. Keyed on a stable signature of the prefill's CONTENT instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedCompanyId, lockedContactId, prefillKey, isSales, workspaceId]);

  // CRM party search — by name, VAT, or email (companies + contacts).
  useEffect(() => {
    if (!open) return;
    const term = partySearch.trim();
    if (term.length < 2) { setPartyOpts([]); return; }
    const like = foldedLike(term);
    const t = setTimeout(async () => {
      // Same role and workspace filters the per-LINE SupplierPickerDialog applies (and tells the
      // user about). Without them a purchase order could be raised against a company the line-level
      // picker then refuses to offer — the on-screen rule contradicting itself — and the search
      // reached across every workspace's CRM.
      let companyQ = supabase.from('crm_companies').select('id, name, vat_number, email')
        .eq('workspace_id', workspaceId)
        .ilike(CRM_SEARCH_COLUMN, like).limit(8);
      let contactQ = supabase.from('crm_contacts').select('id, name, vat_number, email')
        .eq('workspace_id', workspaceId)
        .ilike(CRM_SEARCH_COLUMN, like).limit(8);
      if (!isSales) {
        companyQ = companyQ.eq('is_supplier', true);
        contactQ = contactQ.eq('is_supplier', true);
      }
      const [c, p] = await Promise.all([companyQ, contactQ]);
      const opts: Party[] = [];
      for (const r of (c.data ?? []) as any[]) opts.push({ type: 'company', id: r.id, name: r.name, vat: r.vat_number, sub: [r.vat_number ? `VAT ${r.vat_number}` : null, r.email, 'Company'].filter(Boolean).join(' · ') });
      for (const r of (p.data ?? []) as any[]) opts.push({ type: 'contact', id: r.id, name: r.name, vat: r.vat_number, sub: [r.vat_number ? `VAT ${r.vat_number}` : null, r.email, 'Contact'].filter(Boolean).join(' · ') });
      setPartyOpts(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [partySearch, open, isSales, workspaceId]);

  // Per-line product lookup — typing in a line's Description searches the catalog.
  useEffect(() => {
    if (!open || activeLine === null) return;
    // Locked lines aren't typed into — the supplier's wording stays put — so the search term
    // comes from the line's own "link a product" box instead of its description.
    const term = (locked ? linkSearch : (items[activeLine]?.description ?? '')).trim();
    if (term.length < 2) { setLineProdOpts([]); return; }
    const t = setTimeout(async () => {
      // Scope to the party's OWN catalog when the order is for a company: `brand_company_id` is
      // the single source of truth for "this company supplies this product" (ingestion stamps it
      // via resolve_brand_company; it is what the supplier's Products tab lists). Ordering from a
      // supplier should search what THEY supply, not the whole catalog.
      // Also workspace-scoped — this query had no workspace filter at all and leaned entirely on
      // RLS to avoid offering another tenant's products.
      let q = supabase.from('products').select('id, name')
        .eq('workspace_id', workspaceId)
        .ilike('name', `%${term}%`)
        .limit(8);
      if (party?.type === 'company') q = q.eq('brand_company_id', party.id);
      let { data } = await q;
      let outsideCatalog = false;
      // If they have nothing marked under them, don't strand the operator with an empty box —
      // widen to the workspace catalog and SAY the result isn't theirs. Scoping should focus the
      // search, not make a line impossible to add for a supplier whose catalog isn't stamped yet.
      if (party?.type === 'company' && (data ?? []).length === 0) {
        const wide = await supabase.from('products').select('id, name')
          .eq('workspace_id', workspaceId).ilike('name', `%${term}%`).limit(8);
        data = wide.data;
        outsideCatalog = (data ?? []).length > 0;
      }
      const prods = (data ?? []).map((p: any) => ({ ...p, outsideCatalog })) as Array<{ id: string; name: string; outsideCatalog?: boolean }>;
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
    // Depends on the DESCRIPTION of the active line, not on the whole `items` array.
    // `setItem` replaces the array on every field edit, so depending on `items` re-ran this on
    // every keystroke in quantity, price, cost, unit or VAT — each run issuing 1–3 Supabase
    // queries (products, the widened products retry, warehouse_items) for a search term that had
    // not changed. Editing a quantity should not search the catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine, items[activeLine ?? -1]?.description, open, isSales, workspaceId, party?.type, party?.id, locked, linkSearch]);

  const setItem = (i: number, patch: Partial<Line>) => setItems((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setItems((ls) => [...ls, blankLine()]);
  const removeLine = (i: number) => setItems((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);
  const pickProduct = async (i: number, p: { id: string; name: string }) => {
    if (locked) {
      // Link only. The document's description, quantity, price, unit and VAT are the supplier's
      // statement of what we bought — resolving catalog pricing over them would make the order
      // contradict its own evidence. All this needs to do is give the line a product_id so the
      // goods can reach the warehouse.
      setItem(i, { product_id: p.id });
      setLinkedNames((m) => ({ ...m, [i]: p.name }));
      setActiveLine(null); setLineProdOpts([]); setLinkSearch('');
      return;
    }
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
  const discCalc = items.map((l) => {
    const net = r2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 - effDiscountPct / 100));
    return { net, vat: vatOf(net, pctOf(l.vat_code)) };
  });
  const netTotal = r2(discCalc.reduce((a, c) => a + c.net, 0));
  const vatTotal = r2(discCalc.reduce((a, c) => a + c.vat, 0));
  const grossTotal = r2(netTotal + vatTotal);
  const discountAmount = r2(r2(rawNet) - netTotal);
  // Margin = revenue − cost across lines that carry a cost. null when no line has cost yet. The
  // discount reduces revenue, so it reduces margin by the same net amount.
  // Same definition the saved order uses: post-discount line net minus cost x qty. Subtracting
  // `discountAmount` from a PRE-discount margin produced the same number only when the discount
  // was order-level — with per-line discounts the figure quoted at creation changed once the order
  // was saved and reopened.
  const anyCost = items.some((l) => l.unit_cost != null);
  const marginTotal = anyCost
    ? r2(discCalc.reduce((a, c, i) => a + c.net - ((Number(items[i]?.unit_cost) || 0) * (Number(items[i]?.quantity) || 0)), 0))
    : null;

  // status: 'draft' = pre-order (not yet committed); 'confirmed' = a live order.
  const save = async (status: OrderStatus) => {
    // ── A cost OF an order that already exists ───────────────────────────────────────────────
    // Nothing is created here: the document becomes an expense (or reuses the one it already
    // became) and that expense carries `order_id`. Handled before every other check because none
    // of them apply — no order is raised, so it needs no party, no lines and no stock. Raising one
    // anyway would invent a second purchase for a cost that already has one and double-count it.
    if (link.kind === 'cost_of_order' && prefill?.inboundDocumentId) {
      setBusy(true);
      try {
        const billId = await linkOrderToDocument({ id: prefill.inboundDocumentId }, link.orderId);
        let moneyNote: string | undefined;
        if (paidNow) {
          await financeService.paySupplierBill({
            workspaceId,
            supplierBillId: billId,
            amount: grossTotal,
            method: payMethod,
            paidAt: new Date().toISOString(),
            bankAccountId: payBankAccountId || null,
            categoryId: categoryId === 'none' ? null : categoryId,
          });
          moneyNote = 'Expense settled.';
        }
        toast({
          title: `Added to ${link.label}`,
          description: ['This cost now counts on that order.', moneyNote].filter(Boolean).join(' '),
        });
        onCreated(link.orderId);
      } catch (err: any) {
        toast({ title: 'Could not add it to the order', description: err?.message, variant: 'destructive' });
      } finally { setBusy(false); }
      return;
    }
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
      const lineItems = clean.map((it) => ({
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
      }));

      // MERGE is the one branch that creates nothing: the lines join an order that already exists,
      // so there is no new order to stock, invoice or notify about. It returns early rather than
      // falling through — a merge that also created an order would double-count the whole purchase.
      if (link.kind === 'merge_order') {
        const merged = await ordersService.appendItems({
          orderId: link.orderId, items: lineItems,
          expectOrderType: link.orderType, expectCurrency: currency,
        });
        if (!merged.ok) {
          toast({ title: 'Could not merge', description: merged.message, variant: 'destructive' });
          return;
        }
        toast({
          title: `Added to ${merged.order_number ?? 'the order'}`,
          description: `${merged.appended} line(s) merged into the existing order.`,
        });
        onCreated(link.orderId);
        return;
      }

      // "For this customer" with no order yet: raise theirs FIRST, so the purchase can point at it.
      // Priced through the pricing resolver, not marked up by a number invented here.
      let coversOrderId: string | null = link.kind === 'sales_order' ? link.orderId : null;
      let linkNote: string | undefined;
      if (link.kind === 'customer') {
        const mirrored = await ordersService.mirrorLinesForSale({
          workspaceId, items: lineItems,
          companyId: link.party.party_type === 'company' ? link.party.id : null,
          contactId: link.party.party_type === 'contact' ? link.party.id : null,
          // We are recording the purchase in the same breath, so who supplies the customer's
          // lines is not a question anyone should have to answer again on the sale.
          supplierCompanyId: !isSales ? coId : null,
        });
        coversOrderId = await ordersService.create({
          workspaceId,
          orderType: 'sales',
          status: 'draft',
          currency,
          customerCompanyId: link.party.party_type === 'company' ? link.party.id : null,
          customerContactId: link.party.party_type === 'contact' ? link.party.id : null,
          notes: `Raised alongside a purchase for ${party.name}.`,
          items: mirrored.items,
        });
        linkNote = mirrored.unpriced.length
          ? `Customer order drafted — ${mirrored.unpriced.length} line(s) had no catalog price and carry cost: ${mirrored.unpriced.slice(0, 3).join(', ')}.`
          : 'Customer order drafted at their selling price.';
      }

      const projectId = link.kind === 'project'
        ? link.projectId
        // A sales order already knows its project; inheriting it keeps the purchase reported under
        // the same job rather than floating unattributed. Same thing raise_cover_purchase_orders does.
        : (link.kind === 'sales_order' ? link.projectId : null);

      const orderId = await ordersService.create({
        workspaceId,
        orderType,
        status,
        currency,
        projectId,
        coversOrderId,
        categoryId: categoryId === 'none' ? null : categoryId,
        expectedPaymentDate: expectedDate || null,
        discountType: isSales && dv > 0 ? discountType : null,
        discountValue: isSales && dv > 0 ? dv : 0,
        notes: notes.trim() || null,
        customerCompanyId: isSales ? coId : null,
        customerContactId: isSales ? ctId : null,
        supplierCompanyId: !isSales ? coId : null,
        supplierContactId: !isSales ? ctId : null,
        items: lineItems,
      });
      // Bought for a sale that already existed: it has lines of its own that nothing mirrored, so
      // the supplier crosses by stamp instead. (The 'customer' branch above mirrored the lines and
      // carried the supplier with them, so there is nothing left to fill.) Best-effort — the order
      // is committed and must not report failure because a courtesy stamp did not land.
      if (coversOrderId && link.kind === 'sales_order') {
        await ordersService.stampLineSuppliersFromCover(coversOrderId).catch(() => 0);
      }
      // The goods on a received document already arrived, so stock them as part of creating the
      // order. Best-effort: a receipt failure must not lose the order that was just created —
      // it stays receivable from the order itself.
      let stockNote: string | undefined;
      if (locked && !isSales && receiveNow && status !== 'draft') {
        try {
          const { data: rec, error: recErr } = await supabase.rpc('receive_order_into_warehouse', {
            p_order: orderId, ...(warehouseId ? { p_warehouse: warehouseId } : {}),
          });
          if (recErr) throw recErr;
          const r = (rec ?? {}) as { received?: number; skipped?: number };
          stockNote = Number(r.skipped ?? 0) > 0
            ? `${r.received ?? 0} line(s) stocked · ${r.skipped} skipped with no catalog product.`
            : `${r.received ?? 0} line(s) added to stock.`;
        } catch (recErr: any) {
          stockNote = `Order saved, but receiving into the warehouse failed: ${recErr?.message ?? 'unknown error'}. Receive it from the order.`;
        }
      }
      // A document-seeded purchase is one act with three consequences: the ORDER records what was
      // bought, the EXPENSE records what is owed for it, and — if it is already settled — the
      // PAYMENT records the cash. All three happen HERE, in that order — copy the linking into
      // each caller after the fact, or send paying through a separate dialog, and a document ends
      // up paid with no order behind it.
      let moneyNote: string | undefined;
      if (prefill?.inboundDocumentId) {
        try {
          // Idempotent: an existing bill for the document is returned rather than duplicated.
          const billId = await linkOrderToDocument({ id: prefill.inboundDocumentId }, orderId);
          if (paidNow && status !== 'draft') {
            // Pay what the BILL says, not what this form recomputed.
            // The bill is created from the DOCUMENT by inbound_doc_to_supplier_bill, while
            // `grossTotal` is recomputed from the form's lines — and orderLinesFromDoc rounds
            // net/qty per line and defaults vat_code to 24% when myDATA omits vat_category, so the
            // two disagree. When the form total came out higher, record_payment_fx raised
            // 'over-allocation' and the error was reported INSIDE a success-titled 'Order created'
            // toast; when lower, the bill was left permanently part-paid.
            const { data: billRow } = await supabase.from('supplier_bills')
              .select('amount_due, total').eq('id', billId).maybeSingle();
            const payable = Number((billRow as any)?.amount_due ?? (billRow as any)?.total ?? grossTotal);
            await financeService.paySupplierBill({
              workspaceId,
              supplierBillId: billId,
              amount: payable,
              method: payMethod,
              paidAt: new Date().toISOString(),
              bankAccountId: payBankAccountId || null,
              categoryId: categoryId === 'none' ? null : categoryId,
            });
            moneyNote = 'Expense settled.';
          }
        } catch (linkErr: any) {
          moneyNote = `Order created, but the expense step failed: ${linkErr?.message ?? 'unknown error'}.`;
        }
      }
      // A failed expense/payment step is not a success. Append it to a toast titled 'Order
      // created' and an over-allocation error reads as part of the good news.
      const partialFailure = !!(moneyNote?.includes('failed') || stockNote?.includes('failed'));
      toast({
        title: partialFailure
          ? (status === 'draft' ? 'Pre-order saved — with problems' : 'Order created — with problems')
          : (status === 'draft' ? 'Pre-order saved' : 'Order created'),
        variant: partialFailure ? 'destructive' : undefined,
        description: [linkNote, stockNote, moneyNote].filter(Boolean).join(' ') || undefined,
      });
      onCreated(orderId);
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
            {/* One field for "what is this for?". A project, a customer (raising or attaching their
                order), an existing order of the same kind to merge these lines into, or — for a
                document-seeded cost that RIDES ALONG with a purchase already recorded (freight,
                customs, an installer) — that order, which then gains this as an expense instead of
                a second order being invented for it. Merge candidates need the counterparty, so
                they only appear once a party is chosen; a document-seeded order is never a merge
                source, because its lines are evidence for the document that produced it and must
                stay on their own order. */}
            <OrderLinkPicker
              workspaceId={workspaceId}
              value={link}
              onChange={setLink}
              orderType={orderType}
              partyCompanyId={party?.type === 'company' ? party.id : null}
              partyContactId={party?.type === 'contact' ? party.id : null}
              currency={currency}
              allowCustomer={!isSales}
              allowMerge={!locked && !!party}
              allowCostOf={costOfPossible}
              label="What is this for? (optional)"
              hint={attachingToOrder ? (
                <p className="text-[11px] text-muted-foreground">
                  Nothing new is created: this document becomes an expense on that order. Its own
                  lines and totals stay exactly as the supplier stated them.
                </p>
              ) : undefined}
            />
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
              {/* A PURCHASE pre-order ages in Payables, not Receivables — this named Receivables
                  regardless of order type; the detail version already gets it right. */}
              {preset.draft && expectedDate && (
                <p className="text-[11px] text-amber-600">Pre-orders age in {orderType === 'purchase' ? 'Payables' : 'Receivables'} only after a deposit is recorded.</p>
              )}
            </div>
          </div>

          {/* Ordering again: the copy carries today's prices by default, and this puts the source
              order's prices one click away. Shown only when the two actually differ — an unchanged
              catalog would otherwise offer a choice with no difference behind it. */}
          {repricedLines.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <span className="text-xs font-medium">Prices</span>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant={pricingMode === 'today' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => applyPricingMode('today')}>Today’s</Button>
                <Button type="button" size="sm" variant={pricingMode === 'original' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => applyPricingMode('original')}>As originally ordered</Button>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {repricedLines.length} line(s) priced differently today
                {repricedLines.slice(0, 2).map((l) => ` · ${l.description}: ${formatMoney(Number(l.original_unit_price), currency)} → ${formatMoney(Number(l.unit_price ?? 0), currency)}`).join('')}
                {repricedLines.length > 2 ? ` · +${repricedLines.length - 2} more` : ''}
              </span>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              {/* No "add a product" when the document defines the order — anything typed in here
                  was not on the supplier's document and does not belong on this order. */}
              {!locked && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> New product</Button>
              )}
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
                    {locked ? (
                      <div className="py-0.5">
                        {/* The supplier's own wording — shown, never edited. */}
                        <div className="truncate text-sm" title={l.description}>{l.description}</div>
                        {l.product_id ? (
                          <button type="button" className="text-[10px] text-emerald-600 hover:underline"
                            onClick={() => { setItem(i, { product_id: null }); setLinkedNames((m) => { const n = { ...m }; delete n[i]; return n; }); }}>
                            → {linkedNames[i] ?? 'linked to catalog'} · unlink
                          </button>
                        ) : activeLine === i ? (
                          <Input autoFocus className="h-7 mt-0.5 text-xs" value={linkSearch}
                            onChange={(e) => setLinkSearch(e.target.value)}
                            onBlur={() => window.setTimeout(() => { setActiveLine((a) => (a === i ? null : a)); }, 150)}
                            placeholder="Search the catalog…" />
                        ) : (
                          // Without a product this line cannot be stocked, so the gap is stated
                          // here rather than discovered as a silent no-op at receiving time.
                          <button type="button" className="text-[10px] text-amber-600 hover:underline"
                            onClick={() => { setActiveLine(i); setLinkSearch(''); }}>
                            not in catalog — link a product to stock it
                          </button>
                        )}
                      </div>
                    ) : (
                    <Input className="h-8 text-sm" value={l.description}
                      onChange={(e) => { setItem(i, { description: e.target.value, product_id: null }); setActiveLine(i); }}
                      onFocus={() => setActiveLine(i)}
                      placeholder="Search a product or type a new one…" />
                    )}
                    {activeLine === i && lineProdOpts.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                        {lineProdOpts.map((p) => (
                          <button key={p.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => pickProduct(i, p)}>
                            <span className="truncate">
                              {p.name}
                              {/* Widened past this party's own catalog because they had no match. */}
                              {p.outsideCatalog && (
                                <span className="ml-2 text-[10px] text-muted-foreground">not in their catalog</span>
                              )}
                            </span>
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
                  {/* Locked: the supplier stated these. Rendered as text so there is nothing to
                      "correct" — an order that disagrees with the document it was created from
                      is a discrepancy to raise with them, not a field to quietly retype. */}
                  {locked ? <span className="text-right text-sm tabular-nums">{Number(l.quantity)}</span> : (
                    <MoneyInput className="h-8 text-right text-sm px-1" displayDecimals={null} value={l.quantity} onValueChange={(v) => setItem(i, { quantity: v ?? 0 })} />
                  )}
                  {locked ? <span className="text-xs text-muted-foreground">{UNIT_OPTIONS.find((u) => u.code === l.unit_code)?.label ?? l.unit_code}</span> : (
                    <Select value={l.unit_code} onValueChange={(v) => setItem(i, { unit_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {/* Sales: unit price. Purchase: this IS the cost (mirror into unit_cost on save). */}
                  {locked ? <span className="text-right text-sm tabular-nums">{formatMoney(l.unit_price)}</span> : (
                    <MoneyInput className="h-8 text-right text-sm px-1" value={l.unit_price} onValueChange={(v) => setItem(i, { unit_price: v ?? 0 })} />
                  )}
                  {isSales && (
                    <MoneyInput className="h-8 text-right text-sm px-1" placeholder="—" value={l.unit_cost} onValueChange={(v) => setItem(i, { unit_cost: v })} title="What this costs us — auto-filled from the catalog, editable" />
                  )}
                  {locked ? <span className="text-right text-xs text-muted-foreground">{VAT_CATEGORIES.find((v) => v.code === l.vat_code)?.label ?? l.vat_code}</span> : (
                    <Select value={l.vat_code} onValueChange={(v) => setItem(i, { vat_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <span className="text-right text-sm tabular-nums">{formatMoney(calc[i]?.gross ?? 0)}</span>
                  {locked ? <span /> : (
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
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
            {locked ? (
              <p className="text-[11px] text-muted-foreground">
                These are the supplier&apos;s lines and figures, exactly as the document states them — they can&apos;t be
                edited here. Link each one to a catalog product so the goods can enter the warehouse.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">{isSales ? 'Pick a catalog product to auto-fill the customer’s price, cost & unit (this customer’s discount is applied). Editable.' : 'A purchase order’s unit price is what we pay the supplier (= our cost). Pick a catalog product to auto-fill it.'} Catalog lines link to the warehouse — delivery moves stock.</p>
            )}
          </div>

          {/* ── Into the warehouse ──────────────────────────────────────────────────────────
              A received document means the goods ALREADY arrived (this is often a ΤΔΑ, a delivery
              note), so stocking them is part of recording the order, not a later step someone has
              to remember. Without this the order exists and the stock silently doesn't.
              Hidden when the document is a cost OF another order — freight, customs and an
              installer bring no goods, and that order's own stock arrived with its own document. */}
          {!isSales && locked && !attachingToOrder && (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <label htmlFor="orderspanel-receive-now" className="flex items-center gap-2 text-sm">
                <Checkbox id="orderspanel-receive-now" className="h-3.5 w-3.5 rounded" checked={receiveNow} onCheckedChange={(v) => setReceiveNow(v === true)} />
                <span className="font-medium">Receive these goods into the warehouse now</span>
              </label>
              {receiveNow && warehouses.length > 1 && (
                <div className="space-y-1">
                  <Label htmlFor="orderspanel-receive-warehouse" className="text-[10px] text-muted-foreground">Warehouse</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger id="orderspanel-receive-warehouse" className="h-8 text-xs"><SelectValue placeholder="Pick a warehouse" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' · default' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {receiveNow && (() => {
                const unlinked = items.filter((l) => !l.product_id).length;
                return unlinked > 0 ? (
                  <p className="text-[11px] text-amber-600">
                    {unlinked} of {items.length} line(s) have no catalog product and will NOT be stocked. Link them above,
                    or receive them later from the order.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    All {items.length} line(s) are linked and will be added to stock.
                  </p>
                );
              })()}
            </div>
          )}

          {/* ── Already paid? ───────────────────────────────────────────────────────────────
              The other half of the same act. A supplier's document usually reaches the Inbox
              after the money has gone, so settling it is a tick here rather than a second trip
              through the payment dialog — that second trip is what used to produce a paid
              expense with no order behind it. OFF leaves an open payable in AP, which is what
              "Record payment" on the expense is then for. */}
          {!isSales && locked && prefill?.inboundDocumentId && (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox className="h-3.5 w-3.5 rounded" checked={paidNow} onCheckedChange={(v) => setPaidNow(v === true)} />
                <span className="font-medium">Mark as paid</span>
              </label>
              <p className="text-[11px] text-muted-foreground">
                {paidNow
                  ? `Books ${formatMoney(grossTotal, currency)} out of the account below and settles the expense.`
                  : 'Leaves it as an open payable in AP until you record the payment.'}
              </p>
              {paidNow && (
                <PaidFromSelect
                  workspaceId={workspaceId}
                  value={payBankAccountId}
                  onChange={setPayBankAccountId}
                  method={payMethod}
                  onMethodChange={setPayMethod}
                />
              )}
            </div>
          )}

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
          {/* The kind was chosen in the New-order dropdown: draft → pre-order, else a live order.
              Unless this is a cost of an order that already exists — then the button must not
              promise an order it is deliberately not going to create. */}
          <Button onClick={() => save(preset.draft ? 'draft' : 'confirmed')} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {attachingToOrder ? 'Add to the order' : preset.draft ? 'Save pre-order' : 'Create order'}
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

/**
 * Who the order is WITH, as a CRM record: the customer on a sale, the supplier on a purchase.
 * One derivation — the header link, the name fetch and any future consumer read the same ref,
 * so the party shown can never disagree with the party linked to.
 */
export const orderPartyRef = (o: Pick<Order, 'order_type' | 'customer_company_id' | 'customer_contact_id' | 'supplier_company_id' | 'supplier_contact_id'>):
  { kind: 'company' | 'contact'; id: string; role: 'customer' | 'supplier' } | null => {
  const isSales = o.order_type === 'sales';
  // Prefer the side the order type implies, but fall back to the other — an order created from
  // the wrong entry point still has exactly one party, and linking to it beats showing nothing.
  const companyId = (isSales ? o.customer_company_id : o.supplier_company_id) ?? o.customer_company_id ?? o.supplier_company_id;
  const contactId = (isSales ? o.customer_contact_id : o.supplier_contact_id) ?? o.customer_contact_id ?? o.supplier_contact_id;
  const role: 'customer' | 'supplier' = isSales ? 'customer' : 'supplier';
  if (companyId) return { kind: 'company', id: companyId, role };
  if (contactId) return { kind: 'contact', id: contactId, role };
  return null;
};

/** Exported so the dedicated order page (`/finance/orders/:orderId`) renders the SAME detail
 *  surface as the list's row click — one order form, two entry points, no second copy. */
export const OrderDetailDialog: React.FC<{ orderId: string | null; categories: FinanceCategory[]; open: boolean; onClose: () => void; onChanged: () => void; onOpenOrder?: (id: string) => void }> = ({ orderId, categories, open, onClose, onChanged, onOpenOrder }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Mirror the mount point. Hardcoded '/finance/...' links threw an admin-shell user out of the
  // shell the moment they created an invoice or followed a covered-by link.
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  // The buyer's VAT identity — an order row carries only the company/contact id, which is not
  // enough to tell a sole trader from a consumer. Feeds the shared sales-document rule.
  const [buyerIdentity, setBuyerIdentity] = useState<BuyerIdentity | null>(null);
  const [fin, setFin] = useState<Awaited<ReturnType<typeof ordersService.getOrderFinance>> | null>(null);
  const [saving, setSaving] = useState(false);
  // Bank accounts — used to label a payment row with the account name it moved through.
  const [bankAccounts, setBankAccounts] = useState<Awaited<ReturnType<typeof financeService.listBankAccounts>>>([]);
  // Order money splits cleanly by direction: money IN (from the customer) → RecordPaymentDialog;
  // money OUT (paying a supplier / any cost) → NewExpenseDialog (a supplier bill → Payables & P&L),
  // attached to the order + defaulted to the "Order" category. `expensePrefill` seeds it from a line/supplier.
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expensePrefill, setExpensePrefill] = useState<{ amount?: number; vatAmount?: number; description?: string; categoryId?: string; supplier?: { companyId?: string | null; name?: string | null } } | null>(null);
  // Attaching an expense that ALREADY exists (booked before the order, or arriving separately —
  // transport, customs, an installer). `setSupplierBillOrder` on an existing bill, not a new one.
  const [linkExpenseOpen, setLinkExpenseOpen] = useState(false);
  // Money-in modal (received / customer refund). `{ amount }` seeds it; null = closed.
  const [payInOpen, setPayInOpen] = useState<{ amount?: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Line[]>([]);
  // Catalog list prices for the order's products → summarised as a discount total below.
  const [listPrices, setListPrices] = useState<Map<string, number>>(new Map());
  // Per-LINE supplier (who supplies this line / who we owe) → settable inline on any line.
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());
  const [supplierPick, setSupplierPick] = useState<{ itemId: string; productId: string | null; label: string; currentId: string | null } | null>(null);
  // Per-LINE warehouse identity (which catalog product / is it stock at all) — see LineStockDialog.
  const [stockPick, setStockPick] = useState<OrderItem | null>(null);
  // Per-LINE myDATA exemption cause. Only meaningful on a 0%-VAT sales line — see VatExemptionDialog.
  const [vatExemptPick, setVatExemptPick] = useState<OrderItem | null>(null);
  /** The customer's STANDING exemption cause, if they carry one. A line with none inherits it, so
   *  the gate must not nag about a line that is already justified by the party. Same fallback
   *  `generate_invoice_from_order` applies — read here only so the UI can say which is in force. */
  const [buyerVat, setBuyerVat] = useState<{
    exemption: number | null; country: string | null; vatNumber: string | null; validated: boolean | null;
  }>({ exemption: null, country: null, vatNumber: null, validated: null });
  const partyVatExemption = buyerVat.exemption;
  /** Our own country — the suggester applies Greek articles and must not do so for another issuer. */
  const [sellerCountry, setSellerCountry] = useState<string | null>(null);
  /** order_item_id → what the catalog says it is. Absent = no linked product, so unknowable here. */
  const [lineItemTypes, setLineItemTypes] = useState<Map<string, SupplyKind>>(new Map());
  // Per-LINE warranty: which lines of this order already have a registered unit in the customer's
  // installed base, keyed by order_item_id. The link has always been stored (`source_order_item_id`)
  // and never read, so a sold-and-covered line looked identical to one nobody had registered.
  const [lineAssets, setLineAssets] = useState<Map<string, OrderAssetRow>>(new Map());
  /** True when the read FAILED. Distinct from "nothing is registered" — see the note in `load`. */
  const [lineAssetsFailed, setLineAssetsFailed] = useState(false);
  const [warrantyPick, setWarrantyPick] = useState<OrderItem | null>(null);
  // Catalog names for linked lines, so a linked line can SAY what it points at rather than just
  // being silently unlinkable.
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map());
  // What we owe each supplier on this order (line cost grouped by supplier − money already paid out).
  const [supExposure, setSupExposure] = useState<Awaited<ReturnType<typeof ordersService.getOrderSupplierExposure>>>([]);
  // Audit trail of payment edits/deletes on this order (finance-manager-readable only).
  const [payAudit, setPayAudit] = useState<Awaited<ReturnType<typeof ordersService.listOrderPaymentAudit>>>([]);
  /** True when the audit read FAILED. Distinct from "there is no history" — see #297 finding 23. */
  const [payAuditFailed, setPayAuditFailed] = useState(false);
  const [showPayAudit, setShowPayAudit] = useState(false);
  // Purchase-order 3-way match (PO × goods received × supplier bill).
  const [match, setMatch] = useState<ThreeWayMatch | null>(null);
  // In-app handoff: whether this PO's supplier has a claimed platform identity to send to.
  const [handoff, setHandoff] = useState<{ available: boolean; supplierWorkspaceName?: string } | null>(null);
  // The order's own party (customer / supplier) name — the order row carries only the id, and the
  // header has to say WHO this order is with before it can offer to open their CRM record.
  const [partyName, setPartyName] = useState<string | null>(null);

  const load = async (id: string) => {
    try {
      setLoading(true);
      const res = await ordersService.get(id);
      const productIds = res.items.map((it) => it.product_id).filter(Boolean) as string[];
      const supplierIds = res.items.map((it) => it.supplier_company_id).filter(Boolean) as string[];
      const partyRef = orderPartyRef(res.order);
      // Everything the panel needs, in ONE wave. `getThreeWayMatch` used to be awaited after this
      // block, so opening an order cost two sequential round-trips where one would do — the
      // straggler depended on nothing in here.
      const [finance, lp, names, exposure, accounts, audit, buyer, party, prodNames, threeWay, handoffInfo, assetRows] = await Promise.all([
        ordersService.getOrderFinance(id),
        ordersService.getListPrices(productIds).catch(() => new Map<string, number>()),
        ordersService.getCompanyNames(supplierIds).catch(() => new Map<string, string>()),
        ordersService.getOrderSupplierExposure(id).catch(() => []),
        financeService.listBankAccounts(res.order.workspace_id).catch(() => []),
        // A failed audit read is recorded, not flattened to "no history" — see the note on
        // listOrderPaymentAudit.
        ordersService.listOrderPaymentAudit(id).then(
          (rows) => ({ ok: true as const, rows }),
          (e) => ({ ok: false as const, rows: [] as never[], error: e }),
        ),
        financeService.getBuyerIdentity({
          companyId: res.order.customer_company_id, contactId: res.order.customer_contact_id,
        }).catch(() => null),
        !partyRef ? Promise.resolve(null)
          : (partyRef.kind === 'company' ? ordersService.getCompanyNames([partyRef.id]) : ordersService.getContactNames([partyRef.id]))
              .then((m) => m.get(partyRef.id) ?? null).catch(() => null),
        ordersService.getProductNames(productIds).catch(() => new Map<string, string>()),
        res.order.order_type === 'purchase'
          ? ordersService.getThreeWayMatch(id).catch(() => null)
          : Promise.resolve(null),
        res.order.order_type === 'purchase' && !res.order.paired_order_id
          ? ordersService.supplierHandoffAvailable(id).catch(() => null)
          : Promise.resolve(null),
        // Only a sale puts a unit into a CUSTOMER's installed base; a purchase order has no
        // customer to register it against.
        //
        // A FAILED read is recorded, not flattened to "nothing registered" — same reason as the
        // payment audit above. Both look identical as an empty array, and here the wrong reading
        // is actively harmful: every line would offer "warranty" as though it were uncovered, and
        // clicking one would try to register a unit that already exists (23505).
        res.order.order_type === 'sales'
          ? customerAssetsService.listByOrder(id).then(
              (rows) => ({ ok: true as const, rows }),
              () => ({ ok: false as const, rows: [] as OrderAssetRow[] }),
            )
          : Promise.resolve({ ok: true as const, rows: [] as OrderAssetRow[] }),
      ]);
      setProductNames(prodNames);
      setLineAssets(new Map(
        assetRows.rows.filter((a) => a.source_order_item_id).map((a) => [a.source_order_item_id as string, a]),
      ));
      setLineAssetsFailed(!assetRows.ok);
      setOrder(res.order); setItems(res.items); setFin(finance); setListPrices(lp); setSupplierNames(names); setSupExposure(exposure);
      setBankAccounts(accounts);
      setPayAudit(audit.rows);
      setPayAuditFailed(!audit.ok);
      setBuyerIdentity(buyer); setPartyName(party);
      setMatch(threeWay);
      setHandoff(handoffInfo);
    } catch (err: any) {
      toast({ title: 'Failed to load order', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!orderId) { setOrder(null); setItems([]); setFin(null); setExpenseOpen(false); setPayInOpen(null); setListPrices(new Map()); setSupplierNames(new Map()); setSupplierPick(null); setSupExposure([]); setMatch(null); setHandoff(null); setPartyName(null); setLineAssets(new Map()); setWarrantyPick(null); return; }
    void load(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * Statuses DERIVED from the delivered quantities, which a human must not set by hand.
   *
   * deliver_order_line and receive_order_into_warehouse both recompute the order's fulfilment from
   * the sum of quantity_delivered, so a manual value here is silently reverted by the next
   * delivery edit — and in the meantime an order can read 'Completed' with 0/10 delivered.
   */
  const DERIVED_ORDER_STATUSES = new Set<OrderStatus>(['partially_fulfilled', 'fulfilled']);

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
  const saveMeta = async (patch: {
    categoryId?: string | null; expectedPaymentDate?: string | null; notes?: string | null;
    projectId?: string | null; coversOrderId?: string | null;
  }) => {
    if (!order) return;
    // generate_invoice_from_order copies category_id and expected_payment_date -> invoices.due_at
    // at CREATION time only, so editing them after a document exists moves nothing: the invoice
    // keeps its due_at and the AR aging bucket disagrees with this screen. The fields are frozen
    // once a document exists (see `metaFrozen` where they render).
    if (metaFrozen && ('categoryId' in patch || 'expectedPaymentDate' in patch)) {
      toast({
        title: 'Already on a document',
        description: 'Category and expected payment date were copied to the invoice/bill when it was created. Change them there — editing here would leave the two disagreeing.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await ordersService.updateMeta(order.id, patch);
      setOrder({
        ...order,
        ...('categoryId' in patch ? { category_id: patch.categoryId ?? null } : {}),
        ...('expectedPaymentDate' in patch ? { expected_payment_date: patch.expectedPaymentDate ?? null } : {}),
        ...('notes' in patch ? { notes: patch.notes ?? null } : {}),
        ...('projectId' in patch ? { project_id: patch.projectId ?? null } : {}),
        ...('coversOrderId' in patch ? { covers_order_id: patch.coversOrderId ?? null } : {}),
      });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Failed to update order', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  /**
   * The inline Project control's value. `project_id` is a plain FK with no display name on it, so
   * the label is resolved here rather than stored — a denormalized copy would be one more thing to
   * keep in step with a rename.
   *
   * Project ONLY. An earlier version fed this control the order's full link, which resolved
   * `covers_order_id` first and so printed a customer's order number underneath the word "Project".
   * The covers link is shown by the "Covered by" block instead, from the side that reads naturally.
   */
  const [projectValue, setProjectValue] = useState<OrderLinkTarget>({ kind: 'none' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order?.project_id) { setProjectValue({ kind: 'none' }); return; }
      const { data } = await supabase.from('projects').select('id, name').eq('id', order.project_id).maybeSingle();
      if (cancelled) return;
      setProjectValue({
        kind: 'project', projectId: order.project_id,
        label: (data?.name as string | null) ?? 'Project',
      });
    })();
    return () => { cancelled = true; };
  }, [order?.id, order?.project_id]);
  /**
   * The reverse view: purchase orders raised to cover THIS sale. `raise_cover_purchase_orders` has
   * been writing `covers_order_id` since it shipped and nothing ever displayed it, so the POs it
   * created looked unrelated to the sale that caused them.
   */
  const [coveredBy, setCoveredBy] = useState<Array<{
    id: string; order_number: string | null; status: string; total: number; currency: string;
    supplier_company_id: string | null; settled: number; outstanding: number;
  }>>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order || order.order_type !== 'sales') { setCoveredBy([]); return; }
      const { data } = await supabase.from('orders')
        .select('id, order_number, status, total, currency, supplier_company_id')
        .eq('covers_order_id', order.id).neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      const rows = (data ?? []) as Array<{ id: string; order_number: string | null; status: string; total: number; currency: string; supplier_company_id: string | null }>;
      // How much of that purchase is actually settled comes from `orderBalances` —
      // `get_order_settlements`, the one derivation. Re-summing allocations here would be the
      // sixth implementation of a money quantity that already has an answer.
      const bal = rows.length ? await ordersService.orderBalances(rows.map((r) => r.id)).catch(() => new Map()) : new Map();
      if (!cancelled) {
        setCoveredBy(rows.map((r) => ({
          ...r,
          settled: Number(bal.get(r.id)?.settled ?? 0),
          outstanding: Number(bal.get(r.id)?.outstanding ?? Number(r.total)),
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [order?.id, order?.order_type]);

  /**
   * The tabs, in reading order. EVERY tab an order of this type can have is offered, whether or
   * not it holds anything — each says so itself when empty.
   *
   * The order's own body (classification, lines, totals, cash) is `details`, the first tab and the
   * default. Only the record's identity and the controls that act on the whole order — party,
   * status, Actions — stay above the strip, because they are true of every tab rather than the
   * contents of one.
   *
   * They used to appear only once they had content, which made the tab strip change shape under
   * the operator: the same order showed three tabs, then four once an invoice was issued, and
   * "there is no Payments tab" was indistinguishable from "no payment has been recorded". An empty
   * tab is an answer; a missing one is a question about the UI.
   *
   * The two type gates are NOT emptiness gates and stay:
   *   • Suppliers is sales-only. `create()` stamps every PURCHASE line with the order's own
   *     supplier, so on a purchase order the block re-derives the order's OWN payable with a
   *     different formula (getOrderSupplierExposure, not get_order_settlements) — 'owe X' beside a
   *     differently-derived Outstanding — and its Pay button opens NewExpenseDialog, booking a
   *     SECOND supplier bill that double-counts the cost in P&L. It answers what a SALE costs us.
   *   • 3-Way Match is purchase-only: there is no PO cost × goods received × supplier bill to
   *     compare on a sale.
   */
  const orderTabs = useMemo(() => {
    if (!order) return [] as string[];
    const t: string[] = ['details'];
    if (order.order_type === 'sales') t.push('suppliers');
    t.push('invoices', 'expenses', 'payments');
    if (order.order_type === 'purchase') t.push('match');
    t.push('customs');
    return t;
  }, [order]);

  /**
   * Controlled rather than `defaultValue`, so a panel can hand the operator off to the tab that
   * owns the action it is describing — a purchase order's Invoices tab pointing at Expenses, where
   * the supplier's bill actually lives. Falls back whenever the remembered tab is not on offer
   * (opening a different order, or one of the other type).
   */
  const [activeTab, setActiveTab] = useState<string | null>(null);
  useEffect(() => { setActiveTab(null); }, [orderId]);
  const currentTab = activeTab && orderTabs.includes(activeTab) ? activeTab : orderTabs[0];

  /**
   * The FORWARD view, and its control: the customer's sales order this purchase was made to serve.
   *
   * `raise_cover_purchase_orders` sets `covers_order_id` when the sale comes first, and the New
   * Order dialog sets it when the purchase is raised for a customer in one go. Neither helps the
   * ordinary case — a PO placed first, and only later revealed to have been bought for someone —
   * which had no path at all: the service could write the column, and nothing in the UI called it.
   */
  const [covers, setCovers] = useState<{ id: string; order_number: string | null; status: string; total: number; currency: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order?.covers_order_id) { setCovers(null); return; }
      const { data } = await supabase.from('orders')
        .select('id, order_number, status, total, currency')
        .eq('id', order.covers_order_id).maybeSingle();
      if (!cancelled) setCovers((data ?? null) as any);
    })();
    return () => { cancelled = true; };
  }, [order?.id, order?.covers_order_id]);

  /**
   * What this SALE still owes a supplier — the one rule, used everywhere the figure appears.
   *
   * `getOrderSupplierExposure` only sees cash tagged to THIS order, so when a purchase order was
   * raised to buy the goods (its bill and its payment carry the PURCHASE's order_id) the sale kept
   * claiming the full cost was outstanding after the supplier had been paid in full. The answer for
   * those goods is already derived on the purchase order by `get_order_settlements`; this defers to
   * it rather than re-deriving the same money from a second set of rows — the exact habit that put
   * five disagreeing settlement formulas in this codebase. Returns the covering order too, so the
   * UI can name where the figure comes from instead of stating it flat.
   */
  const supplierOwedAfterCover = useCallback((s: { supplier_company_id: string; owed: number }) => {
    const po = coveredBy.find((c) => c.supplier_company_id === s.supplier_company_id);
    return { po, owed: Math.max(0, po ? po.outstanding : s.owed) };
  }, [coveredBy]);

  // The customer's standing exemption cause. Read from whichever party the sale is with, in the
  // same order `generate_invoice_from_order` reads it — company first, then contact.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order || order.order_type !== 'sales') {
        setBuyerVat({ exemption: null, country: null, vatNumber: null, validated: null });
        return;
      }
      let reason: string | null = null;
      let country: string | null = null;
      let vatNumber: string | null = null;
      // Only crm_companies records a VIES verdict. A contact's VAT number is therefore never
      // treated as proof of business status — the safe direction: it declines to claim an
      // intra-community supply rather than claiming one that cannot be evidenced.
      let validated: boolean | null = null;
      if (order.customer_company_id) {
        const { data } = await supabase.from('crm_companies')
          .select('vat_exemption_reason, country_code, billing_country_code, vat_number, vat_validated')
          .eq('id', order.customer_company_id).maybeSingle();
        reason = (data?.vat_exemption_reason as string | null) ?? null;
        // Billing address wins: it is where the invoice is addressed, which is what decides VAT.
        country = (data?.billing_country_code as string | null) ?? (data?.country_code as string | null) ?? null;
        vatNumber = (data?.vat_number as string | null) ?? null;
        validated = (data?.vat_validated as boolean | null) ?? null;
      } else if (order.customer_contact_id) {
        const { data } = await supabase.from('crm_contacts')
          .select('vat_exemption_reason, country_code, billing_country_code, vat_number')
          .eq('id', order.customer_contact_id).maybeSingle();
        reason = (data?.vat_exemption_reason as string | null) ?? null;
        country = (data?.billing_country_code as string | null) ?? (data?.country_code as string | null) ?? null;
        vatNumber = (data?.vat_number as string | null) ?? null;
      }
      const n = reason != null && /^\d+$/.test(reason.trim()) ? parseInt(reason.trim(), 10) : NaN;
      if (!cancelled) {
        setBuyerVat({
          exemption: Number.isFinite(n) && n >= 1 && n <= 31 ? n : null,
          country, vatNumber, validated,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [order?.id, order?.order_type, order?.customer_company_id, order?.customer_contact_id]);

  // Goods or services, per line, from the catalog. Only lines WITH a product can answer; the rest
  // fall back to the line's own off-warehouse flag at the call site.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = [...new Set(items.map((it) => it.product_id).filter(Boolean) as string[])];
      if (ids.length === 0) { setLineItemTypes(new Map()); return; }
      const { data } = await supabase.from('products').select('id, item_type').in('id', ids);
      const byProduct = new Map<string, SupplyKind>();
      for (const r of (data ?? []) as Array<{ id: string; item_type: string | null }>) {
        byProduct.set(r.id, r.item_type === 'service' ? 'services' : 'goods');
      }
      if (cancelled) return;
      const byLine = new Map<string, SupplyKind>();
      for (const it of items) {
        const k = it.product_id ? byProduct.get(it.product_id) : undefined;
        if (k) byLine.set(it.id, k);
      }
      setLineItemTypes(byLine);
    })();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order) { setSellerCountry(null); return; }
      const { data } = await supabase.from('finance_settings')
        .select('business_country_code').eq('workspace_id', order.workspace_id).maybeSingle();
      if (!cancelled) setSellerCountry((data?.business_country_code as string | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [order?.workspace_id, order?.id]);

  /** The picker's value — derived from `covers`, so it can never disagree with the block below it. */
  const coversValue: OrderLinkTarget = covers
    ? { kind: 'sales_order', orderId: covers.id, projectId: null, label: covers.order_number ?? covers.id.slice(0, 8) }
    : { kind: 'none' };

  /**
   * Point this purchase at the customer it was bought for — either an order they already have, or
   * a new one raised from these lines.
   *
   * The new order is a MIRROR, never a move: `mirrorLinesForSale` re-prices every catalog line
   * through the pricing resolver, so the customer is charged their price and not our supplier's.
   * Ad-hoc lines have nothing to look up and are reported back rather than sold at cost in silence.
   * The purchase keeps its own lines untouched — a purchase settles on money OUT and a sale on
   * money IN, and merging the two is the mistake `OrderLinkPicker` exists to make unavailable.
   *
   * Prices cross re-derived; the SUPPLIER crosses as-is. Attaching to a sale that already exists
   * mirrors nothing, so there `stamp_order_line_suppliers_from_cover` stamps the sale's unassigned
   * lines from the covering purchase instead — same answer, arrived at from the other side.
   */
  const linkToCustomer = async (v: OrderLinkTarget) => {
    if (!order) return;
    if (v.kind === 'none') { await saveMeta({ coversOrderId: null }); return; }
    if (v.kind === 'sales_order') {
      // A sale already knows its project; inheriting it keeps the purchase reported under the same
      // job. Only when this order has none — never overwrite a project someone chose deliberately.
      await saveMeta({
        coversOrderId: v.orderId,
        ...(order.project_id ? {} : (v.projectId ? { projectId: v.projectId } : {})),
      });
      // The link just answered "who supplies this line" for the sale. Best-effort: the link itself
      // is saved and must not be reported as failed because the courtesy stamp did not land.
      await ordersService.stampLineSuppliersFromCover(v.orderId).catch(() => 0);
      return;
    }
    if (v.kind !== 'customer') return;
    setSaving(true);
    try {
      const mirrored = await ordersService.mirrorLinesForSale({
        workspaceId: order.workspace_id,
        items: items.map((it) => ({
          product_id: it.product_id ?? null,
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          unit_cost: it.unit_cost != null ? Number(it.unit_cost) : null,
          measurement_unit_code: it.measurement_unit_code ?? null,
          vat_percent: Number(it.vat_percent ?? 0),
          vat_category: it.vat_category ?? null,
          supplier_company_id: it.supplier_company_id ?? null,
          update_warehouse: it.update_warehouse ?? true,
        })),
        companyId: v.party.party_type === 'company' ? v.party.id : null,
        contactId: v.party.party_type === 'contact' ? v.party.id : null,
        supplierCompanyId: order.supplier_company_id ?? null,
      });
      const salesOrderId = await ordersService.create({
        workspaceId: order.workspace_id,
        orderType: 'sales',
        status: 'draft',
        currency: order.currency,
        projectId: order.project_id ?? null,
        customerCompanyId: v.party.party_type === 'company' ? v.party.id : null,
        customerContactId: v.party.party_type === 'contact' ? v.party.id : null,
        notes: `Raised from purchase ${order.order_number ?? order.id.slice(0, 8)}.`,
        items: mirrored.items,
      });
      await ordersService.updateMeta(order.id, { coversOrderId: salesOrderId });
      setOrder({ ...order, covers_order_id: salesOrderId });
      onChanged();
      toast({
        title: `Customer order drafted for ${v.party.name ?? 'the customer'}`,
        description: mirrored.unpriced.length
          ? `${mirrored.unpriced.length} line(s) had no catalog price and carry cost — price them before sending: ${mirrored.unpriced.slice(0, 3).join(', ')}.`
          : 'Drafted at their selling price. Open it to review and confirm.',
      });
    } catch (err: any) {
      toast({ title: 'Could not raise the customer order', description: err?.message, variant: 'destructive' });
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

  /** Apply the line's warehouse identity (catalog product / off-warehouse) — see LineStockDialog. */
  /** Set / clear the myDATA exemption cause on a 0%-VAT sales line. */
  const setLineVatExemption = async (itemId: string, code: number | null) => {
    setSaving(true);
    try {
      await ordersService.setOrderItemVatExemption(itemId, code);
      setVatExemptPick(null);
      if (order) await load(order.id);
      toast({
        title: code == null ? 'Exemption reason cleared' : 'Exemption reason set',
        description: code == null
          ? 'This line can no longer be invoiced at 0% until a reason is given.'
          : mydataExemptionLabel(code) ?? undefined,
      });
    } catch (err: any) {
      toast({ title: 'Failed to set the exemption reason', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const setLineStock = async (itemId: string, patch: { productId?: string | null; updateWarehouse?: boolean }, note: string) => {
    setSaving(true);
    try {
      await ordersService.setOrderItemStock(itemId, patch);
      setStockPick(null);
      if (order) await load(order.id);
      // Say what is now possible, not just that a row changed — the whole point of this dialog is
      // to unblock a receive that silently did nothing.
      toast({ title: 'Line updated', description: `${note} Use Actions → Receive into warehouse to apply it.` });
    } catch (err: any) {
      toast({ title: 'Failed to update the line', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Record real cash ON the order: money in (a payment received) or money out (a payment sent).
  // Per-line "Mark as paid" — record a PAYMENT to this line's supplier (money out), NOT an expense.
  // Paying a supplier = money OUT = an expense (supplier bill → Payables & P&L), attached to this
  // order + defaulted to the "Order" category. All money-out on an order flows through this one form.
  // Per-line "Mark as paid": pre-fills the line cost + the line's supplier (operator adds one if absent).
  /**
   * The expense form takes a NET amount plus its VAT — the two are separate fields on the bill
   * and feed different places (net → P&L cost, VAT → recoverable input tax). Both entry points
   * below therefore hand it a SPLIT, never one lump sum. They used to hand it one, and the two
   * disagreed about which one: "Mark paid" passed the net (so VAT was missing from the total)
   * and "Pay" passed the VAT-INCLUSIVE owed figure (so the tax was folded into the net and the
   * P&L cost was overstated by exactly the VAT). Both then showed "VAT 0" on a 24% line.
   */
  const openLinePayment = (it: { unit_cost: number | null; quantity: number; vat_percent?: number | null; supplier_company_id: string | null }) => {
    const lineNet = it.unit_cost != null ? Number(it.unit_cost) * Number(it.quantity) : 0;
    const { net, vat } = splitByVatRate(lineNet, it.vat_percent);
    setExpensePrefill({
      amount: net > 0 ? net : undefined,
      vatAmount: net > 0 ? vat : undefined,
      description: `Order ${order?.order_number ?? order?.id.slice(0, 8) ?? ''} — supplier cost`,
      supplier: it.supplier_company_id ? { companyId: it.supplier_company_id, name: supplierNames.get(it.supplier_company_id) ?? null } : undefined,
    });
    setExpenseOpen(true);
  };

  // Pay a specific supplier straight from the "what we owe" rollup — same expense form, supplier +
  // amount pre-filled. `owed` is GROSS (the rollup's cost is VAT-inclusive), so it is split back
  // into net + VAT in the same proportion the supplier's line costs carry.
  const openPaySupplier = (sup: { supplier_company_id: string; name: string; cost_net: number; cost: number; owed: number }) => {
    const { net, vat } = splitGrossLikeTotals(sup.owed, sup.cost_net, sup.cost);
    setExpensePrefill({
      amount: net,
      vatAmount: vat,
      description: `Order ${order?.order_number ?? order?.id.slice(0, 8) ?? ''} — ${sup.name}`,
      supplier: { companyId: sup.supplier_company_id, name: sup.name },
    });
    setExpenseOpen(true);
  };


  // #3 — edit the order's line items (only while it has no invoice yet).
  // Lines are frozen once a document has been derived FROM them. This checked invoices only —
  // the sales side — so a purchase order stayed editable after "Record supplier bill" had already
  // copied its lines into a supplier_bills row. Editing then silently left the bill holding the
  // old figures, which is exactly the €420 gap the 3-way match had to catch after the fact.
  const editable = !!order && order.status !== 'cancelled' && order.status !== 'fulfilled'
    && (fin?.invoices.length ?? 0) === 0 && (fin?.supplierBills.length ?? 0) === 0;
  /** A document or settled cash exists — the order's classification is already copied onto it. */
  const metaFrozen = !!fin && (fin.invoices.length > 0 || fin.supplierBills.length > 0);
  /**
   * Cancelling is only honest while nothing downstream depends on the order. With an issued
   * invoice or settled cash behind it, 'cancelled' describes the order and contradicts the ledger.
   */
  const cancellable = !metaFrozen && (fin?.payments.length ?? 0) === 0;
  /** 'Completed' means every line is delivered — set the thing the derivation reads. */
  const markAllDelivered = async () => {
    if (!order) return;
    setSaving(true);
    try {
      // One batched call — the same API the per-line editor uses.
      const pending = items
        .filter((it) => Number(it.quantity_delivered) !== Number(it.quantity))
        .map((it) => ({ itemId: it.id, quantityDelivered: Number(it.quantity) }));
      if (pending.length > 0) await ordersService.setDelivery(order.id, pending);
      await load(order.id); onChanged();
      // #320: say what did NOT happen. This action used to empty the warehouse for the whole
      // order in one click, and a toast that only reports success reads as if it still does.
      toast({
        title: 'All lines marked picked',
        description: 'Stock has not moved — issue the invoice or a Δελτίο Αποστολής to dispatch it.',
      });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };
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
      if (data) navigate(`${financeBase}/invoices/${data}`);
    } catch (err: any) {
      // The 0%-VAT gate refuses BY NAME so this can name the lines instead of leaking raw SQL.
      toast({ title: 'Failed', description: invoiceGenerationErrorMessage(err), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const receiveWarehouse = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('receive_order_into_warehouse', { p_order: order.id });
      if (error) throw error;
      const res = (data ?? {}) as { received?: number; skipped?: number; skipped_lines?: string[]; services?: number };
      const received = Number(res.received ?? 0);
      const skipped = Number(res.skipped ?? 0);
      // Lines deliberately marked off-warehouse: delivered, never stocked. Counted separately so a
      // services-only order stops reporting a correct run as "0 warehouse line(s) updated" — the
      // silent zero that reads as failure.
      const services = Number(res.services ?? 0);
      await load(order.id); onChanged();
      // A line with no catalog product cannot become stock. Say which ones, loudly — reporting
      // a flat "0 lines updated" as success is exactly how goods go missing from the warehouse.
      const did = [
        received > 0 ? `${received} line(s) stocked` : null,
        services > 0 ? `${services} off-warehouse line(s) delivered` : null,
      ].filter(Boolean).join(' · ');
      toast({
        title: skipped > 0 ? (received + services > 0 ? 'Partly received' : 'Nothing received') : 'Received',
        description: skipped > 0
          ? `${did || 'Nothing stocked'} · ${skipped} skipped with no catalog product: ${(res.skipped_lines ?? []).join(', ')}. Open the line and link a product — or mark it off-warehouse if it isn’t stock.`
          : (did || 'Everything on this order was already received.'),
        variant: received + services === 0 && skipped > 0 ? 'destructive' : undefined,
      });
      // Notify via Flows that the PO arrived (allocations flipped to reserved).
      if (order.order_type === 'purchase') {
        const { data: u } = await supabase.auth.getUser();
        void flowEventService.emit('purchase_order.received', {
          user_id: u?.user?.id ?? null,
          title: `Purchase order ${order.order_number ?? order.id.slice(0, 8)} received`,
          body: `${did || 'Nothing stocked'}${skipped > 0 ? ` · ${skipped} skipped (no catalog product)` : ''}`,
          action_url: `/finance/orders/${order.id}`,
          order_id: order.id,
          order_number: order.order_number,
          supplier_id: order.supplier_company_id,
          workspace_id: order.workspace_id,
        });
      }
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  /**
   * Re-order — buy/sell this again, at TODAY's prices and against today's stock. It opens the
   * ordinary New order form pre-filled, so the operator sees what changed and the normal create
   * path runs (numbering, reservation, three-way match, notifications). Duplicate, below, is the
   * other thing: an exact frozen-price copy for fixing paperwork.
   */
  const [reorder, setReorder] = useState<Awaited<ReturnType<typeof ordersService.reorderPrefill>> | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const startReorder = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const pre = await ordersService.reorderPrefill(order.id);
      setReorder(pre);
      // The form itself now shows which lines moved and offers the original prices back, so the
      // toast only needs to say that re-pricing happened at all.
      if (pre.changes.length > 0) {
        toast({
          title: "Re-priced at today's prices",
          description: `${pre.changes.length} line(s) changed — switch back to the original prices in the form if you'd rather.`,
        });
      }
    } catch (err: any) { toast({ title: 'Could not re-order', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  /**
   * Cover the shortfall: raise the purchase order(s) for whatever this confirmed sale promised
   * and stock cannot supply. Draft orders, one per supplier — placing them stays a decision.
   */
  const coverShortfall = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await ordersService.raiseCoverPurchaseOrders(order.id);
      if (!res.ok) {
        toast({ title: 'Nothing raised', description: res.message ?? res.reason, variant: 'destructive' });
        return;
      }
      const made = res.created ?? [];
      const short = res.uncovered ?? [];
      if (made.length === 0) {
        toast({ title: 'Nothing to order', description: res.message });
      } else {
        toast({
          title: made.length === 1 ? 'Purchase order drafted' : `${made.length} purchase orders drafted`,
          description: made.map((c) => `${c.supplier_name ?? 'Supplier'} · ${formatMoney(c.total, c.currency)}`).join(' · ')
            + (short.length > 0 ? ` — ${short.length} line(s) have no supplier and were left out.` : ''),
        });
      }
      onChanged();
    } catch (err: any) { toast({ title: 'Could not raise the order', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  // Hand the PO off in-app: a draft sales order materializes in the supplier's claimed
  // workspace and their admins are notified. Their confirm/fulfil rounds back onto this PO.
  const sendToSupplierInApp = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await ordersService.handoffToSupplier(order.id);
      await load(order.id); onChanged();
      toast({
        title: 'Sent in-app',
        description: `A draft sales order is waiting in ${handoff?.supplierWorkspaceName ?? 'the supplier'}'s workspace. You'll see their acknowledgement here.`,
      });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  // Email the purchase order to the supplier (PDF), mark it placed.
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

  // Margin, cost columns and the cash strip are SALES concepts. A purchase order has no margin
  // (its price is its cost) and no money-in half, so everything derived from those is hidden
  // rather than rendered as a permanent zero.
  const isSalesOrder = order?.order_type === 'sales';

  /** Which cover this line reports — `activeCover` decides, here and in the Warranties tab alike. */
  const lineWarranty = useCallback(
    (it: OrderItem) => activeCover(lineAssets.get(it.id)?.warranties),
    [lineAssets],
  );
  /**
   * Deliveries do nothing on a draft or cancelled order.
   *
   * deliver_order_line writes quantity_delivered but explicitly skips stock movement and status
   * recomputation for those statuses, so the editor happily turned a line green with no ledger
   * row and no stock change behind it.
   */
  const deliveryLocked = order?.status === 'draft' || order?.status === 'cancelled';
  /**
   * Order margin = SUM(net_value - unit_cost x qty). ONE definition.
   *
   * `net_value` is the POST-discount line revenue the invoice is built from, and the per-line
   * Profit column below reads the same field, so the column always sums to this total. Never
   * substitute `unit_price` — it is stored PRE-discount, and on any discounted order the two
   * stop agreeing.
   */
  const anyCost = items.some((it) => it.unit_cost != null);
  const orderMargin = order && anyCost
    ? items.reduce((a, it) => a + (Number(it.net_value) || 0) - ((Number(it.unit_cost) || 0) * (Number(it.quantity) || 0)), 0)
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
  // READ the derived value; never recompute it. `get_order_settlements` already returns
  // `outstanding`, direction-resolved. Recomputing `total - settled` here is the exact bug
  // moneyDerivation.test.ts exists to prevent — and naming the local helper something else
  // (`orderSettled`) is enough to slip past that guard, so do not.
  const outstanding = fin?.outstanding ?? 0;
  // B2B issues an invoice, a consumer a retail receipt. Derived from the buyer's VAT identity via
  // the SHARED rule — never from `customer_company_id`, which calls a sole trader (a contact
  // carrying an ΑΦΜ) retail and proposes an ΑΛΠ to a business.
  const salesDocKind: SalesDocumentKind = salesDocumentKindFor(buyerIdentity);
  // Remaining owed per supplier → drives per-line "Mark paid" visibility: once a line's supplier is
  // fully settled, its "Mark paid" button hides (nothing left to pay).
  //
  // Deferred to the covering purchase order through `supplierOwedAfterCover`, exactly like the
  // rollup below. Reading the RAW `s.owed` here was a second answer to one money question: the sale
  // sees none of the cash that settled a covering PO (that bill and that payment carry the
  // PURCHASE's order_id), so a line whose supplier had been paid in full still showed a live red
  // "Mark paid" — and pressing it books a SECOND payable for one delivery, the precise mistake the
  // rollup's own Pay button was already fixed to stop making.
  const supplierOwedById = new Map(supExposure.map((s) => [s.supplier_company_id, supplierOwedAfterCover(s).owed]));

  // The CRM record this order is with — same derivation the name fetch used.
  const party = order ? orderPartyRef(order) : null;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1400px] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Order {order?.order_number ?? order?.id.slice(0, 8)}</DialogTitle>
          <DialogDescription className="sr-only">Order form.</DialogDescription>
          {/* Who the order is with, one click from their CRM record — the order header named a
              number and nothing else, so answering "who is this for?" meant leaving the order. */}
          {party && (
            <p className="text-xs text-muted-foreground">
              {party.role === 'customer' ? 'Customer' : 'Supplier'}{' · '}
              <Link
                to={`/crm/${party.kind === 'company' ? 'companies' : 'contacts'}/${party.id}`}
                className="font-medium text-primary hover:underline"
              >
                {partyName ?? 'Open CRM record'}
              </Link>
            </p>
          )}
        </DialogHeader>
        {loading || !order ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Status + actions sit ON TOP of the products (then the document + totals below). */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-semibold capitalize ${order.order_type === 'sales' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>{order.order_type}</span>
              {/* DERIVED, not the cached `orders.payment_status` column. The list one click up has
                  read the derivation since the "Paid beside a non-zero Outstanding" fix; this header
                  kept reading the cache, which is the same bug one screen deeper — and it sits
                  directly above an Outstanding figure that comes from `get_order_settlements`. Same
                  row, so the two cannot disagree. */}
              <span className="text-xs text-muted-foreground">{ORDER_PAYMENT_LABEL[fin?.payment_status ?? order.payment_status]}</span>
              {/* Supplier round-trip on a PO: paired = sent in-app; supplier_status comes back from
                  their portal ack/ship or their mirror order's progress. Plain colored words. */}
              {order.order_type === 'purchase' && (order.paired_order_id || order.supplier_status) && (
                <span className="text-xs" title={order.supplier_eta ? `Supplier ETA ${order.supplier_eta}` : undefined}>
                  {order.supplier_status === 'shipped'
                    ? <span className="font-medium text-emerald-600 dark:text-emerald-400">Supplier shipped</span>
                    : order.supplier_status === 'acknowledged'
                      ? <span className="font-medium text-blue-600 dark:text-blue-400">Supplier acknowledged{order.supplier_eta ? ` · ETA ${order.supplier_eta}` : ''}</span>
                      : <span className="text-muted-foreground">Sent in-app · awaiting acknowledgement</span>}
                </span>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {/* Which project this order belongs to — inline, ahead of Status. Only projects are
                    offered: the order already knows its party, so re-picking one here would just be
                    a second way to say something the order header states above. */}
                <Label className="text-xs text-muted-foreground">Project</Label>
                <OrderLinkPicker
                  workspaceId={order.workspace_id}
                  value={projectValue}
                  onChange={(v) => {
                    setProjectValue(v);
                    if (v.kind === 'project') void saveMeta({ projectId: v.projectId });
                    else if (v.kind === 'none') void saveMeta({ projectId: null });
                  }}
                  currency={order.currency}
                  allowCustomer={false}
                  allowMerge={false}
                  allowCostOf={false}
                  compact
                  disabled={saving}
                />
                {/* Who this purchase was bought FOR. Purchase-only and deliberately separate from
                    Project: they answer different questions and write different columns, and the
                    one control that tried to do both printed a customer's order number under the
                    word "Project". Projects are switched off here for the same reason.
                    Sales orders are excluded — a sale IS the customer's order; pointing it at
                    another one would invert the direction the whole link is defined by. */}
                {order.order_type === 'purchase' && (
                  <>
                    <Label className="text-xs text-muted-foreground">For customer</Label>
                    <OrderLinkPicker
                      workspaceId={order.workspace_id}
                      value={coversValue}
                      onChange={(v) => void linkToCustomer(v)}
                      currency={order.currency}
                      allowProject={false}
                      allowCustomer
                      allowRaiseCustomerOrder
                      allowMerge={false}
                      allowCostOf={false}
                      compact
                      disabled={saving}
                    />
                  </>
                )}
                <Label className="text-xs text-muted-foreground">Status</Label>
                {/* Only the statuses a human actually owns. `partially_fulfilled` and `fulfilled`
                    are DERIVED from the delivered quantities — deliver_order_line and
                    receive_order_into_warehouse recompute them on every delivery edit — so setting
                    them by hand was reverted by the next tick, and meanwhile an order could sit at
                    'Completed' with 0/10 delivered. Cancel is blocked once a document or settled
                    cash exists, because cancelling then leaves an issued invoice behind it. */}
                <Select value={order.status} onValueChange={(v: any) => changeStatus(v)}>
                  <SelectTrigger className="h-8 w-44 text-xs" disabled={saving}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[])
                      .filter((st) => st === order.status || !DERIVED_ORDER_STATUSES.has(st))
                      .filter((st) => st !== 'cancelled' || cancellable)
                      .map((st) => <SelectItem key={st} value={st}>{ORDER_STATUS_LABEL[st]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={saving}>
                      <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Actions <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {/* The order's own settlement: a sale is settled by the customer paying us, a
                        purchase by us paying the supplier. Same action, opposite direction — the
                        label followed the sales case on both and so read as a lie on a purchase. */}
                    {/* One line per item, no explanatory second line: a menu is a list of verbs.
                        What the action means belongs in the panel it opens — the direction here,
                        for instance, is already carried by the arrow and its colour. */}
                    <DropdownMenuItem onClick={() => setPayInOpen({ amount: outstanding > 0.005 ? outstanding : undefined })}>
                      {order.order_type === 'purchase'
                        ? <ArrowUpRight className="h-3.5 w-3.5 mr-2 text-red-400" />
                        : <ArrowDownLeft className="h-3.5 w-3.5 mr-2 text-emerald-500" />}
                      Record payment
                    </DropdownMenuItem>
                    {/* A cost booked against this order. On a sales order that is the cost side of
                        the sale (goods bought in, transport); on a purchase order it is the
                        supplier's own bill and every extra that rides along with the goods —
                        freight, customs, an installer, a second supplier on the same job. An order
                        holds MANY expenses (`supplier_bills.order_id` is not unique), so this stays
                        available after the first one exists — hence the label counts.

                        It was SALES-only, to avoid duplicating a "Record supplier bill" action that
                        generated the payable from the order's own lines. That action no longer
                        exists in this menu (`generate_supplier_bill_from_order` has no caller left),
                        so the gate stopped preventing a double entry and started preventing the ONLY
                        one: a purchase order raised by hand rather than from the Inbox had no way to
                        record what the supplier billed, which left 3-way match permanently at
                        "awaiting bill". */}
                    <DropdownMenuItem onClick={() => { setExpensePrefill({}); setExpenseOpen(true); }}>
                      <ArrowUpRight className="h-3.5 w-3.5 mr-2 text-red-400" />
                      Add {(fin?.supplierBills.length ?? 0) > 0 ? 'another expense' : 'expense'}
                    </DropdownMenuItem>
                    {/* The same link, for a cost that is ALREADY booked — the transport invoice that
                        landed a week after the goods, or anything sitting in the Inbox that was
                        added to Expenses on its own. Without this the link could only ever be
                        written at the moment the expense was created. */}
                    <DropdownMenuItem onClick={() => setLinkExpenseOpen(true)}>
                      <Link2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Attach an existing expense
                    </DropdownMenuItem>
                    {/* "Pay from account credit" was here. Money received now lands on what is owed
                        by itself, so an order with the customer's cash available against it is
                        already settled by the time this menu opens — and asking the operator to
                        apply it by hand was the whole complication we removed. */}
                    <DropdownMenuSeparator />
                    {order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 && (
                      <DropdownMenuItem onClick={createInvoice}>
                        <FileText className="h-3.5 w-3.5 mr-2" /> {salesDocKind === 'receipt' ? 'Create receipt' : 'Create invoice'}
                      </DropdownMenuItem>
                    )}
                    {/* In-app first when the supplier is on the platform (claimed identity); the
                        email PDF stays as the universal fallback. Once handed off, neither shows —
                        the round-trip status in the header is the record. */}
                    {order.order_type === 'purchase' && handoff?.available && !order.paired_order_id && (
                      <DropdownMenuItem onClick={sendToSupplierInApp}>
                        <Send className="h-3.5 w-3.5 mr-2 text-primary" />
                        Send in-app{handoff.supplierWorkspaceName ? ` to ${handoff.supplierWorkspaceName}` : ''}
                      </DropdownMenuItem>
                    )}
                    {order.order_type === 'purchase' && !order.paired_order_id && (
                      <DropdownMenuItem onClick={sendToSupplier}>
                        <Send className="h-3.5 w-3.5 mr-2" /> {handoff?.available ? 'Email to supplier (PDF)' : 'Send to supplier'}
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
                    {order.order_type === 'sales' && (order.status === 'confirmed' || order.status === 'partially_fulfilled') && (
                      <DropdownMenuItem onClick={coverShortfall}>
                        <PackagePlus className="h-3.5 w-3.5 mr-2 text-amber-500" /> Cover shortfall from suppliers
                      </DropdownMenuItem>
                    )}
                    {/* One action, not two. "Re-order" and "Duplicate order" differed only in which
                        prices the copy carried — same items, same party, same everything else — so
                        the choice belongs inside the form as a toggle, not as two menu entries the
                        operator has to tell apart. It also no longer writes a draft just to show
                        you one: nothing is saved until you save. */}
                    <DropdownMenuItem onClick={startReorder}>
                      <RotateCcw className="h-3.5 w-3.5 mr-2" /> Order again
                    </DropdownMenuItem>
                    {/* The named, reusable version of the same idea (#322): the basket without the
                        party, kept in the template library for any future order. */}
                    <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}>
                      <Layers className="h-3.5 w-3.5 mr-2" /> Save as template
                    </DropdownMenuItem>
                    {order.order_type === 'sales' && (
                      <DropdownMenuItem onClick={() => navigate('/finance?tab=doc_dispatch')}>
                        <Truck className="h-3.5 w-3.5 mr-2" /> Dispatch board
                      </DropdownMenuItem>
                    )}
                    {order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                      <>
                        <DropdownMenuSeparator />
                        {/* Derived from the delivered quantities; setting it here is reverted by
                            the next delivery edit. Marks every line delivered instead, which is
                            what 'completed' actually means and what the derivation reads. */}
                        <DropdownMenuItem onClick={() => void markAllDelivered()}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark completed
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
              {/* gap-1: the shared TabsList packs its triggers flush, so with this many the active
                  one's fill runs straight into its neighbours' labels and the strip reads as one
                  block rather than a row of choices. */}
              <TabsList className="gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                {orderTabs.includes('suppliers') && <TabsTrigger value="suppliers">Suppliers</TabsTrigger>}
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                {orderTabs.includes('match') && <TabsTrigger value="match">3-Way Match</TabsTrigger>}
                <TabsTrigger value="customs">Customs</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-3 space-y-4">

            {/* The "apply this customer's credit" banner used to live here. Money received now lands
                on what is owed by itself (`auto_allocate_workspace`), so there is nothing left for
                an operator to notice and apply — an order with cash available against it is simply
                already settled by the time this panel renders. */}
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

            {/* Where this order came from. `create_order_from_thread_intake` has stamped the
                conversation on every order it raised and nothing ever showed it, so the customer
                exchange that produced the order was unreachable from the order itself — the same
                write-only-link shape as "Covered by". */}
            {order.source_thread_id && (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Raised from</span>
                <div className="mt-1">
                  <Link to={`/inbox?thread=${order.source_thread_id}`} className="text-xs hover:underline">
                    <MessageSquare className="mr-1 inline h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">the customer conversation</span>
                  </Link>
                </div>
              </div>
            )}

            {/* The forward view, from the purchase side: the customer order this was bought to
                serve. The header picker SETS it; this states it as a link, because "which sale is
                this for" is only useful if you can open that sale. Mirrors "Covered by" below. */}
            {order.order_type === 'purchase' && covers && (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Bought for</span>
                <div className="mt-1">
                  <Link to={`${financeBase}/orders/${covers.id}`} className="text-xs hover:underline">
                    <span className="font-medium">{covers.order_number ?? covers.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground"> · {covers.status} · {formatMoney(Number(covers.total), covers.currency)}</span>
                  </Link>
                </div>
              </div>
            )}

            {!editing ? (
              <>
                <div className="rounded-md border border-border/60 overflow-x-auto">
                  {/* On a PURCHASE order the price paid IS the cost, so Cost and Cost total repeat
                      Price and Net verbatim and Profit is 0 by construction — three columns that
                      can only ever restate the two beside them. Margin belongs to a sale. */}
                  <div className={`grid ${isSalesOrder ? 'grid-cols-[minmax(240px,1.7fr)_44px_52px_120px_82px_92px_84px_94px_88px_84px_96px]' : 'grid-cols-[minmax(240px,1.7fr)_44px_52px_120px_82px_92px_84px_96px]'} gap-2 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground ${isSalesOrder ? 'min-w-[1040px]' : 'min-w-[760px]'}`}>
                    <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Delivered</span><span className="text-right" title={isSalesOrder ? 'Sell price per unit (excl. VAT)' : 'Cost per unit — what we pay the supplier (excl. VAT)'}>{isSalesOrder ? 'Price' : 'Cost/unit'}</span><span className="text-right" title="Net = price × qty (excl. VAT)">Net</span>{isSalesOrder && <><span className="text-right" title="Cost per unit — what this costs us">Cost</span><span className="text-right" title="Cost total = cost/unit × qty">Cost total</span><span className="text-right" title="Profit = net − cost total (excl. VAT)">Profit</span></>}<span className="text-right" title="VAT amount on this line">VAT</span><span className="text-right" title="Total = net + VAT">Total</span>
                  </div>
                  {items.map((it) => {
                    const gross = Number(it.net_value) + Number(it.vat_amount);
                    const unitLabel = UNIT_OPTIONS.find((u) => u.code === it.measurement_unit_code)?.label ?? (it.measurement_unit_code || '—');
                    const supName = it.supplier_company_id ? supplierNames.get(it.supplier_company_id) : undefined;
                    const lineCost = it.unit_cost != null ? Number(it.unit_cost) * Number(it.quantity) : null;
                    const lineProfit = lineCost != null ? Number(it.net_value) - lineCost : null;
                    const del = Number(it.quantity_delivered); const q = Number(it.quantity);
                    const delTone = del >= q && q > 0 ? 'text-emerald-600' : del > 0 ? 'text-amber-600' : 'text-muted-foreground';
                    // What this line's supplier is still owed, AFTER a covering purchase order is
                    // taken into account. `?? 1` keeps the button for a supplier the rollup does not
                    // know about — an unknown is not a settlement.
                    const lineSupplierOwed = it.supplier_company_id ? (supplierOwedById.get(it.supplier_company_id) ?? 1) : 1;
                    // Settled BY that purchase order rather than by cash on this sale. Worth naming
                    // on the line: this order's own ledger shows nothing, so saying nothing here
                    // reads as "the supplier has not been paid".
                    const linePaidOnPo = lineSupplierOwed <= 0.005
                      ? coveredBy.find((c) => c.supplier_company_id === it.supplier_company_id) ?? null
                      : null;
                    return (
                    <div key={it.id} className={`grid ${isSalesOrder ? 'grid-cols-[minmax(240px,1.7fr)_44px_52px_120px_82px_92px_84px_94px_88px_84px_96px]' : 'grid-cols-[minmax(240px,1.7fr)_44px_52px_120px_82px_92px_84px_96px]'} gap-2 border-t border-border/40 px-3 py-1.5 text-sm items-center ${isSalesOrder ? 'min-w-[1040px]' : 'min-w-[760px]'}`}>
                      <span className="min-w-0">
                        <span className="block truncate">{it.description}</span>
                        {/* #6/#7 — who supplies this line (and therefore who we owe). Only a SALES
                            order mixes suppliers across lines; on a PURCHASE order every line comes
                            from the order's own supplier, already chosen when the order was raised,
                            so asking again per line is work with no possible second answer. */}
                        <span className="inline-flex items-center gap-2">
                          {/* What this line IS to the warehouse. A line flagged for stock but
                              pointing at no product cannot be received — `receive_order_into_
                              warehouse` skips it — so the gap is stated ON the line, next to the
                              fix, rather than discovered as a red toast after the fact. Unlike the
                              figures above, this stays editable once a bill exists: it is not a
                              figure, and locking it is what made the skip unfixable. */}
                          {it.update_warehouse && !it.product_id ? (
                            <button type="button" className="text-[10px] text-amber-600 hover:underline inline-flex items-center gap-0.5"
                              disabled={saving} onClick={() => setStockPick(it)}>
                              <AlertTriangle className="h-2.5 w-2.5" /> not in catalog — won’t be stocked
                            </button>
                          ) : !it.update_warehouse ? (
                            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                              disabled={saving} onClick={() => setStockPick(it)}>
                              <Unlink className="h-2.5 w-2.5" /> off-warehouse
                            </button>
                          ) : (
                            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                              disabled={saving} onClick={() => setStockPick(it)}>
                              <Package className="h-2.5 w-2.5" /> {(it.product_id && productNames.get(it.product_id)) || 'in catalog'}
                            </button>
                          )}
                          {order.order_type === 'sales' && (
                            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5" onClick={() => setSupplierPick({ itemId: it.id, productId: it.product_id ?? null, label: it.description, currentId: it.supplier_company_id ?? null })}>
                              {supName ? <><Building2 className="h-2.5 w-2.5" /> {supName}</> : <><Plus className="h-2.5 w-2.5" /> supplier</>}
                            </button>
                          )}
                          {/* WHY this line is 0%. myDATA requires an exemption cause on every
                              vatCategory 7/8 line, and `generate_invoice_from_order` now refuses
                              without one — so the gap is stated here, beside the fix, rather than
                              surfacing as a rejected document after the operator has moved on.
                              A line inherits the customer's standing reason when it has none, so
                              this only turns amber when nothing anywhere justifies the zero. */}
                          {order.order_type === 'sales' && Number(it.vat_percent ?? 0) === 0 && (
                            it.vat_exemption_category != null ? (
                              <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                                disabled={saving} onClick={() => setVatExemptPick(it)}
                                title={mydataExemptionLabel(it.vat_exemption_category) ?? undefined}>
                                <Percent className="h-2.5 w-2.5" /> 0% · cause {it.vat_exemption_category}
                              </button>
                            ) : partyVatExemption != null ? (
                              <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                                disabled={saving} onClick={() => setVatExemptPick(it)}
                                title={`From the customer's record: ${mydataExemptionLabel(partyVatExemption) ?? ''}`}>
                                <Percent className="h-2.5 w-2.5" /> 0% · cause {partyVatExemption} (customer)
                              </button>
                            ) : (
                              <button type="button" className="text-[10px] text-amber-600 hover:underline inline-flex items-center gap-0.5"
                                disabled={saving} onClick={() => setVatExemptPick(it)}>
                                <AlertTriangle className="h-2.5 w-2.5" /> 0% VAT — reason required to invoice
                              </button>
                            )
                          )}
                          {/* Under warranty? A sold unit the customer still owns is the installed
                              base's whole subject, and THIS is where an operator knows it: at the
                              moment they are looking at what was sold. Registering here writes the
                              order + line onto the unit, so the customer's Warranties tab can say
                              where it came from and the order can say it is covered. Purchases are
                              excluded — a purchase order has no customer to register against. */}
                          {isSalesOrder && lineAssetsFailed && (
                            <span className="text-[10px] text-amber-600 inline-flex items-center gap-0.5"
                              title="The installed-base read failed, so this line's warranty is unknown. Reload the order.">
                              <ShieldCheck className="h-2.5 w-2.5" /> warranty unknown
                            </span>
                          )}
                          {isSalesOrder && !lineAssetsFailed && lineWarranty(it) && (
                            <button type="button" className="text-[10px] text-emerald-500 hover:underline inline-flex items-center gap-0.5"
                              title={`Registered in the customer's installed base — covered to ${lineWarranty(it)!.ends_on}`}
                              onClick={() => setWarrantyPick(it)}>
                              <ShieldCheck className="h-2.5 w-2.5" /> covered to {lineWarranty(it)!.ends_on}
                            </button>
                          )}
                          {isSalesOrder && !lineAssetsFailed && !lineWarranty(it) && (
                            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                              title="Register this line in the customer's installed base with a warranty period"
                              onClick={() => setWarrantyPick(it)}>
                              <ShieldCheck className="h-2.5 w-2.5" /> {lineAssets.has(it.id) ? 'registered — no cover' : 'warranty'}
                            </button>
                          )}
                          {/* Mark this line's cost as paid → records a supplier bill + payment on the
                              order. Once the line's supplier is settled this becomes WHERE it was
                              settled, because on a covered sale that is a different order entirely. */}
                          {lineCost != null && lineCost > 0.005 && order.order_type === 'sales' && (
                            lineSupplierOwed > 0.005 ? (
                              <button type="button" className="text-[10px] text-red-400 hover:text-foreground inline-flex items-center gap-0.5" title="Record a payment to this line's supplier" onClick={() => openLinePayment(it)}>
                                <Receipt className="h-2.5 w-2.5" /> Mark paid
                              </button>
                            ) : linePaidOnPo ? (
                              <Link to={`${financeBase}/orders/${linePaidOnPo.id}`} className="text-[10px] text-emerald-500 hover:underline inline-flex items-center gap-0.5"
                                title="This line's cost is settled on the purchase order raised to cover this sale">
                                <Receipt className="h-2.5 w-2.5" /> paid on {linePaidOnPo.order_number ?? 'the purchase order'}
                              </Link>
                            ) : null
                          )}
                        </span>
                      </span>
                      <span className="text-right tabular-nums">{Number(it.quantity)}</span>
                      <span className="text-muted-foreground text-xs">{unitLabel}</span>
                      {/* Delivered: inline-editable (reads like text, box on hover/focus) + quick menu.
                          Tone: green = fully delivered, amber = partial. Status auto-advances. */}
                      {/* #320: this is a PICKING marker and nothing else. It writes
                          quantity_delivered and drives recompute_order_fulfilment; it does not
                          move warehouse stock, because goods may only leave against a fiscal
                          accompanying document (τιμολόγιο / Δελτίο Αποστολής). Saying so on hover
                          matters — this control used to move stock, and an operator who still
                          believes it does will think the warehouse is wrong. */}
                      {/* Still disabled on draft/cancelled: deliver_order_line skips status
                          recomputation there, so the cell turned green "3 / 3" with no status
                          change. Reason on hover. */}
                      <div className="flex items-center justify-end gap-0.5"
                        title={deliveryLocked
                          ? `Deliveries are recorded once the order leaves ${order.status}. Confirm it first.`
                          : 'Picking progress only — this does not move warehouse stock. Stock moves when the goods get their document: issue the invoice, or a Δελτίο Αποστολής from the Dispatch board.'}>
                        <Input key={`${it.id}-${it.quantity_delivered}`}
                          className={`h-6 w-9 text-right text-xs px-0.5 tabular-nums border-0 shadow-none bg-transparent rounded hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-1 ${delTone} ${deliveryLocked ? 'opacity-50' : ''}`}
                          type="number" step="1" min="0" defaultValue={del} disabled={saving || deliveryLocked}
                          onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== del) void setLineDelivered(it.id, v); }} />
                        <span className="text-[10px] text-muted-foreground">/ {q}</span>
                        {!deliveryLocked && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className="h-3 w-3" /></button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => void setLineDelivered(it.id, q)}>Mark fully picked</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void setLineDelivered(it.id, Math.ceil(q / 2))}>Mark half picked</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void setLineDelivered(it.id, 0)}>Mark not picked</DropdownMenuItem>
                            {/* The menu says "picked", the column says "Delivered": the column name
                                is the order's fulfilment vocabulary and drives its status, while
                                the verbs are what the click actually does. Naming the action
                                "delivered" is what made operators read it as a dispatch. */}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                      </div>
                      <span className="text-right tabular-nums" title={Number(it.discount_pct) > 0 ? `List ${formatMoney(Number(it.unit_price), order.currency)} · ${Number(it.discount_pct)}% off` : 'Sell price per unit (excl. VAT)'}>
                        {Number(it.discount_pct) > 0 && Number(it.quantity) > 0
                          ? formatMoney(Number(it.net_value) / Number(it.quantity), order.currency)
                          : formatMoney(Number(it.unit_price), order.currency)}
                      </span>
                      <span className="text-right tabular-nums" title="Net = price × qty (excl. VAT, after discount)">{formatMoney(Number(it.net_value), order.currency)}</span>
                      {isSalesOrder && (
                        <>
                          <span className="text-right tabular-nums text-muted-foreground" title="Cost per unit">{it.unit_cost != null ? formatMoney(Number(it.unit_cost), order.currency) : '—'}</span>
                          <span className="text-right tabular-nums text-muted-foreground" title="Cost total (cost/unit × qty) — what this line costs us">{lineCost != null ? formatMoney(lineCost, order.currency) : '—'}</span>
                          <span className={`text-right tabular-nums ${lineProfit == null ? 'text-muted-foreground' : lineProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`} title="Profit on this line (excl. VAT) + margin % of net">
                            {lineProfit != null ? formatMoney(lineProfit, order.currency) : '—'}
                            {lineProfit != null && Number(it.net_value) > 0 && (
                              <span className="block text-[9px] text-muted-foreground">{Math.round((lineProfit / Number(it.net_value)) * 100)}%</span>
                            )}
                          </span>
                        </>
                      )}
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
                  {isSalesOrder && orderMargin != null && (
                    <div className="flex justify-between gap-8 w-60 font-medium"><span className="text-muted-foreground">Profit (excl. VAT)</span><span className={`tabular-nums ${orderMargin >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(orderMargin, order.currency)}{Number(order.subtotal_net) > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">{Math.round((orderMargin / Number(order.subtotal_net)) * 100)}%</span>}</span></div>
                  )}
                </div>

              </>
            ) : (
              <div className="rounded-md border border-border/60">
                {/* A PURCHASE order's price IS its cost — the two are the same figure, and saving
                    writes unit_price into both. Showing a separate editable Cost column here meant
                    typing into a box whose value was silently overwritten on save. Sales orders
                    keep both, because there the sell price and what we paid genuinely differ. */}
                <div className={`grid ${order.order_type === 'sales' ? 'grid-cols-[1fr_52px_60px_80px_80px_84px_24px]' : 'grid-cols-[1fr_52px_60px_80px_84px_24px]'} gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground`}>
                  <span>Product</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">{order.order_type === 'sales' ? 'Price' : 'Cost/unit'}</span>{order.order_type === 'sales' && <span className="text-right">Cost</span>}<span className="text-right">VAT</span><span />
                </div>
                {editItems.map((l, i) => {
                  const short = order.order_type === 'sales' && l.product_id && l.available != null && (Number(l.quantity) || 0) > l.available;
                  return (
                  <React.Fragment key={i}>
                  <div className={`grid ${order.order_type === 'sales' ? 'grid-cols-[1fr_52px_60px_80px_80px_84px_24px]' : 'grid-cols-[1fr_52px_60px_80px_84px_24px]'} items-center gap-2 border-t border-border/40 px-2 py-1.5`}>
                    <Input className="h-8 text-sm" value={l.description} onChange={(e) => setEditItem(i, { description: e.target.value, product_id: null })} placeholder="Product…" />
                    <MoneyInput className="h-8 text-right text-sm px-1" displayDecimals={null} value={l.quantity} onValueChange={(v) => setEditItem(i, { quantity: v ?? 0 })} />
                    <Select value={l.unit_code} onValueChange={(v) => setEditItem(i, { unit_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <MoneyInput className="h-8 text-right text-sm px-1" value={l.unit_price} onValueChange={(v) => setEditItem(i, { unit_price: v ?? 0 })} />
                    {order.order_type === 'sales' && (
                      <MoneyInput className="h-8 text-right text-sm px-1" placeholder="—" value={l.unit_cost} onValueChange={(v) => setEditItem(i, { unit_cost: v })} />
                    )}
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
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditItems((ls) => [...ls, blankLine()])}><Plus className="h-3.5 w-3.5 mr-1" /> New product</Button>
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
              // A purchase order has ONE cash fact: what we have paid the supplier so far. There is
              // no money-in half to show and therefore nothing to net it against — "Received" and
              // "Net cash (in − out)" were two more permanent zeros restating the same figure.
              // The money-in card still appears if cash in somehow exists on the order, because a
              // figure that is really there must not be hidden by a label decision.
              <div className={`grid gap-2 ${isSalesOrder ? 'grid-cols-3' : fin.received > 0.005 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(isSalesOrder || fin.received > 0.005) && (
                  <div className="rounded-md border border-border/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{isSalesOrder ? 'Received' : 'Money back'}</div>
                    <div className="text-sm font-semibold text-emerald-500">{formatMoney(fin.received, order.currency)}</div>
                  </div>
                )}
                <div className="rounded-md border border-border/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{isSalesOrder ? 'Paid to suppliers' : 'Paid to supplier'}</div>
                  <div className="text-sm font-semibold text-red-400">{formatMoney(fin.paid_out, order.currency)}</div>
                </div>
                {isSalesOrder && (
                  <div className="rounded-md border border-border/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      Net cash (in − out)
                      <span title="Cash in the bank now. It differs from Profit because part of the profit is still unpaid (customer / suppliers) and because VAT you've collected sits here until you remit it to the tax office.">ⓘ</span>
                    </div>
                    <div className={`text-sm font-semibold ${fin.profit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(fin.profit, order.currency)}</div>
                  </div>
                )}
              </div>
            )}

            {/* The ladder — the middle rung between "profit earned" and "cash in bank". Makes the
                gap self-explaining (profit is earned on the sale; cash is only what's landed), so
                a profitable-but-uncollected order never reads as lost money. Sales only — payables
                already have the "Suppliers on this order" block below. */}
            {fin && order.order_type === 'sales' && orderMargin != null && (() => {
              const supplierOwed = supExposure.reduce((a, s) => a + supplierOwedAfterCover(s).owed, 0);
              const hasGap = outstanding > 0.005 || supplierOwed > 0.005;
              if (!hasGap) return null;
              return (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
                  <div className="font-medium text-muted-foreground mb-1.5">Earned vs Collected</div>
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

            {/* The order's own note, on the order's own tab. It used to sit below the strip and
                outside every panel, so it repeated itself under Invoices, Payments and everything
                else — a field belonging to the record reading as one belonging to whichever tab you
                were on. Captured when the order is placed; prints on the invoice and the receipt. */}
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

              </TabsContent>

              <TabsContent value="suppliers" className="mt-3 space-y-3">
            {/* What we owe suppliers on this order — line costs grouped by the line's supplier,
                minus money-out already paid to them. "Pay" pre-fills a money-out for the balance.
                Empty means one of two different things, so it says which: a line with no cost owes
                nobody anything, while a line with a cost and no supplier is a payable we cannot
                attribute — and that one is fixable right there on the line. */}
            {order.order_type === 'sales' && (
              <div className="rounded-md border border-border/60">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  <span>Suppliers on this order — what we owe</span>
                  {/* The rollup is derived from the LINES, so there is nothing to add here directly.
                      What an operator actually wants at this point is to book the cost — the same
                      expense form the per-supplier Pay button opens, with nothing pre-filled. */}
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { setExpensePrefill({}); setExpenseOpen(true); }}>
                    <ArrowUpRight className="h-3 w-3 mr-1 text-red-400" /> Add supplier cost
                  </Button>
                </div>
                {supExposure.length === 0 && (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    {items.some((it) => it.unit_cost != null && Number(it.unit_cost) > 0 && !it.supplier_company_id)
                      ? 'No supplier is set on the lines that carry a cost, so what we owe cannot be attributed. Set one from the line above.'
                      : 'No line on this order carries a cost, so there is nothing owed to a supplier.'}
                  </p>
                )}
                {supExposure.map((s) => {
                  // Deferred to the covering purchase order when there is one — see
                  // `supplierOwedAfterCover`. The Pay button goes with it: it books a supplier
                  // bill, and pressing it for goods a paid purchase order already covers is a
                  // second payable for one delivery.
                  const { po } = supplierOwedAfterCover(s);
                  return (
                  <div key={s.supplier_company_id} className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {s.name}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-[11px] text-muted-foreground">
                        {s.has_vat
                          ? `cost ${formatMoney(s.cost_net, order.currency)} + ${formatMoney(s.cost - s.cost_net, order.currency)} VAT = ${formatMoney(s.cost, order.currency)} · paid ${formatMoney(s.paid, order.currency)}`
                          : `cost ${formatMoney(s.cost, order.currency)} · paid ${formatMoney(s.paid, order.currency)}`}
                      </span>
                      {po ? (
                        <Link to={`${financeBase}/orders/${po.id}`} className="text-[11px] hover:underline">
                          <span className={po.outstanding > 0.005 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-500'}>
                            {po.outstanding > 0.005
                              ? `${formatMoney(po.outstanding, po.currency)} owed on ${po.order_number ?? 'the purchase order'}`
                              : `paid on ${po.order_number ?? 'the purchase order'}`}
                          </span>
                        </Link>
                      ) : (
                        <>
                          <span className={s.owed > 0.005 ? 'text-red-400 font-medium' : 'text-emerald-500'}>
                            {s.owed > 0.005 ? `owe ${formatMoney(s.owed, order.currency)}` : s.owed < -0.005 ? `overpaid ${formatMoney(-s.owed, order.currency)}` : 'settled'}
                          </span>
                          {s.owed > 0.005 && (
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => openPaySupplier(s)}>
                              <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                            </Button>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                  );
                })}
              </div>
            )}

              </TabsContent>

              <TabsContent value="invoices" className="mt-3 space-y-3">
            {/* Attached invoices. An order with none is the ordinary state, not a fault — the
                document is issued when the goods get one — so the empty line says that plainly
                rather than leaving a blank panel that reads as a failure to load. */}
            <div className="rounded-md border border-border/60">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                <span>Invoices{fin && fin.invoices.length > 0 ? ` (${fin.invoices.length})` : ''}</span>
                {/* Same guard as the Actions menu: an order already invoiced must not raise a second
                    document from the same lines. Nothing is offered on a purchase — a purchase is
                    documented by the supplier's own bill, which is an expense, and the empty state
                    below sends you there rather than pretending there is an invoice to issue. */}
                {order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 && (
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={saving} onClick={createInvoice}>
                    <FileText className="h-3 w-3 mr-1" /> {salesDocKind === 'receipt' ? 'Create receipt' : 'Create invoice'}
                  </Button>
                )}
              </div>
              {!fin || fin.invoices.length === 0 ? (
                <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 px-3 py-2 text-[11px] text-muted-foreground">
                  {order.order_type === 'sales' ? (
                    'Nothing has been invoiced to the customer yet.'
                  ) : (
                    <>
                      A purchase is documented by the supplier’s own bill, not an invoice you issue.
                      <button type="button" className="text-foreground underline underline-offset-2 hover:text-primary" onClick={() => setActiveTab('expenses')}>
                        Book it under Expenses
                      </button>
                    </>
                  )}
                </p>
              ) : fin.invoices.map((iv) => (
                <div key={iv.id} className="flex justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                  <span className="font-mono text-xs">{iv.internal_number ?? iv.id.slice(0, 8)} · {humanizeLabel(iv.status)}</span>
                  <span className="tabular-nums">{formatMoney(Number(iv.total), iv.currency)} <span className="text-[10px] text-muted-foreground">due {formatMoney(Number(iv.amount_due), iv.currency)}</span></span>
                </div>
              ))}
            </div>

              </TabsContent>

              <TabsContent value="expenses" className="mt-3 space-y-3">
            {/* The purchase orders raised to cover this sale. It lives with the expenses because
                that is what it is — the cost side of this order, alongside the bills booked on it —
                rather than a loose block wedged between the order's own summary and its lines.
                (The purchase-side mirror, "Bought for", stays up in the header: the sale a purchase
                serves is the demand behind it, not a cost on it.) */}
            {coveredBy.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  Covered by — purchase orders raised for this sale
                </div>
                {coveredBy.map((po) => (
                  <Link key={po.id} to={`${financeBase}/orders/${po.id}`}
                    className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0 hover:bg-muted/40">
                    <span className="font-mono text-xs">{po.order_number ?? po.id.slice(0, 8)} · {humanizeLabel(po.status)}</span>
                    {/* Settlement, not just the figure: "there is a purchase order for €2,580" and
                        "that €2,580 has been paid" are different facts, and only the second one
                        tells the operator whether this sale still costs them anything. */}
                    <span className="flex items-center gap-3">
                      <span className={`text-[11px] ${po.outstanding > 0.005 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-500'}`}>
                        {po.outstanding > 0.005 ? `${formatMoney(po.outstanding, po.currency)} still owed` : 'paid'}
                      </span>
                      <span className="tabular-nums">{formatMoney(Number(po.total), po.currency)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* Every expense attached to this order — the supplier's own bill plus any extra cost
                put on it. Many per order by design (`supplier_bills.order_id` is not unique), so
                the header carries the count and the attach action, and each row can be detached
                again (detaching NEVER deletes the expense — it stays in Payables, just on no
                order, which is also how you move one to a different order). */}
            {/* Rendered even before `fin` resolves: the tab is always offered, and a tab that opens
                onto nothing at all reads as broken. Attaching an expense does not need the rollup. */}
            {(
              <div className="rounded-md border border-border/60">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  <span>Expenses on this order{fin && fin.supplierBills.length > 0 ? ` (${fin.supplierBills.length})` : ''}</span>
                  {/* An order holds MANY expenses (`supplier_bills.order_id` is not unique), so both
                      stay available after the first one: "Add" books a new cost, "Attach" claims one
                      already sitting in Payables — the transport invoice that landed a week late. */}
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { setExpensePrefill({}); setExpenseOpen(true); }}>
                      <ArrowUpRight className="h-3 w-3 mr-1 text-red-400" /> Add {(fin?.supplierBills.length ?? 0) > 0 ? 'another' : 'expense'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setLinkExpenseOpen(true)}>
                      <Link2 className="h-3 w-3 mr-1" /> Attach existing
                    </Button>
                  </span>
                </div>
                {!fin || fin.supplierBills.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    {/* "No cost is booked against this order" was false whenever a purchase order
                        covered the sale: the cost was booked, on that order, and saying otherwise
                        while the block directly above listed it made the panel argue with itself. */}
                    {coveredBy.length > 0
                      ? 'No cost is booked directly on this order — what it costs to fulfil sits on the purchase order(s) above. Anything extra (freight, customs, an installer) goes here.'
                      : 'No cost is booked against this order yet.'}
                  </p>
                ) : fin.supplierBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="font-mono text-xs">{b.supplier_bill_number ?? b.id.slice(0, 8)} · {humanizeLabel(b.status)}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(Number(b.total), b.currency)} <span className="text-[10px] text-muted-foreground">due {formatMoney(Number(b.amount_due), b.currency)}</span></span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                        title="Detach from this order — the expense itself is kept"
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            await financeService.setSupplierBillOrder(b.id, null);
                            toast({ title: 'Expense detached', description: 'It stays in Payables, on no order.' });
                            await load(order.id);
                            onChanged();
                          } catch (err: unknown) {
                            toast({ title: 'Could not detach', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
                          } finally { setSaving(false); }
                        }}
                      >
                        <Unlink className="h-3 w-3" />
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}

              </TabsContent>

              <TabsContent value="payments" className="mt-3 space-y-3">
            {/* Attached payments. "No cash has moved" is a real and important answer about an
                order — it is the difference between unpaid and unknown — so the tab states it
                instead of disappearing. */}
            {(!fin || (fin.payments.length === 0 && fin.creditApplied.length === 0)) && (
              <div className="rounded-md border border-border/60">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  <span>Payments &amp; expenses</span>
                  {/* The order's own settlement, seeded with what is still outstanding — a sale is
                      settled by the customer paying us, a purchase by us paying the supplier, and
                      the same dialog records both. */}
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setPayInOpen({ amount: outstanding > 0.005 ? outstanding : undefined })}>
                    {order.order_type === 'purchase'
                      ? <ArrowUpRight className="h-3 w-3 mr-1 text-red-400" />
                      : <ArrowDownLeft className="h-3 w-3 mr-1 text-emerald-500" />}
                    Record payment
                  </Button>
                </div>
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  No cash has moved on this order yet — nothing received, nothing paid out.
                </p>
              </div>
            )}
            {fin && (fin.payments.length > 0 || fin.creditApplied.length > 0) && (
              <div className="rounded-md border border-border/60">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  <span>Payments &amp; expenses</span>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setPayInOpen({ amount: outstanding > 0.005 ? outstanding : undefined })}>
                    {order.order_type === 'purchase'
                      ? <ArrowUpRight className="h-3 w-3 mr-1 text-red-400" />
                      : <ArrowDownLeft className="h-3 w-3 mr-1 text-emerald-500" />}
                    Record payment
                  </Button>
                </div>
                {/* Credit re-homed onto this order from an on-account payment — no fresh cash, so it's
                    read-only here (to reverse it, un-apply from the source payment). Counts in Received. */}
                {fin.creditApplied.map((c) => (
                  <div key={c.allocation_id} className="flex items-start justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="min-w-0">
                      <span className="block truncate">
                        Applied from account credit
                        {c.counterparty_name && <span className="text-muted-foreground">{c.direction === 'in' ? ' · from ' : ' · to '}<span className="text-foreground/80">{c.counterparty_name}</span></span>}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(c.paid_at)} · {c.direction === 'in' ? 'Payment' : 'Expense'} · account credit</span>
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
                      {/* Account only — the method is derived from it, so printing both said
                          "Postbank BG · Bank Payment" and taught the reader nothing twice. */}
                      <span className="text-[11px] text-muted-foreground">{formatDate(p.paid_at)} · {p.direction === 'in' ? 'Payment' : 'Expense'}{acctName ? ` · ${acctName}` : ''}</span>
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
            {payAuditFailed && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Payment history unavailable — the audit log could not be read. This is <strong>not</strong> a statement that nothing was edited.
              </div>
            )}
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
                      {' '}· {formatDate(a.changed_at, { withTime: true })}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Payments / Expenses above are real cash on this order (money received from the customer / paid out). Marking a line
              delivered records picking progress and auto-advances the status — it does <strong>not</strong> move warehouse stock.
              Stock moves when the goods get their fiscal document: issue the invoice, or a Δελτίο Αποστολής from the Dispatch board.
            </p>

              </TabsContent>

              {/* A verdict on everything else in this dialog, so it reads last. */}
              <TabsContent value="match" className="mt-3 space-y-3">
            {/* 3-way match — purchase orders only: PO cost × goods received × supplier bill.
                `no_lines` is not "matched": there is nothing to compare, and letting that render as
                a blank tab would read like a verdict that everything agrees. */}
            {order.order_type === 'purchase' && (!match || match.match_status === 'no_lines') && (
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <span className="text-xs font-semibold">3-way match</span>
                <p className="text-[11px] text-muted-foreground">
                  Nothing to compare yet. The check needs lines on the order with a cost — then it
                  weighs what you <strong>ordered</strong> against what actually <strong>arrived</strong>{' '}
                  and what the supplier <strong>billed</strong>.
                </p>
                {/* The billed side is the half an operator can act on from here: without the
                    supplier's own bill the match sits at "awaiting bill" indefinitely, and a
                    purchase raised by hand rather than from the Inbox has no other way in. */}
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { setExpensePrefill({}); setExpenseOpen(true); }}>
                    <ArrowUpRight className="h-3 w-3 mr-1 text-red-400" /> Record the supplier’s bill
                  </Button>
                  {/* Same status gate the Actions menu applies — a fulfilled or cancelled order has
                      nothing left to receive, and offering it here would be a button that only ever
                      reports back that it did nothing. */}
                  {order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                    <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={saving} onClick={receiveWarehouse}>
                      <PackageCheck className="h-3 w-3 mr-1" /> Receive the goods
                    </Button>
                  )}
                </span>
              </div>
            )}
            {order.order_type === 'purchase' && match && match.match_status !== 'no_lines' && (
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">3-way match</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${MATCH_META[match.match_status].cls}`}>
                    {MATCH_META[match.match_status].label}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">PO cost × goods received × supplier bill</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The safety check before you pay this supplier: what you <strong>ordered</strong>, what actually{' '}
                  <strong>arrived</strong>, and what they <strong>billed</strong> you should all say the same thing.
                  The order is what you owe — the billed figure only differs once the supplier's own invoice
                  arrives in the Expenses Inbox and is linked here, which is the whole point of comparing them.
                </p>
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
                {/* Each state says what to DO next, not just what it is — the badge alone left the
                    operator guessing which of the three documents was still missing. */}
                <p className="text-[11px] text-muted-foreground">
                  {match.match_status === 'awaiting_receipt'
                    ? 'Nothing delivered yet. Mark the lines delivered above as the goods arrive.'
                    : match.match_status === 'awaiting_bill'
                      ? "Goods received. Nothing more to do here unless the supplier's invoice arrives in the Expenses Inbox — link it to this order and it gets checked against these figures."
                      : match.match_status === 'variance'
                        ? 'These do not agree. Fix whatever is wrong above — or take it up with the supplier — before paying.'
                        : 'Ordered, received and billed all agree. Safe to pay.'}
                </p>
              </div>
            )}

              </TabsContent>

              {/* What this order costs at the border. A tab of its own now rather than a card
                  wedged above the strip: it is one more thing the order is, and it says so itself
                  when the order carries nothing declarable. */}
              <TabsContent value="customs" className="mt-3">
                <OrderCustomsCard
                  orderId={order.id}
                  onAddCost={(s) => { setExpensePrefill({ amount: s.amount, description: `${order.order_number ?? order.id.slice(0, 8)} — ${s.description}` }); setExpenseOpen(true); }}
                />
              </TabsContent>
            </Tabs>
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

      {warrantyPick && order && (
        <LineWarrantyDialog
          order={order}
          item={warrantyPick}
          existing={lineAssets.get(warrantyPick.id) ?? null}
          onClose={() => setWarrantyPick(null)}
          onSaved={() => { setWarrantyPick(null); void load(order.id); }}
        />
      )}
      {vatExemptPick && order && (
        <VatExemptionDialog
          label={vatExemptPick.description}
          current={vatExemptPick.vat_exemption_category ?? null}
          inheritedFromParty={partyVatExemption}
          suggestion={suggestVatExemption({
            sellerCountry,
            buyerCountry: buyerVat.country,
            buyerVatNumber: buyerVat.vatNumber,
            buyerVatValidated: buyerVat.validated,
            // A line explicitly OFF the warehouse is hire, labour or transport — a service. One
            // that is stocked is goods. Anything else stays 'unknown', which the suggester
            // reports at low confidence rather than resolving by assumption.
            supply: lineItemTypes.get(vatExemptPick.id)
              ?? (vatExemptPick.update_warehouse === false ? 'services' : 'unknown'),
          })}
          busy={saving}
          onClose={() => setVatExemptPick(null)}
          onApply={(code) => void setLineVatExemption(vatExemptPick.id, code)}
        />
      )}

      {stockPick && order && (
        <LineStockDialog
          workspaceId={order.workspace_id}
          label={stockPick.description}
          unitCode={stockPick.measurement_unit_code ?? null}
          unitCost={stockPick.unit_cost != null ? Number(stockPick.unit_cost) : null}
          currentProductId={stockPick.product_id ?? null}
          currentProductName={stockPick.product_id ? (productNames.get(stockPick.product_id) ?? null) : null}
          updateWarehouse={stockPick.update_warehouse}
          supplierCompanyId={stockPick.supplier_company_id ?? order.supplier_company_id ?? null}
          onClose={() => setStockPick(null)}
          onApply={(patch, note) => void setLineStock(stockPick.id, patch, note)}
        />
      )}
    </Dialog>
    {order && (
      <SaveAsTemplateDialog
        entityType="order"
        sourceId={order.id}
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        defaultTitle={order.order_number ? `Order ${order.order_number}` : undefined}
      />
    )}
    {/* Re-order → the ordinary New order form, pre-filled and re-priced. Saving here runs the
        normal create path, which is what makes numbering, reservation, three-way match and the
        order-created notification fire — an insert behind the scenes fires none of them. */}
    {reorder && order && (
      <NewOrderModal
        workspaceId={order.workspace_id}
        lockedCompanyId={reorder.lockedCompanyId}
        lockedContactId={reorder.lockedContactId}
        preset={{ orderType: reorder.orderType, draft: false }}
        prefill={{ currency: reorder.currency, notes: reorder.notes, lines: reorder.lines }}
        categories={categories}
        open
        onOpenChange={(v) => { if (!v) setReorder(null); }}
        onCreated={(newId) => {
          setReorder(null);
          onChanged();
          if (onOpenOrder) onOpenOrder(newId); else onClose();
        }}
      />
    )}
    {/* All money-OUT on the order — supplier payment / cost — is a supplier bill (Payables & P&L),
        linked to this order + defaulted to the "Order" category. Opened blank (Add expense) or
        pre-filled from a line ("Mark as paid") / the what-we-owe rollup ("Pay"). */}
    {order && (
      <NewExpenseDialog
        workspaceId={order.workspace_id}
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        orderId={order.id}
        prefill={expensePrefill ?? undefined}
        onCreated={async () => {
          setExpenseOpen(false);
          // Recording the expense writes a payment, and every payment runs the settlement sweep —
          // which is what draws the customer's held balance down onto this order. It used to be a
          // second, narrower re-homing bolted on here, capped at the supplier amount rather than
          // the order's outstanding.
          await load(order.id);
          onChanged();
        }}
      />
    )}
    {/* The same link written against an expense that already exists, instead of a new one. */}
    {order && (
      <LinkExpenseToOrderDialog
        workspaceId={order.workspace_id}
        orderId={order.id}
        orderLabel={`order ${order.order_number ?? order.id.slice(0, 8)}`}
        supplierCompanyId={order.supplier_company_id}
        open={linkExpenseOpen}
        onOpenChange={setLinkExpenseOpen}
        onLinked={() => { void load(order.id); onChanged(); }}
      />
    )}
    {/* Recording money ON the order. Which side depends on what KIND of order it is: a sales order
        is settled by the customer paying us, a purchase order by us paying the supplier. The dialog
        used to be hard-wired to the customer side, so "Record payment" on a purchase order offered
        "Received from customer" — the opposite side of the trade. */}
    {order && (
      <RecordPaymentDialog
        workspaceId={order.workspace_id}
        open={!!payInOpen}
        onOpenChange={(o) => { if (!o) setPayInOpen(null); }}
        orderId={order.id}
        orderLabel={order.order_number ?? undefined}
        side={order.order_type === 'purchase' ? 'supplier' : 'customer'}
        initialCounterparty={order.order_type === 'purchase'
          ? { companyId: order.supplier_company_id, contactId: order.supplier_contact_id }
          : { companyId: order.customer_company_id, contactId: order.customer_contact_id }}
        // The ORDER's currency. Without this the dialog reset to EUR and record_payment_fx
        // silently refused to allocate the remainder onto a non-EUR order.
        orderCurrency={order.currency}
        payableBills={(fin?.supplierBills ?? []).filter((b) => Number(b.amount_due) > 0)}
        defaultAmount={payInOpen?.amount}
        presetInvoiceId={order.order_type === 'sales' ? (fin?.invoices ?? []).find((iv) => Number(iv.amount_due) > 0)?.id : undefined}
        // Offered only while a SALES order has no sales document yet — once one exists, issuing a
        // second from a payment would duplicate the filing. A purchase order issues nothing.
        fiscalDocKind={order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 ? salesDocKind : undefined}
        fiscalDocReason={salesDocumentKindReason(buyerIdentity)}
        onIssueDoc={createInvoice}
        onSaved={() => { setPayInOpen(null); void load(order.id); onChanged(); }}
      />
    )}
    {connectEmailGate}
    </>
  );
};

/**
 * Put one sold line under warranty — the order-side half of the installed base (#343).
 *
 * The cover period is entered as a NUMBER OF MONTHS and the end date is shown as the consequence,
 * because "24 months" is how a warranty is sold and quoted while `ends_on` is how it is enforced.
 * Only one of the two is stored: the date. Months is an input, never a column, so there is no
 * second copy of the period to drift out of step with the date the reminders actually fire on.
 *
 * The prefill comes from `products.default_warranty_months` when the line points at a catalogue
 * product. That is the same number `apply_asset_service_defaults` would have used had the delivery
 * trigger registered this unit, so agreeing with it here keeps one answer to "how long is this
 * covered for" rather than inventing a second at the order.
 */
const LineWarrantyDialog: React.FC<{
  order: Order;
  item: OrderItem;
  existing: OrderAssetRow | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ order, item, existing, onClose, onSaved }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [months, setMonths] = useState('');
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  // `ends_on` is the FIELD, not a computed display: it is what gets stored and what the customer
  // can hold us to. "Cover (months)" below is a convenience that asks the database to fill it in.
  const [endsOn, setEndsOn] = useState('');
  const [kind, setKind] = useState<WarrantyKind>('manufacturer');
  const [resolving, setResolving] = useState(false);

  // Adopt whatever is already on record: the existing cover when this line has one, otherwise the
  // product's declared default. An existing period loads its STORED dates — no months are
  // back-derived from them, because "how many months is 2026-01-31 → 2026-02-28" has no single
  // right answer and guessing one would silently move the end date on the next save.
  useEffect(() => {
    let cancelled = false;
    // Deliberately NOT `activeCover`: this is an edit form, so a lapsed period must still load —
    // extending an expired warranty is the reason you would open it.
    const current = (existing?.warranties ?? [])
      .slice()
      .sort((a, b) => b.ends_on.localeCompare(a.ends_on))[0] ?? null;
    if (current) {
      setKind(current.kind); setStartsOn(current.starts_on); setEndsOn(current.ends_on);
      return () => { cancelled = true; };
    }
    if (!item.product_id) return () => { cancelled = true; };
    void (async () => {
      const { data } = await supabase.from('products')
        .select('default_warranty_months').eq('id', item.product_id as string).maybeSingle();
      const d = (data as { default_warranty_months?: number | null } | null)?.default_warranty_months;
      if (cancelled || d == null || d <= 0) return;
      setMonths(String(d));
      const end = await warrantyEndDate(startsOn, d).catch(() => null);
      if (!cancelled && end) setEndsOn(end);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.product_id, existing]);

  /** Fill the end date from a month count — the DATABASE does the arithmetic, never this file. */
  const applyMonths = async (raw: string, from: string) => {
    const n = Number(raw);
    if (!from || !Number.isFinite(n) || n <= 0) return;
    setResolving(true);
    try {
      const end = await warrantyEndDate(from, n);
      if (end) setEndsOn(end);
    } catch {
      /* leave the operator's own end date alone; it is the field that counts */
    } finally { setResolving(false); }
  };

  // A unit has to belong to somebody. An order with neither a customer company nor a contact has
  // nobody to register it against, and saying so up front beats a 400 from the RPC.
  const hasCustomer = !!(order.customer_company_id || order.customer_contact_id);

  const save = async () => {
    if (!endsOn || !hasCustomer) return;
    setSaving(true);
    try {
      await customerAssetsService.warrantOrderLine({
        order_id: order.id,
        order_item_id: item.id,
        // Reuse the unit this line already produced. Registering a second one against the same
        // line is a 23505 — which is what saving from the "covered to …" button used to do.
        asset_id: existing?.id ?? null,
        name: item.description,
        customer_company_id: order.customer_company_id,
        customer_contact_id: order.customer_contact_id,
        project_id: order.project_id ?? null,
        product_id: item.product_id ?? null,
        supplier_company_id: item.supplier_company_id ?? null,
        quantity: Number(item.quantity) || 1,
        purchased_on: (order.created_at ?? '').slice(0, 10) || null,
        starts_on: startsOn,
        ends_on: endsOn,
        kind,
      });
      toast({ title: 'Warranty recorded', description: `${item.description} — covered to ${endsOn}.` });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Could not record the warranty', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Warranty' : 'Add warranty'}</DialogTitle>
          <DialogDescription>
            {hasCustomer
              ? <>Registers <span className="text-foreground">{item.description}</span> in the customer’s installed base, linked to this order and line.</>
              : 'This order has no customer, so there is nobody to register the unit against. Set a customer on the order first.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wr-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as WarrantyKind)}>
                <SelectTrigger id="wr-kind" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manufacturer">Manufacturer</SelectItem>
                  <SelectItem value="extended">Extended</SelectItem>
                  <SelectItem value="installer">Installer / labour</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="wr-months">Cover (months)</Label>
              <Input id="wr-months" type="number" min="1" step="1" className="h-9" value={months}
                placeholder="24"
                onChange={(e) => setMonths(e.target.value)}
                onBlur={(e) => void applyMonths(e.target.value, startsOn)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wr-start">Starts on</Label>
              <Input id="wr-start" type="date" className="h-9" value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                onBlur={(e) => void applyMonths(months, e.target.value)} />
            </div>
            <div>
              <Label htmlFor="wr-end">Ends on</Label>
              <Input id="wr-end" type="date" className="h-9" value={endsOn}
                disabled={resolving}
                onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter a month count to fill the end date, or set the end date directly — that date is
            what gets stored.
          </p>
          {existing && (
            <p className="text-xs text-muted-foreground">
              Already registered as <span className="text-foreground">{existing.name}</span>. Saving updates its {kind} cover.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {/* `resolving` gates Save on purpose: "cover months" fills the end date on blur, and
              blur fires BEFORE the click that caused it. Without this, typing 36 and hitting Save
              stores the end date the previous month count produced. */}
          <Button onClick={() => void save()} disabled={saving || resolving || !endsOn || !hasCustomer}>
            {(saving || resolving) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Pick (or clear) the supplier we buy a product from — searches CRM companies flagged as suppliers.
/**
 * What a line IS, as far as the warehouse is concerned. Two answers, and the operator has to give
 * one of them — nothing in the data can infer it:
 *
 *  · goods we hold  → link (or create) a catalog product, and receiving adds to its stock;
 *  · a service      → mark it off-warehouse, and receiving marks it delivered and stocks nothing.
 *
 * Creating the product from here is offered because refusing to would send someone to the catalog
 * to build the item by hand and come back — but it is a deliberate CLICK, never automatic. Auto-
 * creating a product for every unlinked line would fill the catalog with `Delivery`, `Discount`
 * and typos, each carrying a phantom stock quantity that is far harder to unwind than this dialog.
 */
/**
 * WHY a line is 0% VAT.
 *
 * An order may carry 0% for as long as it stays an order — it declares nothing. The cause becomes
 * mandatory at the moment the rate turns into a fiscal claim, so `generate_invoice_from_order`
 * refuses without one and this is where that refusal is answered. Codes are the ΑΑΔΕ catalog, not
 * free text: the number is what myDATA receives, and a wrong one is rejected at submission.
 */
const VatExemptionDialog: React.FC<{
  label: string;
  current: number | null;
  /** The customer's standing cause, which this line inherits when it states none. */
  inheritedFromParty: number | null;
  busy?: boolean;
  onClose: () => void;
  onApply: (code: number | null) => void;
  /** What the rules infer from the buyer + the line. A DEFAULT, never an auto-apply. */
  suggestion?: ExemptionSuggestion;
}> = ({ label, current, inheritedFromParty, suggestion, busy, onClose, onApply }) => {
  // Pre-select the suggestion only when nothing is set yet and it is confident. A low-confidence
  // guess sitting pre-filled in the box is the same as deciding for the operator, which is the one
  // thing neither Novus nor AADE will do for us either — the cause is the issuer's own claim.
  const [code, setCode] = useState<string>(
    current != null ? String(current)
      : suggestion?.code != null && suggestion.confidence === 'high' ? String(suggestion.code)
      : '',
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Why is “{label}” 0% VAT?</DialogTitle>
          <DialogDescription>
            myDATA requires an exemption cause on every 0% line. The order is fine without one —
            this is only needed before it can become an invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {suggestion && (
            <div className={`rounded-md border px-3 py-2 text-xs ${
              suggestion.confidence === 'high'
                ? 'border-border/60 bg-muted/20'
                : 'border-amber-500/40 bg-amber-500/5'}`}>
              <div className="flex items-center gap-1.5 font-medium">
                {suggestion.confidence === 'high'
                  ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  : <AlertTriangle className="h-3 w-3 text-amber-500" />}
                {suggestion.code != null
                  ? <span>Suggested: cause {suggestion.code}</span>
                  : <span>No exemption suggested</span>}
                {suggestion.confidence === 'low' && (
                  <span className="text-muted-foreground">· check before accepting</span>
                )}
              </div>
              {suggestion.label && <p className="mt-0.5 text-muted-foreground">{suggestion.label}</p>}
              <p className="mt-1 text-muted-foreground">{suggestion.rationale}</p>
              {suggestion.caveat && <p className="mt-1 text-amber-600 dark:text-amber-400">{suggestion.caveat}</p>}
              {suggestion.code != null && String(suggestion.code) !== code && (
                <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" disabled={busy}
                  onClick={() => setCode(String(suggestion.code))}>
                  Use cause {suggestion.code}
                </Button>
              )}
            </div>
          )}
          {inheritedFromParty != null && current == null && (
            <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              This line already inherits <span className="font-medium text-foreground">cause {inheritedFromParty}</span> from
              the customer’s record. Set one here only to override it for this line.
            </p>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Exemption cause</Label>
            <Select value={code} onValueChange={setCode} disabled={busy}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick the governing article…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {MYDATA_EXEMPTION_CATEGORIES.map((c) => (
                  <SelectItem key={c.code} value={String(c.code)}>{c.code} · {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {current != null && (
            <Button variant="ghost" disabled={busy} onClick={() => onApply(null)}>Clear</Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button disabled={busy || !code} onClick={() => onApply(parseInt(code, 10))}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Set reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LineStockDialog: React.FC<{
  workspaceId: string;
  label: string;
  unitCode: string | null;
  unitCost: number | null;
  currentProductId: string | null;
  currentProductName: string | null;
  updateWarehouse: boolean;
  supplierCompanyId: string | null;
  onClose: () => void;
  onApply: (patch: { productId?: string | null; updateWarehouse?: boolean }, note: string) => void;
}> = ({ workspaceId, label, unitCode, unitCost, currentProductId, currentProductName, updateWarehouse, supplierCompanyId, onClose, onApply }) => {
  const { toast } = useToast();
  const handleQuota = useQuotaErrorHandler();
  const [term, setTerm] = useState(label);
  const [opts, setOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) { setOpts([]); return; }
    const h = setTimeout(async () => {
      // Workspace-scoped, like the new-order line search — RLS alone should never be the only
      // thing standing between this box and another tenant's catalog.
      const { data } = await supabase.from('products').select('id, name')
        .eq('workspace_id', workspaceId).ilike('name', `%${t}%`).limit(8);
      setOpts((data ?? []) as Array<{ id: string; name: string }>);
    }, 200);
    return () => clearTimeout(h);
  }, [term, workspaceId]);

  const createAndLink = async () => {
    const name = term.trim() || label;
    setBusy(true);
    try {
      // The line already knows the unit and what we paid — carrying them over means the new
      // product arrives costed and measured instead of as a bare name someone has to finish.
      const productId = await warehouseService.createProduct({
        workspaceId, name, itemType: 'good',
        unit: unitCode || null,
        cost: unitCost != null && unitCost > 0 ? unitCost : null,
      });
      if (supplierCompanyId) {
        await supabase.from('products').update({ supplier_company_id: supplierCompanyId })
          .eq('id', productId).is('supplier_company_id', null);
      }
      onApply({ productId, updateWarehouse: true }, `“${name}” added to the catalog and linked.`);
    } catch (err: any) {
      if (!handleQuota(err)) {
        toast({ title: 'Could not create the product', description: err?.message, variant: 'destructive' });
      }
      setBusy(false);
    }
  };

  const exactMatch = opts.some((o) => o.name.trim().toLowerCase() === term.trim().toLowerCase());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Stock for “{label}”</DialogTitle>
          <DialogDescription>
            The warehouse counts quantities against a catalog product, so a typed-in line has nothing to add to.
            Tell it which product this is — or that it isn’t stock at all.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {currentProductId && (
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 min-w-0">
                <Package className="h-4 w-4 shrink-0" />
                <span className="truncate">{currentProductName ?? 'Linked to catalog'}</span>
              </span>
              <Button size="sm" variant="ghost" disabled={busy}
                onClick={() => onApply({ productId: null }, 'Line unlinked from the catalog.')}>Unlink</Button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7" placeholder="Search the catalog…" value={term} disabled={busy}
              onChange={(e) => setTerm(e.target.value)} />
          </div>
          {opts.length > 0 && (
            <div className="rounded-md border border-border/60 divide-y divide-border/40">
              {opts.map((o) => (
                <button key={o.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" disabled={busy}
                  onClick={() => onApply({ productId: o.id, updateWarehouse: true }, `Linked to “${o.name}”.`)}>{o.name}</button>
              ))}
            </div>
          )}
          {term.trim().length >= 2 && !exactMatch && (
            <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => void createAndLink()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5 mr-2" />}
              Create “{term.trim()}” as a new product
            </Button>
          )}
          <div className="rounded-md border border-border/60 p-3 space-y-1.5">
            <p className="text-xs font-medium">Not stock at all?</p>
            <p className="text-[11px] text-muted-foreground">
              Hire, labour, transport, a one-off charge — nothing enters the warehouse. Receiving will mark the line
              delivered and leave stock untouched.
            </p>
            {updateWarehouse ? (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => onApply({ updateWarehouse: false, productId: null }, 'Line marked off-warehouse — it will never be stocked.')}>
                It’s a service — don’t stock it
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => onApply({ updateWarehouse: true }, 'Line put back on the warehouse — link a product to stock it.')}>
                Put it back on the warehouse
              </Button>
            )}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
      const { data } = await supabase.from('crm_companies').select('id, name').eq('is_supplier', true).ilike(CRM_SEARCH_COLUMN, foldedLike(t)).limit(8);
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
