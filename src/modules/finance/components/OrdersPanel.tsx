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
import { formatMoney } from '@/modules/finance/services/financeService';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL,
  type OrderType, type OrderStatus, type OrderListRow, type OrderItem, type Order, type NewOrderItem,
} from '@/modules/finance/services/ordersService';

const STATUS_TONE: Record<OrderStatus, string> = {
  draft: 'secondary', confirmed: 'outline', partially_fulfilled: 'outline', fulfilled: 'default', cancelled: 'destructive',
};

type Party = { type: 'company' | 'contact'; id: string; name: string };

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
  const [items, setItems] = useState<NewOrderItem[]>([{ description: '', quantity: 1, unit_price: 0 }]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodOpts, setProdOpts] = useState<Array<{ id: string; name: string }>>([]);

  const isSales = preset.orderType === 'sales';

  useEffect(() => {
    if (!open) return;
    setParty(null); setPartySearch(''); setPartyOpts([]); setProdSearch(''); setProdOpts([]);
    setItems([{ description: '', quantity: 1, unit_price: 0 }]);
  }, [open]);

  // CRM party search (any company/contact).
  useEffect(() => {
    if (!open) return;
    const term = partySearch.trim();
    if (term.length < 2) { setPartyOpts([]); return; }
    const like = `%${term}%`;
    const t = setTimeout(async () => {
      const [c, p] = await Promise.all([
        supabase.from('crm_companies').select('id, name').ilike('name', like).limit(8),
        supabase.from('crm_contacts').select('id, name').ilike('name', like).limit(8),
      ]);
      const opts: Party[] = [];
      for (const r of c.data ?? []) opts.push({ type: 'company', id: (r as any).id, name: `${(r as any).name} (company)` });
      for (const r of p.data ?? []) opts.push({ type: 'contact', id: (r as any).id, name: (r as any).name });
      setPartyOpts(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [partySearch, open]);

  // Catalog product search → adds a line.
  useEffect(() => {
    if (!open) return;
    const term = prodSearch.trim();
    if (term.length < 2) { setProdOpts([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name').ilike('name', `%${term}%`).limit(8);
      setProdOpts((data ?? []) as Array<{ id: string; name: string }>);
    }, 200);
    return () => clearTimeout(t);
  }, [prodSearch, open]);

  const setItem = (i: number, patch: Partial<NewOrderItem>) => setItems((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = (l?: NewOrderItem) => setItems((ls) => [...ls, l ?? { description: '', quantity: 1, unit_price: 0 }]);
  const removeLine = (i: number) => setItems((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  const total = items.reduce((a, it) => a + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  const save = async () => {
    const clean = items.filter((it) => it.description.trim() && (Number(it.quantity) || 0) > 0);
    if (clean.length === 0) { toast({ title: 'Add at least one line', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await ordersService.create({
        workspaceId,
        orderType: preset.orderType,
        status: preset.preOrder ? 'draft' : 'confirmed',
        customerCompanyId: isSales && party?.type === 'company' ? party.id : null,
        customerContactId: isSales && party?.type === 'contact' ? party.id : null,
        supplierCompanyId: !isSales && party?.type === 'company' ? party.id : null,
        supplierContactId: !isSales && party?.type === 'contact' ? party.id : null,
        items: clean.map((it) => ({ ...it, quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0 })),
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
            <Label>{isSales ? 'Customer' : 'Supplier'}</Label>
            {party ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{party.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setParty(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-7" placeholder={`Search ${isSales ? 'customers' : 'suppliers'} by name…`} value={partySearch} onChange={(e) => setPartySearch(e.target.value)} />
                {partyOpts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                    {partyOpts.map((o) => (
                      <button key={`${o.type}:${o.id}`} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setParty(o); setPartySearch(''); setPartyOpts([]); }}>{o.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => addLine()}><Plus className="h-3.5 w-3.5 mr-1" /> Ad-hoc line</Button>
            </div>
            <div className="rounded-md border border-border/60">
              <div className="grid grid-cols-[1fr_70px_96px_96px_28px] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Line total</span><span />
              </div>
              {items.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_96px_96px_28px] items-center gap-2 border-t border-border/40 px-2 py-1.5">
                  <Input className="h-8 text-sm" value={l.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Product / description" />
                  <Input className="h-8 text-right text-sm" type="number" step="0.01" value={l.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} />
                  <Input className="h-8 text-right text-sm" type="number" step="0.01" value={l.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} />
                  <span className="text-right text-sm tabular-nums">{formatMoney((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            {/* Catalog add */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-7 h-8 text-sm" placeholder="…or add a catalog product by name" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} />
              {prodOpts.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                  {prodOpts.map((o) => (
                    <button key={o.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => { addLine({ product_id: o.id, description: o.name, quantity: 1, unit_price: 0 }); setProdSearch(''); setProdOpts([]); }}>
                      {o.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Ad-hoc lines are not linked to the warehouse. Catalog products link to it (delivery moves stock).</p>
          </div>

          <div className="flex justify-end text-sm font-semibold">Total {formatMoney(total)}</div>
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
