/**
 * Price Monitoring Types — re-exported from the API client.
 *
 * After the 2026-05-01 consolidation, every monitored product is a
 * `tracked_queries` row. The legacy types (PriceMonitoringProduct,
 * PriceHistory, CompetitorSource) have been replaced by `TrackedQuery` and
 * `RetailerRow` exported from `@/services/priceMonitoringApi`.
 */

export type { TrackedQuery, RetailerRow, MatchKind } from '@/services/priceMonitoringApi';

/** Per-tracked-query alert preferences (subset of TrackedQuery fields). */
export interface AlertPrefs {
  alert_on_price_drop: boolean;
  alert_on_new_retailer: boolean;
  alert_on_promo: boolean;
  alert_channels: string[];
  alert_webhook_url: string | null;
}

/** Computed market statistics for a tracked query (used by stat cards). */
export interface PriceStatistics {
  min_price: number;
  max_price: number;
  avg_price: number;
  current_price: number;
  price_trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  total_sources: number;
}
