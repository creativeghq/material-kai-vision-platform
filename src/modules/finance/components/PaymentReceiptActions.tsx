import React, { useState } from 'react';
import { Mail, Link2, Download } from 'lucide-react';
import { financeService } from '@/modules/finance/services/financeService';
import { useToast } from '@/hooks/use-toast';

/**
 * The three payment-receipt (απόδειξη είσπραξης) actions for a recorded money-IN payment:
 * email it to the customer, copy a shareable link to the receipt PDF, and download the PDF.
 * The receipt is a proof-of-payment acknowledgment — NOT a fiscal document and NEVER transmitted
 * to myDATA/AADE. Renders nothing for money-out. Drop it into any payment row so every list stays
 * consistent (order detail, CRM party ledger, global Payments tab, invoice-attached payments).
 */
export const PaymentReceiptActions: React.FC<{
  paymentId: string;
  direction: 'in' | 'out';
  className?: string;
  iconClassName?: string;
}> = ({ paymentId, direction, className, iconClassName = 'h-3.5 w-3.5' }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (direction !== 'in') return null;

  const email = async () => {
    setBusy(true);
    try {
      const { emailed, email: addr } = await financeService.emailPaymentReceipt(paymentId);
      toast(emailed
        ? { title: 'Receipt emailed', description: addr ?? undefined }
        : { title: 'No email on file', description: 'Add an email on this customer’s contact to send receipts.', variant: 'destructive' });
    } catch (err: any) {
      toast({ title: 'Failed to email receipt', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    setBusy(true);
    try {
      const { pdf_url } = await financeService.generatePaymentReceiptPdf(paymentId);
      if (!pdf_url) { toast({ title: 'Receipt not available yet', variant: 'destructive' }); return; }
      await navigator.clipboard.writeText(pdf_url);
      toast({ title: 'Receipt link copied', description: 'A shareable link to the receipt PDF is on your clipboard.' });
    } catch (err: any) {
      toast({ title: 'Failed to copy link', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    try {
      const { pdf_url, receipt_number } = await financeService.generatePaymentReceiptPdf(paymentId);
      if (!pdf_url) { toast({ title: 'Receipt not available yet', variant: 'destructive' }); return; }
      const blob = await (await fetch(pdf_url)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${receipt_number ?? `receipt-${paymentId.slice(0, 8)}`}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Failed to download receipt', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" title="Email the receipt to the customer" className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={busy} onClick={email}><Mail className={iconClassName} /></button>
      <button type="button" title="Copy a shareable link to the receipt PDF" className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={busy} onClick={copyLink}><Link2 className={iconClassName} /></button>
      <button type="button" title="Download the receipt PDF (not sent to myDATA)" className="text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={busy} onClick={download}><Download className={iconClassName} /></button>
    </span>
  );
};
