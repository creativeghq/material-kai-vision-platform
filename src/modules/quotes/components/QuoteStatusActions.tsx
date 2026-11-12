import React, { useState } from 'react';
import { ChevronDown, Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Textarea } from '@/components/core/ui/textarea';
import { FormField } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { quotesService, type Quote, type QuoteManualStatus } from '../services/QuotesService';

type StatusQuote = Pick<Quote, 'id' | 'status' | 'name'>;

interface StatusMove {
  to: QuoteManualStatus;
  label: string;
}

/** What an operator may move a quote to by hand, from where it is now. Mirrors `set_quote_status`. */
export function quoteStatusMoves(status: Quote['status']): StatusMove[] {
  switch (status) {
    case 'draft':
      return [{ to: 'submitted', label: 'Submitted' }, { to: 'rejected', label: 'Declined…' }];
    case 'submitted':
      return [{ to: 'draft', label: 'Draft' }, { to: 'rejected', label: 'Declined…' }];
    case 'quoted':
      return [
        { to: 'draft', label: 'Draft' },
        { to: 'submitted', label: 'Submitted' },
        { to: 'rejected', label: 'Declined…' },
      ];
    case 'expired':
      return [{ to: 'draft', label: 'Reopen as draft' }, { to: 'rejected', label: 'Declined…' }];
    case 'rejected':
      return [{ to: 'draft', label: 'Reopen as draft' }];
    default:
      return [];
  }
}

function useQuoteStatusMove(quote: StatusQuote, onChanged: () => void) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');

  const apply = async (to: QuoteManualStatus, why?: string) => {
    try {
      setBusy(true);
      await quotesService.setQuoteStatus(quote.id, to, why);
      toast({
        title: to === 'rejected' ? 'Quote declined' : to === 'draft' ? 'Quote is a draft again' : 'Quote marked submitted',
      });
      setDeclineOpen(false);
      setReason('');
      onChanged();
    } catch (err) {
      toast({ title: 'Could not change the status', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const run = (move: StatusMove) => {
    if (move.to === 'rejected') setDeclineOpen(true);
    else void apply(move.to);
  };

  const dialog = (
    <Dialog open={declineOpen} onOpenChange={(o) => { if (!busy) setDeclineOpen(o); }}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Mark quote declined</DialogTitle>
          <DialogDescription>
            {quote.name || 'This quote'} will be closed as declined. You can reopen it as a draft later.
          </DialogDescription>
        </DialogHeader>
        <FormField label="Reason (optional)">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Went with another supplier, price too high"
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={() => void apply('rejected', reason)} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Mark declined
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { busy, run, dialog };
}

/**
 * The status control on a quote's own page: every status the quote can move to.
 * Sent and Accepted have side effects (customer notified; order + draft invoice), so the page supplies them.
 */
export const QuoteStatusMenu: React.FC<{
  quote: StatusQuote;
  onChanged: () => void;
  onMarkSent?: () => void;
  onAccept?: () => void;
  blockedReason?: string;
  working?: boolean;
}> = ({ quote, onChanged, onMarkSent, onAccept, blockedReason, working = false }) => {
  const { busy: moving, run, dialog } = useQuoteStatusMove(quote, onChanged);
  const busy = moving || working;
  const [acceptOpen, setAcceptOpen] = useState(false);
  const moves = quoteStatusMoves(quote.status);
  const open = ['draft', 'submitted', 'quoted'].includes(quote.status);
  const canSend = open && quote.status !== 'quoted' && !!onMarkSent;
  const canAccept = open && !!onAccept;
  const empty = moves.length === 0 && !canSend && !canAccept;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Change status <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {empty ? (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              An accepted quote is changed by issuing a revision.
            </DropdownMenuLabel>
          ) : (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Move to</DropdownMenuLabel>
              {moves.filter((m) => m.to !== 'rejected').map((m) => (
                <DropdownMenuItem key={m.to} onSelect={() => run(m)}>{m.label}</DropdownMenuItem>
              ))}
              {canSend && (
                <DropdownMenuItem disabled={!!blockedReason} onSelect={() => onMarkSent?.()}>
                  Sent to customer
                </DropdownMenuItem>
              )}
              {canAccept && (
                <DropdownMenuItem disabled={!!blockedReason} onSelect={() => setAcceptOpen(true)}>
                  Accepted…
                </DropdownMenuItem>
              )}
              {moves.some((m) => m.to === 'rejected') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => run({ to: 'rejected', label: 'Declined…' })}
                  >
                    Declined…
                  </DropdownMenuItem>
                </>
              )}
              {blockedReason && (canSend || canAccept) && (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{blockedReason}</DropdownMenuLabel>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark quote accepted</DialogTitle>
            <DialogDescription>
              Accepting {quote.name || 'this quote'} creates a confirmed sales order and a draft invoice from its lines.
              After that the quote can only be changed by issuing a revision.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>Cancel</Button>
            <Button onClick={() => { setAcceptOpen(false); onAccept?.(); }}>Mark accepted</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const QuoteRowActions: React.FC<{
  quote: StatusQuote;
  onOpen: () => void;
  onPipeline: () => void;
  onDelete: () => void;
  onChanged: () => void;
}> = ({ quote, onOpen, onPipeline, onDelete, onChanged }) => {
  const { busy, run, dialog } = useQuoteStatusMove(quote, onChanged);
  const moves = quoteStatusMoves(quote.status);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Actions for ${quote.name || 'quote'}`}
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
          {moves.length > 0 && <DropdownMenuSeparator />}
          {moves.length > 0 && (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Move to</DropdownMenuLabel>
          )}
          {moves.map((m) => (
            <DropdownMenuItem key={m.to} onSelect={() => run(m)}>{m.label}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onPipeline}>Add to pipeline…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
};
