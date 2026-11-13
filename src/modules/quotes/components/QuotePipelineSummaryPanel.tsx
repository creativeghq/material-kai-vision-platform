import React, { useEffect, useState } from 'react';

import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { formatMoney } from '@/modules/finance/services/financeService';
import { quotesService } from '../services/QuotesService';
import { EMPTY_BUCKET, type QuotePipelineSummary } from '../utils/quoteEconomics';

const MIN_DECIDED = 5;

const Note: React.FC<{ children: React.ReactNode; tone?: 'muted' | 'warning' }> = ({ children, tone = 'muted' }) => (
  <p className={tone === 'warning' ? 'text-xs text-amber-800 dark:text-amber-300' : 'text-xs text-muted-foreground'}>{children}</p>
);

/** Money the quotes represent: open pipeline, expected wins, profit and win rate — all derived by `get_quote_pipeline_summary`. */
export const QuotePipelineSummaryPanel: React.FC<{ workspaceId: string; refreshKey?: unknown }> = ({ workspaceId, refreshKey }) => {
  const [summary, setSummary] = useState<QuotePipelineSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void quotesService.getPipelineSummary(workspaceId).then((s) => {
      if (cancelled) return;
      setSummary(s);
      setFailed(s === null);
    });
    return () => { cancelled = true; };
  }, [workspaceId, refreshKey]);

  if (failed) {
    return <Note tone="warning">Could not load quote money figures — refresh to retry.</Note>;
  }
  if (!summary || summary.status !== 'ok') return null;

  const cur = summary.currency || 'EUR';
  const money = (n: number | null | undefined) => (n == null ? '—' : formatMoney(n, cur));
  const open = summary.buckets?.open ?? EMPTY_BUCKET;
  const won = summary.buckets?.won ?? EMPTY_BUCKET;
  const draft = summary.buckets?.draft ?? EMPTY_BUCKET;
  const months = Math.round((summary.window_days ?? 365) / 30.4);
  const windowLabel = months >= 12 && months % 12 === 0 ? `last ${months / 12 === 1 ? '12 months' : `${months / 12} years`}` : `last ${months} months`;
  const enoughHistory = summary.win_rate_status === 'ok';
  const scopeNote = summary.scope === 'own' ? 'Your quotes only.' : 'All quotes in this workspace.';

  const marginNote = (b: typeof open) => {
    if (b.count === 0) return null;
    if (b.profit == null) return <Note tone="warning">No buy prices yet — profit unknown</Note>;
    return (
      <Note tone={b.uncosted_value > 0 ? 'warning' : 'muted'}>
        {b.margin_pct != null ? `${b.margin_pct}% margin` : 'Margin unknown'}
        {b.uncosted_value > 0 ? ` · ${money(b.uncosted_value)} has no buy price` : ''}
      </Note>
    );
  };

  return (
    <div className="space-y-2">
      <HubStatGrid>
        <HubStatTile
          label="Open Pipeline"
          value={money(open.value)}
          category={`${open.count} open quote${open.count === 1 ? '' : 's'}`}
          help={`Net value (after discount, before VAT) of quotes sent or submitted and not yet expired. ${scopeNote}`}
          chart={draft.count > 0 ? <Note>{money(draft.value)} more in {draft.count} draft{draft.count === 1 ? '' : 's'}</Note> : undefined}
        />
        <HubStatTile
          label="Expected To Win"
          value={enoughHistory ? money(summary.expected_value) : 'No verdict'}
          category={enoughHistory ? `at ${summary.win_rate_value_pct}% win rate` : undefined}
          help={`Open pipeline × your win rate by value over the ${windowLabel}. Needs at least ${MIN_DECIDED} accepted or lost quotes.`}
          chart={!enoughHistory ? <Note>Needs {MIN_DECIDED} decided quotes — {summary.decided_count ?? 0} so far</Note> : undefined}
        />
        <HubStatTile
          label="Profit On Open Quotes"
          value={money(open.profit)}
          help="Sell price minus buy price, over the lines that have a buy price. Lines without one are left out and named, never counted at zero cost."
          chart={marginNote(open)}
        />
        <HubStatTile
          label="Won"
          value={money(won.value)}
          category={`${won.count} accepted · ${windowLabel}`}
          help={`Net value of accepted quotes over the ${windowLabel}. Profit uses the buy price frozen when the quote was accepted.`}
          chart={won.count > 0 ? (won.profit != null ? <Note>{money(won.profit)} profit{won.margin_pct != null ? ` · ${won.margin_pct}%` : ''}</Note> : marginNote(won)) : undefined}
        />
        <HubStatTile
          label="Win Rate"
          value={enoughHistory && summary.win_rate_value_pct != null ? `${summary.win_rate_value_pct}%` : 'No verdict'}
          category={enoughHistory && summary.win_rate_count_pct != null ? `by value · ${summary.win_rate_count_pct}% by count` : undefined}
          help={`Accepted ÷ (accepted + rejected + expired) over the ${windowLabel}.`}
          chart={!enoughHistory ? <Note>{summary.decided_count ?? 0} of {MIN_DECIDED} decided quotes needed</Note> : undefined}
        />
      </HubStatGrid>
      {(summary.other_currency_count ?? 0) > 0 && (
        <Note>{summary.other_currency_count} quote{summary.other_currency_count === 1 ? '' : 's'} in another currency than {cur} are not included in these totals.</Note>
      )}
    </div>
  );
};
