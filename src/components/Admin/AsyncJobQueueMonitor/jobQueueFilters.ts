/**
 * Filter definitions for the async job queue.
 *
 * Job type stays the tab strip (it selects an entirely different pipeline + its own
 * pagination), so it is deliberately absent here. Everything else the job row actually
 * carries — status, workspace, spend, health markers, timestamps — lives in the modal.
 */
import { AlertTriangle, CalendarDays, Coins, Layers } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { BackgroundJob } from './types';

export function buildJobQueueFilters(jobs: BackgroundJob[]): FilterGroupDef[] {
  const costs = jobs.map((j) => Number(j.total_ai_cost_usd ?? 0)).filter((n) => Number.isFinite(n));
  const maxCost = Math.max(1, Math.ceil(Math.max(0, ...costs)));

  return [
    {
      key: 'general', label: 'General', icon: Layers,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search filename, source, job id…',
          accessor: (j) => [j.id, j.metadata?.filename, j.metadata?.source_name, j.metadata?.source_url, j.error],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: optionsFromRows(jobs, (j) => j.status, humanizeLabel),
          accessor: (j) => j.status,
        },
        {
          key: 'workspace_id', type: 'multi', label: 'Workspace',
          description: 'Jobs are workspace-scoped — narrow to one tenant when triaging.',
          options: optionsFromRows(jobs, (j) => j.workspace_id, (v) => `${v.slice(0, 8)}…`),
          accessor: (j) => j.workspace_id,
        },
      ],
    },
    {
      key: 'health', label: 'Health', icon: AlertTriangle,
      fields: [
        {
          key: 'has_error', type: 'bool', label: 'Error message',
          trueLabel: 'Has an error', falseLabel: 'No error',
          accessor: (j) => !!j.error,
        },
        {
          key: 'has_failures', type: 'bool', label: 'Failure rollup',
          description: 'update_job_failure_summary found per-product or OCR failures on this job.',
          trueLabel: 'Has failures', falseLabel: 'Clean',
          accessor: (j) => !!j.failure_summary,
        },
        {
          key: 'slow_operation', type: 'bool', label: 'Slow operation',
          description: 'Currently inside a stage that is legitimately long-running, so auto-recovery skips it.',
          trueLabel: 'In a slow operation', falseLabel: 'Not in a slow operation',
          accessor: (j) => !!j.current_slow_operation,
        },
      ],
    },
    {
      key: 'cost', label: 'Cost', icon: Coins,
      fields: [
        {
          key: 'total_ai_cost_usd', type: 'range', label: 'AI cost', unit: '$',
          description: 'Written at job completion from ai_usage_logs — 0 while a job is still running.',
          min: 0, max: maxCost, step: 0.01,
          accessor: (j) => j.total_ai_cost_usd ?? 0,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (j) => j.created_at },
        { key: 'updated_at', type: 'dateRange', label: 'Last update', accessor: (j) => j.updated_at ?? j.created_at },
      ],
    },
  ];
}
