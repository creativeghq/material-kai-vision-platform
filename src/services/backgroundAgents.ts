/**
 * Background Agent Service
 *
 * Supabase queries for the background agent monitoring dashboard.
 * All agent execution is triggered from the KAI chat (dispatch_background_task tool)
 * or automatically by cron/event triggers — not from this service.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentTriggerType = 'cron' | 'event' | 'manual' | 'chain';
export type AgentRunStatus   = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type LogLevel         = 'debug' | 'info' | 'warn' | 'error';

export interface BackgroundAgent {
  id:                     string;
  name:                   string;
  description:            string | null;
  agent_type:             string;
  trigger_type:           AgentTriggerType;
  schedule:               string | null;
  event_type:             string | null;
  parent_agent_id:        string | null;
  model:                  string;
  system_prompt_override: string | null;
  config:                 Record<string, unknown>;
  enabled:                boolean;
  workspace_id:           string | null;
  created_by:             string | null;
  created_at:             string;
  updated_at:             string;
  last_run_at:            string | null;
  last_run_status:        string | null;
  run_count:              number;
}

export interface AgentRun {
  id:                  string;
  agent_id:            string;
  status:              AgentRunStatus;
  triggered_by:        string;
  trigger_event_type:  string | null;
  input_data:          Record<string, unknown>;
  output_data:         Record<string, unknown> | null;
  error_message:       string | null;
  model_used:          string | null;
  input_tokens:        number;
  output_tokens:       number;
  credits_debited:     number;
  started_at:          string | null;
  completed_at:        string | null;
  duration_ms:         number | null;
  last_heartbeat:      string;
  recovery_attempts:   number;
  delegated_to_python: boolean;
  python_job_id:       string | null;
  parent_run_id:       string | null;
  workspace_id:        string | null;
  created_at:          string;
}

export interface AgentRunLog {
  id:         string;
  run_id:     string;
  level:      LogLevel;
  message:    string;
  data:       Record<string, unknown> | null;
  created_at: string;
}

// ── Agent queries ─────────────────────────────────────────────────────────────

export async function listAgents(): Promise<BackgroundAgent[]> {
  const { data, error } = await supabase
    .from('background_agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BackgroundAgent[];
}

// ── Run queries ───────────────────────────────────────────────────────────────

export async function listRuns(agentId: string, limit = 20): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AgentRun[];
}

/** Server-side query across all agents — one round-trip, real ordering. */
export async function listAllRuns(limit = 100): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AgentRun[];
}

/**
 * A run is "stuck" when it's still processing but hasn't heartbeat in STUCK_MS.
 * The auto-recovery-cron uses the same threshold before re-dispatching.
 */
export const STUCK_MS = 8 * 60 * 1000; // 8 min

export function isStuck(run: AgentRun): boolean {
  if (run.status !== 'processing') return false;
  const hbAge = Date.now() - new Date(run.last_heartbeat).getTime();
  return hbAge > STUCK_MS;
}

export async function cancelRun(runId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_runs')
    .update({ status: 'cancelled' })
    .eq('id', runId)
    .in('status', ['pending', 'processing']);
  if (error) throw error;
}

// ── Log queries ───────────────────────────────────────────────────────────────

export async function listLogs(runId: string, limit = 200): Promise<AgentRunLog[]> {
  const { data, error } = await supabase
    .from('agent_run_logs')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AgentRunLog[];
}

export function subscribeToLogs(
  runId: string,
  onLog: (log: AgentRunLog) => void,
): () => void {
  const channel = supabase
    .channel(`agent_run_logs:${runId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'agent_run_logs', filter: `run_id=eq.${runId}` },
      (payload) => onLog(payload.new as AgentRunLog),
    )
    .subscribe();
  return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 60000)  return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function statusColor(status: AgentRunStatus): string {
  switch (status) {
    case 'completed':  return 'text-green-600 bg-green-50';
    case 'processing': return 'text-blue-600 bg-blue-50';
    case 'pending':    return 'text-yellow-600 bg-yellow-50';
    case 'failed':     return 'text-red-600 bg-red-50';
    case 'cancelled':  return 'text-gray-500 bg-gray-50';
  }
}

export function logLevelColor(level: LogLevel): string {
  switch (level) {
    case 'error': return 'text-red-500';
    case 'warn':  return 'text-yellow-500';
    case 'info':  return 'text-blue-500';
    case 'debug': return 'text-gray-400';
  }
}
