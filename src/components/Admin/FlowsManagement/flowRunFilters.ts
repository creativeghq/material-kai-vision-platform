/**
 * Filter definitions for the flow run history.
 *
 * `flow` and `status` carry a `column` instead of an `accessor`: they are pushed into the
 * flow_runs query so the 50-row page stays meaningful when narrowing (filtering the loaded
 * page client-side would only ever show failures among the most recent 50 runs). The rest
 * are matched in-memory over the returned page.
 */
import { CalendarDays, GitBranch, Timer } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { Flow, FlowRun } from '@/services/flows';

const STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled', 'timed_out'];

export function buildFlowRunFilters(runs: FlowRun[], flows: Flow[]): FilterGroupDef[] {
  const durations = runs.map((r) => Number(r.duration_ms ?? 0)).filter((n) => Number.isFinite(n));
  const maxDuration = Math.max(1000, Math.ceil(Math.max(0, ...durations) / 100) * 100);

  return [
    {
      key: 'general', label: 'General', icon: GitBranch,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search trigger / error…',
          accessor: (r) => [r.trigger_type, r.error_message, r.initiated_by],
        },
        {
          key: 'status', type: 'select', label: 'Status',
          options: STATUSES.map((s) => ({ value: s, label: humanizeLabel(s) })),
          column: 'status',
        },
        {
          key: 'flow_id', type: 'select', label: 'Flow',
          options: flows.map((f) => ({ value: f.id, label: f.name })).sort((a, b) => a.label.localeCompare(b.label)),
          column: 'flow_id',
        },
        {
          key: 'trigger_type', type: 'multi', label: 'Trigger type',
          options: optionsFromRows(runs, (r) => r.trigger_type, humanizeLabel),
          accessor: (r) => r.trigger_type,
        },
        {
          key: 'is_test_run', type: 'bool', label: 'Test runs',
          trueLabel: 'Test runs only', falseLabel: 'Real runs only',
          accessor: (r) => !!r.is_test_run,
        },
      ],
    },
    {
      key: 'execution', label: 'Execution', icon: Timer,
      fields: [
        {
          key: 'duration_ms', type: 'range', label: 'Duration', unit: 'ms',
          min: 0, max: maxDuration, accessor: (r) => r.duration_ms,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Started', accessor: (r) => r.created_at },
        { key: 'completed_at', type: 'dateRange', label: 'Finished', accessor: (r) => r.completed_at },
      ],
    },
  ];
}
