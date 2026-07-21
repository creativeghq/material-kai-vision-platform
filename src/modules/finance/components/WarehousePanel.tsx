import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, PackagePlus, PackageMinus, Trash2, AlertTriangle, Search, Package, X, ArrowLeftRight, Store, Coins, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { warehouseService, type WarehouseItem, type Warehouse } from '@/services/warehouseService';
import {
  marketplaceService, type ActiveListingSummary, type ListingCondition, type DeliveryOption,
} from '@/services/marketplaceService';
import { AddDealerProductDialog } from '@/components/business/marketplace/AddDealerProductDialog';
import { parseDecimal, parseDecimalOr } from '@/utils/decimal';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

import { PendingProductsCard } from '@/modules/finance/components/PendingProductsCard';

export const WarehousePanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWh, setSelectedWh] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addWhOpen, setAddWhOpen] = useState(false);
  // Active marketplace listings keyed by warehouse_item_id — drives the "Listed" row badge.
  const [listings, setListings] = useState<Record<string, ActiveListingSummary>>({});
  const [listItem, setListItem] = useState<WarehouseItem | null>(null);
  // #207 — editing the catalog-depth fields (codes / myDATA classification) of an item.
  const [editItem, setEditItem] = useState<WarehouseItem | null>(null);

  // #223 — stock filters (sqm/qty range, unit, low-stock, location, marketplace status).
  const [fSearch, setFSearch] = useState('');
  const [fUnit, setFUnit] = useState('all');
  const [fLowOnly, setFLowOnly] = useState(false);
  const [fListed, setFListed] = useState('all'); // all | listed | unlisted
  const [fQtyMin, setFQtyMin] = useState('');
  const [fQtyMax, setFQtyMax] = useState('');
  const [fLocation, setFLocation] = useState('');
  const [page, setPage] = useState(1);

  const units = useMemo(() => Array.from(new Set(items.map((i) => i.unit))).sort(), [items]);
  const visibleItems = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    const loc = fLocation.trim().toLowerCase();
    const min = fQtyMin === '' ? null : parseDecimal(fQtyMin);
    const max = fQtyMax === '' ? null : parseDecimal(fQtyMax);
    return items.filter((it) => {
      if (q && !(`${it.name} ${it.sku ?? ''}`.toLowerCase().includes(q))) return false;
      if (fUnit !== 'all' && it.unit !== fUnit) return false;
      if (fLowOnly && !(it.reorder_point > 0 && it.qty_on_hand <= it.reorder_point)) return false;
      if (loc && !(it.location ?? '').toLowerCase().includes(loc)) return false;
      if (min != null && it.qty_on_hand < min) return false;
      if (max != null && it.qty_on_hand > max) return false;
      if (fListed === 'listed' && !listings[it.id]) return false;
      if (fListed === 'unlisted' && listings[it.id]) return false;
      return true;
    });
  }, [items, listings, fSearch, fUnit, fLowOnly, fListed, fQtyMin, fQtyMax, fLocation]);

  // Any filter change (or switching warehouse) is a new result set; deleting/transferring an
  // item shrinks the current one. Both must leave the table on a page that still has rows.
  useEffect(() => { setPage(1); }, [selectedWh, fSearch, fUnit, fLowOnly, fListed, fQtyMin, fQtyMax, fLocation]);
  useEffect(() => { setPage((p) => clampPage(p, visibleItems.length)); }, [visibleItems.length]);

  const load = async (whId?: string) => {
    setLoading(true);
    try {
      // Ensure at least the default "Main" warehouse exists, then load the list.
      await warehouseService.ensureDefaultWarehouse(workspaceId);
      const whs = await warehouseService.listWarehouses(workspaceId);
      setWarehouses(whs);
      const active = whId || selectedWh || whs.find((w) => w.is_default)?.id || whs[0]?.id || '';
      setSelectedWh(active);
      setItems(active ? await warehouseService.listItems(workspaceId, active) : []);
      // Best-effort: a listings read failure must never block the warehouse view.
      try { setListings(await marketplaceService.activeListingsByItem(workspaceId)); }
      catch { setListings({}); }
    } catch (err: any) {
      toast({ title: 'Failed to load stock', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { if (workspaceId) void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const move = async (item: WarehouseItem, direction: 'in' | 'out') => {
    const raw = window.prompt(`${direction === 'in' ? 'Receive' : 'Issue'} quantity for ${item.name}?`, '1');
    if (raw === null) return;
    const qty = parseDecimal(raw) ?? NaN;  // EU-format aware ("100,5" → 100.5)
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: 'Invalid quantity', variant: 'destructive' }); return; }
    try { await warehouseService.recordMovement(item.id, direction, qty); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  // #207 — move stock of this item's product into another warehouse.
  const transfer = async (item: WarehouseItem) => {
    const others = warehouses.filter((w) => w.id !== selectedWh);
    if (others.length === 0) { toast({ title: 'No other warehouse', description: 'Create a second warehouse first.' }); return; }
    const target = others.length === 1
      ? others[0]
      : others.find((w) => w.name.toLowerCase() === (window.prompt(`Transfer to which warehouse? (${others.map((o) => o.name).join(', ')})`, others[0].name) || '').trim().toLowerCase());
    if (!target) return;
    const raw = window.prompt(`Transfer how many "${item.name}" to ${target.name}? (on hand: ${item.qty_on_hand})`, '1');
    if (raw === null) return;
    const qty = parseDecimal(raw) ?? NaN;  // EU-format aware ("100,5" → 100.5)
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: 'Invalid quantity', variant: 'destructive' }); return; }
    try { await warehouseService.transfer(item.id, target.id, qty); toast({ title: `Transferred to ${target.name}` }); await load(); }
    catch (err: any) { toast({ title: 'Transfer failed', description: err?.message, variant: 'destructive' }); }
  };

  const remove = async (item: WarehouseItem) => {
    if (!confirm(`Delete ${item.name} from the warehouse?`)) return;
    try { await warehouseService.deleteItem(item.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const unlist = async (item: WarehouseItem) => {
    const l = listings[item.id];
    if (!l || !confirm(`Withdraw "${item.name}" from the marketplace? Reserved stock is released.`)) return;
    try { await marketplaceService.withdraw(l.id); toast({ title: 'Listing withdrawn' }); await load(selectedWh); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  // Record a marketplace sale: decrements on-hand (stock movement) AND syncs the listing's
  // remaining qty — the correct path vs a plain "Issue", which would leave the listing stale.
  const sellListing = async (item: WarehouseItem) => {
    const l = listings[item.id];
    if (!l) return;
    const raw = window.prompt(`How many "${item.name}" did you sell on the marketplace? (listed: ${l.qty_remaining})`, String(l.qty_remaining));
    if (raw === null) return;
    const qty = parseDecimal(raw) ?? NaN;  // EU-format aware ("100,5" → 100.5)
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: 'Invalid quantity', variant: 'destructive' }); return; }
    try { await marketplaceService.markSold(l.id, qty); toast({ title: 'Sale recorded — stock updated' }); await load(selectedWh); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <PendingProductsCard workspaceId={workspaceId} warehouses={warehouses} onChanged={() => load(selectedWh)} />
      <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CardTitle className="text-sm shrink-0">Warehouse stock</CardTitle>
          {warehouses.length > 0 && (
            <Select value={selectedWh} onValueChange={(v) => load(v)}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setAddWhOpen(true)} className="rounded-full"><Plus className="h-4 w-4 mr-1" /> Warehouse</Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="rounded-full" disabled={!selectedWh}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
        </div>
      </CardHeader>
      {/* #223 — stock filters */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/60 bg-muted/10">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Name or SKU…" className="h-8 w-40 pl-7 text-xs" />
          </div>
          <Select value={fUnit} onValueChange={setFUnit}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={fQtyMin} onChange={(e) => setFQtyMin(e.target.value)} type="text" inputMode="decimal" placeholder="min qty" className="h-8 w-24 text-xs" />
          <Input value={fQtyMax} onChange={(e) => setFQtyMax(e.target.value)} type="text" inputMode="decimal" placeholder="max qty" className="h-8 w-24 text-xs" />
          <Input value={fLocation} onChange={(e) => setFLocation(e.target.value)} placeholder="Location…" className="h-8 w-32 text-xs" />
          <Select value={fListed} onValueChange={setFListed}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="listed">Listed</SelectItem>
              <SelectItem value="unlisted">Not listed</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant={fLowOnly ? 'default' : 'outline'} className="h-8 rounded-full text-xs" onClick={() => setFLowOnly((v) => !v)}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Low stock
          </Button>
          {visibleItems.length !== items.length && (
            <span className="text-xs text-muted-foreground">{visibleItems.length}/{items.length}</span>
          )}
        </div>
      )}
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-right">On hand</th>
                <th className="px-4 py-2 text-right">Reserved</th>
                <th className="px-4 py-2 text-right">Reorder</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No stock items yet.</td></tr>
              )}
              {items.length > 0 && visibleItems.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No items match the filters.</td></tr>
              )}
              {paginate(visibleItems, page).map((it) => {
                const low = it.qty_on_hand <= it.reorder_point && it.reorder_point > 0;
                const listed = listings[it.id];
                const available = it.qty_on_hand - it.qty_reserved;
                return (
                  <tr key={it.id} className="border-b border-border/30">
                    <td className="px-4 py-2 font-medium">
                      {it.name} <span className="text-xs text-muted-foreground">/ {it.unit}</span>
                      {listed && (
                        <Badge variant="outline" className="ml-2 border-emerald-500/50 text-emerald-500">
                          <Store className="h-3 w-3 mr-1" />listed €{listed.price}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {it.sku ?? '—'}
                      {(it.barcode || it.cpv_code || it.taric_code || it.serial_number) && (
                        <div className="text-[10px] text-muted-foreground/70 normal-case font-sans">
                          {[it.barcode && `bc:${it.barcode}`, it.serial_number && `s/n:${it.serial_number}`, it.cpv_code && `CPV:${it.cpv_code}`, it.taric_code && `TARIC:${it.taric_code}`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{it.location ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {it.qty_on_hand}
                      {low && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-500"><AlertTriangle className="h-3 w-3 mr-1" />low</Badge>}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{it.qty_reserved}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{it.reorder_point}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Receive stock" onClick={() => move(it, 'in')}><PackagePlus className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Issue stock" onClick={() => move(it, 'out')}><PackageMinus className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Transfer to another warehouse" onClick={() => transfer(it)}><ArrowLeftRight className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Edit codes & myDATA classification" onClick={() => setEditItem(it)}><Tag className="h-4 w-4" /></Button>
                        {listed ? (
                          <>
                            <Button size="sm" variant="ghost" title={'Record a marketplace sale (decrements stock)'} onClick={() => sellListing(it)}><Coins className="h-4 w-4 text-emerald-500" /></Button>
                            <Button size="sm" variant="ghost" title={`Listed €${listed.price} · ${listed.qty_remaining} ${it.unit} — withdraw`} onClick={() => unlist(it)}><Store className="h-4 w-4 text-emerald-500" /></Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" title={available > 0 ? 'List to Marketplace' : 'No available stock to list'} disabled={available <= 0} onClick={() => setListItem(it)}><Store className="h-4 w-4" /></Button>
                        )}
                        <Button size="sm" variant="ghost" title="Delete" onClick={() => remove(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && <TablePagination page={page} total={visibleItems.length} onPageChange={setPage} label="items" />}
      </CardContent>

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} warehouseId={selectedWh} onAdded={async () => { setAddOpen(false); await load(); }} />
      <EditItemCatalogDialog item={editItem} onOpenChange={(v) => { if (!v) setEditItem(null); }} onSaved={async () => { setEditItem(null); await load(selectedWh); }} />
      <AddWarehouseDialog open={addWhOpen} onOpenChange={setAddWhOpen} workspaceId={workspaceId} onAdded={async (id) => { setAddWhOpen(false); await load(id); }} />
      <ListToMarketplaceDialog
        item={listItem}
        workspaceId={workspaceId}
        warehouseLocation={warehouses.find((w) => w.id === selectedWh)?.location ?? null}
        onOpenChange={(v) => { if (!v) setListItem(null); }}
        onListed={async () => { setListItem(null); await load(selectedWh); }}
      />
      </Card>
    </div>
  );
};

/**
 * Stock is product-backed: every warehouse item links to a real catalog `products`
 * row (which already carries its embeddings). You either pick an existing product or
 * create a new one through the SAME MIVAA ingest core as XML import / dealer add
 * (facet canonicalization → Voyage text_embedding_1024 → vector DB) — never a
 * free-text orphan that bypasses the product pipeline.
 */
interface CatalogProduct { id: string; name: string; sku: string | null; unit: string }

const productUnit = (row: any): string =>
  (row?.metadata?.unit || row?.properties?.unit || 'pcs') as string;

const AddItemDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; warehouseId: string; onAdded: () => void }> = ({ open, onOpenChange, workspaceId, warehouseId, onAdded }) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const [unit, setUnit] = useState('pcs');
  const [qty, setQty] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [location, setLocation] = useState('');
  // #207 — catalog depth
  const [barcode, setBarcode] = useState('');
  const [serial, setSerial] = useState('');
  const [cpv, setCpv] = useState('');
  const [taric, setTaric] = useState('');
  const [clsType, setClsType] = useState('');
  const [clsCategory, setClsCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const searchSeq = useRef(0);

  // Reset when the dialog closes.
  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setSelected(null);
      setUnit('pcs'); setQty('0'); setReorder('0'); setLocation('');
      setBarcode(''); setSerial(''); setCpv(''); setTaric(''); setClsType(''); setClsCategory('');
    }
  }, [open]);

  // Debounced catalog search (name or SKU) within the workspace.
  useEffect(() => {
    if (!open || selected) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, external_sku, metadata, properties')
          .eq('workspace_id', workspaceId)
          // #207 — warehouse stock is for the workspace's OWN products, never operator-catalog
          // reference items (supply_mode='reference_only' are cost-basis references, not held stock).
          .or('supply_mode.is.null,supply_mode.neq.reference_only')
          .or(`name.ilike.%${q}%,external_sku.ilike.%${q}%`)
          .order('name')
          .limit(10);
        if (error) throw error;
        if (seq !== searchSeq.current) return; // stale response
        setResults((data ?? []).map((r: any) => ({
          id: r.id, name: r.name, sku: r.external_sku ?? null, unit: productUnit(r),
        })));
      } catch (err: any) {
        toast({ title: 'Search failed', description: err?.message, variant: 'destructive' });
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, selected, workspaceId, toast]);

  const pick = (p: CatalogProduct) => { setSelected(p); setUnit(p.unit || 'pcs'); };

  // A product was just created via the embedding pipeline — fetch it and select it.
  const onProductCreated = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, external_sku, metadata, properties')
        .eq('id', productId)
        .single();
      if (error) throw error;
      pick({ id: data.id, name: data.name, sku: data.external_sku ?? null, unit: productUnit(data) });
    } catch (err: any) {
      toast({ title: 'Created, but failed to load', description: err?.message, variant: 'destructive' });
    }
  };

  const submit = async () => {
    if (!selected) { toast({ title: 'Pick a product first', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      await warehouseService.createItem({
        workspaceId, warehouse_id: warehouseId, product_id: selected.id, name: selected.name,
        sku: selected.sku || undefined, unit: unit.trim() || 'pcs',
        qty_on_hand: parseDecimalOr(qty, 0), reorder_point: parseDecimalOr(reorder, 0),
        location: location.trim() || undefined,
        barcode: barcode.trim() || null, serial_number: serial.trim() || null,
        cpv_code: cpv.trim() || null, taric_code: taric.trim() || null,
        mydata_classification_type: clsType.trim() || null,
        mydata_classification_category: clsCategory.trim() || null,
      });
      onAdded();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add stock item</DialogTitle></DialogHeader>

          {!selected ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Find a product</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search catalog by name or SKU…" />
                </div>
              </div>
              <div className="min-h-[3rem] max-h-64 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
                {searching ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {query.trim().length < 2 ? 'Type at least 2 characters to search.' : 'No matching products.'}
                  </div>
                ) : results.map((p) => (
                  <button key={p.id} type="button" onClick={() => pick(p)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    {p.sku && <span className="font-mono text-[11px] text-muted-foreground">{p.sku}</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Not in the catalog yet?</span>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Create new product
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{selected.name}</div>
                  {selected.sku && <div className="font-mono text-[11px] text-muted-foreground">{selected.sku}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)} title="Choose a different product"><X className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>On hand</Label><Input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                <div className="space-y-1"><Label>Reorder pt</Label><Input type="text" inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} /></div>
                <div className="space-y-1"><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional — e.g. Aisle 3 / Shelf B" /></div>
              {/* #207 — codes & myDATA classification (optional) */}
              <details className="rounded-md border border-border/60 px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted-foreground select-none">Codes &amp; myDATA classification (optional)</summary>
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div className="space-y-1"><Label className="text-xs">Barcode</Label><Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="EAN / UPC" /></div>
                  <div className="space-y-1"><Label className="text-xs">Serial number (S/N)</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">CPV code</Label><Input value={cpv} onChange={(e) => setCpv(e.target.value)} placeholder="procurement" /></div>
                  <div className="space-y-1"><Label className="text-xs">TARIC code</Label><Input value={taric} onChange={(e) => setTaric(e.target.value)} placeholder="customs" /></div>
                  <div className="space-y-1"><Label className="text-xs">myDATA class. type</Label><Input value={clsType} onChange={(e) => setClsType(e.target.value)} placeholder="e.g. E3_561_001" /></div>
                  <div className="space-y-1"><Label className="text-xs">myDATA class. category</Label><Input value={clsCategory} onChange={(e) => setClsCategory(e.target.value)} placeholder="e.g. category1_1" /></div>
                </div>
              </details>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !selected}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add to warehouse'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddDealerProductDialog open={newOpen} onOpenChange={setNewOpen} onCreated={onProductCreated} />
    </>
  );
};

// #207 — create an additional warehouse.
const AddWarehouseDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; onAdded: (id: string) => void }> = ({ open, onOpenChange, workspaceId, onAdded }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setName(''); setCode(''); setLocation(''); } }, [open]);

  const submit = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const wh = await warehouseService.createWarehouse({ workspaceId, name: name.trim(), code: code.trim() || undefined, location: location.trim() || undefined });
      toast({ title: 'Warehouse created' });
      onAdded(wh.id);
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add warehouse</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Athens depot" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="optional" /></div>
            <div className="space-y-1"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// #207 — edit an existing item's catalog-depth fields (codes + myDATA classification).
const EditItemCatalogDialog: React.FC<{ item: WarehouseItem | null; onOpenChange: (v: boolean) => void; onSaved: () => void }> = ({ item, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const open = !!item;
  const [barcode, setBarcode] = useState('');
  const [serial, setSerial] = useState('');
  const [cpv, setCpv] = useState('');
  const [taric, setTaric] = useState('');
  const [clsType, setClsType] = useState('');
  const [clsCategory, setClsCategory] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setBarcode(item.barcode ?? ''); setSerial(item.serial_number ?? '');
    setCpv(item.cpv_code ?? ''); setTaric(item.taric_code ?? '');
    setClsType(item.mydata_classification_type ?? ''); setClsCategory(item.mydata_classification_category ?? '');
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!item) return;
    try {
      setBusy(true);
      await warehouseService.updateItemCatalog(item.id, {
        barcode: barcode.trim() || null, serial_number: serial.trim() || null,
        cpv_code: cpv.trim() || null, taric_code: taric.trim() || null,
        mydata_classification_type: clsType.trim() || null,
        mydata_classification_category: clsCategory.trim() || null,
      });
      toast({ title: 'Item updated' });
      onSaved();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Codes &amp; classification — {item.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Barcode</Label><Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="EAN / UPC" /></div>
          <div className="space-y-1"><Label className="text-xs">Serial number (S/N)</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">CPV code</Label><Input value={cpv} onChange={(e) => setCpv(e.target.value)} placeholder="procurement" /></div>
          <div className="space-y-1"><Label className="text-xs">TARIC code</Label><Input value={taric} onChange={(e) => setTaric(e.target.value)} placeholder="customs" /></div>
          <div className="space-y-1"><Label className="text-xs">myDATA class. type</Label><Input value={clsType} onChange={(e) => setClsType(e.target.value)} placeholder="e.g. E3_561_001" /></div>
          <div className="space-y-1"><Label className="text-xs">myDATA class. category</Label><Input value={clsCategory} onChange={(e) => setClsCategory(e.target.value)} placeholder="e.g. category1_1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * #221 — "List to Marketplace". Auto-fills title / category / photos / specs / suggested price
 * from the warehouse item's linked catalog product, so the seller realistically only confirms
 * price (and maybe qty). Creating the listing reserves `qty_reserved` via the RPC.
 */
const CONDITIONS: { value: ListingCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'open_box', label: 'Open box' },
  { value: 'remnant', label: 'Remnant / offcut' },
  { value: 'lot', label: 'Mixed lot' },
];
const DELIVERY: { value: DeliveryOption; label: string }[] = [
  { value: 'pickup', label: 'Pickup only' },
  { value: 'ship', label: 'Shipping' },
  { value: 'both', label: 'Pickup or shipping' },
];

const ListToMarketplaceDialog: React.FC<{
  item: WarehouseItem | null;
  workspaceId: string;
  warehouseLocation: string | null;
  onOpenChange: (v: boolean) => void;
  onListed: () => void;
}> = ({ item, workspaceId, warehouseLocation, onOpenChange, onListed }) => {
  const { toast } = useToast();
  const open = !!item;
  const available = item ? item.qty_on_hand - item.qty_reserved : 0;

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [specs, setSpecs] = useState<Record<string, unknown>>({});
  const [comps, setComps] = useState<{ n: number; min: number | null; median: number | null; max: number | null } | null>(null);

  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [qty, setQty] = useState('');
  const [condition, setCondition] = useState<ListingCondition>('new');
  const [batchLot, setBatchLot] = useState('');
  const [city, setCity] = useState('');
  const [delivery, setDelivery] = useState<DeliveryOption>('pickup');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    if (!item) return;
    // reset
    setLoadingMeta(true); setPriceTouched(false); setBusy(false);
    setTitle(item.name); setDescription(''); setCategory(null); setImageUrls([]); setSpecs({}); setComps(null);
    setPrice(''); setQty(String(available));
    setCondition('new'); setBatchLot('');
    setCity(warehouseLocation || item.location || '');
    setDelivery('pickup');
    const d = new Date(); d.setDate(d.getDate() + 60);
    setExpiry(d.toISOString().slice(0, 10));

    let cancelled = false;
    (async () => {
      try {
        if (item.product_id) {
          const a = await marketplaceService.buildAutofill(item.product_id);
          if (cancelled) return;
          if (a.title) setTitle(a.title);
          setCategory(a.material_category);
          setImageUrls(a.image_urls);
          setSpecs(a.specs);
          if (a.price_anchor) setPrice(String(a.price_anchor));
          const c = await marketplaceService.priceComps(a.material_category, item.unit, workspaceId);
          if (cancelled) return;
          setComps({ n: c.n, min: c.min_price, median: c.median_price, max: c.max_price });
        } else {
          const c = await marketplaceService.priceComps(null, item.unit, workspaceId);
          if (cancelled) return;
          setComps({ n: c.n, min: c.min_price, median: c.median_price, max: c.max_price });
        }
      } catch {
        /* autofill is best-effort; the seller can still fill the form */
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // If no catalog price anchor, suggest the comps median (until the user types their own).
  useEffect(() => {
    if (!priceTouched && !price && comps?.median != null) setPrice(String(Math.round(comps.median)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comps]);

  const submit = async () => {
    if (!item) return;
    const p = parseDecimal(price); const q = parseDecimal(qty);
    if (p == null || p <= 0) { toast({ title: 'Set a price', variant: 'destructive' }); return; }
    if (q == null || q <= 0) { toast({ title: 'Set a quantity', variant: 'destructive' }); return; }
    if (q > available) { toast({ title: `Only ${available} ${item.unit} available to list`, variant: 'destructive' }); return; }
    try {
      setBusy(true);
      await marketplaceService.createListing({
        warehouseItemId: item.id, price: p, qty: q,
        condition, batchLot: batchLot.trim() || null,
        locationCity: city.trim() || null, deliveryOption: delivery,
        expiresAt: expiry ? new Date(`${expiry}T23:59:59Z`).toISOString() : null,
        title: title.trim() || item.name, description: description.trim() || null,
        materialCategory: category, specs, imageUrls,
      });
      toast({ title: 'Listed to marketplace' });
      onListed();
    } catch (err: any) {
      toast({ title: 'Failed to list', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>List “{item.name}” to Marketplace</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {imageUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {imageUrls.slice(0, 4).map((u) => (
                <img key={u} src={u} alt="" className="h-16 w-16 rounded-md object-cover border border-border/40" />
              ))}
            </div>
          )}

          <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>

          {/* Suggested-price panel */}
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {loadingMeta ? (
              <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Checking comparable surplus…</span>
            ) : comps && comps.n > 0 ? (
              <>Similar surplus: <span className="text-foreground font-medium">€{comps.min}–€{comps.max}</span> (median €{Math.round(comps.median ?? 0)}) across {comps.n} listing{comps.n === 1 ? '' : 's'}.</>
            ) : (
              <>No comparable surplus listed yet — you set the market.</>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Price (€)</Label>
              <Input type="text" inputMode="decimal" value={price} onChange={(e) => { setPriceTouched(true); setPrice(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <Label>Qty ({item.unit})</Label>
              <Input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
              <span className="text-[11px] text-muted-foreground">{available} available</span>
            </div>
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as ListingCondition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Batch / lot</Label><Input value={batchLot} onChange={(e) => setBatchLot(e.target.value)} placeholder="optional" /></div>
            <div className="space-y-1"><Label>Location</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Athens" /></div>
            <div className="space-y-1">
              <Label>Delivery</Label>
              <Select value={delivery} onValueChange={(v) => setDelivery(v as DeliveryOption)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DELIVERY.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Listing expires</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          </div>

          <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional — anything a buyer should know" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || available <= 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'List it'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
