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
