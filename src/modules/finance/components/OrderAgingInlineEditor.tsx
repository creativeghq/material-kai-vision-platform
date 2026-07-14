import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ordersService } from '@/modules/finance/services/ordersService';
import type { FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

/**
 * Inline popover to set an un-invoiced order's finance category + expected payment date, straight
 * from the AR/AP aging list. An order carries no invoice due date, so the expected payment date is
 * what it AGES against — set it here and the row moves into the right aging bucket. Both values
 * carry onto the invoice/supplier bill when the order is later invoiced. `children` is the clickable
 * trigger (the cell content).
 */
export const OrderAgingInlineEditor: React.FC<{
  orderId: string;
  categoryId: string | null;
  expectedDate: string | null;
  categories: FinanceCategory[];
  onSaved: () => void;
  children: React.ReactNode;
}> = ({ orderId, categoryId, expectedDate, categories, onSaved, children }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(categoryId ?? 'none');
  const [date, setDate] = useState(expectedDate ?? '');
  const [busy, setBusy] = useState(false);

  // Re-seed from props whenever the popover opens (row may have changed under us since last open).
  useEffect(() => {
    if (open) { setCat(categoryId ?? 'none'); setDate(expectedDate ?? ''); }
  }, [open, categoryId, expectedDate]);

  const save = async () => {
    setBusy(true);
    try {
      await ordersService.updateMeta(orderId, {
        categoryId: cat === 'none' ? null : cat,
        expectedPaymentDate: date || null,
      });
      setOpen(false);
      onSaved();
      toast({ title: 'Order updated' });
    } catch (err: any) {
      toast({ title: 'Failed to update order', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-left hover:underline decoration-dotted underline-offset-2" onClick={(e) => e.stopPropagation()}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-9"><SelectValue placeholder="No category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expected payment date</Label>
          <Input type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">Un-invoiced orders age against this date. Leave empty to keep it as “expected” (won’t age).</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
