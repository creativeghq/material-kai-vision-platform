/** What `seo_website_ga_breakdowns` returns, and how a row is read. */
import type { GaBreakdownKey } from './gaVocabulary';

export interface GaBreakdownRow {
  value: string;
  label: string | null;
  sessions: number | null;
  active_users: number | null;
  new_users: number | null;
  engaged_sessions: number | null;
  screen_page_views: number | null;
  event_count: number | null;
  conversions: number | null;
  total_revenue: number | null;
  /** Derived in SQL: GA reports engagement as a total across sessions, which reads as nonsense. */
  secs_per_session: number | null;
  items_viewed: number | null;
  items_added_to_cart: number | null;
  items_purchased: number | null;
  ad_cost: number | null;
  ad_clicks: number | null;
  ad_impressions: number | null;
  /** Return on ad spend, as GA derives it. Null where no Ads account is linked. */
  roas: number | null;
  /** This value day by day, for the dimensions that collect a trend. Empty, never null. */
  series: { date: string; v: number | null }[];
}

export interface GaBreakdown {
  status: string;
  note: string | null;
  window_days: number | null;
  period_start: string | null;
  period_end: string | null;
  captured_at: string | null;
  row_count: number;
  /** Sessions across the rows RETURNED, so a share adds up to what the reader can see. */
  shown_sessions: number;
  rows: GaBreakdownRow[];
}

export type GaBreakdowns = Record<GaBreakdownKey, GaBreakdown>;

export const EMPTY_BREAKDOWN: GaBreakdown = {
  status: 'not_collected', note: null, window_days: null, period_start: null, period_end: null,
  captured_at: null, row_count: 0, shown_sessions: 0, rows: [],
};

/** A dimension the payload omits is `not_collected`, never an empty table. */
export function breakdownOf(b: GaBreakdowns | null, key: GaBreakdownKey): GaBreakdown {
  return b?.[key] ?? EMPTY_BREAKDOWN;
}

/** Share of the shown total, or null when there is no denominator to divide by. */
export function shareOf(row: GaBreakdownRow, b: GaBreakdown): number | null {
  if (!b.shown_sessions || row.sessions == null) return null;
  return (row.sessions / b.shown_sessions) * 100;
}

/** A duration a person reads, not 732.4 seconds. */
export function formatDuration(secs: number | null): string {
  if (secs == null || !Number.isFinite(secs)) return '—';
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Drops the query string, so a table is not 80% tracking parameters. */
export function prettyPath(path: string): string {
  const q = path.indexOf('?');
  return q > 0 ? path.slice(0, q) : path;
}

/** The country name for an alpha-2 code, in the reader's language — `Intl` owns the list, not us. */
export function countryName(alpha2: string, fallback?: string | null): string {
  try {
    const dn = new Intl.DisplayNames(undefined, { type: 'region' });
    const n = dn.of(alpha2.toUpperCase());
    if (n && n !== alpha2.toUpperCase()) return n;
  } catch { /* Intl.DisplayNames is unavailable — fall through to what GA told us. */ }
  return fallback || alpha2;
}

/** The regional-indicator pair for an alpha-2 code. */
export function countryFlag(alpha2: string): string {
  const c = alpha2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** An exact match on one breakdown's row; `label` pins the second dimension too (city AND its country). */
export interface GaDrillFilter { dimension: GaBreakdownKey; value: string; label?: string | null }

export interface GaDrillQuery {
  dimension: GaBreakdownKey;
  filters?: GaDrillFilter[];
  search?: string;
  orderBy?: string;
  desc?: boolean;
  days?: number;
  limit?: number;
}

export interface GaDrillResult {
  rows: GaBreakdownRow[];
  row_count: number;
  period_start: string;
  period_end: string;
  days: number;
  metrics: string[];
}

export const GA_WINDOWS = [7, 28, 90] as const;
export type GaWindow = typeof GA_WINDOWS[number];

/** The stored breakdowns are a 28-day pull; any other window is asked of Google live. */
export const GA_STORED_WINDOW: GaWindow = 28;

export function drillAsBreakdown(r: GaDrillResult): GaBreakdown {
  return {
    status: r.rows.length ? 'ok' : 'no_data',
    note: r.rows.length ? null : 'Google Analytics answered, and had nothing for this slice.',
    window_days: r.days,
    period_start: r.period_start,
    period_end: r.period_end,
    captured_at: null,
    row_count: r.row_count,
    shown_sessions: r.rows.reduce((n, x) => n + (x.sessions ?? 0), 0),
    rows: r.rows,
  };
}

export function failedBreakdown(message: string): GaBreakdown {
  return { ...EMPTY_BREAKDOWN, status: 'collector_failed', note: message };
}

export const GA_DRILL_TARGETS: Record<GaBreakdownKey, GaBreakdownKey[]> = {
  country: ['city', 'landing_page', 'source', 'device', 'page', 'language', 'returning', 'browser'],
  city: ['landing_page', 'source', 'device', 'page', 'returning'],
  page: ['source', 'device', 'country', 'returning', 'city'],
  landing_page: ['source', 'device', 'country', 'city', 'returning'],
  device: ['browser', 'os', 'source', 'landing_page', 'country'],
  browser: ['os', 'device', 'landing_page', 'country'],
  os: ['browser', 'device', 'landing_page', 'country'],
  source: ['landing_page', 'device', 'country', 'city', 'returning'],
  event: ['page', 'source', 'device', 'country'],
  returning: ['source', 'landing_page', 'device', 'country'],
  item: ['source', 'country', 'device'],
  ads_campaign: ['landing_page', 'device', 'country'],
  age: ['country', 'source', 'device', 'landing_page'],
  gender: ['country', 'source', 'device', 'landing_page'],
  language: ['country', 'landing_page', 'device'],
  hostname: ['page', 'source', 'country'],
};

export const GA_DIMENSION_NOUN: Record<GaBreakdownKey, string> = {
  country: 'Country', city: 'City', page: 'Page', landing_page: 'Landing page', device: 'Device',
  browser: 'Browser', os: 'Operating system', source: 'Source / medium', event: 'Event',
  returning: 'New vs returning', item: 'Product', ads_campaign: 'Ad campaign', age: 'Age',
  gender: 'Gender', language: 'Language', hostname: 'Hostname',
};

export function drillTargets(from: GaBreakdownKey, used: readonly GaBreakdownKey[]): GaBreakdownKey[] {
  return GA_DRILL_TARGETS[from].filter((k) => !used.includes(k));
}

export function gaRowText(key: GaBreakdownKey, row: Pick<GaBreakdownRow, 'value' | 'label'>): string {
  switch (key) {
    case 'country': return countryName(row.value, row.label);
    case 'page': return row.label ? `${row.label} ${prettyPath(row.value)}` : prettyPath(row.value);
    case 'landing_page': return prettyPath(row.value);
    case 'source': return row.label ? `${row.value} / ${row.label}` : row.value;
    case 'city': case 'item': case 'ads_campaign':
      return row.label ? `${row.value} · ${row.label}` : row.value;
    default: return row.value;
  }
}

export function searchGaRows(key: GaBreakdownKey, rows: GaBreakdownRow[], q: string): GaBreakdownRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    [r.value, r.label ?? '', gaRowText(key, r)].some((s) => s.toLowerCase().includes(needle)));
}

export interface GaSort { key: string; desc: boolean }
export const GA_NAME_SORT = 'name';

/** Nulls last in both directions: an unknown figure is not the smallest one. */
export function sortGaRows(key: GaBreakdownKey, rows: GaBreakdownRow[], sort: GaSort | null): GaBreakdownRow[] {
  if (!sort) return rows;
  const dir = sort.desc ? -1 : 1;
  const out = [...rows];
  if (sort.key === GA_NAME_SORT) {
    return out.sort((a, b) => dir * gaRowText(key, a).localeCompare(gaRowText(key, b)));
  }
  const k = sort.key as keyof GaBreakdownRow;
  return out.sort((a, b) => {
    const x = a[k] as number | null;
    const y = b[k] as number | null;
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return dir * (x - y);
  });
}

export interface GaFunnelStepRow {
  step_index: number;
  step_label: string;
  event_name: string;
  active_users: number | null;
  completion_rate: number | null;
  abandonments: number | null;
  abandonment_rate: number | null;
  of_first: number | null;
  of_previous: number | null;
  dropped: number | null;
}

export interface GaCohortPeriod { nth: number; active_users: number | null; retention: number | null }
export interface GaCohortRow {
  cohort_label: string;
  cohort_start: string | null;
  total_users: number | null;
  periods: GaCohortPeriod[];
}

export interface GaJourney {
  funnel: {
    status: string; note: string | null; ladder: string | null;
    window_days: number | null; captured_at: string | null;
    steps: GaFunnelStepRow[];
  };
  cohorts: {
    status: string; note: string | null;
    window_days: number | null; captured_at: string | null;
    periods: number[];
    rows: GaCohortRow[];
  };
}
