/**
 * Filter definitions for the catalog operations tab.
 *
 * Mixed surface: catalog / event type / email are pushed into the catalogsService queries
 * (they carry `column` and no accessor, so `applyFilters` leaves them alone), while
 * matched_kind and the date window are matched over the returned timeline rows. The date
 * field keeps an accessor because the service only accepts a lower bound — `from` is
 * additionally used as `sinceIso` to pre-narrow the query, which is the same predicate.
 */
import { BookOpen, CalendarDays, Users } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { CatalogAccessLogRow, CatalogOperationsSummary, CatalogViewEventRow } from '@/services/catalogsService';

export function buildCatalogOperationsFilters(
  summary: CatalogOperationsSummary[],
  timelineRows: Array<CatalogViewEventRow | CatalogAccessLogRow>,
): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: BookOpen,
      fields: [
        {
          key: 'q', type: 'text', label: 'Email contains',
          placeholder: 'Search by email…',
          column: 'email',
        },
        {
          key: 'catalog_id', type: 'select', label: 'Catalog',
          options: summary.map((s) => ({
            value: s.id,
            label: s.title,
            hint: s.slug ? `/c/${s.slug}` : undefined,
          })),
          column: 'catalog_id',
        },
        {
          key: 'event_type', type: 'select', label: 'Event type',
          description: 'Applies to the Events timeline; the email-gate log has no event type.',
          options: [
            { value: 'page_view', label: 'Page views' },
            { value: 'pdf_download', label: 'PDF downloads' },
          ],
          column: 'event_type',
        },
      ],
    },
    {
      key: 'visitor', label: 'Visitor', icon: Users,
      fields: [
        {
          key: 'matched_kind', type: 'multi', label: 'Matched as',
          description: 'How the gate resolved the visitor email against the platform.',
          options: optionsFromRows(timelineRows, (r: any) => r.matched_kind, humanizeLabel),
          accessor: (r) => r.matched_kind,
        },
        {
          key: 'matched_user', type: 'bool', label: 'Platform user',
          trueLabel: 'Matched a user', falseLabel: 'Anonymous visitor',
          accessor: (r) => !!r.matched_user_id,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [{ key: 'created_at', type: 'dateRange', label: 'When', accessor: (r) => r.created_at }],
    },
  ];
}
