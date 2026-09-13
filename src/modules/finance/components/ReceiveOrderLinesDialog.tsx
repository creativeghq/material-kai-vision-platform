/**
 * Record what actually turned up against a purchase order.
 *
 * The whole-order "Receive into warehouse" is all-or-nothing, so a supplier delivering 5 of 10
 * pallets had nowhere to put that — and the per-line "Delivered" editor, which looks like the
 * place, writes a commercial figure and moves no stock (#320).
 */
import React, { useMemo, useState } from 'react';
import { Loader2, PackageCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { OrderItem } from '@/modules/finance/services/ordersService';

export const ReceiveOrderLinesDialog: React.FC<{
  orderId: string;
  orderNumber: string | null;
  items: OrderItem[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReceived?: () => void;
}> = ({ orderId, orderNumber, items, open, onOpenChange, onReceived }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Only what can still arrive. A line already fully received is not a choice to offer.
  const stillToArrive = useMemo(() => items
    .filter((i) => i.product_id && i.update_warehouse !== false)
    .map((i) => ({ item: i, left: Number(i.quantity ?? 0) - Number(i.quantity_shipped ?? 0) }))
    .filter((x) => x.left > 0), [items]);

  const [qty, setQty] = useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open) setQty(Object.fromEntries(stillToArrive.map((x) => [x.item.id, String(x.left)])));
  }, [open, stillToArrive]);

  const submit = async () => {
    const lines = stillToArrive
      .map((x) => ({ order_item_id: x.item.id, quantity: Number(qty[x.item.id] ?? 0) }))
      .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);
    if (lines.length === 0) {
      toast({ title: 'Nothing to receive', description: 'Set a quantity on at least one line.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('receive_order_lines', {
        p_order: orderId, p_lines: lines,
      });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) as { received_lines?: number; units?: number } | null;
      toast({
        title: 'Received into stock',
        description: `${r?.received_lines ?? 0} line(s), ${r?.units ?? 0} unit(s). The three-way match now counts these as received.`,
      });
      onOpenChange(false);
      onReceived?.();
    } catch (e) {
      // The function's own words: it distinguishes "more than outstanding" from "not a finance
      // manager" from "no stocked lines", and each needs a different response.
      toast({ title: 'Could not receive', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive goods — {orderNumber ?? 'purchase order'}</DialogTitle>
          <DialogDescription>
            What physically arrived. This moves stock; the &ldquo;Delivered&rdquo; column on the lines
            does not.
          </DialogDescription>
        </DialogHeader>

        {stillToArrive.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every stocked line on this order has already been received in full.
          </p>
        ) : stillToArrive.map(({ item, left }) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <Label htmlFor={`rcv-${item.id}`} className="min-w-0 flex-1 truncate text-sm font-normal">
              {item.description}
              <span className="ml-1 text-xs text-muted-foreground">({left} outstanding)</span>
            </Label>
            <Input
              id={`rcv-${item.id}`}
              value={qty[item.id] ?? ''}
              onChange={(e) => setQty((m) => ({ ...m, [item.id]: e.target.value }))}
              inputMode="decimal"
              className="w-24 text-right"
            />
          </div>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || stillToArrive.length === 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
            Receive into stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiveOrderLinesDialog;
