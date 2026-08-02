import React, { useState } from 'react';
import { Mail, Link2, Download } from 'lucide-react';
import { financeService } from '@/modules/finance/services/financeService';
import { useToast } from '@/hooks/use-toast';

/**
 * The three payment-voucher actions for a recorded payment — for BOTH directions:
 *  - money IN  → a "receipt" (απόδειξη είσπραξης) for the CUSTOMER: "Received from".
 *  - money OUT → a payment voucher (απόδειξη πληρωμής) for the SUPPLIER: "Paid to".
 * Email it to the counterparty, copy a shareable link, and download the PDF. It's a
 * proof-of-payment acknowledgment — NOT a fiscal document and NEVER transmitted to myDATA/AADE.
 * The PDF renderer titles it "Received from" vs "Paid to" off the payment direction. Drop it into
 * any payment row so every list stays consistent (order detail, CRM ledger, global Payments tab).
 */
export const PaymentReceiptActions: React.FC<{
  paymentId: string;
  direction: 'in' | 'out';
  className?: string;
  iconClassName?: string;
}> = ({ paymentId, direction, className, iconClassName = 'h-3.5 w-3.5' }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const out = direction === 'out';
  const noun = out ? 'voucher' : 'receipt';
  const party = out ? 'supplier' : 'customer';

  const email = async () => {
    setBusy(true);
    try {
      const { emailed, email: addr } = await financeService.emailPaymentReceipt(paymentId);
      toast(emailed
        ? { title: `${out ? 'Voucher' : 'Receipt'} emailed`, description: addr ?? undefined }
        : { title: 'No email on file', description: `Add an email on this ${party}’s contact to send the ${noun}.`, variant: 'destructive' });
    } catch (err: any) {
      toast({ title: `Failed to email ${noun}`, description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // The clipboard write MUST be issued synchronously inside the click handler. Awaiting the
  // PDF generation first spends the transient user activation, and Safari/Firefox then reject
  // the write — which is why this used to "not copy" and surface a generic failure toast.
  // ClipboardItem accepts a pending Promise<Blob>, so we hand it the in-flight request instead.
  const copyLink = () => {
    setBusy(true);
    const url = financeService.generatePaymentReceiptPdf(paymentId)
      .then(({ pdf_url }) => {
        if (!pdf_url) throw new Error('Receipt not available yet');
        return pdf_url;
      });
    const write = typeof ClipboardItem !== 'undefined' && 'write' in navigator.clipboard
      ? navigator.clipboard.write([
          new ClipboardItem({ 'text/plain': url.then((u) => new Blob([u], { type: 'text/plain' })) }),
        ])
      // Older browsers with no ClipboardItem: fall back to the (activation-spending) text write.
      : url.then((u) => navigator.clipboard.writeText(u));

    write
      .then(() => toast({ title: `${out ? 'Voucher' : 'Receipt'} link copied`, description: `A shareable link to the ${noun} PDF is on your clipboard.` }))
      .catch((err: any) => toast({ title: 'Failed to copy link', description: err?.message, variant: 'destructive' }))
      .finally(() => setBusy(false));
  };

  const download = async () => {
    setBusy(true);
    try {
      const { pdf_url, receipt_number } = await financeService.generatePaymentReceiptPdf(paymentId);
      if (!pdf_url) { toast({ title: `${out ? 'Voucher' : 'Receipt'} not available yet`, variant: 'destructive' }); return; }
      const blob = await (await fetch(pdf_url)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${receipt_number ?? `${noun}-${paymentId.slice(0, 8)}`}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: `Failed to download ${noun}`, description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`} role="presentation" onClick={(e) => e.stopPropagation()}>
      <button type="button" title={`Email the ${noun} to the ${party}`} className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={busy} onClick={email}><Mail className={iconClassName} /></button>
      <button type="button" title={`Copy a shareable link to the ${noun} PDF`} className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={busy} onClick={copyLink}><Link2 className={iconClassName} /></button>
      <button type="button" title={`Download the ${noun} PDF (not sent to myDATA)`} className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={busy} onClick={download}><Download className={iconClassName} /></button>
    </span>
  );
};
