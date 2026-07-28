/**
 * "Preview" — the received document exactly as AADE holds it.
 *
 * Everything shown here comes from the myDATA payload we store per document: identity
 * (ΤΥΠΟΣ / ΜΑΡΚ / UID / authentication code), both parties, and the analytic line table with
 * the unit, unit price, net, VAT and total per line. It is a read-only mirror — nothing here
 * is derived or inferred, so it is the thing to check when a figure elsewhere looks wrong.
 */
import React from 'react';
import { ExternalLink, QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { formatMoney } from '@/modules/finance/services/financeService';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import type { InboundAddress, InboundDocument } from '@/modules/finance/services/inboundService';
import { unitSuffix, unitFromMydataCode } from '@/lib/units';

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
  const lines = doc.lines ?? [];
  const number = [doc.series, doc.aa].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">AADE document preview</DialogTitle>
          <DialogDescription>
            The received document as the tax authority holds it — read-only.
          </DialogDescription>
        </DialogHeader>

        {/* Identity — two columns, mirroring the myDATA viewer layout */}
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <Row label="Type"><MydataTypeLabel code={doc.doc_type} className="text-xs font-medium" /></Row>
            <Row label="Currency">{doc.currency}</Row>
            <Row label="Also a delivery note">{doc.is_delivery_note ? 'Yes' : 'No'}</Row>
            <Row label="Date">{doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : '—'}</Row>
            <Row label="MARK"><span className="font-mono text-[11px]">{doc.mark}</span></Row>
          </div>
          <div>
            <Row label="Issuer VAT"><span className="font-mono">{doc.issuer_vat ?? '—'}</span></Row>
            <Row label="Issuer country">{doc.issuer_country ?? '—'}</Row>
            <Row label="Issuer branch">{doc.issuer_branch ?? '—'}</Row>
            <Row label="Series · number">{number || '—'}</Row>
            <Row label="UID"><span className="font-mono text-[10px] break-all">{doc.uid ?? '—'}</span></Row>
            {doc.authentication_code && (
              <Row label="Authentication code">
                <span className="font-mono text-[10px] break-all">{doc.authentication_code}</span>
              </Row>
            )}
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Issuer</p>
            <p className="text-sm font-medium">{doc.issuer_name ?? doc.issuer_vat ?? '—'}</p>
            {fmtAddress(doc.issuer_address) && (
              <p className="text-xs text-muted-foreground">{fmtAddress(doc.issuer_address)}</p>
            )}
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Counterpart (you)</p>
            <p className="text-sm font-medium">{doc.counterpart_name ?? doc.counterpart_vat ?? '—'}</p>
            {fmtAddress(doc.counterpart_address) && (
              <p className="text-xs text-muted-foreground">{fmtAddress(doc.counterpart_address)}</p>
            )}
          </div>
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
            <Row label="VAT">{formatMoney(doc.total_vat ?? 0, doc.currency)}</Row>
            {!!doc.total_withheld && <Row label="Withheld">{formatMoney(doc.total_withheld, doc.currency)}</Row>}
            {!!doc.total_fees && <Row label="Fees">{formatMoney(doc.total_fees, doc.currency)}</Row>}
            {!!doc.total_stamp_duty && <Row label="Stamp duty">{formatMoney(doc.total_stamp_duty, doc.currency)}</Row>}
            {!!doc.total_other_taxes && <Row label="Other taxes">{formatMoney(doc.total_other_taxes, doc.currency)}</Row>}
            {!!doc.total_deductions && <Row label="Deductions">{formatMoney(doc.total_deductions, doc.currency)}</Row>}
            <Row label="Total payable">
              <span className="text-sm">{formatMoney(doc.total_gross ?? 0, doc.currency)}</span>
            </Row>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
