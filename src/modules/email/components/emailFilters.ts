/**
 * Filter definitions for the email module's log and template tabs.
 *
 * On the logs tab, `status` and `email_type` keep their SQL pushdown (they carry `column`
 * and no accessor, and the tab feeds them into emailService.getEmailLogs) — the rest is
 * matched over the loaded page. Templates are fully client-side.
 */
import { CalendarDays, FileText, Mail, Tags } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { EmailLog } from '../services/emailService';

const EMAIL_STATUSES = ['queued', 'sent', 'delivered', 'bounced', 'complained', 'failed'];
const EMAIL_TYPES = ['transactional', 'marketing', 'notification'];

export function buildEmailLogFilters(logs: EmailLog[]): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: Mail,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search recipient / subject…',
          accessor: (l) => [l.to_email, l.from_email, l.subject],
        },
        {
          key: 'status', type: 'select', label: 'Status',
          options: EMAIL_STATUSES.map((s) => ({ value: s, label: humanizeLabel(s) })),
          column: 'status',
        },
        {
          key: 'email_type', type: 'select', label: 'Type',
          options: EMAIL_TYPES.map((t) => ({ value: t, label: humanizeLabel(t) })),
          column: 'email_type',
        },
        {
          key: 'from_email', type: 'multi', label: 'Sender',
          options: optionsFromRows(logs, (l) => l.from_email),
          accessor: (l) => l.from_email,
        },
      ],
    },
    {
      key: 'engagement', label: 'Engagement', icon: Tags,
      fields: [
        {
          key: 'delivered', type: 'bool', label: 'Delivery',
          trueLabel: 'Delivered', falseLabel: 'Not delivered',
          accessor: (l) => !!l.delivered_at,
        },
        {
          key: 'opened', type: 'bool', label: 'Open',
          trueLabel: 'Opened', falseLabel: 'Not opened',
          accessor: (l) => !!l.opened_at,
        },
        {
          key: 'clicked', type: 'bool', label: 'Click',
          trueLabel: 'Clicked', falseLabel: 'Not clicked',
          accessor: (l) => !!l.clicked_at,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'sent_at', type: 'dateRange', label: 'Sent', accessor: (l) => l.sent_at },
        { key: 'delivered_at', type: 'dateRange', label: 'Delivered', accessor: (l) => l.delivered_at },
      ],
    },
  ];
}

/** Structural subset of the tab's local EmailTemplate row. */
export interface EmailTemplateRow {
  name: string;
  slug: string;
  description?: string;
  category: string;
  is_active: boolean;
  is_system?: boolean;
}

export function buildEmailTemplateFilters(
  templates: EmailTemplateRow[],
  topicOf: (slug: string) => string,
  topicOptions: FilterOption[],
): FilterGroupDef[] {
  const systemCount = templates.filter((t) => t.is_system).length;

  return [
    {
      key: 'general', label: 'General', icon: FileText,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search name / slug…',
          accessor: (t) => [t.name, t.slug, t.description],
        },
        {
          key: 'kind', type: 'select', label: 'Template kind',
          description: 'System templates are automation-only and hidden from the manual send pickers.',
          options: [
            { value: 'manual', label: 'Manual — user-sendable', count: templates.length - systemCount },
            { value: 'system', label: 'System — automation', count: systemCount },
          ],
          accessor: (t) => (t.is_system ? 'system' : 'manual'),
        },
        {
          key: 'topic', type: 'select', label: 'Topic',
          description: 'Derived from the slug prefix — see TOPIC_GROUPS.',
          options: topicOptions,
          accessor: (t) => topicOf(t.slug),
        },
        {
          key: 'category', type: 'multi', label: 'Category',
          options: optionsFromRows(templates, (t) => t.category, humanizeLabel),
          accessor: (t) => t.category,
        },
        {
          key: 'is_active', type: 'bool', label: 'Status',
          trueLabel: 'Active only', falseLabel: 'Inactive only',
          accessor: (t) => !!t.is_active,
        },
      ],
    },
  ];
}
