import React, { useEffect, useState } from 'react';
import { ExternalLink, Landmark, Loader2, Paperclip } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { financeService, type InvoicePaymentProof } from '@/modules/finance/services/financeService';
import { formatDate } from '@/utils/datetime';

const STATUS: Record<InvoicePaymentProof['status'], { label: string; variant: 'warning' | 'success' | 'error' }> = {
  submitted: { label: 'To review', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
};

/**
 * Bank-transfer receipts the customer uploaded on the pay page. A receipt is evidence, not money:
 * it becomes Accepted only by recording the payment through the ordinary Record Payment form.
 */
export const PaymentProofsCard: React.FC<{
  invoiceId: string;
  canManage: boolean;
  outstanding: number;
  /** Bumped by the parent after a payment saves, so a pending accept is applied and the list reloads. */
  reloadKey: number;
  onRecordPayment: (proofId: string) => void;
}> = ({ invoiceId, canManage, outstanding, reloadKey, onRecordPayment }) => {
  const { toast } = useToast();
  const [proofs, setProofs] = useState<InvoicePaymentProof[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    financeService.listInvoicePaymentProofs(invoiceId)
      .then((rows) => { if (live) setProofs(rows); })
      .catch((err: Error) => toast({ title: 'Could not load payment receipts', description: err.message, variant: 'destructive' }));
    return () => { live = false; };
  }, [invoiceId, reloadKey, toast]);

  if (proofs.length === 0) return null;

  const open = async (p: InvoicePaymentProof) => {
    setBusyId(p.id);
    try { window.open(await financeService.paymentProofUrl(p), '_blank', 'noopener'); }
    catch (err) { toast({ title: 'Could not open the receipt', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const setStatus = async (p: InvoicePaymentProof, status: InvoicePaymentProof['status']) => {
    setBusyId(p.id);
    try {
      await financeService.setPaymentProofStatus(p.id, status);
      setProofs((xs) => xs.map((x) => (x.id === p.id ? { ...x, status } : x)));
    } catch (err) {
      toast({ title: 'Could not update the receipt', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" /> Bank transfer receipts
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-hairline">
          {proofs.map((p) => {
            const s = STATUS[p.status];
            return (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{p.file_name || 'Receipt'}</span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {formatDate(p.created_at, { withTime: true })}
                    {p.size_bytes != null ? ` · ${(p.size_bytes / 1024 / 1024).toFixed(2)} MB` : ''}
                  </p>
                  {p.note && <p className="whitespace-pre-wrap text-xs">{p.note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void open(p)} disabled={busyId === p.id}>
                    {busyId === p.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
                    View
                  </Button>
                  {canManage && p.status === 'submitted' && (
                    <>
                      {outstanding > 0.005 && (
                        <Button variant="secondary" size="sm" onClick={() => onRecordPayment(p.id)} disabled={busyId === p.id}>
                          Record payment
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void setStatus(p, 'rejected')} disabled={busyId === p.id}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};
