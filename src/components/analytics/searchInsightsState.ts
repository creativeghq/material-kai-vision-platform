export interface SearchInsights {
  window_days: number;
  searches: number;
  answered: number;
  zero_result_share: number | null;
  top_queries: Array<{ query: string; searches: number; avg_results: number; zero_results: number }>;
  unmet: Array<{ query: string; searches: number }>;
  unmatched_terms: Array<{ term: string; occurrences: number }>;
  top_products: Array<{ product_id: string; name: string; events: number }>;
  reason: string | null;
}

export type InsightsState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: SearchInsights }
  | { kind: 'failed'; reason: string };

export type InsightsOutcome =
  | { kind: 'loading' }
  | { kind: 'failed'; reason: string }
  | { kind: 'no_searches'; windowDays: number }
  | { kind: 'ready'; data: SearchInsights };

export function insightsOutcome(state: InsightsState): InsightsOutcome {
  if (state.kind === 'failed') return { kind: 'failed', reason: state.reason };
  if (state.kind === 'loading') return { kind: 'loading' };
  if (state.data.reason === 'no_searches_in_window' || state.data.searches === 0) {
    return { kind: 'no_searches', windowDays: state.data.window_days };
  }
  return { kind: 'ready', data: state.data };
}

export type CoverageTone = 'good' | 'warn' | 'bad' | 'unknown';

export interface CoverageVerdict {
  label: string;
  tone: CoverageTone;
  known: boolean;
}

export function coverageVerdict(share: number | null | undefined): CoverageVerdict {
  if (typeof share !== 'number' || Number.isNaN(share)) {
    return { label: 'No verdict', tone: 'unknown', known: false };
  }
  if (share >= 0.99) return { label: 'Nothing found, ever', tone: 'bad', known: true };
  if (share >= 0.5) return { label: 'Most searches find nothing', tone: 'bad', known: true };
  if (share >= 0.2) return { label: 'Many searches find nothing', tone: 'warn', known: true };
  return { label: 'Most searches find something', tone: 'good', known: true };
}
