/**
 * Filter definitions for the messaging module's log and opt-out tabs.
 *
 * `channel_type` and `status` keep their SQL pushdown (they carry `column` and no accessor;
 * the tabs feed them into messagingService). Everything else is matched over the loaded page.
 */
import { CalendarDays, Coins, MessageCircle, UserX } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { MessagingLog, MessagingOptout } from '../services';

const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'rejected', 'expired'];

export function buildMessagingLogFilters(logs: MessagingLog[]): FilterGroupDef[] {
  const costs = logs.map((l) => Number(l.cost ?? 0)).filter((n) => Number.isFinite(n));
  const maxCost = Math.max(0.1, Math.max(0, ...costs));

  return [
    {
      key: 'general', label: 'General', icon: MessageCircle,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search phone number or content…',
          accessor: (l) => [l.to_number, l.from_number, l.content],
        },
        {
          key: 'channel_type', type: 'select', label: 'Channel',
          options: [{ value: 'whatsapp', label: 'WhatsApp' }],
          column: 'channel_type',
        },
        {
          key: 'status', type: 'select', label: 'Status',
          options: MESSAGE_STATUSES.map((s) => ({ value: s, label: humanizeLabel(s) })),
          column: 'status',
        },
        {
          key: 'message_type', type: 'multi', label: 'Message type',
          options: optionsFromRows(logs, (l) => l.message_type, humanizeLabel),
          accessor: (l) => l.message_type,
        },
        {
          key: 'has_error', type: 'bool', label: 'Errors',
          trueLabel: 'Errored only', falseLabel: 'No error',
          accessor: (l) => !!l.error_message,
        },
        {
          key: 'campaign', type: 'bool', label: 'Origin',
          trueLabel: 'Campaign sends', falseLabel: 'One-off sends',
          accessor: (l) => !!l.campaign_id,
        },
      ],
    },
    {
      key: 'cost', label: 'Cost', icon: Coins,
      fields: [
        { key: 'cost', type: 'range', label: 'Cost', min: 0, max: maxCost, step: 0.001, accessor: (l) => l.cost ?? 0 },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'sent_at', type: 'dateRange', label: 'Sent', accessor: (l) => l.sent_at ?? l.created_at },
        { key: 'delivered_at', type: 'dateRange', label: 'Delivered', accessor: (l) => l.delivered_at },
      ],
    },
  ];
}

export function buildMessagingOptoutFilters(optouts: MessagingOptout[]): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: UserX,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search by phone number…',
          accessor: (o) => [o.phone_number, o.reason],
        },
        {
          key: 'channel_type', type: 'select', label: 'Channel',
          options: [
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'all', label: 'All channels' },
          ],
          column: 'channel_type',
        },
        {
          key: 'source', type: 'multi', label: 'Source',
          description: 'How the opt-out was recorded — STOP keyword, manual entry, API, or complaint.',
          options: optionsFromRows(optouts, (o) => o.source, humanizeLabel),
          accessor: (o) => o.source,
        },
        {
          key: 'has_reason', type: 'bool', label: 'Reason',
          trueLabel: 'Has a reason', falseLabel: 'No reason given',
          accessor: (o) => !!o.reason,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [{ key: 'opted_out_at', type: 'dateRange', label: 'Opted out', accessor: (o) => o.opted_out_at }],
    },
  ];
}
