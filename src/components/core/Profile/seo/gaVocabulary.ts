/**
 * What we ask Google Analytics for beyond the daily totals — ONE declaration, read by the edge that
 * builds the reports, the panels that render them, and `ga_breakdown_dimension_check`.
 */

export type GaBreakdownKey =
  | 'country' | 'city' | 'page' | 'landing_page'
  | 'device' | 'browser' | 'os' | 'source' | 'event' | 'returning'
  | 'item' | 'ads_campaign' | 'age' | 'gender' | 'language' | 'hostname';

/**
 * A GA4 metric and the `ga_breakdown` column it lands in. `alt` is the same fact under a renamed
 * key (`conversions` became `keyEvents`); naming one the property lacks fails the WHOLE report.
 */
export interface GaMetricBinding { ga: string; col: string; alt?: string }

export interface GaBreakdownSpec {
  key: GaBreakdownKey;
  label: string;
  /** The FIRST is the stored `value`; a second becomes `label` — an ISO code and "Greece". */
  dimensions: string[];
  metrics: GaMetricBinding[];
  /** GA4 truncates here, after ordering by the first metric. */
  limit: number;
  /** Pull a per-day series too. Low-cardinality only: `date x page` is a row explosion. */
  daily?: boolean;
  /** Needs something set up on the property (ecommerce events, a linked Ads account). */
  requires?: string;
}

export const GA_BASE_METRICS: readonly GaMetricBinding[] = [
  { ga: 'sessions', col: 'sessions' },
  { ga: 'activeUsers', col: 'active_users' },
  { ga: 'newUsers', col: 'new_users' },
  { ga: 'engagedSessions', col: 'engaged_sessions' },
  { ga: 'screenPageViews', col: 'screen_page_views' },
  { ga: 'conversions', col: 'conversions', alt: 'keyEvents' },
  { ga: 'totalRevenue', col: 'total_revenue' },
  { ga: 'userEngagementDuration', col: 'engagement_secs' },
];

/** Events are counted, not sessionised — an event row with `sessions` alone says nothing. */
export const GA_EVENT_METRICS: readonly GaMetricBinding[] = [
  { ga: 'eventCount', col: 'event_count' },
  { ga: 'sessions', col: 'sessions' },
  { ga: 'activeUsers', col: 'active_users' },
  { ga: 'conversions', col: 'conversions', alt: 'keyEvents' },
  { ga: 'totalRevenue', col: 'total_revenue' },
];

/** A product is measured in views, carts and purchases. */
export const GA_ITEM_METRICS: readonly GaMetricBinding[] = [
  { ga: 'itemsViewed', col: 'items_viewed' },
  { ga: 'itemsAddedToCart', col: 'items_added_to_cart' },
  { ga: 'itemsPurchased', col: 'items_purchased' },
  { ga: 'itemRevenue', col: 'total_revenue' },
  { ga: 'itemsViewed', col: 'screen_page_views' },
];

export const GA_ADS_METRICS: readonly GaMetricBinding[] = [
  { ga: 'advertiserAdCost', col: 'ad_cost' },
  { ga: 'advertiserAdClicks', col: 'ad_clicks' },
  { ga: 'advertiserAdImpressions', col: 'ad_impressions' },
  { ga: 'returnOnAdSpend', col: 'roas' },
  { ga: 'sessions', col: 'sessions' },
  { ga: 'conversions', col: 'conversions', alt: 'keyEvents' },
  { ga: 'totalRevenue', col: 'total_revenue' },
];

export const GA_BREAKDOWNS: readonly GaBreakdownSpec[] = [
  { key: 'country', label: 'Countries', dimensions: ['countryId', 'country'], metrics: [...GA_BASE_METRICS], limit: 300, daily: true },
  { key: 'city', label: 'Cities', dimensions: ['city', 'country'], metrics: [...GA_BASE_METRICS], limit: 200 },
  { key: 'page', label: 'Pages', dimensions: ['pagePath', 'pageTitle'], metrics: [...GA_BASE_METRICS], limit: 300 },
  { key: 'landing_page', label: 'Landing pages', dimensions: ['landingPage'], metrics: [...GA_BASE_METRICS], limit: 200 },
  { key: 'device', label: 'Devices', dimensions: ['deviceCategory'], metrics: [...GA_BASE_METRICS], limit: 20, daily: true },
  { key: 'browser', label: 'Browsers', dimensions: ['browser'], metrics: [...GA_BASE_METRICS], limit: 40 },
  { key: 'os', label: 'Operating systems', dimensions: ['operatingSystem'], metrics: [...GA_BASE_METRICS], limit: 40 },
  { key: 'source', label: 'Sources', dimensions: ['sessionSource', 'sessionMedium'], metrics: [...GA_BASE_METRICS], limit: 150, daily: true },
  { key: 'event', label: 'Events', dimensions: ['eventName'], metrics: [...GA_EVENT_METRICS], limit: 100 },
  { key: 'returning', label: 'New vs returning', dimensions: ['newVsReturning'], metrics: [...GA_BASE_METRICS], limit: 10, daily: true },

  { key: 'item', label: 'Products', dimensions: ['itemName', 'itemBrand'], metrics: [...GA_ITEM_METRICS], limit: 200, requires: 'ecommerce events on the property' },
  { key: 'ads_campaign', label: 'Ad campaigns', dimensions: ['sessionCampaignName', 'sessionSource'], metrics: [...GA_ADS_METRICS], limit: 100, requires: 'a linked Google Ads account' },
  { key: 'age', label: 'Age', dimensions: ['userAgeBracket'], metrics: [...GA_BASE_METRICS], limit: 20 },
  { key: 'gender', label: 'Gender', dimensions: ['userGender'], metrics: [...GA_BASE_METRICS], limit: 10 },
  { key: 'language', label: 'Languages', dimensions: ['language'], metrics: [...GA_BASE_METRICS], limit: 50 },
  { key: 'hostname', label: 'Hostnames', dimensions: ['hostName'], metrics: [...GA_BASE_METRICS], limit: 40 },
];

export const GA_BREAKDOWN_KEYS: readonly GaBreakdownKey[] = GA_BREAKDOWNS.map((b) => b.key);

/** Every column a breakdown row can carry — one INSERT shape for all of them. */
export const GA_BREAKDOWN_COLUMNS: readonly string[] = [
  'sessions', 'active_users', 'new_users', 'engaged_sessions',
  'screen_page_views', 'event_count', 'conversions', 'total_revenue', 'engagement_secs',
  'items_viewed', 'items_added_to_cart', 'items_purchased',
  'ad_cost', 'ad_clicks', 'ad_impressions', 'roas',
];

/** Never stored — realtime at rest is wrong. `countryId` so the flag lookup gets a code. */
export const GA_REALTIME = {
  dimensions: ['unifiedScreenName', 'countryId', 'deviceCategory'],
  metric: 'activeUsers',
  limit: 50,
} as const;

export interface GaFunnelStep { event: string; label: string }
export interface GaFunnelLadder { key: string; label: string; description: string; steps: GaFunnelStep[] }

/** Which journey a site is ON is DERIVED from the events it reports. */
export const GA_FUNNELS: readonly GaFunnelLadder[] = [
  {
    key: 'ecommerce',
    label: 'Purchase journey',
    description: 'Arrival through to purchase, on GA4 recommended ecommerce events.',
    steps: [
      { event: 'session_start', label: 'Arrived' },
      { event: 'view_item_list', label: 'Browsed a list' },
      { event: 'view_item', label: 'Viewed a product' },
      { event: 'add_to_cart', label: 'Added to cart' },
      { event: 'begin_checkout', label: 'Started checkout' },
      { event: 'purchase', label: 'Purchased' },
    ],
  },
  {
    key: 'lead',
    label: 'Enquiry journey',
    description: 'Arrival through to an enquiry, for a site that sells by conversation.',
    steps: [
      { event: 'session_start', label: 'Arrived' },
      { event: 'page_view', label: 'Viewed a page' },
      { event: 'view_search_results', label: 'Searched' },
      { event: 'generate_lead', label: 'Enquired' },
    ],
  },
];

export const GA_FUNNEL_MIN_STEPS = 3;

export const GA_COHORT = { weeks: 6, granularity: 'WEEKLY' } as const;
