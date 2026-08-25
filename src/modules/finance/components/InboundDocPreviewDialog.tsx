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
import { inboundService, type InboundAddress, type InboundDocument, type IssuerProfile } from '@/modules/finance/services/inboundService';
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

const fmtAddress = (a: InboundAddress | null | undefined): string | null => {
  if (!a) return null;
  const line = [a.street, a.number && a.number !== '0' ? a.number : null].filter(Boolean).join(' ');
  const town = [a.postal_code, a.city].filter(Boolean).join(' ');
  return [line, town].filter(Boolean).join(', ') || null;
};

/** One `Label value` pair in the issuer strip. Renders nothing when there's no value, so the
 *  strip shows what we actually know instead of a row of em-dashes. */
const Fact: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) =>
  value ? (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs">{value}</span>
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

  const lines = (full ?? doc).lines ?? [];
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
      ? [[issuer.street, issuer.street_number].filter(Boolean).join(' '),
         [issuer.postal_code, issuer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : null);
  const activity = issuer?.kad_primary_description ?? issuer?.profession ?? null;
  const loading = doc.delivery_addresses?.loading;
  const hasDispatch = !!(doc.dispatch_date || doc.vehicle_number || loading);

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

        {/* Dispatch — a ΤΔΑ's whole point. Shown only when the document carries it. */}
        {hasDispatch && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-border/60 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Truck className="h-3.5 w-3.5" /> Dispatch
            </span>
            <Fact label="Date" value={doc.dispatch_date ? formatDate(doc.dispatch_date) : null} />
            <Fact label="Vehicle" value={doc.vehicle_number ? <span className="font-mono">{doc.vehicle_number}</span> : null} />
            <Fact label="From" value={fmtAddress(loading)} />
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
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Document lines</p>
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
                    AADE sent no line detail for this document.
                  </td></tr>
                )}
                {lines.map((l, i) => {
                  // Unit price is not transmitted; it is net ÷ quantity, which is exactly how
                  // the myDATA viewer derives the ΤΙΜ. ΜΟΝ. column.
                  const unitPrice = l.quantity && Number(l.quantity) !== 0 && l.net_value != null
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
                      <td className="px-3 py-2 text-right">{formatMoney(Number(l.net_value ?? 0), doc.currency)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(Number(l.vat_amount ?? 0), doc.currency)}
                        {l.vat_category != null && (
                          <span className="block text-[10px] text-muted-foreground">{VAT_RATE[l.vat_category] ?? `cat ${l.vat_category}`}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(total, doc.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
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
