/** The Detail column of the Expenses inbox, which answers for BOTH halves of one purchase. */
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { inboundService, type InboundDocument, type InboundLinkSummary } from '@/modules/finance/services/inboundService';
import { needsLineDetail } from '@/modules/finance/utils/inboundProvenance';
import { correlationCellLabel } from '@/modules/finance/utils/inboundCorrelation';

export const InboundDetailCell: React.FC<{
  doc: InboundDocument;
  /** The best correlation for this document, from `inboundService.linkSummary`. */
  link: InboundLinkSummary | undefined;
  readOnly: boolean;
  onChanged: () => void;
}> = ({ doc, link, readOnly, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const cell = correlationCellLabel(link);

  // No correlation to report: the column falls back to its own two answers.
  if (!cell) {
    return needsLineDetail(doc)
      ? <span className="text-[10px] text-amber-800 dark:text-amber-300" title="Value-only lines — nothing here can be received to the warehouse or turned into a product until someone says what was on it.">Needs detail</span>
      : <span className="text-[10px] text-muted-foreground/50">—</span>;
  }

  /**
   * The warning STAYS UP unless this correlation is the thing that answers it.
   *
   * A credit note correlating this invoice, or a cited MARK we never received, tells the operator
   * something real and tells them NOTHING about the missing lines. Rendering it in the detail
   * column in place of "Needs detail" silently clears the one flag saying the document still needs
   * a human — 12 live documents were in that state.
   */
  const stillNeedsDetail = needsLineDetail(doc) && !cell.suppliesDetail;
  const warning = stillNeedsDetail ? (
    <span
      className="text-[10px] text-amber-800 dark:text-amber-300"
      title="Value-only lines — nothing here can be received to the warehouse or turned into a product until someone says what was on it."
    >
      Needs detail
    </span>
  ) : null;
  const sep = warning ? <span className="text-[10px] text-muted-foreground/50"> · </span> : null;

  // A settled fact: AADE's own declaration, or a link somebody already accepted.
  if (!cell.actionable) {
    return (
      <span className="inline-flex items-center">
        {warning}{sep}
        <span
          className="text-[10px] text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/40"
          title={cell.title}
        >
          {cell.text}
        </span>
      </span>
    );
  }

  const rule = async (accept: boolean) => {
    if (!link) return;
    setBusy(true);
    try {
      if (accept) await inboundService.confirmLink(link.link_id);
      else await inboundService.rejectLink(link.link_id);
      onChanged();
    } catch (e: any) {
      toast({
        title: accept ? 'Could not link the documents' : 'Could not dismiss the match',
        description: e?.message,
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1">
      {warning}{sep}
      <span
        className="text-[10px] text-amber-800 dark:text-amber-300 cursor-help border-b border-dotted border-amber-800/40 dark:border-amber-300/40"
        title={cell.title}
      >
        {cell.text}
      </span>
      {!readOnly && (
        <>
          <button
            type="button" disabled={busy} onClick={() => void rule(true)}
            className="rounded-sm px-1 text-[10px] text-muted-foreground hover:bg-surface-sunken hover:text-foreground disabled:opacity-50"
            title={`Yes — ${cell.text.replace(/\?$/, '')} belongs with this document`}
          >✓</button>
          <button
            type="button" disabled={busy} onClick={() => void rule(false)}
            className="rounded-sm px-1 text-[10px] text-muted-foreground hover:bg-surface-sunken hover:text-foreground disabled:opacity-50"
            title="No — dismiss this match. It will not be suggested again."
          >✗</button>
        </>
      )}
    </span>
  );
};
