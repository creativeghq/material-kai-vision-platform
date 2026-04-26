import React, { useState } from 'react';
import { FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/core/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { oxygenService } from '../services/oxygenService';
import { CustomerLinkDialog } from './CustomerLinkDialog';
import type { QuoteOxygenView } from '../types';

interface OxygenPreInvoiceButtonProps {
  quote: QuoteOxygenView;
  onSynced?: () => void;
}

// Module entry point — drop this on a quote detail page next to other action buttons.
// Renders only when quote.status === 'accepted'. Once oxygen_notice_id is set, the button is permanently disabled.
export const OxygenPreInvoiceButton: React.FC<OxygenPreInvoiceButtonProps> = ({ quote, onSynced }) => {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (quote.status !== 'accepted') return null;

  const alreadySynced = !!quote.oxygen_notice_id;
  const failed = quote.oxygen_sync_status === 'failed';
  const syncing = quote.oxygen_sync_status === 'syncing';
  const customerLinked = !!quote.customer_contact_id || !!quote.customer_company_id;

  const handleClick = async () => {
    if (alreadySynced) return; // hard block
    if (!customerLinked) {
      setPickerOpen(true);
      return;
    }
    setCreating(true);
    try {
      const result = await oxygenService.createPreInvoice(quote.id);
      if (result.already_synced) {
        toast({ title: 'Already synced', description: `Pre-invoice ${result.oxygen_notice_id} already exists in Oxygen.` });
      } else {
        toast({ title: 'Pre-invoice created', description: `Oxygen notice ${result.oxygen_notice_id} (${result.items_count ?? 0} items).` });
      }
      onSynced?.();
    } catch (err) {
      toast({
        title: 'Pre-invoice failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  let label: React.ReactNode;
  let className = 'rounded-full';

  if (alreadySynced) {
    label = <><CheckCircle2 className="h-4 w-4 mr-1" /> Pre-Invoice #{quote.oxygen_notice_id}</>;
    className += ' bg-emerald-700 hover:bg-emerald-700 text-white opacity-80 cursor-not-allowed';
  } else if (creating || syncing) {
    label = <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</>;
    className += ' bg-blue-600 hover:bg-blue-700 text-white';
  } else if (failed) {
    label = <><AlertCircle className="h-4 w-4 mr-1" /> Retry Pre-Invoice</>;
    className += ' bg-amber-600 hover:bg-amber-700 text-white';
  } else {
    label = <><FileText className="h-4 w-4 mr-1" /> Make Pre-Invoice</>;
    className += ' bg-blue-600 hover:bg-blue-700 text-white';
  }

  const button = (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={alreadySynced || creating || syncing}
      className={className}
    >
      {label}
    </Button>
  );

  return (
    <>
      {failed && quote.oxygen_sync_error
        ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-xs">{quote.oxygen_sync_error}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
        : button}

      <CustomerLinkDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        quoteId={quote.id}
        onLinked={onSynced ?? (() => {})}
      />
    </>
  );
};
