import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, PackagePlus, PackageMinus, Trash2, AlertTriangle, Search, Package, X, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { warehouseService, type WarehouseItem, type Warehouse } from '@/services/warehouseService';
import { AddDealerProductDialog } from '@/components/business/marketplace/AddDealerProductDialog';

export const WarehousePanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWh, setSelectedWh] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addWhOpen, setAddWhOpen] = useState(false);

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
    } catch (err: any) {
      toast({ title: 'Failed to load stock', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { if (workspaceId) void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const move = async (item: WarehouseItem, direction: 'in' | 'out') => {
    const raw = window.prompt(`${direction === 'in' ? 'Receive' : 'Issue'} quantity for ${item.name}?`, '1');
    if (raw === null) return;
    const qty = parseFloat(raw);
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
    const qty = parseFloat(raw);
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: 'Invalid quantity', variant: 'destructive' }); return; }
    try { await warehouseService.transfer(item.id, target.id, qty); toast({ title: `Transferred to ${target.name}` }); await load(); }
    catch (err: any) { toast({ title: 'Transfer failed', description: err?.message, variant: 'destructive' }); }
  };

  const remove = async (item: WarehouseItem) => {
    if (!confirm(`Delete ${item.name} from the warehouse?`)) return;
    try { await warehouseService.deleteItem(item.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
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
              {items.map((it) => {
                const low = it.qty_on_hand <= it.reorder_point && it.reorder_point > 0;
                return (
                  <tr key={it.id} className="border-b border-border/30">
                    <td className="px-4 py-2 font-medium">{it.name} <span className="text-xs text-muted-foreground">/ {it.unit}</span></td>
                    <td className="px-4 py-2 font-mono text-xs">{it.sku ?? '—'}</td>
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
                        <Button size="sm" variant="ghost" title="Delete" onClick={() => remove(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} warehouseId={selectedWh} onAdded={async () => { setAddOpen(false); await load(); }} />
      <AddWarehouseDialog open={addWhOpen} onOpenChange={setAddWhOpen} workspaceId={workspaceId} onAdded={async (id) => { setAddWhOpen(false); await load(id); }} />
    </Card>
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
  const [busy, setBusy] = useState(false);
  const searchSeq = useRef(0);

  // Reset when the dialog closes.
  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setSelected(null);
      setUnit('pcs'); setQty('0'); setReorder('0'); setLocation('');
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
        qty_on_hand: parseFloat(qty) || 0, reorder_point: parseFloat(reorder) || 0,
        location: location.trim() || undefined,
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
                <div className="space-y-1"><Label>On hand</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                <div className="space-y-1"><Label>Reorder pt</Label><Input type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} /></div>
                <div className="space-y-1"><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional — e.g. Aisle 3 / Shelf B" /></div>
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
