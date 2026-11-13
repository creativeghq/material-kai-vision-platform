import React, { useEffect, useState } from 'react';

import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { formatMoney } from '@/utils/decimal';
import { quotesService } from '../services/QuotesService';
import { costStatusNote, type QuoteEconomics } from '../utils/quoteEconomics';

/** One quote's revenue, cost and profit as derived by `get_quote_economics`. Renders nothing for a viewer with no cost access. */
export const QuoteEconomicsTiles: React.FC<{ quoteId: string; refreshKey?: unknown }> = ({ quoteId, refreshKey }) => {
  const [e, setE] = useState<QuoteEconomics | null>(null);

  useEffect(() => {
    let cancelled = false;
    void quotesService.getQuoteEconomics([quoteId]).then((m) => { if (!cancelled) setE(m.get(quoteId) ?? null); });
    return () => { cancelled = true; };
  }, [quoteId, refreshKey]);

  if (!e) return null;
  const note = costStatusNote(e);
  const noteEl = note ? <p className="text-xs text-amber-800 dark:text-amber-300">{note}</p> : undefined;
  const basis = e.cost_basis === 'snapshot' ? 'Buy prices frozen at acceptance' : e.cost_basis === 'live' ? 'Current buy prices' : e.cost_basis === 'mixed' ? 'Frozen and current buy prices' : undefined;

  return (
    <HubStatGrid>
      <HubStatTile label="Revenue (Net)" value={formatMoney(e.revenue_net, e.currency)} help="After the cash discount and accepted extras, before VAT." />
      <HubStatTile
        label="Cost"
        value={formatMoney(e.cost, e.currency)}
        category={basis}
        help="Quantity × buy price for every line that has one."
        chart={e.uncosted_revenue > 0 && e.cost != null ? <p className="text-xs text-muted-foreground">{formatMoney(e.uncosted_revenue, e.currency)} of revenue has no buy price</p> : undefined}
      />
      <HubStatTile
        label="Gross Profit"
        value={<span className={e.gross_profit != null && e.gross_profit < 0 ? 'text-destructive' : undefined}>{formatMoney(e.gross_profit, e.currency)}</span>}
        help="Revenue minus cost, over the lines that have a buy price. Lines without one are left out, never counted at zero cost."
        chart={noteEl}
      />
      <HubStatTile
        label="Margin"
        value={e.margin_pct == null ? '—' : `${e.margin_pct}%`}
        help="Gross profit ÷ revenue of the costed lines."
      />
    </HubStatGrid>
  );
};
