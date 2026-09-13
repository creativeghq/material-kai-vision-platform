/**
 * What a customer asked for and walked away without (#434).
 *
 * The only thing in the whole vertical review that generates data we have no other route to. A
 * customer who asks for something we do not stock leaves no record anywhere — nothing raises,
 * because no row is wrong. For a showroom this is the range-planning input.
 */
import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { orderLineService, type LostSale } from '@/modules/finance/services/orderLineService';

const OUTCOMES: { value: LostSale['outcome']; label: string }[] = [
  { value: 'not_stocked', label: 'We do not stock it' },
  { value: 'out_of_stock', label: 'We stock it and had none' },
  { value: 'price', label: 'Price' },
  { value: 'lead_time', label: 'Lead time' },
  { value: 'wrong_spec', label: 'Wrong specification' },
  { value: 'other', label: 'Something else' },
];

export const LostSaleDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  branchCode?: number;
}> = ({ open, onOpenChange, workspaceId, branchCode }) => {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [outcome, setOutcome] = useState<LostSale['outcome']>('not_stocked');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!description.trim()) return;
    setBusy(true);
    try {
      await orderLineService.recordLostSale({
        workspace_id: workspaceId,
        description: description.trim(),
        quantity: quantity.trim() ? Number(quantity) : null,
        outcome,
        notes: notes.trim() || null,
        branch_code: branchCode ?? null,
      } as never);
      setDescription(''); setQuantity(''); setNotes('');
      onOpenChange(false);
      toast({ title: 'Recorded', description: 'It will show up in the range review.' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record it',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>What did they ask for?</DialogTitle>
          <DialogDescription>
            Ten seconds now. Nothing else in the system will ever know somebody wanted this.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div>
            <Label htmlFor="lost-desc" className="text-[11px]">What they wanted</Label>
            <Input
              id="lost-desc" className="mt-1 h-9 text-sm" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="120x120 anthracite, matt"
            />
          </div>
          <div className="flex gap-2">
            <div className="w-28">
              <Label htmlFor="lost-qty" className="text-[11px]">Quantity</Label>
              <Input
                id="lost-qty" type="number" className="mt-1 h-9 text-sm" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="lost-outcome" className="text-[11px]">Why they left</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as LostSale['outcome'])}>
                <SelectTrigger id="lost-outcome" className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lost-notes" className="text-[11px]">Notes</Label>
            <Input
              id="lost-notes" className="mt-1 h-9 text-sm" value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !description.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Record it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
