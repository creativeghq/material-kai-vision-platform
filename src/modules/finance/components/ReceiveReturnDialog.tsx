/**
 * Goods coming back, recorded against the credit note that paid for them. The credit note itself
 * handles only the MONEY — it touches neither stock nor `quantity_shipped`.
 *
 * Explicit on purpose: most credit notes return nothing, and inferring a physical movement from a
 * financial document would put back stock that never arrived.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';

interface Line {
  id: string;
  product_id: string | null;
  description: string | null;
  quantity: number | null;
  order_item_id?: string | null;
}

export const ReceiveReturnDialog: React.FC<{
  creditNoteId: string;
  creditNoteNumber: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}> = ({ creditNoteId, creditNoteNumber, open, onOpenChange, onDone }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('credit_note_items')
      .select('id, product_id, description, quantity, source_invoice_item_id')
      .eq('credit_note_id', creditNoteId);
    const rows = ((data ?? []) as Array<Line & { source_invoice_item_id?: string | null }>)
      // Only a stocked product can come back into a warehouse. A labour or delivery line on a
      // credit note is money, not goods.
      .filter((l) => !!l.product_id);
    setLines(rows);
    setQty(Object.fromEntries(rows.map((l) => [l.id, String(l.quantity ?? 0)])));
  }, [creditNoteId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const submit = async () => {
    if (!lines) return;
    const payload = lines
      .map((l) => ({
        product_id: l.product_id,
        description: l.description,
        quantity: Number(qty[l.id] ?? 0),
      }))
      .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);

    if (payload.length === 0) {
      toast({ title: 'Nothing to receive', description: 'Set a quantity on at least one line.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('credit_note_receive_return', {
        p_credit_note_id: creditNoteId, p_lines: payload,
      });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) as { received_lines?: number; order_lines_reversed?: number } | null;
      toast({
        title: 'Goods received back',
        description: `${r?.received_lines ?? 0} line(s) back into stock`
          + (r?.order_lines_reversed ? `, ${r.order_lines_reversed} order line(s) no longer counted as delivered.` : '.'),
      });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      // The function's own words — it distinguishes "already received" from "not a stock
      // operator" from "no stocked lines", and each needs a different response.
      toast({ title: 'Could not receive the return', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive returned goods</DialogTitle>
          <DialogDescription>
            Against credit note {creditNoteNumber ?? ''}. Only what physically arrived — the credit
            note itself does not put anything back into stock.
          </DialogDescription>
        </DialogHeader>

        {lines === null && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the credited lines…
          </p>
        )}
        {lines?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No line on this credit note names a stocked product, so there is nothing to receive.
            A credit for labour, delivery or a price correction returns no goods.
          </p>
        )}
        {(lines ?? []).map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3">
            <Label htmlFor={`ret-${l.id}`} className="min-w-0 flex-1 truncate text-sm font-normal">
              {l.description ?? 'Line'}
            </Label>
            <Input
              id={`ret-${l.id}`}
              value={qty[l.id] ?? ''}
              onChange={(e) => setQty((m) => ({ ...m, [l.id]: e.target.value }))}
              inputMode="decimal"
              className="w-24 text-right"
            />
          </div>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !lines || lines.length === 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
            Receive into stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiveReturnDialog;
