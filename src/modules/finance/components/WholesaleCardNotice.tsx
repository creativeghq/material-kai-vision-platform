/**
 * Wholesale settled on a payment terminal needs its own document (#448).
 *
 * ΠΟΛ.1220 code 355 «ΠΡΟΕΙΣΠΡΑΞΗ ΜΕΣΩ EFTPOS» → myDATA 8.4 Απόδειξη Είσπραξης POS, correlated to the
 * invoice afterwards. The Α.1098 workaround — a retail receipt, then a credit note, then the
 * invoice — is a different mechanic, and running both files two documents for one sale.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CardTerminalPaymentDialog } from '@/modules/finance/components/CardTerminalPaymentDialog';
import {
  posInterconnectionService, wholesaleReceiptMissing,
  EFTPOS_PREPAYMENT_CODE, EFTPOS_RECEIPT_TYPE,
  type WholesaleCardPosition,
} from '@/modules/finance/services/posInterconnectionService';

export const WholesaleCardNotice: React.FC<{ invoiceId: string | null }> = ({ invoiceId }) => {
  const [position, setPosition] = useState<WholesaleCardPosition | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const { activeWorkspaceId } = useWorkspace();
  const [issue, setIssue] = useState<{ amount: number; currency: string; label: string } | null>(null);
  const openIssue = async () => {
    if (!invoiceId) return;
    const { data } = await supabase.from('invoices')
      .select('amount_due, total, currency, legal_number, internal_number').eq('id', invoiceId).maybeSingle();
    if (data) setIssue({ amount: Number(data.amount_due ?? data.total ?? 0), currency: data.currency ?? 'EUR', label: data.legal_number ?? data.internal_number ?? 'Invoice' });
  };

  useEffect(() => {
    let cancelled = false;
    if (!invoiceId) { setPosition(null); return; }
    posInterconnectionService.wholesaleCard(invoiceId)
      .then((p) => { if (!cancelled) { setPosition(p); setFailed(false); } })
      .catch(() => { if (!cancelled) { setPosition(null); setFailed(true); } });
    return () => { cancelled = true; };
  }, [invoiceId, reload]);

  if (failed) {
    return (
      <p className="flex items-start gap-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Whether this sale needs an {EFTPOS_RECEIPT_TYPE} could not be checked. That is not a
        statement that it does not.
      </p>
    );
  }

  if (!position || position.status === 'not_wholesale' || position.status === 'not_card'
      || position.status === 'no_document') {
    return null;
  }

  return (
    <p
      className={`flex items-start gap-2 text-xs ${
        wholesaleReceiptMissing(position)
          ? 'text-amber-800 dark:text-amber-300'
          : 'text-muted-foreground'
      }`}
    >
      {wholesaleReceiptMissing(position)
        ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        ΠΟΛ.1220 {EFTPOS_PREPAYMENT_CODE} → myDATA {EFTPOS_RECEIPT_TYPE}. {position.reason}
        {wholesaleReceiptMissing(position) && activeWorkspaceId && (
          <Button size="sm" variant="outline" className="ml-2 h-6 px-2 text-xs" onClick={() => void openIssue()}>
            Issue the {EFTPOS_RECEIPT_TYPE}
          </Button>
        )}
      </span>
      {issue && activeWorkspaceId && invoiceId && (
        <CardTerminalPaymentDialog
          open={!!issue}
          onOpenChange={(o) => { if (!o) setIssue(null); }}
          workspaceId={activeWorkspaceId}
          target={{ kind: 'eftpos_receipt', invoiceIds: [invoiceId] }}
          amount={issue.amount}
          currency={issue.currency}
          label={issue.label}
          onDone={() => setReload((n) => n + 1)}
        />
      )}
    </p>
  );
};
