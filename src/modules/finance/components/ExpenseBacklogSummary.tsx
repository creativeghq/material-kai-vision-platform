import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import { bookingStateCopy } from '@/modules/finance/pnlStatus';
import { inboundService, type InboundBacklogRow } from '@/modules/finance/services/inboundService';

/**
 * Read-only: booking belongs with the filing, on By Supplier, because a document books into the
 * category its supplier is filed to. This is the header that stops the list below reading as the
 * whole story - delivery notes and credit notes in it are not work outstanding.
 */
export const ExpenseBacklogSummary: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [rows, setRows] = useState<InboundBacklogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setRows(await inboundService.bookingBacklog(workspaceId));
      setError(null);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  if (rows === null) return null;

  const bookable = rows.find((r) => r.booking_state === 'bookable');
  const booked = rows.find((r) => r.booking_state === 'booked');
  const others = rows.filter((r) => r.booking_state !== 'bookable' && r.booking_state !== 'booked');

  // A read that FAILED must not render as an inbox with nothing in it.
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-3 text-xs text-amber-800 dark:text-amber-300">
          <span>Could not read the booking breakdown — <span className="opacity-80">{error}</span>.</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Inbox className="h-4 w-4 text-muted-foreground" /> What is in this inbox
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Until a document is booked it is in no report, no P&amp;L and no VAT return.
            {booked && booked.docs > 0 && <> {booked.docs.toLocaleString()} already in Expenses.</>}
          </p>
        </div>
        {bookable && bookable.docs > 0 && (
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">{formatMoney(bookable.will_book_total, 'EUR')}</div>
              <div className="text-[11px] text-muted-foreground">{bookable.docs.toLocaleString()} ready to book</div>
            </div>
            <Link to={financeTabUrl(FINANCE_TAB.expenseSuppliers)}>
              <Button size="sm" variant="outline">Book by supplier</Button>
            </Link>
          </div>
        )}
      </CardHeader>

      {others.length > 0 && (
        <CardContent className="px-5 py-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Not bookable, and why</div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {others.map((o) => {
              const copy = bookingStateCopy(o.booking_state);
              return (
                <li key={o.booking_state} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{copy.label}</div>
                    <div className="text-[11px] leading-relaxed text-muted-foreground">{copy.detail}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs tabular-nums">{o.docs.toLocaleString()}</div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">{formatMoney(o.gross, 'EUR')}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
};
