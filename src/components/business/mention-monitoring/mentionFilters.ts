/**
 * Filter definitions for the mention-monitoring surfaces.
 *
 * Per-product feed: the Feed/Outlets/LLM tabs stay as tabs (they are different views of the
 * same subject, not filters). Sentiment is a filter, so it sits in the modal alongside the
 * rest of what a mention row carries.
 */
import { CalendarDays, Globe, MessageSquare, Sparkles } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { MentionRow, TrackedMention } from '@/services/mentionMonitoringApi';

export function buildMentionFeedFilters(rows: MentionRow[]): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: MessageSquare,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search title, excerpt, outlet…',
          accessor: (r) => [r.title, r.excerpt, r.outlet_name, r.outlet_domain, r.author],
        },
        {
          key: 'sentiment', type: 'multi', label: 'Sentiment',
          options: optionsFromRows(rows, (r) => r.sentiment, humanizeLabel),
          accessor: (r) => r.sentiment,
        },
        {
          key: 'relevance', type: 'multi', label: 'Relevance',
          description: 'Haiku classifier verdict. Mismatches are dropped before persistence.',
          options: optionsFromRows(rows, (r) => r.relevance, humanizeLabel),
          accessor: (r) => r.relevance,
        },
        {
          key: 'is_anomaly', type: 'bool', label: 'Anomaly',
          description: 'Sentiment sits outside the trailing 7d band for this subject.',
          trueLabel: 'Anomalies only', falseLabel: 'Normal readings',
          accessor: (r) => !!r.is_anomaly,
        },
      ],
    },
    {
      key: 'outlet', label: 'Outlet', icon: Globe,
      fields: [
        {
          key: 'outlet_type', type: 'multi', label: 'Outlet type',
          options: optionsFromRows(rows, (r) => r.outlet_type, humanizeLabel),
          accessor: (r) => r.outlet_type,
        },
        {
          key: 'outlet_domain', type: 'multi', label: 'Domain',
          options: optionsFromRows(rows, (r) => r.outlet_domain),
          accessor: (r) => r.outlet_domain,
        },
        {
          key: 'source', type: 'multi', label: 'Discovery source',
          options: optionsFromRows(rows, (r) => r.source, humanizeLabel),
          accessor: (r) => r.source,
        },
        {
          key: 'language_code', type: 'multi', label: 'Language',
          options: optionsFromRows(rows, (r) => r.language_code),
          accessor: (r) => r.language_code,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'published_at', type: 'dateRange', label: 'Published', accessor: (r) => r.published_at },
        { key: 'discovered_at', type: 'dateRange', label: 'Discovered', accessor: (r) => r.discovered_at },
      ],
    },
  ];
}

export function buildTrackedMentionFilters(
  rows: TrackedMention[],
  productName: (id: string) => string | undefined,
): FilterGroupDef[] {
  const credits = Math.max(1, Math.ceil(Math.max(0, ...rows.map((r) => Number(r.total_credits_used ?? 0)))));

  return [
    {
      key: 'general', label: 'General', icon: Sparkles,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search subjects, brands, products…',
          accessor: (r) => [r.subject_label, r.brand_name, r.product_id ? productName(r.product_id) : undefined],
        },
        {
          key: 'subject_type', type: 'multi', label: 'Subject type',
          options: optionsFromRows(rows, (r) => r.subject_type, humanizeLabel),
          accessor: (r) => r.subject_type,
        },
        {
          key: 'is_active', type: 'bool', label: 'Tracking',
          trueLabel: 'Active only', falseLabel: 'Inactive only',
          accessor: (r) => !!r.is_active,
        },
        {
          key: 'has_error', type: 'bool', label: 'Last refresh',
          trueLabel: 'Errored', falseLabel: 'Clean',
          accessor: (r) => !!r.last_error,
        },
      ],
    },
    {
      key: 'activity', label: 'Activity', icon: MessageSquare,
      fields: [
        {
          key: 'current_mention_count_7d', type: 'range', label: 'Mentions (7d)',
          min: 0, max: Math.max(10, ...rows.map((r) => r.current_mention_count_7d ?? 0)),
          accessor: (r) => r.current_mention_count_7d ?? 0,
        },
        {
          key: 'current_sentiment_avg', type: 'range', label: 'Sentiment avg',
          description: 'Rolling average in [-1, 1]. Below -0.3 is the negative-trend threshold.',
          min: -1, max: 1, step: 0.1,
          accessor: (r) => r.current_sentiment_avg,
        },
        {
          key: 'total_credits_used', type: 'range', label: 'Credits used', unit: ' cr',
          min: 0, max: credits, accessor: (r) => r.total_credits_used ?? 0,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'last_refreshed_at', type: 'dateRange', label: 'Last refresh', accessor: (r) => r.last_refreshed_at },
        { key: 'next_check_at', type: 'dateRange', label: 'Next check', accessor: (r) => r.next_check_at },
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (r) => r.created_at },
      ],
    },
  ];
}
