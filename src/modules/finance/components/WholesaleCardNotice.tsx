/**
 * Wholesale settled on a payment terminal needs its own document (#448).
 *
 * ΠΟΛ.1220 code 355 «ΠΡΟΕΙΣΠΡΑΞΗ ΜΕΣΩ EFTPOS» → myDATA 8.4 Απόδειξη Είσπραξης POS, correlated to the
 * invoice afterwards. The Α.1098 workaround — a retail receipt, then a credit note, then the
 * invoice — is a different mechanic, and running both files two documents for one sale.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  posInterconnectionService, wholesaleReceiptMissing,
  EFTPOS_PREPAYMENT_CODE, EFTPOS_RECEIPT_TYPE,
  type WholesaleCardPosition,
} from '@/modules/finance/services/posInterconnectionService';

export const WholesaleCardNotice: React.FC<{ invoiceId: string | null }> = ({ invoiceId }) => {
  const [position, setPosition] = useState<WholesaleCardPosition | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!invoiceId) { setPosition(null); return; }
    posInterconnectionService.wholesaleCard(invoiceId)
      .then((p) => { if (!cancelled) { setPosition(p); setFailed(false); } })
      .catch(() => { if (!cancelled) { setPosition(null); setFailed(true); } });
    return () => { cancelled = true; };
  }, [invoiceId]);

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
      </span>
    </p>
  );
};
