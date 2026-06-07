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
  const [kind, setKind] = useState<'dispatch' | 'receipt'>('dispatch');
  const [customer, setCustomer] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DeliveryLineInput[]>([]);
  // Transport (Στοιχεία Μεταφοράς)
  const [transportDate, setTransportDate] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [movePurpose, setMovePurpose] = useState('1');
  const [shipTo, setShipTo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('dispatch'); setCustomer(''); setNotes(''); setLines([]);
    setTransportDate(''); setVehicleNumber(''); setMovePurpose('1'); setShipTo('');
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
        kind, customerCompanyId: customer || null, notes, lines,
        transportDate, vehicleNumber, movePurpose, shipTo,
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> New {kind === 'receipt' ? 'goods-receipt note' : 'delivery note'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dispatch">Delivery note (dispatch · stock out)</SelectItem>
                <SelectItem value="receipt">Goods-receipt note (receive · stock in)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{kind === 'receipt' ? 'Supplier' : 'Customer'} (optional)</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Transport (Στοιχεία Μεταφοράς) */}
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Transport date</Label>
              <Input type="date" className="h-8 text-xs" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle no.</Label>
              <Input className="h-8 text-xs" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="ΝΑΧ-1234" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Purpose</Label>
              <Select value={movePurpose} onValueChange={setMovePurpose}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Sale</SelectItem>
                  <SelectItem value="2">2 — Sale on behalf of third party</SelectItem>
                  <SelectItem value="3">3 — Sampling</SelectItem>
                  <SelectItem value="4">4 — Exhibition</SelectItem>
                  <SelectItem value="5">5 — Return</SelectItem>
                  <SelectItem value="6">6 — Movement between premises</SelectItem>
                  <SelectItem value="7">7 — Consignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ship to (address)</Label>
              <Input className="h-8 text-xs" value={shipTo} onChange={(e) => setShipTo(e.target.value)} placeholder="Delivery address" />
            </div>
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
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue ({kind === 'receipt' ? 'add to stock' : 'decrement stock'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
