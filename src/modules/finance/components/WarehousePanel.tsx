import React, { useEffect, useState } from 'react';
import { Loader2, Plus, PackagePlus, PackageMinus, Trash2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { warehouseService, type WarehouseItem } from '@/services/warehouseService';

export const WarehousePanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await warehouseService.listItems(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load stock', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
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

  const remove = async (item: WarehouseItem) => {
    if (!confirm(`Delete ${item.name} from the warehouse?`)) return;
    try { await warehouseService.deleteItem(item.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Warehouse stock</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)} className="rounded-full"><Plus className="h-4 w-4 mr-1" /> Add item</Button>
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

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} onAdded={async () => { setAddOpen(false); await load(); }} />
    </Card>
  );
};

const AddItemDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; onAdded: () => void }> = ({ open, onOpenChange, workspaceId, onAdded }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [qty, setQty] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      await warehouseService.createItem({
        workspaceId, name: name.trim(), sku: sku.trim() || undefined, unit: unit.trim() || 'pcs',
        qty_on_hand: parseFloat(qty) || 0, reorder_point: parseFloat(reorder) || 0, location: location.trim() || undefined,
      });
      setName(''); setSku(''); setQty('0'); setReorder('0'); setLocation('');
      onAdded();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add stock item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>SKU</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} /></div>
            <div className="space-y-1"><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>On hand</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="space-y-1"><Label>Reorder pt</Label><Input type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} /></div>
            <div className="space-y-1"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
