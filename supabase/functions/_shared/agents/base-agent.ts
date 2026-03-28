/**
 * Background Agent Framework — Base Agent Helpers
 *
 * Shared utilities for all agent runners:
 * - Log helper    (writes to agent_run_logs)
 * - Heartbeat helper (updates agent_runs.last_heartbeat)
 *
 * The LangGraph runner + types live in ../langgraph-core.ts.
 * They are re-exported here so existing agent imports keep working.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { LogLevel } from './types.ts';

// Re-export LangGraph utilities so agents that import from './base-agent.ts' continue to work.
export type { LangGraphRunOptions, LangGraphRunOutput } from '../langgraph-core.ts';
export { runLangGraphAgent, buildLLM, extractTextContent } from '../langgraph-core.ts';

// ── Log helper factory ────────────────────────────────────────────────────────

export function createLogHelper(supabase: SupabaseClient, runId: string) {
  return async function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    try {
      const { error } = await supabase.from('agent_run_logs').insert({
        run_id:  runId,
        level,
        message,
        data:    data ?? null,
      });
      if (error) {
        console.error('[base-agent] Failed to write log:', error.message);
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      console.error('[base-agent] Failed to write log (unexpected):', err);
      return { ok: false };
    }
  };
}

// ── Heartbeat helper factory ──────────────────────────────────────────────────

export function createHeartbeatHelper(supabase: SupabaseClient, runId: string) {
  return async function heartbeat(): Promise<{ ok: boolean }> {
    try {
      const { error } = await supabase
        .from('agent_runs')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', runId);
      if (error) {
        // Log at error level — a missed heartbeat means auto-recovery may re-dispatch
        // the agent thinking it is stuck, causing duplicate runs.
        console.error('[base-agent] Failed to update heartbeat:', error.message);
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      console.error('[base-agent] Failed to update heartbeat (unexpected):', err);
      return { ok: false };
    }
  };
}
