import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, ShoppingCart, Trash2, Search, Truck, FileText, Receipt, PackageCheck, ChevronDown, MoreHorizontal, CheckCircle2, Pencil, Package, FileClock, Building2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
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
import { formatMoney, financeService, VAT_CATEGORIES } from '@/modules/finance/services/financeService';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL,
  type OrderType, type OrderStatus, type OrderListRow, type OrderItem, type Order,
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
export const OrdersPanel: React.FC<{ workspaceId: string; companyId?: string; contactId?: string; projectId?: string }> = ({ workspaceId, companyId, contactId, projectId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeF, setTypeF] = useState<'all' | OrderType>('all');
  const [statusF, setStatusF] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  // What the New-order dropdown chose: sales/purchase + whether it's a draft (pre-order).
  const [createPreset, setCreatePreset] = useState<{ orderType: OrderType; draft: boolean }>({ orderType: 'sales', draft: false });
  const [openId, setOpenId] = useState<string | null>(null);
  // Inside a CRM party (company/contact) the list is already scoped — hide the filter cluster.
  const embedded = !!(companyId || contactId);

  const openCreate = (orderType: OrderType, draft: boolean) => { setCreatePreset({ orderType, draft }); setCreateOpen(true); };

  const load = async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setRows(await ordersService.list({ workspaceId, companyId, contactId, projectId, orderType: typeF === 'all' ? undefined : typeF, status: statusF === 'all' ? undefined : statusF }));
    } catch (err: any) {
      toast({ title: 'Failed to load orders', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, companyId, contactId, projectId, typeF, statusF]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => (r.party_name ?? '').toLowerCase().includes(t) || (r.order_number ?? '').toLowerCase().includes(t));
  }, [rows, search]);

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
                <Select value={typeF} onValueChange={(v: any) => setTypeF(v)}>
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
                <Select value={statusF} onValueChange={(v: any) => setStatusF(v)}>
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
              <DropdownMenuItem onClick={() => openCreate('sales', false)}>
                <ShoppingCart className="h-3.5 w-3.5 mr-2" /> Sales order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openCreate('purchase', false)}>
                <Package className="h-3.5 w-3.5 mr-2" /> Purchase order
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openCreate('sales', true)}>
                <FileClock className="h-3.5 w-3.5 mr-2" /> Pre-order <span className="ml-1 text-[10px] text-muted-foreground">(draft)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No orders yet. An accepted quote creates one automatically, or add one above.</div>
          ) : (
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
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td className="px-4 py-2 font-mono text-xs">{r.order_number ?? r.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">{r.party_name ?? '—'}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] capitalize">{r.order_type}</Badge></td>
                    <td className="px-4 py-2"><Badge variant={STATUS_TONE[r.status] as any} className="text-[10px]">{ORDER_STATUS_LABEL[r.status]}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{ORDER_PAYMENT_LABEL[r.payment_status]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(r.total), r.currency)}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <NewOrderModal
        workspaceId={workspaceId}
        lockedCompanyId={companyId}
        lockedContactId={contactId}
        preset={createPreset}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); void load(); }}
      />
      <OrderDetailDialog orderId={openId} open={openId !== null} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
};

// ---------------------------------------------------------------------------

type Line = { product_id?: string | null; description: string; quantity: number; unit_price: number; unit_cost: number | null; unit_code: string; vat_code: string; available?: number | null };
const blankLine = (): Line => ({ description: '', quantity: 1, unit_price: 0, unit_cost: null, unit_code: DEFAULT_UNIT, vat_code: DEFAULT_VAT_CODE, available: null });

const NewOrderModal: React.FC<{
  workspaceId: string;
  /** When the modal is opened from inside a CRM party, that party is pre-selected and locked. */
  lockedCompanyId?: string;
  lockedContactId?: string;
  /** Chosen from the New-order dropdown: sell vs buy + draft (pre-order) vs confirmed. */
  preset: { orderType: OrderType; draft: boolean };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}> = ({ workspaceId, lockedCompanyId, lockedContactId, preset, open, onOpenChange, onCreated }) => {
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

  const isSales = orderType === 'sales';

  useEffect(() => {
    if (!open) return;
    setParty(null); setPartySearch(''); setPartyOpts([]); setActiveLine(null); setLineProdOpts([]);
    setProject(null); setProjectSearch(''); setProjectOpts([]); setCurrency('EUR');
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
        const next: Line = { ...l, available: pr.available };
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
  const netTotal = calc.reduce((a, c) => a + c.net, 0);
  const vatTotal = calc.reduce((a, c) => a + c.vat, 0);
  const grossTotal = netTotal + vatTotal;
  // Margin = revenue − cost across lines that carry a cost. null when no line has cost yet.
  const anyCost = items.some((l) => l.unit_cost != null);
  const marginTotal = anyCost
    ? items.reduce((a, l) => a + ((Number(l.unit_price) || 0) - (Number(l.unit_cost) || 0)) * (Number(l.quantity) || 0), 0)
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
                  <Input className="h-8 text-right text-sm px-1" type="number" step="0.01" value={l.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} />
                  <Select value={l.unit_code} onValueChange={(v) => setItem(i, { unit_code: v })}>
                    <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {/* Sales: unit price. Purchase: this IS the cost (mirror into unit_cost on save). */}
                  <Input className="h-8 text-right text-sm px-1" type="number" step="0.01" value={l.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} />
                  {isSales && (
                    <Input className="h-8 text-right text-sm px-1" type="number" step="0.01" placeholder="—" value={l.unit_cost ?? ''} onChange={(e) => setItem(i, { unit_cost: e.target.value === '' ? null : Number(e.target.value) })} title="What this costs us — auto-filled from the catalog, editable" />
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

          <div className="flex justify-end gap-4 text-sm">
            <span className="text-muted-foreground">Net {formatMoney(netTotal)}</span>
            <span className="text-muted-foreground">VAT {formatMoney(vatTotal)}</span>
            <span className="font-semibold">Total {formatMoney(grossTotal)}</span>
            {marginTotal != null && <span className={marginTotal >= 0 ? 'text-emerald-500' : 'text-destructive'}>Margin {formatMoney(marginTotal)}</span>}
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

const OrderDetailDialog: React.FC<{ orderId: string | null; open: boolean; onClose: () => void; onChanged: () => void }> = ({ orderId, open, onClose, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [fin, setFin] = useState<Awaited<ReturnType<typeof ordersService.getOrderFinance>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState('');
  // The order only deals in REAL cash: money in (a payment received) or money out (a payment sent).
  const [payDir, setPayDir] = useState<'in' | 'out'>('in');
  // Optional: issue the order's receipt/invoice in the same step as recording money in.
  const [payIssueDoc, setPayIssueDoc] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Line[]>([]);
  // Catalog list prices for the order's products → summarised as a discount total below.
  const [listPrices, setListPrices] = useState<Map<string, number>>(new Map());
  // Per-product supplier (who we buy/owe) → shown on each catalog line, settable inline.
  const [suppliers, setSuppliers] = useState<Map<string, { id: string; name: string }>>(new Map());
  const [supplierPick, setSupplierPick] = useState<{ productId: string; label: string } | null>(null);

  const load = async (id: string) => {
    try {
      setLoading(true);
      const res = await ordersService.get(id);
      const productIds = res.items.map((it) => it.product_id).filter(Boolean) as string[];
      const [finance, lp, sup] = await Promise.all([
        ordersService.getOrderFinance(id),
        ordersService.getListPrices(productIds).catch(() => new Map<string, number>()),
        ordersService.getProductSuppliers(productIds).catch(() => new Map<string, { id: string; name: string }>()),
      ]);
      setOrder(res.order); setItems(res.items); setFin(finance); setListPrices(lp); setSuppliers(sup);
    } catch (err: any) {
      toast({ title: 'Failed to load order', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!orderId) { setOrder(null); setItems([]); setFin(null); setPayOpen(false); setListPrices(new Map()); setSuppliers(new Map()); setSupplierPick(null); return; }
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

  // #7 — set a product's supplier (who we owe when we restock it).
  const setProductSupplier = async (productId: string, supplierCompanyId: string | null) => {
    setSaving(true);
    try {
      await ordersService.setProductSupplier(productId, supplierCompanyId);
      setSupplierPick(null);
      if (order) await load(order.id);
    } catch (err: any) {
      toast({ title: 'Failed to set supplier', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Record real cash ON the order: money in (a payment received) or money out (a payment sent).
  // The payment trigger recomputes payment_status; getOrderFinance refreshes Received/Paid/Profit.
  const openPay = (dir: 'in' | 'out') => {
    if (!order) return;
    setPayDir(dir);
    setPayIssueDoc(false);
    setPayAmt(String(Math.max(0, Number(order.total) - (dir === 'in' ? (fin?.received ?? 0) : (fin?.paid_out ?? 0)))));
    setPayOpen(true);
  };
  const recordPay = async () => {
    if (!order) return;
    const amt = parseFloat(payAmt);
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    const alsoIssue = payIssueDoc && payDir === 'in' && order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0;
    setSaving(true);
    try {
      const { error } = await supabase.from('payments').insert({
        workspace_id: order.workspace_id,
        direction: payDir,
        amount: amt,
        currency: order.currency,
        order_id: order.id,
        paid_at: new Date().toISOString(),
      });
      if (error) throw error;
      setPayOpen(false); setPayAmt('');
      // Cash sale: issue the order's receipt/invoice from the same step, then open it to transmit.
      if (alsoIssue) { await createInvoice(); return; }
      await load(order.id);
      onChanged();
      toast({ title: payDir === 'in' ? 'Money in recorded' : 'Money out recorded' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // #3 — edit the order's line items (only while it has no invoice yet).
  const editable = !!order && order.status !== 'cancelled' && order.status !== 'fulfilled' && (fin?.invoices.length ?? 0) === 0;
  const startEdit = () => {
    setEditItems(items.map((it) => ({ product_id: it.product_id, description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), unit_cost: it.unit_cost, unit_code: it.measurement_unit_code || DEFAULT_UNIT, vat_code: vatCodeOf(it.vat_percent) })));
    setEditing(true);
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
        measurement_unit_code: l.unit_code,
        vat_percent: pctOf(l.vat_code), vat_category: parseInt(l.vat_code, 10) || undefined,
      })));
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
  // A sales order to a company (B2B) issues an invoice; to a bare contact (retail) a receipt.
  // myDATA finalises the exact document type at issue; this just labels the action correctly.
  const salesDocKind: 'invoice' | 'receipt' = order?.customer_company_id ? 'invoice' : 'receipt';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto">
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
                    <DropdownMenuSeparator />
                    {order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 && (
                      <DropdownMenuItem onClick={createInvoice}>
                        <FileText className="h-3.5 w-3.5 mr-2" /> {salesDocKind === 'receipt' ? 'Create receipt' : 'Create invoice'}
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

            {!editing ? (
              <>
                <div className="rounded-md border border-border/60 overflow-x-auto">
                  <div className="grid grid-cols-[1fr_44px_52px_120px_82px_78px_44px_88px_92px] gap-2 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground min-w-[800px]">
                    <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Delivered</span><span className="text-right">Price</span><span className="text-right">Cost</span><span className="text-right">VAT</span><span className="text-right">Net</span><span className="text-right">Total</span>
                  </div>
                  {items.map((it) => {
                    const gross = Number(it.net_value) + Number(it.vat_amount);
                    const unitLabel = UNIT_OPTIONS.find((u) => u.code === it.measurement_unit_code)?.label ?? (it.measurement_unit_code || '—');
                    const sup = it.product_id ? suppliers.get(it.product_id) : undefined;
                    const del = Number(it.quantity_delivered); const q = Number(it.quantity);
                    const delTone = del >= q && q > 0 ? 'text-emerald-600' : del > 0 ? 'text-amber-600' : 'text-muted-foreground';
                    return (
                    <div key={it.id} className="grid grid-cols-[1fr_44px_52px_120px_82px_78px_44px_88px_92px] gap-2 border-t border-border/40 px-3 py-1.5 text-sm items-center min-w-[800px]">
                      <span className="min-w-0">
                        <span className="block truncate">{it.description}{!it.update_warehouse && <span className="ml-1 text-[10px] text-muted-foreground">(off-warehouse)</span>}</span>
                        {/* #7 — who we buy this from (and therefore owe). Set it inline. */}
                        {it.product_id && (
                          <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5" onClick={() => setSupplierPick({ productId: it.product_id!, label: it.description })}>
                            {sup ? <><Building2 className="h-2.5 w-2.5" /> {sup.name}</> : <><Plus className="h-2.5 w-2.5" /> supplier</>}
                          </button>
                        )}
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
                      <span className="text-right tabular-nums">{formatMoney(Number(it.unit_price), order.currency)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{it.unit_cost != null ? formatMoney(Number(it.unit_cost), order.currency) : '—'}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{Number(it.vat_percent ?? 0)}%</span>
                      <span className="text-right tabular-nums">{formatMoney(Number(it.net_value), order.currency)}</span>
                      <span className="text-right tabular-nums">{formatMoney(gross, order.currency)}</span>
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
                  <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">Net (excl. VAT)</span><span className="tabular-nums">{formatMoney(Number(order.subtotal_net), order.currency)}</span></div>
                  <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">VAT</span><span className="tabular-nums">{formatMoney(Number(order.vat_amount), order.currency)}</span></div>
                  <div className="flex justify-between gap-8 w-60 font-semibold border-t border-border/60 pt-0.5"><span>Total (incl. VAT)</span><span className="tabular-nums">{formatMoney(Number(order.total), order.currency)}</span></div>
                  {orderMargin != null && (
                    <div className="flex justify-between gap-8 w-60"><span className="text-muted-foreground">Margin (excl. VAT)</span><span className={`tabular-nums ${orderMargin >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(orderMargin, order.currency)}</span></div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-border/60">
                <div className="grid grid-cols-[1fr_52px_60px_80px_80px_84px_24px] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>Product</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Price</span><span className="text-right">Cost</span><span className="text-right">VAT</span><span />
                </div>
                {editItems.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_52px_60px_80px_80px_84px_24px] items-center gap-2 border-t border-border/40 px-2 py-1.5">
                    <Input className="h-8 text-sm" value={l.description} onChange={(e) => setEditItem(i, { description: e.target.value, product_id: null })} placeholder="Product…" />
                    <Input className="h-8 text-right text-sm px-1" type="number" step="0.01" value={l.quantity} onChange={(e) => setEditItem(i, { quantity: Number(e.target.value) })} />
                    <Select value={l.unit_code} onValueChange={(v) => setEditItem(i, { unit_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="h-8 text-right text-sm px-1" type="number" step="0.01" value={l.unit_price} onChange={(e) => setEditItem(i, { unit_price: Number(e.target.value) })} />
                    <Input className="h-8 text-right text-sm px-1" type="number" step="0.01" placeholder="—" value={l.unit_cost ?? ''} onChange={(e) => setEditItem(i, { unit_cost: e.target.value === '' ? null : Number(e.target.value) })} />
                    <Select value={l.vat_code} onValueChange={(v) => setEditItem(i, { vat_code: v })}>
                      <SelectTrigger className="h-8 text-xs px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setEditItems((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
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
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium flex items-center gap-1">
                    {payDir === 'in' ? <><ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" /> Money in (received)</> : <><ArrowUpRight className="h-3.5 w-3.5 text-red-400" /> Money out (sent)</>}
                  </span>
                  <Input className="h-8 w-32 text-right text-sm" type="number" step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                  <span className="text-xs text-muted-foreground">{order.currency}</span>
                  <Button size="sm" onClick={recordPay} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
                </div>
                {/* Cash sale: record the money AND issue the order's receipt/invoice in one step. */}
                {payDir === 'in' && order.order_type === 'sales' && (fin?.invoices.length ?? 0) === 0 && (
                  <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-0.5">
                    <Checkbox checked={payIssueDoc} onCheckedChange={(v) => setPayIssueDoc(v === true)} />
                    Also issue a {salesDocKind === 'receipt' ? 'receipt' : 'invoice'} for this order (opens it to review &amp; transmit)
                  </label>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {payIssueDoc
                    ? `Records the cash and creates the ${salesDocKind === 'receipt' ? 'receipt' : 'invoice'} draft — review &amp; transmit it next.`
                    : <>Just the cash movement — no document. Tick the box above, or use Actions → {salesDocKind === 'receipt' ? 'Create receipt' : 'Create invoice'}, to issue one.</>}
                </p>
              </div>
            )}

            {/* Profit: what we received (customer payments) − what we paid suppliers (linked payments out). */}
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
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Profit</div>
                  <div className={`text-sm font-semibold ${fin.profit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatMoney(fin.profit, order.currency)}</div>
                </div>
              </div>
            )}

            {/* Attached invoices */}
            {fin && fin.invoices.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Invoices</div>
                {fin.invoices.map((iv) => (
                  <div key={iv.id} className="flex justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="font-mono text-xs">{iv.internal_number ?? iv.id.slice(0, 8)} · {iv.status}</span>
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
                    <span className="font-mono text-xs">{b.supplier_bill_number ?? b.id.slice(0, 8)} · {b.status}</span>
                    <span className="tabular-nums">{formatMoney(Number(b.total), b.currency)} <span className="text-[10px] text-muted-foreground">due {formatMoney(Number(b.amount_due), b.currency)}</span></span>
                  </div>
                ))}
              </div>
            )}

            {/* Attached payments */}
            {fin && fin.payments.length > 0 && (
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Payments</div>
                {fin.payments.map((p) => (
                  <div key={p.id} className="flex justify-between gap-2 border-t border-border/40 px-3 py-1.5 text-sm first:border-t-0">
                    <span className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()} · {p.direction === 'in' ? 'In' : 'Out'} · {p.method ?? '—'}</span>
                    <span className={`tabular-nums ${p.direction === 'in' ? 'text-emerald-500' : 'text-red-400'}`}>{formatMoney(Number(p.amount), p.currency)}</span>
                  </div>
                ))}
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
          currentName={suppliers.get(supplierPick.productId)?.name ?? null}
          onClose={() => setSupplierPick(null)}
          onPick={(companyId) => void setProductSupplier(supplierPick.productId, companyId)}
        />
      )}
    </Dialog>
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
