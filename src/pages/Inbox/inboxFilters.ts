/**
 * Filter definitions for the Inbox thread list.
 *
 * The status tabs (Open / Follow-up / Done) and the mailbox folders stay as navigation —
 * they are how you move around a mailbox, not a constraint you stack. Everything secondary
 * (channel, label, thread type, AI state, unread, recency) lives in the modal.
 *
 * `channel` and `label` carry no accessor on purpose: they are request parameters on
 * `inboxApi.listThreads`, so the server has already applied them and the client matcher
 * passes them through.
 */
import { CalendarDays, MessagesSquare, Tag, UserRound } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import type { InboxLabel, InboxThread } from '@/services/inboxApi';

export function buildInboxFilters(labels: InboxLabel[], threads: InboxThread[] = [], myUserId?: string): FilterGroupDef[] {
  const labelOptions: FilterOption[] = labels.map((l) => ({ value: l.id, label: l.name }));
  return [
    {
      key: 'conversation', label: 'Conversation', icon: MessagesSquare,
      fields: [
        {
          key: 'channel', type: 'select', label: 'Channel',
          description: 'Where the conversation is happening.',
          placeholder: 'All channels',
          options: [
            { value: 'internal', label: 'Team' },
            { value: 'whatsapp', label: 'WhatsApp' },
          ],
        },
        {
          key: 'thread_type', type: 'multi', label: 'Type',
          options: [
            { value: 'internal', label: 'Internal' },
            { value: 'customer', label: 'Customer' },
            { value: 'upstream', label: 'Dealer' },
          ],
          accessor: (t: InboxThread) => t.thread_type,
        },
        {
          key: 'agent_state', type: 'multi', label: 'AI assistant',
          options: [
            { value: 'active', label: 'Handling' },
            { value: 'paused', label: 'Taken over' },
            { value: 'off', label: 'Off' },
          ],
          accessor: (t: InboxThread) => t.agent_state,
        },
        {
          key: 'unread', type: 'bool', label: 'Unread',
          trueLabel: 'Unread only', falseLabel: 'Read only',
          accessor: (t: InboxThread) => !!t.unread,
        },
      ],
    },
    {
      key: 'people', label: 'Assignment', icon: UserRound,
      fields: [
        {
          key: 'assignee', type: 'multi', label: 'Assigned to',
          description: 'Team members on the conversation. Unassigned means nobody has picked it up.',
          options: [
            { value: NONE_VALUE, label: 'Unassigned' },
            ...optionsFromRows(threads, (t: InboxThread) => (t.assignees ?? []).map((a) => a.name)),
          ],
          accessor: (t: InboxThread) => (t.assignees ?? []).map((a) => a.name),
        },
        ...(myUserId ? [{
          key: 'mine', type: 'bool' as const, label: 'Just mine',
          description: 'Conversations you are on, regardless of who else is.',
          trueLabel: 'Assigned to me', falseLabel: 'Not mine',
          accessor: (t: InboxThread) => (t.assignees ?? []).some((a) => a.user_id === myUserId),
        }] : []),
      ],
    },
    ...(labelOptions.length > 0 ? [{
      key: 'labels', label: 'Labels', icon: Tag,
      fields: [{
        key: 'label', type: 'select' as const, label: 'Label',
        description: 'Only one label can be applied at a time — the list is fetched by label.',
        placeholder: 'All labels',
        options: labelOptions,
      }],
    }] : []),
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'last_message_at', type: 'dateRange', label: 'Last message', accessor: (t: InboxThread) => t.last_message_at },
        { key: 'created_at', type: 'dateRange', label: 'Started', accessor: (t: InboxThread) => t.created_at },
      ],
    },
  ];
}
