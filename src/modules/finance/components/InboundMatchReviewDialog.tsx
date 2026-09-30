/** Review a suggested ΔΑ ↔ invoice match side by side before anyone accepts it. */
import React from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import {
  inboundService, type InboundDetailEdge, type InboundDocumentDetail, type InboundLinkSummary,
} from '@/modules/finance/services/inboundService';
import { documentLabel } from '@/modules/finance/utils/inboundCorrelation';
import { unitSuffix, unitFromMydataCode } from '@/lib/units';
import { formatDate } from '@/utils/datetime';

const isLinked = (e: InboundDetailEdge) =>
  !e.rejected_at && (e.link_source === 'aade' || e.link_source === 'user' || !!e.confirmed_at);

const isDeliveryNote = (docType: string | null | undefined) => String(docType ?? '').split('.')[0] === '9';

const dayGap = (a: string | null | undefined, b: string | null | undefined): number | null => {
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
};

type Verdict = 'good' | 'weak' | 'bad';
const VERDICT_TONE: Record<Verdict, string> = {
  good: 'text-emerald-800 dark:text-emerald-300',
  weak: 'text-amber-800 dark:text-amber-300',
  bad: 'text-red-700 dark:text-red-300',
};

const CheckItem: React.FC<{ verdict: Verdict; children: React.ReactNode }> = ({ verdict, children }) => (
  <li className={`flex items-start gap-1.5 text-xs ${VERDICT_TONE[verdict]}`}>
    {verdict === 'good' ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      : verdict === 'bad' ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
    <span>{children}</span>
  </li>
);

const DocColumn: React.FC<{ title: string; d: InboundDocumentDetail }> = ({ title, d }) => {
  const doc = d.document;
  const money = d.money;
  return (
    <div className="rounded-md border border-hairline p-3">
      <p className="text-[11px] text-muted-foreground">{title}</p>
      <p className="font-medium">{doc.label || doc.mark}</p>
      <MydataTypeLabel code={doc.doc_type} className="text-[11px] text-muted-foreground" />
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Issued</dt><dd>{doc.issue_date ? formatDate(doc.issue_date) : '—'}</dd>
        <dt className="text-muted-foreground">Dispatched</dt><dd>{doc.dispatch_date ? formatDate(doc.dispatch_date) : '—'}</dd>
        <dt className="text-muted-foreground">Vehicle</dt><dd className="font-mono">{doc.vehicle_number ?? '—'}</dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd className="tabular-nums">
          {isDeliveryNote(doc.doc_type) ? 'Prices nothing (ΔΑ)' : formatMoney(Number(money.total_gross ?? 0), doc.currency ?? 'EUR')}
        </dd>
        <dt className="text-muted-foreground">Own lines</dt>
        <dd>{d.detail.status === 'own' ? d.lines.length : 'none — value only'}</dd>
      </dl>
    </div>
  );
};

export const InboundMatchReviewDialog: React.FC<{
  docId: string;
  link: InboundLinkSummary;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly: boolean;
  onChanged: () => void;
}> = ({ docId, link, open, onOpenChange, readOnly, onChanged }) => {
  const { toast } = useToast();
  const [self, setSelf] = React.useState<InboundDocumentDetail | null>(null);
  const [other, setOther] = React.useState<InboundDocumentDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !link.other_doc_id) return;
    let live = true;
    setSelf(null); setOther(null); setError(null);
    Promise.all([inboundService.documentDetail(docId), inboundService.documentDetail(link.other_doc_id)])
      .then(([a, b]) => { if (live) { setSelf(a); setOther(b); } })
      .catch((e: any) => { if (live) setError(e?.message ?? 'Could not load the two documents.'); });
    return () => { live = false; };
  }, [open, docId, link.other_doc_id]);

  const otherName = documentLabel(link);
  const selfIsNote = self ? isDeliveryNote(self.document.doc_type) : false;
  const note = selfIsNote ? self : other;
  const invoice = selfIsNote ? other : self;

  // What each side is ALREADY tied to — the fact a 45-day window guess must not override.
  const noteTakenBy = note?.correlations.filter(
    (e) => isLinked(e) && e.other_doc_id !== invoice?.document.id && !isDeliveryNote(e.other_doc_type),
  ) ?? [];
  const rivals = (note?.suggestions ?? []).filter((e) => e.other_doc_id !== invoice?.document.id);
  const otherCandidates = (invoice?.suggestions ?? []).filter((e) => e.other_doc_id !== note?.document.id);

  const dispatchSame = !!note?.document.dispatch_date
    && note.document.dispatch_date === invoice?.document.dispatch_date;
  const gap = dayGap(note?.document.issue_date, invoice?.document.issue_date);
  const confidence = link.confidence != null ? Math.round(Number(link.confidence) * 100) : null;

  const rule = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) await inboundService.confirmLink(link.link_id);
      else await inboundService.rejectLink(link.link_id);
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: accept ? 'Could not link the documents' : 'Could not dismiss the match',
        description: e?.message,
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Does {otherName} belong with this document?</DialogTitle>
          <DialogDescription>
            Suggested by us, not by the supplier{confidence != null ? ` — ${confidence}% confidence` : ''}. {link.reason}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}
        {!error && (!self || !other) && (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading both documents…
          </div>
        )}

        {self && other && note && invoice && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DocColumn title="This document" d={self} />
              <DocColumn title="Suggested match" d={other} />
            </div>

            <ul className="space-y-1">
              {noteTakenBy.length > 0
                ? noteTakenBy.map((e) => (
                    <CheckItem key={e.link_id} verdict="bad">
                      {note.document.label} is already the detail for {documentLabel(e)}
                      {e.other_total_gross != null ? ` (${formatMoney(Number(e.other_total_gross), 'EUR')})` : ''}
                      {e.confirmed_at ? `, confirmed ${formatDate(e.confirmed_at)}` : ', stated by the issuer'}.
                      A delivery note is normally invoiced once — linking it here too would count the same goods on two bills.
                    </CheckItem>
                  ))
                : <CheckItem verdict="good">{note.document.label} is not linked to any other invoice.</CheckItem>}
              {dispatchSame
                ? <CheckItem verdict="good">Same dispatch date ({formatDate(note.document.dispatch_date!)}).</CheckItem>
                : <CheckItem verdict="weak">
                    Dispatch dates differ ({note.document.dispatch_date ? formatDate(note.document.dispatch_date) : '—'} vs{' '}
                    {invoice.document.dispatch_date ? formatDate(invoice.document.dispatch_date) : '—'}).
                  </CheckItem>}
              {gap != null && (
                <CheckItem verdict={gap === 0 ? 'good' : gap <= 7 ? 'weak' : 'bad'}>
                  Invoice issued {gap === 0 ? 'the same day as' : `${gap} day(s) after`} the delivery note.
                </CheckItem>
              )}
              {rivals.length > 0 && (
                <CheckItem verdict="weak">
                  {note.document.label} is also suggested for {rivals.map((r) => documentLabel(r)).join(', ')}.
                </CheckItem>
              )}
              {otherCandidates.length > 0 && (
                <CheckItem verdict="weak">
                  Other candidates for {invoice.document.label}: {otherCandidates.map((r) => documentLabel(r)).join(', ')}.
                </CheckItem>
              )}
            </ul>

            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">
                Items on {note.document.label} — what {invoice.document.label} would be billing
                {invoice.money.total_gross != null && ` for ${formatMoney(Number(invoice.money.total_gross), invoice.document.currency ?? 'EUR')}`}
              </p>
              <div className="table-scroll rounded-md border border-hairline">
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
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No items on the delivery note.</td></tr>
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
                </table>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          {!readOnly && (
            <>
              <Button variant="secondary" onClick={() => void rule(false)} disabled={busy || !self}>
                Not a match
              </Button>
              <Button onClick={() => void rule(true)} disabled={busy || !self || !other}>
                {noteTakenBy.length > 0 ? 'Link anyway' : 'Link them'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
