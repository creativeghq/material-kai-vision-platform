/**
 * Filter definitions for the price-alert history.
 *
 * The panel reads `price_alert_log`, where the useful questions are "what fired, for which
 * retailer, and did it actually get delivered" — hence the channel dimensions alongside type
 * and date.
 */
import { Bell, CalendarDays, Send } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import type { PriceAlertLogRow } from './priceAlertsService';

/** Alert types the Python dispatcher emits (price_monitoring_notifications/service.py). */
const ALERT_TYPE_LABELS: Record<string, string> = {
  price_drop: 'Price drop',
  new_retailer: 'New retailer',
  promo_started: 'Promo started',
  anomaly_detected: 'Anomaly detected',
};

export const alertTypeLabel = (t: string) => ALERT_TYPE_LABELS[t] ?? t;

export function buildPriceAlertFilters(rows: PriceAlertLogRow[]): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'Alert', icon: Bell,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search retailer…',
          accessor: (r: PriceAlertLogRow) => [r.retailer_name, r.retailer_domain],
        },
        {
          key: 'alert_type', type: 'multi', label: 'Type',
          options: optionsFromRows(rows, (r) => r.alert_type, alertTypeLabel),
          accessor: (r: PriceAlertLogRow) => r.alert_type,
        },
        {
          key: 'retailer', type: 'multi', label: 'Retailer',
          options: optionsFromRows(rows, (r) => r.retailer_domain ?? undefined),
          accessor: (r: PriceAlertLogRow) => r.retailer_domain ?? undefined,
        },
      ],
    },
    {
      key: 'delivery', label: 'Delivery', icon: Send,
      fields: [
        {
          key: 'channel', type: 'multi', label: 'Channel fired',
          options: optionsFromRows(rows, (r) => r.channels_fired ?? []),
          accessor: (r: PriceAlertLogRow) => r.channels_fired ?? [],
        },
        {
          key: 'skipped', type: 'bool', label: 'Delivery problems',
          description: 'A channel was skipped — out of credits, or the send failed.',
          trueLabel: 'Had a skipped channel', falseLabel: 'Delivered cleanly',
          accessor: (r: PriceAlertLogRow) => (r.channels_skipped ?? []).length > 0,
        },
        {
          key: 'credits_charged', type: 'range', label: 'Credits charged',
          min: 0, max: 10, step: 1,
          accessor: (r: PriceAlertLogRow) => r.credits_charged ?? 0,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [{ key: 'created_at', type: 'dateRange', label: 'Fired at', accessor: (r: PriceAlertLogRow) => r.created_at }],
    },
  ];
}
