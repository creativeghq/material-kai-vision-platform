/**
 * What we ask Google Analytics for beyond the daily totals — ONE declaration, read by the edge that
 * builds the reports, the panels that render them, and `ga_breakdown_dimension_check`.
 */

export type GaBreakdownKey =
  | 'country' | 'city' | 'page' | 'landing_page'
  | 'device' | 'browser' | 'os' | 'source' | 'event' | 'returning';

/** A GA4 metric and the `ga_breakdown` column it lands in. */
export interface GaMetricBinding { ga: string; col: string }

export interface GaBreakdownSpec {
  key: GaBreakdownKey;
  label: string;
  /**
   * The FIRST becomes the stored `value` (the identity); an optional second becomes `label`. That
   * is how the map keys on an ISO code while the table prints "Greece", from one row.
   */
  dimensions: string[];
  metrics: GaMetricBinding[];
  /** GA4 truncates here, after ordering by the first metric. */
  limit: number;
}

/** One list, so a new dimension cannot arrive with a column set the writer does not map. */
export const GA_BASE_METRICS: readonly GaMetricBinding[] = [
  { ga: 'sessions', col: 'sessions' },
  { ga: 'activeUsers', col: 'active_users' },
  { ga: 'newUsers', col: 'new_users' },
  { ga: 'engagedSessions', col: 'engaged_sessions' },
  { ga: 'screenPageViews', col: 'screen_page_views' },
  { ga: 'conversions', col: 'conversions' },
  { ga: 'totalRevenue', col: 'total_revenue' },
  { ga: 'userEngagementDuration', col: 'engagement_secs' },
];

/** Events are counted, not sessionised — an event row with `sessions` alone says nothing. */
export const GA_EVENT_METRICS: readonly GaMetricBinding[] = [
  { ga: 'eventCount', col: 'event_count' },
  { ga: 'sessions', col: 'sessions' },
  { ga: 'activeUsers', col: 'active_users' },
  { ga: 'conversions', col: 'conversions' },
  { ga: 'totalRevenue', col: 'total_revenue' },
];

export const GA_BREAKDOWNS: readonly GaBreakdownSpec[] = [
  { key: 'country', label: 'Countries', dimensions: ['countryId', 'country'], metrics: [...GA_BASE_METRICS], limit: 300 },
  { key: 'city', label: 'Cities', dimensions: ['city', 'country'], metrics: [...GA_BASE_METRICS], limit: 200 },
  { key: 'page', label: 'Pages', dimensions: ['pagePath', 'pageTitle'], metrics: [...GA_BASE_METRICS], limit: 300 },
  { key: 'landing_page', label: 'Landing pages', dimensions: ['landingPage'], metrics: [...GA_BASE_METRICS], limit: 200 },
  { key: 'device', label: 'Devices', dimensions: ['deviceCategory'], metrics: [...GA_BASE_METRICS], limit: 20 },
  { key: 'browser', label: 'Browsers', dimensions: ['browser'], metrics: [...GA_BASE_METRICS], limit: 40 },
  { key: 'os', label: 'Operating systems', dimensions: ['operatingSystem'], metrics: [...GA_BASE_METRICS], limit: 40 },
  { key: 'source', label: 'Sources', dimensions: ['sessionSource', 'sessionMedium'], metrics: [...GA_BASE_METRICS], limit: 150 },
  { key: 'event', label: 'Events', dimensions: ['eventName'], metrics: [...GA_EVENT_METRICS], limit: 100 },
  { key: 'returning', label: 'New vs returning', dimensions: ['newVsReturning'], metrics: [...GA_BASE_METRICS], limit: 10 },
];

export const GA_BREAKDOWN_KEYS: readonly GaBreakdownKey[] = GA_BREAKDOWNS.map((b) => b.key);

/** Every column a breakdown row can carry — one INSERT shape for all ten. */
export const GA_BREAKDOWN_COLUMNS: readonly string[] = [
  'sessions', 'active_users', 'new_users', 'engaged_sessions',
  'screen_page_views', 'event_count', 'conversions', 'total_revenue', 'engagement_secs',
];
