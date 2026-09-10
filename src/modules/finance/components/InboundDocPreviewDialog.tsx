/**
 * "Preview" — the received document exactly as AADE holds it.
 *
 * Everything shown here comes from the myDATA payload we store per document: identity
 * (ΤΥΠΟΣ / ΜΑΡΚ / UID / authentication code), both parties, and the analytic line table with
 * the unit, unit price, net, VAT and total per line. It is a read-only mirror — nothing here
 * is derived or inferred, so it is the thing to check when a figure elsewhere looks wrong.
 */
import React from 'react';
import { ExternalLink, QrCode, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { formatMoney } from '@/modules/finance/services/financeService';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import { inboundService, type InboundAddress, type InboundDocLine, type InboundDocument, type InboundDocumentDetail, type IssuerProfile } from '@/modules/finance/services/inboundService';
import { INBOUND_LINE_COST_NOTE, type InboundLineCost } from '@/modules/finance/utils/inboundCorrelation';
import { unitSuffix, unitFromMydataCode } from '@/lib/units';
import { formatDate } from '@/utils/datetime';
import { invoicedTotal, isReverseCharged, selfAccountedVat } from '@/modules/finance/utils/inboundProvenance';

/** AADE VAT-category code → rate. Codes 1-8 per the myDATA reference table. */
const VAT_RATE: Record<number, string> = {
  1: '24%', 2: '13%', 3: '6%', 4: '17%', 5: '9%', 6: '4%', 7: '0%', 8: '—',
};

/** myDATA payment-method codes. */
const PAYMENT_METHOD: Record<number, string> = {
  1: 'Domestic bank account', 2: 'Foreign bank account', 3: 'Cash', 4: 'Cheque',
  5: 'On credit', 6: 'Web banking', 7: 'POS / e-POS', 8: 'IRIS',
};

/** A street number AADE actually sent, or null. `0`, `-` and `—` are the placeholders it fills
 *  the field with when the issuer left it blank; printed verbatim they read as an address that
 *  is missing something ("ΙΑΣΩΝΙΔΟΥ 15 -, 56334 …") rather than one that is simply complete. */
const streetNumber = (n: string | null | undefined): string | null => {
  const v = n?.trim();
  return v && v !== '0' && /\d/.test(v) ? v : null;
};

const fmtAddress = (a: InboundAddress | null | undefined): string | null => {
  if (!a) return null;
  const line = [a.street, streetNumber(a.number)].filter(Boolean).join(' ');
  const town = [a.postal_code, a.city].filter(Boolean).join(' ');
  return [line, town].filter(Boolean).join(', ') || null;
};

/** One `Label value` pair in the issuer strip. Renders nothing when there's no value, so the
 *  strip shows what we actually know instead of a row of em-dashes.
 *
 *  `leading-5` on both halves so every chip is exactly one 20px line tall whatever mix of 10px
 *  label and 12px value it holds — that is what lets a strip line them up as one row. */
const Fact: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) =>
  value ? (
    <span className="inline-flex items-baseline gap-1 leading-5">
      <span className="text-[10px] uppercase leading-5 tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs leading-5">{value}</span>
    </span>
  ) : null;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-border/30 py-1.5 last:border-b-0">
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-right text-xs font-medium">{children}</span>
  </div>
);

export const InboundDocPreviewDialog: React.FC<{
  doc: InboundDocument;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}> = ({ doc, open, onOpenChange }) => {
  /**
   * Hydrate the TOASTed columns on open. The list query no longer selects `lines` / `raw` /
   * `delivery_addresses` — detoasting them for every row cost ~1 s per list paint to render a
   * table that shows none of them. Falls back to the list row, so a failed
   * hydrate degrades to an empty line table rather than a blank dialog.
   */
  const [full, setFull] = React.useState<InboundDocument | null>(null);
  React.useEffect(() => {
    if (!open) { setFull(null); return; }
    let live = true;
    void inboundService.getFull(doc.id)
      .then((d) => { if (live && d) setFull(d); })
      .catch(() => { /* keep the list row; the line table simply renders empty */ });
    return () => { live = false; };
  }, [open, doc.id]);

  /**
   * The MERGED answer: this document's own lines, or the delivery note's when the document names
   * nothing itself and a link somebody stands behind says where the detail lives.
   *
   * This is the whole point of correlating a ΔΑ with the ΤΙΜ that bills it. Without it the invoice
   * preview renders one nameless line under "AADE sent no line detail for this document" while the
   * two items sit on another row of the same table.
   */
  const [detail, setDetail] = React.useState<InboundDocumentDetail | null>(null);
  React.useEffect(() => {
    if (!open) { setDetail(null); return; }
    let live = true;
    void inboundService.documentDetail(doc.id)
      .then((d) => { if (live) setDetail(d); })
      .catch(() => { /* fall back to the document's own lines */ });
    return () => { live = false; };
  }, [open, doc.id]);

  // Annotated: the fallback path is a plain InboundDocLine[], so the union would widen the
  // element type and lose `line_cost` — which is the field the whole money column reads.
  const lines: (InboundDocLine & { line_cost?: InboundLineCost })[] =
    detail ? detail.lines : ((full ?? doc).lines ?? []);
  /** Set when these lines were BORROWED, so the table can say whose they are. */
  const borrowed = detail?.detail.status === 'linked' ? detail.detail : null;
  /**
   * How far the money on these lines is actually known. SQL decides; this only formats it.
   *
   *   stated / derived  — a real figure, printed
   *   unallocated       — several delivery-note lines against one invoice total, no basis to split
   *
   * The per-LINE verdict is what the table reads, because a document can legitimately mix them.
   * The document-level value only picks the note above the table.
   */
  const lineCosts = detail?.money.line_costs;
  const costNote = lineCosts ? INBOUND_LINE_COST_NOTE[lineCosts] : null;
  const number = [doc.series, doc.aa].filter(Boolean).join(' ');

  // The issuer's business identity, which myDATA does not transmit — resolved from their CRM
  // record (populated by the ΑΑΔΕ → ΓΕΜΗ research chain). Loaded only while the dialog is open.
  const [issuer, setIssuer] = React.useState<IssuerProfile | null>(null);
  React.useEffect(() => {
    if (!open || !doc.issuer_vat) { setIssuer(null); return; }
    let alive = true;
    inboundService.issuerProfile(doc.workspace_id, doc.issuer_vat)
      .then((p) => { if (alive) setIssuer(p); })
      .catch(() => { if (alive) setIssuer(null); });
    return () => { alive = false; };
  }, [open, doc.workspace_id, doc.issuer_vat]);

  const issuerAddress = fmtAddress(doc.issuer_address)
    // AADE omits the issuer address on ~2/3 of documents; the registry has it when CRM does.
    ?? (issuer && (issuer.street || issuer.city)
      ? [[issuer.street, streetNumber(issuer.street_number)].filter(Boolean).join(' '),
         [issuer.postal_code, issuer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : null);
  const activity = issuer?.kad_primary_description ?? issuer?.profession ?? null;
  const loadingAddress = fmtAddress(doc.delivery_addresses?.loading);
  // Gated on what the strip can PRINT, not on what the payload carries: a <loadingAddress> block
  // holding nothing but placeholders formats to null, and the strip would otherwise be a bordered
  // box containing the word "Dispatch" and no dispatch.
  const hasDispatch = !!(doc.dispatch_date || doc.vehicle_number || loadingAddress);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">AADE Document Preview</DialogTitle>
          <DialogDescription>
            The received document as the tax authority holds it — read-only.
          </DialogDescription>
        </DialogHeader>

        {/* Who issued it — the first thing to establish, so it leads. AADE sends the ΑΦΜ (and
            sometimes a name/address); everything on the second line is the issuer's registry
            identity, which myDATA never transmits and we hold on their CRM record. */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-base font-medium font-display">{issuer?.name ?? doc.issuer_name ?? doc.issuer_vat ?? 'Unknown issuer'}</p>
            <span className="font-mono text-xs text-muted-foreground">
              ΑΦΜ {doc.issuer_vat ?? '—'}{doc.issuer_country && doc.issuer_country !== 'GR' ? ` · ${doc.issuer_country}` : ''}
            </span>
          </div>
          {issuerAddress && <p className="mt-0.5 text-xs text-muted-foreground">{issuerAddress}</p>}
          {(issuer?.tax_office || issuer?.gemi_number || activity || issuer?.legal_status || issuer?.gemi_legal_form) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2">
              <Fact label="Δ.Ο.Υ." value={issuer?.tax_office} />
              <Fact label="Γ.Ε.ΜΗ." value={issuer?.gemi_number ? <span className="font-mono">{issuer.gemi_number}</span> : null} />
              <Fact label="Form" value={issuer?.legal_status ?? issuer?.gemi_legal_form} />
              <Fact label="Activity" value={activity} />
              <Fact label="ΚΑΔ" value={issuer?.kad_primary ? <span className="font-mono">{issuer.kad_primary}</span> : null} />
            </div>
          )}
          {(issuer?.phone || issuer?.email || issuer?.website) && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <Fact label="Tel" value={issuer?.phone} />
              <Fact label="Email" value={issuer?.email} />
              <Fact label="Web" value={issuer?.website} />
            </div>
          )}
          {!issuer && doc.issuer_vat && (
            // Not a gap in the sync — AADE simply doesn't send this. Say so, and say where it
            // comes from, rather than leaving an operator hunting for a missing field.
            <p className="mt-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
              Δ.Ο.Υ., Γ.Ε.ΜΗ. and contact details aren&apos;t part of the myDATA feed. Add this issuer
              to CRM to pull them from the ΑΑΔΕ and ΓΕΜΗ registries.
            </p>
          )}
        </div>

        {/* Dispatch — a ΤΔΑ's whole point. Shown only when the document carries it.
            The row is items-CENTER, not items-baseline: the truck icon makes the label an
            inline-flex with no baseline-aligned child, so a baseline row synthesizes its baseline
            from that label's bottom EDGE and lifts the whole "Dispatch" chunk a few px above the
            facts sitting beside it. */}
        {hasDispatch && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase leading-5 tracking-wide text-muted-foreground">
              <Truck className="h-3.5 w-3.5 shrink-0" /> Dispatch
            </span>
            <Fact label="Date" value={doc.dispatch_date ? formatDate(doc.dispatch_date) : null} />
            <Fact label="Vehicle" value={doc.vehicle_number ? <span className="font-mono">{doc.vehicle_number}</span> : null} />
            <Fact label="From" value={loadingAddress} />
          </div>
        )}

        {/* Identity — two columns, mirroring the myDATA viewer layout */}
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <Row label="Type"><MydataTypeLabel code={doc.doc_type} className="text-xs font-medium" /></Row>
            <Row label="Currency">{doc.currency}</Row>
            <Row label="Also a delivery note">{doc.is_delivery_note ? 'Yes' : 'No'}</Row>
            <Row label="Date">{doc.issue_date ? formatDate(doc.issue_date) : '—'}</Row>
            <Row label="MARK"><span className="font-mono text-[11px]">{doc.mark}</span></Row>
          </div>
          <div>
            {/* Issuer ΑΦΜ / country moved to the header above; only branch is left, and only when
                it identifies an actual establishment ('0' is the head office, i.e. no branch). */}
            {doc.issuer_branch && doc.issuer_branch !== '0' && (
              <Row label="Issuer branch">{doc.issuer_branch}</Row>
            )}
            <Row label="Series · number">{number || '—'}</Row>
            <Row label="UID"><span className="font-mono text-[10px] break-all">{doc.uid ?? '—'}</span></Row>
            {doc.authentication_code && (
              <Row label="Authentication code">
                <span className="font-mono text-[10px] break-all">{doc.authentication_code}</span>
              </Row>
            )}
          </div>
        </div>

        {/* The receiving side. The issuer half of this pair moved into the header block above —
            keeping both would have printed the same name and address twice. */}
        <div className="rounded-md border border-border/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Billed to (you)</p>
          <p className="text-sm font-medium">{doc.counterpart_name ?? doc.counterpart_vat ?? '—'}</p>
          {fmtAddress(doc.counterpart_address) && (
            <p className="text-xs text-muted-foreground">{fmtAddress(doc.counterpart_address)}</p>
          )}
        </div>

        {/* Analytic lines */}
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Document lines
            {borrowed && (
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
                — from {borrowed.source_label || borrowed.source_mark}, the delivery note this document bills
              </span>
            )}
          </p>
          {costNote && lines.length > 0 && (
            <p className={`mb-1 text-[11px] ${lineCosts === 'unallocated' ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
              {costNote}
            </p>
          )}
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="border-b border-border/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-center">Unit</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    {/* Absence with a stated reason. "No correlation recorded" and "correlated with
                        a document we never received" are different answers, and both are answers. */}
                    {detail?.detail.status === 'none'
                      ? detail.detail.reason
                      : 'AADE sent no line detail for this document.'}
                  </td></tr>
                )}
                {lines.map((l, i) => {
                  // Unit price is not transmitted; it is net ÷ quantity, which is exactly how
                  // the myDATA viewer derives the ΤΙΜ. ΜΟΝ. column.
                  // Per LINE, not per document. `unknown` means the delivery note stated a legal
                  // zero and one invoice total cannot be split, so net / qty would be a fabricated
                  // 0.00 per item rather than a price. Anything else is a real figure.
                  const unknown = l.line_cost === 'unknown';
                  const unitPrice = !unknown && l.quantity && Number(l.quantity) !== 0 && l.net_value != null
                    ? Number(l.net_value) / Number(l.quantity)
                    : null;
                  const unitKey = unitFromMydataCode(l.measurement_unit);
                  const total = Number(l.net_value ?? 0) + Number(l.vat_amount ?? 0);
                  return (
                    <tr key={i} className="border-b border-border/30 last:border-b-0">
                      <td className="px-3 py-2 text-muted-foreground">{l.line_number ?? i + 1}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.item_code ?? '—'}</td>
                      <td className="px-3 py-2">
                        {l.item_description ?? <span className="text-muted-foreground">no description</span>}
                        {l.comments && <span className="block text-[10px] text-muted-foreground">{l.comments}</span>}
                      </td>
                      <td className="px-3 py-2 text-center">{unitKey ? unitSuffix(unitKey) : '—'}</td>
                      <td className="px-3 py-2 text-right">{l.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{unitPrice != null ? formatMoney(unitPrice, doc.currency) : '—'}</td>
                      {/* An unknown AMOUNT is a dash. The VAT RATE beside it is still printed:
                          it belongs to the invoice, not to the delivery note, and is known in
                          every case here — the borrowed line's own `vatCategory 8` ("records
                          without VAT") is true of a delivery note and false of the goods. */}
                      <td className="px-3 py-2 text-right">{unknown ? '—' : formatMoney(Number(l.net_value ?? 0), doc.currency)}</td>
                      <td className="px-3 py-2 text-right">
                        {unknown ? '—' : formatMoney(Number(l.vat_amount ?? 0), doc.currency)}
                        {l.vat_category != null && (
                          <span className="block text-[10px] text-muted-foreground">{VAT_RATE[l.vat_category] ?? `cat ${l.vat_category}`}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{unknown ? '—' : formatMoney(total, doc.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {/* The dashes above are only honest if the real money is right here. Without this
                  footer the answer to "so what did it cost?" is three columns of nothing, and the
                  operator has to go and find the other document to learn a number we already hold. */}
              {detail && lines.length > 0 && detail.money.billed_net != null && lineCosts !== 'stated' && (
                <tfoot className="border-t border-border/60 bg-surface-sunken text-xs">
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-muted-foreground">
                      {lineCosts === 'unallocated'
                        ? `Billed as one total on ${detail.money.billed_on}`
                        : `Total on ${detail.money.billed_on}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(detail.money.billed_net), doc.currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(detail.money.billed_vat ?? 0), doc.currency)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(Number(detail.money.billed_gross ?? 0), doc.currency)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Totals + extras */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-xs">
            {doc.payment_methods && doc.payment_methods.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment</p>
                {doc.payment_methods.map((p, i) => (
                  <p key={i}>
                    {p.type != null ? (PAYMENT_METHOD[p.type] ?? `Method ${p.type}`) : 'Unspecified'}
                    {p.amount != null && ` — ${formatMoney(p.amount, doc.currency)}`}
                  </p>
                ))}
              </div>
            )}
            {doc.delivery_addresses?.delivery && (
              <div className="pt-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Delivered to</p>
                <p>{fmtAddress(doc.delivery_addresses.delivery)}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              {doc.download_url && (
                <a href={doc.download_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Issuer&apos;s document
                </a>
              )}
              {doc.qr_code_url && (
                <a href={doc.qr_code_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline">
                  <QrCode className="h-3.5 w-3.5" /> Verify on AADE
                </a>
              )}
            </div>
          </div>

          <div className="text-xs">
            {/* A delivery note's own totals are zero BY LAW, and they stay zero here — this column
                is summed, and the amount already sits on the invoice row. What was missing was a
                NAME for the money, not the money. */}
            {detail && detail.money.billed_on && Number(doc.total_gross ?? 0) === 0 && detail.money.billed_gross != null && (
              <Row label="Billed on">
                <span title="A plain ΔΑ prices nothing — the invoice bills the goods separately. This is that invoice.">
                  {detail.money.billed_on} — {formatMoney(Number(detail.money.billed_gross), doc.currency)}
                </span>
              </Row>
            )}
            <Row label="Net value">{formatMoney(doc.total_net ?? 0, doc.currency)}</Row>
            {isReverseCharged(doc.doc_type)
              ? <Row label="VAT">
                  <span title="Intra-EU acquisition: zero-rated at source, so the supplier charged nothing. We declare this VAT and reclaim it in the same return.">
                    — <span className="text-muted-foreground">(reverse charge, {formatMoney(selfAccountedVat(doc) ?? 0, doc.currency)} self-assessed)</span>
                  </span>
                </Row>
              : <Row label="VAT">{formatMoney(doc.total_vat ?? 0, doc.currency)}</Row>}
            {!!doc.total_withheld && <Row label="Withheld">{formatMoney(doc.total_withheld, doc.currency)}</Row>}
            {!!doc.total_fees && <Row label="Fees">{formatMoney(doc.total_fees, doc.currency)}</Row>}
            {!!doc.total_stamp_duty && <Row label="Stamp duty">{formatMoney(doc.total_stamp_duty, doc.currency)}</Row>}
            {!!doc.total_other_taxes && <Row label="Other taxes">{formatMoney(doc.total_other_taxes, doc.currency)}</Row>}
            {!!doc.total_deductions && <Row label="Deductions">{formatMoney(doc.total_deductions, doc.currency)}</Row>}
            {/* PAYABLE, and it says so — which is exactly why it must not be AADE's
                totalGrossValue on a 13.x/14.x. That figure adds VAT we self-assess and reclaim;
                nobody will ever be paid it. */}
            <Row label="Total payable">
              <span className="text-sm">{formatMoney(invoicedTotal(doc), doc.currency)}</span>
            </Row>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
