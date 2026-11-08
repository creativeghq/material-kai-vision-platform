/** What a received document is attached to (orders, payments), and the way to attach more. */
import React from 'react';
import { Link } from 'react-router-dom';
import { Paperclip } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { formatMoney } from '@/modules/finance/services/financeService';
import { formatDate } from '@/utils/datetime';
import type { InboundDocAttachments, InboundDocument } from '@/modules/finance/services/inboundService';
import { InboundAttachDialog } from '@/modules/finance/components/InboundAttachDialog';

export const InboundAttachCell: React.FC<{
  doc: InboundDocument;
  /** `undefined` = the read failed, which is not the same fact as `null` = nothing attached. */
  attachments: InboundDocAttachments | null | undefined;
  financeBase: string;
  readOnly: boolean;
  onChanged: () => void;
}> = ({ doc, attachments, financeBase, readOnly, onChanged }) => {
  const [open, setOpen] = React.useState(false);
  const currency = doc.currency ?? 'EUR';

  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
      {attachments === undefined && (
        <span className="text-[10px] text-amber-800 dark:text-amber-300" title="The attachments could not be loaded. That does not mean there are none.">
          Attachments unknown
        </span>
      )}
      {attachments?.orders.map((o) => (
        <Link key={o.order_id} to={`${financeBase}/orders/${o.order_id}`} title={`${formatMoney(o.net_amount, currency)} net of this document`}>
          <Badge variant="info">{o.order_number ?? 'Order'}</Badge>
        </Link>
      ))}
      {attachments?.payments.map((p) => (
        <Badge key={p.allocation_id} variant="success" title={p.reference ?? undefined}>
          {formatMoney(p.amount, currency)}{p.paid_at ? ` · ${formatDate(p.paid_at)}` : ''}
        </Badge>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-0.5 rounded-sm px-1 text-[10px] text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
          title="Attach an order, a payment or another document"
        >
          <Paperclip className="h-3 w-3" aria-hidden="true" /> Attach
        </button>
      )}
      {open && (
        <InboundAttachDialog
          doc={doc}
          attachments={attachments ?? null}
          financeBase={financeBase}
          open={open}
          onOpenChange={setOpen}
          onChanged={onChanged}
        />
      )}
    </div>
  );
};
