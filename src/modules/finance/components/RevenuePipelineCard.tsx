import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { formatMoney } from '@/utils/decimal';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import type { RevenuePipeline } from '@/modules/finance/services/financeService';

const MIN_DECIDED = 5;

const Note: React.FC<{ children: React.ReactNode; tone?: 'muted' | 'warning' }> = ({ children, tone = 'muted' }) => (
  <p className={tone === 'warning' ? 'text-xs text-amber-800 dark:text-amber-300' : 'text-xs text-muted-foreground'}>{children}</p>
);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const opps = (n: number) => `${n} ${n === 1 ? 'opportunity' : 'opportunities'}`;

interface Props {
  pipeline: RevenuePipeline | null;
  periodLabel: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Revenue not yet booked: open quotes and deals, what they should bring, and what was won or lost in the period. Derived by `get_revenue_pipeline`. */
export const RevenuePipelineCard: React.FC<Props> = ({ pipeline, periodLabel, loading, error, onRetry }) => {
  const header = (
    <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
      <div className="min-w-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-muted-foreground" /> Pipeline
        </CardTitle>
        <p className="pt-1 text-[11px] text-muted-foreground">
          Revenue not yet in the P&amp;L — open quotes and deals, net of VAT. A deal with a quote counts once, through the quote.
        </p>
      </div>
      <Link to={financeTabUrl(FINANCE_TAB.reports)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
        Lost revenue <ArrowRight className="h-3 w-3" />
      </Link>
    </CardHeader>
  );

  if (error) {
    return (
      <Card>
        {header}
        <CardContent className="flex items-center justify-between gap-3 p-5 text-sm">
          <span className="text-muted-foreground">
            The pipeline could not be read — these figures are missing, not zero. <span className="opacity-80">{error}</span>
          </span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 text-sm font-medium text-primary hover:underline">Retry</button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!pipeline) {
    return (
      <Card>
        {header}
        <CardContent className="p-6 text-center text-sm text-muted-foreground">{loading ? 'Reading the pipeline…' : 'No pipeline figures.'}</CardContent>
      </Card>
    );
  }

  const ccy = pipeline.currency || 'EUR';
  const enoughHistory = pipeline.win_rate_status === 'ok';
  const openParts = [
    pipeline.open_quote_count > 0 ? `${plural(pipeline.open_quote_count, 'quote')} ${formatMoney(pipeline.open_quote_value, ccy)}` : null,
    pipeline.open_deal_count > 0 ? `${plural(pipeline.open_deal_count, 'deal')} ${formatMoney(pipeline.open_deal_value, ccy)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card>
      {header}
      <CardContent className="space-y-2 p-4">
        <HubStatGrid>
          <HubStatTile
            label="Open Pipeline"
            value={formatMoney(pipeline.open_value, ccy)}
            category={opps(pipeline.open_count)}
            help="Quotes sent and not expired, plus open deals that have no quote yet. Drafts are not counted."
            chart={
              <>
                {openParts && <Note>{openParts}</Note>}
                {pipeline.draft_count > 0 && <Note>{formatMoney(pipeline.draft_value, ccy)} more in {plural(pipeline.draft_count, 'draft')}</Note>}
              </>
            }
          />
          <HubStatTile
            label="Expected Revenue"
            value={pipeline.expected_value != null ? formatMoney(pipeline.expected_value, ccy) : 'No verdict'}
            category={enoughHistory ? `quotes at ${pipeline.win_rate_value_pct}% win rate` : undefined}
            help={`Open quotes × win rate by value over the last 12 months, plus each open deal × its stage probability. The win rate needs ${MIN_DECIDED} won or lost opportunities.`}
            chart={pipeline.expected_value == null
              ? <Note>Needs {MIN_DECIDED} decided quotes or deals — {pipeline.decided_count} so far</Note>
              : (!enoughHistory && pipeline.open_deal_count > 0 ? <Note>Deals only, weighted by stage</Note> : undefined)}
          />
          <HubStatTile
            label="Profit On Open Quotes"
            value={pipeline.open_quote_profit != null ? formatMoney(pipeline.open_quote_profit, ccy) : '—'}
            help="Sell price minus buy price on open quote lines that have a buy price. Deals carry no cost, so they are not in this figure."
            chart={pipeline.open_quote_count > 0 && pipeline.open_quote_profit == null ? <Note tone="warning">No buy prices yet — profit unknown</Note> : undefined}
          />
          <HubStatTile
            label="Won"
            value={formatMoney(pipeline.won_value, ccy)}
            category={`${opps(pipeline.won_count)} · ${periodLabel}`}
            help="Quotes accepted and deals marked won in the period. Revenue reaches the P&L when it is invoiced."
          />
          <HubStatTile
            label="Lost"
            value={formatMoney(pipeline.lost_value, ccy)}
            category={`${opps(pipeline.lost_count)} · ${periodLabel}`}
            help="Quotes rejected or expired, and deals marked lost, in the period. A quote on a lost deal is lost with it."
          />
        </HubStatGrid>
        {pipeline.other_currency_count > 0 && (
          <Note>{opps(pipeline.other_currency_count)} in another currency than {ccy} are not included.</Note>
        )}
      </CardContent>
    </Card>
  );
};
