/**
 * The vocabulary for "a metric we may or may not have".
 *
 * ONE RULE, and every SEO surface in the app obeys it: a metric is a VALUE or a
 * stated REASON there is no value. Never a hidden row, and never a 0 standing in
 * for a failed fetch.
 *
 * That distinction is not cosmetic. `gpt-4o-mini` returned HTTP 429 on all 212 of
 * its stored probes; dividing mentions by probes-SENT renders that as "0% AI
 * visibility", which reads as "assistants never mention us" when it means "we
 * never successfully asked". Same shape on the domain side: every stored snapshot
 * has NULL backlinks because the backlinks call is wrapped in `.catch(() => [])`,
 * and the old panel simply hid the row — so a broken collector and a site with no
 * links looked identical.
 *
 * The STATUS IS DERIVED IN SQL (`public.seo_metric`, `get_website_seo_overview`,
 * `get_website_ai_visibility`) and only formatted here. Nothing in this file
 * re-decides whether a number is real — a tile and a report reading the same RPC
 * cannot then disagree about it.
 */

/** Mirrors the status literals produced by `public.seo_metric`. */
export type SeoMetricStatus =
  | 'ok'
  | 'no_data'
  | 'collector_failed'
  | 'not_collected'
  | 'not_connected';

export interface SeoMetric {
  value: number | null;
  previous: number | null;
  delta: number | null;
  delta_pct: number | null;
  status: SeoMetricStatus | string;
  note: string | null;
  series: { date: string; v: number }[];
}

export interface SeoStatusPresentation {
  /** What goes where the number would have been. Never "0", never blank. */
  placeholder: string;
  /** One line explaining what the reader should take from the absence. */
  explain: string;
  tone: 'neutral' | 'warning' | 'info';
  /** True when a person can act to fix it (connect, run, retry). */
  actionable: boolean;
}

const PRESENTATION: Record<SeoMetricStatus, SeoStatusPresentation> = {
  ok: { placeholder: '', explain: '', tone: 'neutral', actionable: false },
  no_data: {
    placeholder: 'None',
    explain: 'The source answered and genuinely has nothing here for this site yet.',
    tone: 'neutral',
    actionable: false,
  },
  collector_failed: {
    placeholder: 'Unknown',
    explain: 'The source failed, so this figure is unknown — it is not zero.',
    tone: 'warning',
    actionable: true,
  },
  not_collected: {
    placeholder: 'Not measured',
    explain: 'This has never been collected for this site. Run it to fill it in.',
    tone: 'info',
    actionable: true,
  },
  not_connected: {
    placeholder: 'Not connected',
    explain: 'Needs a connection before any data can arrive.',
    tone: 'info',
    actionable: true,
  },
};

/**
 * Fail closed. An unrecognised status — a newer RPC, a typo, a rollback that left
 * an old function behind — must NEVER fall through to rendering the raw number as
 * though it were trustworthy. Unknown provenance is treated as unknown value.
 */
export function statusPresentation(status: string): SeoStatusPresentation {
  return (
    PRESENTATION[status as SeoMetricStatus] ?? {
      placeholder: 'Unknown',
      explain: `This figure arrived with an availability status this build does not recognise ("${status}"), so it is not being shown as fact.`,
      tone: 'warning',
      actionable: false,
    }
  );
}

export const isPresent = (m: SeoMetric | null | undefined): boolean =>
  !!m && m.status === 'ok' && m.value != null;

// ─────────────────────────────────────────────────────────────────────────────
// Metric descriptors
// ─────────────────────────────────────────────────────────────────────────────

export type SeoMetricFormat = 'count' | 'currency' | 'score' | 'percent' | 'position' | 'decimal';

export interface SeoMetricDescriptor {
  key: string;
  label: string;
  format: SeoMetricFormat;
  /**
   * Whether a RISING value is good. Getting this wrong is how a dashboard
   * congratulates you on your spam score. Position is the classic trap: average
   * position moving 8.3 → 27.6 is a large REGRESSION, and colouring by direction
   * alone paints it green.
   */
  upIsGood: boolean;
  /** How the number is derived — shown as the tile's info tooltip. */
  help: string;
}

export const DOMAIN_METRICS: SeoMetricDescriptor[] = [
  {
    key: 'domain_rank',
    label: 'Domain rank',
    format: 'score',
    upIsGood: true,
    help: 'Strength of this domain\'s backlink profile on a 0–100 scale, from the backlink index. Comparative, not a Google figure.',
  },
  {
    key: 'organic_keywords',
    label: 'Organic keywords',
    format: 'count',
    upIsGood: true,
    help: 'How many distinct queries the domain ranks in the top 100 for, in its detected market.',
  },
  {
    key: 'organic_traffic',
    label: 'Est. monthly traffic',
    format: 'count',
    upIsGood: true,
    help: 'Estimated monthly organic visits, modelled from ranking positions and each keyword\'s search volume. An estimate, not analytics.',
  },
  {
    key: 'organic_traffic_value',
    label: 'Traffic value',
    format: 'currency',
    upIsGood: true,
    help: 'What this organic traffic would cost to buy as ads at the same keywords\' CPC. Useful as a size-of-prize figure.',
  },
  {
    key: 'referring_domains',
    label: 'Referring domains',
    format: 'count',
    upIsGood: true,
    help: 'Distinct domains linking to this site. Usually a better health signal than raw backlink count.',
  },
  {
    key: 'backlinks',
    label: 'Backlinks',
    format: 'count',
    upIsGood: true,
    help: 'Total inbound links found across the backlink index, including many from the same domain.',
  },
  {
    key: 'broken_backlinks',
    label: 'Broken backlinks',
    format: 'count',
    upIsGood: false,
    help: 'Inbound links pointing at URLs that no longer resolve — recoverable link equity if redirected.',
  },
  {
    key: 'spam_score',
    label: 'Spam score',
    format: 'score',
    upIsGood: false,
    help: 'Share of the backlink profile judged low quality. Higher is worse.',
  },
];

export const GSC_METRICS: SeoMetricDescriptor[] = [
  { key: 'clicks', label: 'Clicks', format: 'count', upIsGood: true, help: 'Times someone clicked through to your site from Google search results.' },
  { key: 'impressions', label: 'Impressions', format: 'count', upIsGood: true, help: 'Times a link to your site appeared in results a searcher saw.' },
  { key: 'ctr', label: 'CTR', format: 'percent', upIsGood: true, help: 'Clicks divided by impressions. Low CTR at a good position usually means the title and description are not earning the click.' },
  { key: 'avg_position', label: 'Avg. position', format: 'position', upIsGood: false, help: 'Impression-weighted mean ranking position. LOWER is better — position 3 beats position 30.' },
];

export const HEALTH_METRICS: SeoMetricDescriptor[] = [
  { key: 'performance', label: 'Performance', format: 'score', upIsGood: true, help: 'Lighthouse performance score for the audited page (0–100).' },
  { key: 'accessibility', label: 'Accessibility', format: 'score', upIsGood: true, help: 'Lighthouse accessibility score (0–100).' },
  { key: 'best_practices', label: 'Best practices', format: 'score', upIsGood: true, help: 'Lighthouse best-practices score (0–100).' },
  { key: 'seo', label: 'Technical SEO', format: 'score', upIsGood: true, help: 'Lighthouse on-page SEO score (0–100). Covers crawlability basics, not rankings.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

export function formatMetricValue(v: number, format: SeoMetricFormat): string {
  switch (format) {
    case 'currency':
      return v >= 1000
        ? `$${compact(v)}`
        : `$${v.toFixed(v < 10 ? 2 : 0)}`;
    case 'percent':
      return `${round(v, 2)}%`;
    case 'score':
      return String(round(v, 1));
    case 'position':
      return `#${round(v, 1)}`;
    case 'decimal':
      return String(round(v, 2));
    case 'count':
    default:
      return compact(v);
  }
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** 1.8k / 39.4k / 3.9M — the reference density, and it keeps tiles on one line. */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${round(v / 1_000_000_000, 1)}B`;
  if (a >= 1_000_000) return `${round(v / 1_000_000, 1)}M`;
  if (a >= 10_000) return `${round(v / 1000, 1)}k`;
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a < 10 && !Number.isInteger(v)) return String(round(v, 1));
  return String(Math.round(v));
}

/** Signed, already formatted — HubStatTile does not format. */
export function formatDelta(m: SeoMetric, format: SeoMetricFormat): string {
  if (m.delta_pct != null && Number.isFinite(m.delta_pct)) {
    return `${m.delta_pct > 0 ? '+' : ''}${round(m.delta_pct, 1)}%`;
  }
  if (m.delta != null) {
    const sign = m.delta > 0 ? '+' : m.delta < 0 ? '−' : '';
    return `${sign}${formatMetricValue(Math.abs(m.delta), format)}`;
  }
  return '';
}

export function deltaDirection(m: SeoMetric): 'up' | 'down' | 'flat' {
  const d = m.delta_pct ?? m.delta;
  if (d == null || d === 0) return 'flat';
  return d > 0 ? 'up' : 'down';
}
