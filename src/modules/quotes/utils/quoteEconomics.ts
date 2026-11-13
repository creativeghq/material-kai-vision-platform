import type { Database } from '@/integrations/supabase/types';

export type QuoteEconomics = Database['public']['Functions']['get_quote_economics']['Returns'][number];

export type QuoteCostStatus = 'ok' | 'partial' | 'no_cost' | 'no_lines';

export interface QuotePipelineBucket {
  count: number;
  value: number;
  costed_value: number;
  cost: number;
  profit: number | null;
  margin_pct: number | null;
  uncosted_value: number;
  quotes_missing_cost: number;
}

export type QuotePipelineBucketKey = 'draft' | 'open' | 'won' | 'lost';

export interface QuotePipelineSummary {
  status: 'ok' | 'not_permitted';
  currency?: string;
  scope?: 'workspace' | 'own';
  window_days?: number;
  other_currency_count?: number;
  buckets?: Partial<Record<QuotePipelineBucketKey, QuotePipelineBucket>>;
  decided_count?: number;
  win_rate_count_pct?: number | null;
  win_rate_value_pct?: number | null;
  win_rate_status?: 'ok' | 'not_enough_history';
  expected_value?: number | null;
  expected_profit?: number | null;
}

export const EMPTY_BUCKET: QuotePipelineBucket = {
  count: 0, value: 0, costed_value: 0, cost: 0, profit: null, margin_pct: null, uncosted_value: 0, quotes_missing_cost: 0,
};

/** Why a quote has no margin figure, or what the figure leaves out. Unknown statuses fail closed to "unknown". */
export function costStatusNote(e: Pick<QuoteEconomics, 'cost_status' | 'uncosted_lines' | 'unpriced_lines'>): string | null {
  switch (e.cost_status as QuoteCostStatus) {
    case 'ok': return null;
    case 'partial': {
      const parts: string[] = [];
      if (e.uncosted_lines > 0) parts.push(`${e.uncosted_lines} line${e.uncosted_lines === 1 ? '' : 's'} with no buy price`);
      if (e.unpriced_lines > 0) parts.push(`${e.unpriced_lines} unpriced`);
      return parts.length ? `Margin excludes ${parts.join(' and ')}` : 'Margin excludes uncosted extras';
    }
    case 'no_cost': return 'No buy prices yet';
    case 'no_lines': return 'No priced lines';
    default: return 'Margin unknown';
  }
}
