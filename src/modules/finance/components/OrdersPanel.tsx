import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, ShoppingCart, Trash2, Search, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, financeService, VAT_CATEGORIES } from '@/modules/finance/services/financeService';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL,
  type OrderType, type OrderStatus, type OrderListRow, type OrderItem, type Order, type NewOrderItem,
} from '@/modules/finance/services/ordersService';

const STATUS_TONE: Record<OrderStatus, string> = {
  draft: 'secondary', confirmed: 'outline', partially_fulfilled: 'outline', fulfilled: 'default', cancelled: 'destructive',
};

type Party = { type: 'company' | 'contact'; id: string; name: string; vat?: string | null; sub?: string | null };
const pctOf = (code: string) => VAT_CATEGORIES.find((v) => v.code === code)?.pct ?? 0;
const DEFAULT_VAT_CODE = '1'; // 24%

/** Orders list + create — mounted as the first Finance → Documents tab. */
export const OrdersPanel: React.FC<{ workspaceId: string; companyId?: string }> = ({ workspaceId, companyId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeF, setTypeF] = useState<'all' | OrderType>('all');
  const [statusF, setStatusF] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<{ orderType: OrderType; preOrder: boolean }>({ orderType: 'sales', preOrder: false });
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setRows(await ordersService.list({ workspaceId, companyId, orderType: typeF === 'all' ? undefined : typeF, status: statusF === 'all' ? undefined : statusF }));
    } catch (err: any) {
      toast({ title: 'Failed to load orders', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, companyId, typeF, statusF]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => (r.party_name ?? '').toLowerCase().includes(t) || (r.order_number ?? '').toLowerCase().includes(t));
  }, [rows, search]);

  const openCreate = (orderType: OrderType, preOrder: boolean) => { setCreatePreset({ orderType, preOrder }); setCreateOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Orders</h3>
          <p className="text-xs text-muted-foreground">Sales &amp; purchase orders. Invoices, payments, dispatch and profit all hang off an order.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
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
          <Button variant="outline" onClick={() => openCreate('sales', true)}><Plus className="h-4 w-4 mr-1" /> Pre-order</Button>
          <Button variant="outline" onClick={() => openCreate('purchase', false)}><Plus className="h-4 w-4 mr-1" /> Purchase order</Button>
          <Button onClick={() => openCreate('sales', false)}><Plus className="h-4 w-4 mr-1" /> New order</Button>
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
        open={createOpen}
        preset={createPreset}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); void load(); }}
      />
      <OrderDetailDialog orderId={openId} open={openId !== null} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
};

// ---------------------------------------------------------------------------

type Line = { product_id?: string | null; description: string; quantity: number; unit_price: number; vat_code: string };
const blankLine = (): Line => ({ description: '', quantity: 1, unit_price: 0, vat_code: DEFAULT_VAT_CODE });

const NewOrderModal: React.FC<{
  workspaceId: string;
  open: boolean;
  preset: { orderType: OrderType; preOrder: boolean };
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}> = ({ workspaceId, open, preset, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [partyOpts, setPartyOpts] = useState<Party[]>([]);
  const [items, setItems] = useState<Line[]>([blankLine()]);
  // Per-line product lookup — the Description field IS a catalog search.
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [lineProdOpts, setLineProdOpts] = useState<Array<{ id: string; name: string }>>([]);

  const isSales = preset.orderType === 'sales';

  useEffect(() => {
    if (!open) return;
    setParty(null); setPartySearch(''); setPartyOpts([]); setActiveLine(null); setLineProdOpts([]);
    setItems([blankLine()]);
  }, [open]);

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
  const pickProduct = (i: number, p: { id: string; name: string }) => {
    setItem(i, { product_id: p.id, description: p.name });
    setActiveLine(null); setLineProdOpts([]);
  };

  const calc = items.map((l) => {
    const net = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
    const vat = net * pctOf(l.vat_code) / 100;
    return { net, vat, gross: net + vat };
  });
  const netTotal = calc.reduce((a, c) => a + c.net, 0);
  const vatTotal = calc.reduce((a, c) => a + c.vat, 0);
  const grossTotal = netTotal + vatTotal;

  const save = async () => {
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
        orderType: preset.orderType,
        status: preset.preOrder ? 'draft' : 'confirmed',
        customerCompanyId: isSales ? coId : null,
        customerContactId: isSales ? ctId : null,
        supplierCompanyId: !isSales ? coId : null,
        supplierContactId: !isSales ? ctId : null,
        items: clean.map((it) => ({
          product_id: it.product_id ?? null,
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          vat_percent: pctOf(it.vat_code),
          vat_category: parseInt(it.vat_code, 10) || undefined,
        })),
      });
      toast({ title: preset.preOrder ? 'Pre-order created' : 'Order created' });
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const title = preset.preOrder ? 'New pre-order' : isSales ? 'New sales order' : 'New purchase order';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{isSales ? 'Customer *' : 'Supplier *'}</Label>
            {party ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{party.name}{party.sub ? <span className="text-xs text-muted-foreground"> · {party.sub}</span> : null}</span>
                <Button size="sm" variant="ghost" onClick={() => setParty(null)}>Change</Button>
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

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> New Product</Button>
            </div>
            <div className="rounded-md border border-border/60">
              <div className="grid grid-cols-[1fr_56px_84px_92px_84px_28px] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Product</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">VAT</span><span className="text-right">Line total</span><span />
              </div>
              {items.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_56px_84px_92px_84px_28px] items-center gap-2 border-t border-border/40 px-2 py-1.5">
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
                  <Input className="h-8 text-right text-sm" type="number" step="0.01" value={l.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} />
                  <Input className="h-8 text-right text-sm" type="number" step="0.01" value={l.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} />
                  <Select value={l.vat_code} onValueChange={(v) => setItem(i, { vat_code: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-right text-sm tabular-nums">{formatMoney(calc[i]?.gross ?? 0)}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Type to search the catalog and pick a product (links to the warehouse — delivery moves stock), or type a new product name (off-warehouse).</p>
          </div>

          <div className="flex justify-end gap-4 text-sm">
            <span className="text-muted-foreground">Net {formatMoney(netTotal)}</span>
            <span className="text-muted-foreground">VAT {formatMoney(vatTotal)}</span>
            <span className="font-semibold">Total {formatMoney(grossTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Create</Button>
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

  useEffect(() => {
    if (!orderId) { setOrder(null); setItems([]); setFin(null); return; }
    void (async () => {
      try {
        setLoading(true);
        const [res, finance] = await Promise.all([ordersService.get(orderId), ordersService.getOrderFinance(orderId)]);
        setOrder(res.order); setItems(res.items); setFin(finance);
      } catch (err: any) {
        toast({ title: 'Failed to load order', description: err?.message, variant: 'destructive' });
      } finally { setLoading(false); }
    })();
  }, [orderId, toast]);

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Order {order?.order_number ?? order?.id.slice(0, 8)}</DialogTitle></DialogHeader>
        {loading || !order ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="capitalize">{order.order_type}</Badge>
              <Badge variant={STATUS_TONE[order.status] as any}>{ORDER_STATUS_LABEL[order.status]}</Badge>
              <span className="text-muted-foreground">{ORDER_PAYMENT_LABEL[order.payment_status]}</span>
              <span className="ml-auto font-semibold">{formatMoney(Number(order.total), order.currency)}</span>
            </div>

            <div className="rounded-md border border-border/60">
              <div className="grid grid-cols-[1fr_60px_90px_90px_90px] gap-2 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Item</span><span className="text-right">Qty</span><span className="text-right">Delivered</span><span className="text-right">Unit</span><span className="text-right">Total</span>
              </div>
              {items.map((it) => (
                <div key={it.id} className="grid grid-cols-[1fr_60px_90px_90px_90px] gap-2 border-t border-border/40 px-3 py-1.5 text-sm">
                  <span>{it.description}{!it.update_warehouse && <span className="ml-1 text-[10px] text-muted-foreground">(off-warehouse)</span>}</span>
                  <span className="text-right tabular-nums">{it.quantity}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{it.quantity_delivered}</span>
                  <span className="text-right tabular-nums">{formatMoney(Number(it.unit_price), order.currency)}</span>
                  <span className="text-right tabular-nums">{formatMoney(Number(it.line_total), order.currency)}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={order.status} onValueChange={(v: any) => changeStatus(v)}>
                <SelectTrigger className="h-8 w-44 text-xs" disabled={saving}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              {order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                <Button size="sm" variant="outline" onClick={() => changeStatus('fulfilled')} disabled={saving}>Mark completed</Button>
              )}
              {order.order_type === 'sales' && (
                <Button size="sm" variant="outline" onClick={() => navigate('/finance?tab=doc_dispatch')}>
                  <Truck className="h-3.5 w-3.5 mr-1" /> Dispatch board
                </Button>
              )}
            </div>

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
              Dispatch is invoice-driven: once this order's invoice is paid &amp; flagged for shipping it shows on the
              Dispatch board, which cuts the delivery note and moves warehouse stock (catalog lines only — ad-hoc lines stay off-warehouse).
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
