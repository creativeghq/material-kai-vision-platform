/** The expanded body of an inbox row: the delivery note(s) an invoice bills, or the invoice a ΔΑ is billed on. */
import React from 'react';
import { ExternalLink, Loader2, Truck, Unlink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import {
  inboundService, type InboundDetailEdge, type InboundDocumentDetail,
} from '@/modules/finance/services/inboundService';
import { INBOUND_LINK_SOURCE_LABEL, documentLabel } from '@/modules/finance/utils/inboundCorrelation';
import { unitSuffix, unitFromMydataCode } from '@/lib/units';
import { formatDate } from '@/utils/datetime';

const isLinked = (e: InboundDetailEdge) =>
  !e.rejected_at && (e.link_source === 'aade' || e.link_source === 'user' || !!e.confirmed_at);

const isDeliveryNote = (docType: string | null | undefined) => String(docType ?? '').split('.')[0] === '9';

interface Block {
  note: InboundDocumentDetail;
  edge: InboundDetailEdge;
}

export const InboundLinkedDetailPanel: React.FC<{
  docId: string;
  readOnly: boolean;
  onChanged: () => void;
  onOpenDocument?: (docId: string) => void;
}> = ({ docId, readOnly, onChanged, onOpenDocument }) => {
  const { toast } = useToast();
  const [self, setSelf] = React.useState<InboundDocumentDetail | null>(null);
  const [blocks, setBlocks] = React.useState<Block[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const d = await inboundService.documentDetail(docId);
      if (!d) throw new Error('Document not found.');
      let next: Block[];
      if (isDeliveryNote(d.document.doc_type)) {
        next = d.correlations
          .filter((e) => isLinked(e) && e.relation === 'invoiced_by')
          .map((edge) => ({ note: d, edge }));
      } else {
        const edges = d.correlations.filter((e) => isLinked(e) && e.relation === 'itemised_by' && e.other_is_held && e.other_doc_id);
        const notes = await Promise.all(edges.map((e) => inboundService.documentDetail(e.other_doc_id!)));
        next = edges.flatMap((edge, i) => (notes[i] ? [{ note: notes[i]!, edge }] : []));
      }
      if (live) { setSelf(d); setBlocks(next); }
    })().catch((e: any) => { if (live) setError(e?.message ?? 'Could not load the linked documents.'); });
    return () => { live = false; };
  }, [docId]);

  const unlink = async (linkId: string) => {
    setBusy(linkId);
    try {
      await inboundService.rejectLink(linkId);
      onChanged();
    } catch (e: any) {
      toast({ title: 'Could not unlink the documents', description: e?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (error) return <p className="px-4 py-3 text-xs text-red-700 dark:text-red-300">{error}</p>;
  if (!self || !blocks) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading linked documents…
      </div>
    );
  }
  if (blocks.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">No linked delivery note.</p>;
  }

  const selfIsNote = isDeliveryNote(self.document.doc_type);
  const currency = self.document.currency ?? 'EUR';

  return (
    <div className="space-y-3 px-4 py-3">
      {blocks.map(({ note, edge }) => {
        const nd = note.document;
        const counterpartId = edge.other_doc_id;
        const money = note.money;
        return (
          <div key={edge.link_id} className="rounded-sm border border-hairline bg-card">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                {selfIsNote ? `Invoiced on ${documentLabel(edge)}` : `Delivered on ${nd.label || nd.mark}`}
              </span>
              {nd.dispatch_date && <span className="text-[11px] text-muted-foreground">Dispatched {formatDate(nd.dispatch_date)}</span>}
              {nd.vehicle_number && <span className="font-mono text-[11px] text-muted-foreground">{nd.vehicle_number}</span>}
              <span className="text-[11px] text-muted-foreground">
                {INBOUND_LINK_SOURCE_LABEL[edge.link_source]}
                {edge.confirmed_at ? ` · ${formatDate(edge.confirmed_at)}` : ''}
              </span>
              <span className="ml-auto flex items-center gap-1">
                {onOpenDocument && counterpartId && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpenDocument(counterpartId)}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open {documentLabel(edge)}
                  </Button>
                )}
                {!readOnly && edge.link_source !== 'aade' && (
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    disabled={busy === edge.link_id}
                    onClick={() => void unlink(edge.link_id)}
                    title="These two documents do not belong together. The match will not be suggested again."
                  >
                    <Unlink className="mr-1 h-3.5 w-3.5" /> Unlink
                  </Button>
                )}
              </span>
            </div>
            <div className="table-scroll">
              <table className="w-full text-xs">
                <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Code</th>
                    <th className="px-3 py-1.5 text-left">Description</th>
                    <th className="px-3 py-1.5 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {note.lines.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">The delivery note names no items.</td></tr>
                  )}
                  {note.lines.map((l, i) => {
                    const unit = unitFromMydataCode(l.measurement_unit);
                    return (
                      <tr key={i} className="border-t border-hairline">
                        <td className="px-3 py-1.5 font-mono text-[11px]">{l.item_code ?? '—'}</td>
                        <td className="px-3 py-1.5">{l.item_description ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {l.quantity ?? '—'}{unit ? ` ${unitSuffix(unit)}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {money.billed_gross != null && money.billed_on && (
                  <tfoot className="border-t border-hairline bg-surface-sunken">
                    <tr>
                      <td colSpan={2} className="px-3 py-1.5 text-right text-muted-foreground">
                        {money.line_costs === 'unallocated'
                          ? `Billed as one total on ${money.billed_on} — per-item cost not stated`
                          : `Billed on ${money.billed_on}`}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                        {formatMoney(Number(money.billed_gross), currency)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};
