import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { FormField } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { parseDecimal } from '@/utils/decimal';
import { formatMoney } from '@/modules/finance/services/financeService';
import { quotesService } from '../services/QuotesService';

/** Make the customer-facing copy of a procurement quote: every line's price raised by one markup. */
export const ClientQuoteDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: { id: string; name?: string | null; subtotal?: number | null; currency?: string | null };
  onCreated: (newQuoteId: string) => void;
}> = ({ open, onOpenChange, quote, onCreated }) => {
  const { toast } = useToast();
  const [markup, setMarkup] = useState('20');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setMarkup('20'); }, [open]);

  const pct = parseDecimal(markup);
  const valid = pct != null && pct >= 0;
  const ours = Number(quote.subtotal ?? 0);
  const theirs = valid ? ours * (1 + pct / 100) : null;
  const cur = quote.currency || 'EUR';

  const create = async () => {
    if (!valid) return;
    try {
      setBusy(true);
      const newId = await quotesService.generateClientQuote(quote.id, pct);
      toast({ title: 'Customer quote created', description: `+${pct}% on every line. Opening the draft.` });
      onOpenChange(false);
      onCreated(newId);
    } catch (err) {
      toast({ title: 'Could not create the customer quote', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate for end user</DialogTitle>
          <DialogDescription>
            Creates a new draft quote for your customer with the same lines, each priced up by your markup.
            This quote stays as it is, and the markup is never shown to the customer.
          </DialogDescription>
        </DialogHeader>
        <FormField label="Markup %">
          <Input inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} autoFocus />
        </FormField>
        <dl className="space-y-1 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Your price (net)</dt><dd className="tabular-nums">{formatMoney(ours, cur)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Customer price (net)</dt><dd className="tabular-nums">{theirs != null ? formatMoney(theirs, cur) : '—'}</dd></div>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void create()} disabled={busy || !valid}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create customer quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
