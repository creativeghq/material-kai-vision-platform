/**
 * Pending products queue. When a myDATA expense (supplier invoice) is pulled,
 * the inbound sync runs the cheapest AI model in the background to turn each line into a
 * clean product and queues it here. The operator reviews/edits and ✓ adds it to the
 * warehouse (matched to an existing product or created new, with cost from the invoice and
 * sale price from the category margin / workspace markup) or ✗ dismisses it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Check, X, PackagePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { warehouseService, type PendingProduct, type Warehouse } from '@/services/warehouseService';
import { supabase } from '@/integrations/supabase/client';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { formatMoney } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

interface Edit { name: string; sku: string; unit: string; quantity: string; unit_cost: string; sales_price: string; category_id: string; warehouse_id: string; add_to_catalog: boolean; }

export const PendingProductsCard: React.FC<{ workspaceId: string; warehouses: Warehouse[]; onChanged?: () => void }> = ({ workspaceId, warehouses, onChanged }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingProduct[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /** How supplier lines get here at all. Lives on this card because this card IS the thing it
   *  governs — as a standalone control above the stock table it read as a dropdown from nowhere. */
  const [mode, setMode] = useState<'off' | 'suggest' | 'auto'>('suggest');

  const defaultWh = useMemo(() => warehouses.find((w) => w.is_default)?.id ?? warehouses[0]?.id ?? '', [warehouses]);

  const load = async () => {
    try {
      setLoading(true);
      const [rows, cats, fin] = await Promise.all([
        warehouseService.listPending(workspaceId),
        financeCategoriesService.list(workspaceId).then((c) => c.filter((x) => x.kind === 'income' || x.kind === 'both')).catch(() => []),
        supabase.from('finance_settings').select('warehouse_autosync_mode').eq('workspace_id', workspaceId).maybeSingle()
          .then((r) => r.data, () => null),
      ]);
      setMode((((fin as any)?.warehouse_autosync_mode) ?? 'suggest') as 'off' | 'suggest' | 'auto');
      setItems(rows);
      setCategories(cats);
      const e: Record<string, Edit> = {};
      for (const r of rows) e[r.id] = {
        name: r.name, sku: r.sku ?? '', unit: r.unit ?? '', quantity: String(r.quantity ?? 1),
        unit_cost: r.unit_cost != null ? String(r.unit_cost) : '', sales_price: r.sales_price != null ? String(r.sales_price) : '',
        category_id: r.category_id ?? '', warehouse_id: r.target_warehouse_id ?? defaultWh, add_to_catalog: r.add_to_catalog,
      };
      setEdits(e);
    } catch (err: any) { toast({ title: 'Failed to load pending products', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId, defaultWh]);

  const saveMode = async (next: 'off' | 'suggest' | 'auto') => {
    const prev = mode;
    setMode(next);
    const { error } = await supabase.from('finance_settings')
      .update({ warehouse_autosync_mode: next }).eq('workspace_id', workspaceId);
    if (error) { setMode(prev); toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); }
  };

  const setEdit = (id: string, patch: Partial<Edit>) => setEdits((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const marginOf = (categoryId: string) => {
    const c: any = categories.find((x) => x.id === categoryId);
    return c?.margin_pct != null ? Number(c.margin_pct) : null;
  };

  const approve = async (it: PendingProduct) => {
    const e = edits[it.id];
    setBusy(it.id);
    try {
      await warehouseService.approvePending(it.id, {
        name: e.name, sku: e.sku || null, unit: e.unit || null,
        quantity: parseDecimalOr(e.quantity, 0) || it.quantity,
        unit_cost: e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, 0),
        sales_price: e.sales_price === '' ? null : parseDecimalOr(e.sales_price, 0),
        category_id: e.category_id || null,
        target_warehouse_id: e.warehouse_id || null,
        add_to_catalog: e.add_to_catalog,
      });
      toast({ title: 'Added to warehouse', description: e.name });
      setItems((xs) => xs.filter((x) => x.id !== it.id));
      onChanged?.();
    } catch (err: any) { toast({ title: 'Could not add', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const dismiss = async (it: PendingProduct) => {
    setBusy(it.id);
    try {
      await warehouseService.dismissPending(it.id);
      setItems((xs) => xs.filter((x) => x.id !== it.id));
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const header = (
    <CardHeader className="border-b border-border/60 px-5 py-3 flex-row flex-wrap items-center gap-2 space-y-0">
      <PackagePlus className={`h-4 w-4 ${items.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
      <CardTitle>From Supplier Invoices</CardTitle>
      {items.length > 0 && <Badge variant="outline" className="text-[10px]">{items.length}</Badge>}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Intake</span>
        <Select value={mode} onValueChange={(v) => saveMode(v as 'off' | 'suggest' | 'auto')}>
          <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off — ignore supplier lines</SelectItem>
            <SelectItem value="suggest">Review before adding</SelectItem>
            <SelectItem value="auto">Auto-add exact matches</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardHeader>
  );

  // Both the empty and the populated state below render this card, so this component
  // is never absent once loaded — returning null while it loads therefore popped the
  // whole card into the page a beat late and shoved everything under it down. Hold the
  // shell with a skeleton body instead, so the page is laid out the same before/after.
  if (loading) {
    return (
      <Card>
        {header}
        <CardContent className="px-5 py-6">
          <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // An empty queue must explain itself. Rendering nothing at all is why this looked broken:
  // the operator sees no products, no queue, and no way to tell whether that means "all clear"
  // or "the pipeline never ran".
  if (items.length === 0) {
    return (
      <Card>
        {header}
        <CardContent className="px-5 py-6 text-sm text-muted-foreground">
          {mode === 'off'
            ? 'Intake is off, so lines on your suppliers’ myDATA invoices are ignored. Switch to “Review before adding” to start queueing them here.'
            : <>Nothing waiting. Lines from your suppliers&rsquo; myDATA invoices are read once a day and queued here to review. To pull them now, use <strong>Sync from myDATA</strong> in Finance &rarr; Documents &rarr; Expenses.</>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/40">
      {header}
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {items.map((it) => {
            const e = edits[it.id]; if (!e) return null;
            const cost = parseDecimalOr(e.unit_cost, 0);
            const margin = e.category_id ? marginOf(e.category_id) : null;
            const autoPrice = e.sales_price === '' && cost > 0 && margin != null && margin > 0 ? Math.round(cost * (1 + margin / 100) * 100) / 100 : null;
            return (
              <div key={it.id} className="space-y-2 px-4 py-3">
                {/* WHO invoiced this and under which document — the queue is "what my partners
                    sent me", so a bare description string isn't enough to act on. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  {it.inbound_document?.issuer_name && (
                    <span className="font-medium text-foreground/80">{it.inbound_document.issuer_name}</span>
                  )}
                  {(it.inbound_document?.series || it.inbound_document?.aa) && (
                    <span className="text-muted-foreground">
                      {[it.inbound_document.series, it.inbound_document.aa].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {it.inbound_document?.issue_date && (
                    <span className="text-muted-foreground">{new Date(it.inbound_document.issue_date).toLocaleDateString()}</span>
                  )}
                  {/* What approving will actually DO — top up existing stock, or create a product. */}
                  {it.match_score != null && (
                    <span className={it.match_score >= 1
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : it.match_score >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                      {it.match_score >= 0.5 ? 'Tops up existing stock' : 'Creates a new product'}
                      {it.match_reason ? ` · ${it.match_reason}` : ''}
                    </span>
                  )}
                </div>
                {it.raw_description && <div className="text-[11px] text-muted-foreground truncate">Invoice line: {it.raw_description}</div>}
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_70px_80px]">
                  <Input className="h-8 text-sm" value={e.name} onChange={(ev) => setEdit(it.id, { name: ev.target.value })} placeholder="Product name" />
                  <Input className="h-8 text-sm" value={e.sku} onChange={(ev) => setEdit(it.id, { sku: ev.target.value })} placeholder="SKU" />
                  <Input className="h-8 text-sm" value={e.unit} onChange={(ev) => setEdit(it.id, { unit: ev.target.value })} placeholder="unit" />
                  <Input className="h-8 text-sm text-right" type="text" inputMode="decimal" value={e.quantity} onChange={(ev) => setEdit(it.id, { quantity: ev.target.value })} placeholder="qty" />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_140px_1fr_160px]">
                  <div className="space-y-0.5">
                    <label htmlFor="pendingproductscard-unit-cost" className="text-[10px] text-muted-foreground">Unit cost</label>
                    <Input id="pendingproductscard-unit-cost" className="h-8 text-sm text-right" type="text" inputMode="decimal" value={e.unit_cost} onChange={(ev) => setEdit(it.id, { unit_cost: ev.target.value })} placeholder="0.00" />
                  </div>
                  <div className="space-y-0.5">
                    <label htmlFor="pendingproductscard-sale-price" className="text-[10px] text-muted-foreground">Sale price</label>
                    <Input id="pendingproductscard-sale-price" className="h-8 text-sm text-right" type="text" inputMode="decimal" value={e.sales_price}
                      onChange={(ev) => setEdit(it.id, { sales_price: ev.target.value })}
                      placeholder={autoPrice != null ? `auto ${formatMoney(autoPrice, it.currency)}` : 'set price'} />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] text-muted-foreground">Category {margin != null ? `(margin ${margin}%)` : ''}</label>
                    <Select value={e.category_id || '__none'} onValueChange={(v) => setEdit(it.id, { category_id: v === '__none' ? '' : v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— None —</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{(c as any).margin_pct != null ? ` · ${(c as any).margin_pct}%` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5">
                    <label htmlFor="pendingproductscard-warehouse" className="text-[10px] text-muted-foreground">Warehouse</label>
                    <Select value={e.warehouse_id} onValueChange={(v) => setEdit(it.id, { warehouse_id: v })}>
                      <SelectTrigger id="pendingproductscard-warehouse" className="h-8 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                      <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox className="h-3.5 w-3.5 rounded" checked={e.add_to_catalog} onCheckedChange={(v) => setEdit(it.id, { add_to_catalog: v === true })} />
                    Add to sellable catalog
                  </label>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-destructive" disabled={busy === it.id} onClick={() => dismiss(it)}>
                      <X className="h-4 w-4 mr-1" /> Dismiss
                    </Button>
                    <Button size="sm" className="h-8" disabled={busy === it.id} onClick={() => approve(it)}>
                      {busy === it.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Add to warehouse
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
