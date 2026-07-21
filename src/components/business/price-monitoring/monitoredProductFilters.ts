/**
 * Filter definitions for the monitored-products table.
 *
 * This list had no filters at all — only pagination — so a catalog with a few hundred
 * tracked queries could only be read page by page. Every dimension here is a real
 * `tracked_queries` column (see src/services/priceMonitoringApi.ts → TrackedQuery).
 */
import { CalendarDays, Coins, Package, TrendingUp } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { TrackedQuery } from '@/services/priceMonitoringApi';

export function buildMonitoredProductFilters(
  rows: TrackedQuery[],
  productName: (id: string) => string | undefined,
): FilterGroupDef[] {
  const prices = rows.map((r) => Number(r.current_price ?? 0)).filter((n) => Number.isFinite(n) && n > 0);
  const maxPrice = Math.max(100, Math.ceil(Math.max(0, ...prices) / 10) * 10);

  return [
    {
      key: 'general', label: 'General', icon: Package,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search product, query, manufacturer…',
          accessor: (r) => [
            r.product_id ? productName(r.product_id) : undefined,
            r.search_query, r.manufacturer, r.pinned_url,
          ],
        },
        {
          key: 'is_active', type: 'bool', label: 'Monitoring',
          trueLabel: 'Active only', falseLabel: 'Paused only',
          accessor: (r) => !!r.is_active,
        },
        {
          key: 'mode', type: 'multi', label: 'Mode',
          description: 'Discovery runs Perplexity + DataForSEO; url-only tracks a single pinned page.',
          options: [
            { value: 'discovery', label: 'Discovery' },
            { value: 'url-only', label: 'Pinned URL' },
          ],
          accessor: (r) => r.mode,
        },
        {
          key: 'country_code', type: 'multi', label: 'Country',
          options: optionsFromRows(rows, (r) => r.country_code),
          accessor: (r) => r.country_code,
        },
        {
          key: 'has_error', type: 'bool', label: 'Last refresh',
          trueLabel: 'Errored', falseLabel: 'Clean',
          accessor: (r) => !!r.last_error,
        },
      ],
    },
    {
      key: 'price', label: 'Price', icon: Coins,
      fields: [
        {
          key: 'current_price', type: 'range', label: 'Cheapest price',
          description: 'Denormalized cache — the cheapest non-anomaly hit from the latest refresh.',
          min: 0, max: maxPrice, accessor: (r) => r.current_price,
        },
        {
          key: 'current_currency', type: 'multi', label: 'Currency',
          options: optionsFromRows(rows, (r) => r.current_currency),
          accessor: (r) => r.current_currency,
        },
        {
          key: 'current_availability', type: 'multi', label: 'Availability',
          options: optionsFromRows(rows, (r) => r.current_availability, humanizeLabel),
          accessor: (r) => r.current_availability,
        },
        {
          key: 'current_price_verified', type: 'bool', label: 'Verification',
          description: 'Firecrawl re-read the retailer page rather than trusting the LLM/feed price.',
          trueLabel: 'Verified price', falseLabel: 'Unverified price',
          accessor: (r) => !!r.current_price_verified,
        },
        {
          key: 'on_promo', type: 'bool', label: 'Promotion',
          description: 'Retailer page shows a was/now pair.',
          trueLabel: 'On promotion', falseLabel: 'No promotion',
          accessor: (r) => r.current_original_price != null,
        },
      ],
    },
    {
      key: 'cadence', label: 'Cadence', icon: TrendingUp,
      fields: [
        {
          key: 'volatility_score', type: 'range', label: 'Volatility',
          description: 'Drives the 24h → 48h → 72h cadence stretch on stable subjects.',
          min: 0, max: 1, step: 0.05, accessor: (r) => r.volatility_score,
        },
        {
          key: 'consecutive_stable_refreshes', type: 'range', label: 'Stable refreshes',
          min: 0, max: Math.max(10, ...rows.map((r) => r.consecutive_stable_refreshes ?? 0)),
          accessor: (r) => r.consecutive_stable_refreshes,
        },
        {
          key: 'total_credits_used', type: 'range', label: 'Credits used', unit: ' cr',
          min: 0, max: Math.max(10, ...rows.map((r) => Number(r.total_credits_used ?? 0))),
          accessor: (r) => r.total_credits_used ?? 0,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'last_refreshed_at', type: 'dateRange', label: 'Last check', accessor: (r) => r.last_refreshed_at },
        { key: 'next_check_at', type: 'dateRange', label: 'Next check', accessor: (r) => r.next_check_at },
      ],
    },
  ];
}
