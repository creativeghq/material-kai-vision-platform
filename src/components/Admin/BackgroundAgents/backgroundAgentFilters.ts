/**
 * Filter definitions for the Background Agents run list.
 *
 * Status stays a counted tab strip on both pages — it is primary navigation and the
 * live counts are the point. Everything secondary (which agent, which tool, how long,
 * how expensive, when) moves in here so the toolbar stops growing a Select per dimension.
 */
import { Bot, CalendarDays, Coins } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { AgentRun, BackgroundAgent } from '@/services/backgroundAgents';

/** Round the observed max up so the slider end isn't pinned to a single real row. */
function bounds(rows: any[], pick: (r: any) => any, fallbackMax: number): { min: number; max: number } {
  const nums = rows.map(pick).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return { min: 0, max: fallbackMax };
  const max = Math.max(...nums);
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(max)) - 1));
  return { min: 0, max: Math.max(Math.ceil(max / step) * step, step) };
}

export function buildAgentRunFilters(runs: AgentRun[], agents: BackgroundAgent[]): FilterGroupDef[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const agentOf = (r: any) => byId.get(r.agent_id);
  const duration = bounds(runs, (r) => r.duration_ms, 60_000);
  const credits = bounds(runs, (r) => r.credits_debited, 10);

  return [
    {
      key: 'general', label: 'General', icon: Bot,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search task, agent, error…',
          accessor: (r) => [r.input_data?.task_prompt, r.error_message, r.model_used, agentOf(r)?.name],
        },
        {
          key: 'agent', type: 'multi', label: 'Agent',
          options: agents.map((a) => ({
            value: a.id,
            label: a.name,
            count: runs.filter((r) => r.agent_id === a.id).length,
          })).sort((a, b) => a.label.localeCompare(b.label)),
          accessor: (r) => r.agent_id,
        },
        {
          key: 'agent_type', type: 'multi', label: 'Agent Type',
          options: optionsFromRows(runs, (r) => agentOf(r)?.agent_type, humanizeLabel),
          accessor: (r) => agentOf(r)?.agent_type,
        },
        {
          key: 'trigger_type', type: 'multi', label: 'Trigger Type',
          description: 'How the owning agent is scheduled — cron, event, chain or manual.',
          options: optionsFromRows(runs, (r) => agentOf(r)?.trigger_type, humanizeLabel),
          accessor: (r) => agentOf(r)?.trigger_type,
        },
        {
          key: 'enabled', type: 'bool', label: 'Agent Enabled',
          description: 'A disabled cron/event agent will never fire again.',
          trueLabel: 'Enabled agents', falseLabel: 'Disabled agents',
          accessor: (r) => !!agentOf(r)?.enabled,
        },
      ],
    },
    {
      key: 'execution', label: 'Execution', icon: Coins,
      fields: [
        {
          key: 'model', type: 'multi', label: 'Model',
          options: optionsFromRows(runs, (r) => r.model_used),
          accessor: (r) => r.model_used,
        },
        {
          key: 'duration_ms', type: 'range', label: 'Duration', unit: 'ms',
          min: duration.min, max: duration.max, accessor: (r) => r.duration_ms,
        },
        {
          key: 'credits_debited', type: 'range', label: 'Credits', unit: ' cr',
          min: credits.min, max: credits.max, step: 0.1, accessor: (r) => r.credits_debited,
        },
        {
          key: 'delegated_to_python', type: 'bool', label: 'Python Delegation',
          description: 'Runs longer than 25s are handed to the MIVAA backend.',
          trueLabel: 'Delegated to Python', falseLabel: 'Ran in the edge function',
          accessor: (r) => !!r.delegated_to_python,
        },
        {
          key: 'recovered', type: 'bool', label: 'Auto-recovery',
          trueLabel: 'Was recovered', falseLabel: 'Never recovered',
          accessor: (r) => (r.recovery_attempts ?? 0) > 0,
        },
        {
          key: 'chained', type: 'bool', label: 'Chained Run',
          description: 'Triggered by a parent agent completing.',
          trueLabel: 'Chained', falseLabel: 'Top-level',
          accessor: (r) => !!r.parent_run_id,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (r) => r.created_at },
        { key: 'started_at', type: 'dateRange', label: 'Last Run', accessor: (r) => r.started_at ?? r.created_at },
      ],
    },
  ];
}
