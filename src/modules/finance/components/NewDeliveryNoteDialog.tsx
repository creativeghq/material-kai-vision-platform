/**
 * Create a delivery note (Δελτίο Αποστολής). Pick a customer (optional), add warehouse
 * items as lines, save as draft or issue immediately. Issuing decrements stock for each
 * warehouse-linked line.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Plus, Trash2, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { deliveryNotesService, type WarehousePick, type DeliveryLineInput } from '@/modules/finance/services/deliveryNotesService';

export const NewDeliveryNoteDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [warehouse, setWarehouse] = useState<WarehousePick[]>([]);
  const [customer, setCustomer] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DeliveryLineInput[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(''); setNotes(''); setLines([]);
    (async () => {
      const [{ data: cos }, wh] = await Promise.all([
        supabase.from('crm_companies').select('id, name').eq('workspace_id', workspaceId).order('name').limit(500),
        deliveryNotesService.listWarehouse(workspaceId),
      ]);
      setCompanies((cos ?? []) as any);
      setWarehouse(wh);
    })();
  }, [open, workspaceId]);

  const addItem = (id: string) => {
    const w = warehouse.find((x) => x.id === id);
    if (!w) return;
    setLines((ls) => [...ls, { warehouse_item_id: w.id, product_id: w.product_id, description: w.name, sku: w.sku, quantity: 1, unit: w.unit }]);
  };
  const setQty = (i: number, q: number) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, quantity: q } : l));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const submit = async (issue: boolean) => {
    if (lines.length === 0) { toast({ title: 'Add at least one item', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const id = await deliveryNotesService.create(workspaceId, {
        customerCompanyId: customer || null, notes, lines,
      });
      if (issue) await deliveryNotesService.issue(id);
      toast({ title: issue ? 'Delivery note issued' : 'Draft saved' });
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> New delivery note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Customer (optional)</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Select value="" onValueChange={addItem}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="+ Add warehouse item" /></SelectTrigger>
                <SelectContent>
                  {warehouse.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No warehouse items</div>
                    : warehouse.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.qty_on_hand != null ? ` (${w.qty_on_hand})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {lines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items yet.</p>
            ) : (
              <div className="space-y-1">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0 truncate">{l.description}{l.unit ? <span className="text-muted-foreground"> /{l.unit}</span> : ''}</div>
                    <Input type="number" min="1" step="1" className="h-8 w-20 text-xs" value={l.quantity}
                      onChange={(e) => setQty(i, Number(e.target.value) || 1)} />
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shipping reference, vehicle, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => submit(false)} disabled={busy}>Save draft</Button>
          <Button onClick={() => submit(true)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue (decrement stock)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
