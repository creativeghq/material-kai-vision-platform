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

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LogLevel } from './types.ts';
import { CancelledError } from './types.ts';

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

// ── ai_usage_logs writer ─────────────────────────────────────────────────────
// Background agents call Anthropic / OpenAI / Gemini through runLangGraphAgent
// but historically never wrote to ai_usage_logs, so the Operations dashboard
// underreported background-agent spend by 100%. Helper centralizes the insert
// and is fire-and-forget — never blocks or breaks the agent's hot path.
//
// Pricing: callers pass the model name; the helper looks up the per-1M-token
// cost from a small static table. Unknown models are logged at $0 to avoid
// guessing — admin can backfill via the model-pricing curation tool.
const MODEL_USD_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':         { input: 1.0,  output: 5.0  },
  'claude-sonnet-4-6':        { input: 3.0,  output: 15.0 },
  'claude-opus-4-8':          { input: 15.0, output: 75.0 },
  'gpt-4o-mini':              { input: 0.15, output: 0.6  },
  'gpt-4o':                   { input: 2.5,  output: 10.0 },
  'gemini-2.0-flash':         { input: 0.075, output: 0.3 },
};

export async function logAgentAiUsage(
  supabase: SupabaseClient,
  args: {
    runId:            string;
    agentId:          string;
    agentType:        string;
    userId?:          string | null;
    workspaceId?:     string | null;
    model:            string;
    inputTokens:      number;
    outputTokens:     number;
    operationType?:   string;
    metadata?:        Record<string, unknown>;
  },
): Promise<void> {
  try {
    const pricing = MODEL_USD_PER_M_TOKENS[args.model] ?? { input: 0, output: 0 };
    const inputCost  = (args.inputTokens  / 1_000_000) * pricing.input;
    const outputCost = (args.outputTokens / 1_000_000) * pricing.output;
    const rawCost    = inputCost + outputCost;
    const provider   = args.model.startsWith('claude-') ? 'anthropic'
      : args.model.startsWith('gpt-') || args.model.startsWith('o1') || args.model.startsWith('o3') ? 'openai'
      : args.model.startsWith('gemini-') ? 'google'
      : 'unknown';

    const { error } = await supabase.from('ai_usage_logs').insert({
      user_id:          args.userId ?? null,
      operation_type:   args.operationType ?? `background_agent_${args.agentType}`,
      model_name:       args.model,
      api_provider:     provider,
      input_tokens:     args.inputTokens,
      output_tokens:    args.outputTokens,
      input_cost_usd:   inputCost,
      output_cost_usd:  outputCost,
      raw_cost_usd:     rawCost,
      markup_multiplier: 1,
      billed_cost_usd:  rawCost,
      credits_debited:  0,
      metadata: {
        ...(args.metadata ?? {}),
        feature:      'background_agent',
        agent_id:     args.agentId,
        agent_type:   args.agentType,
        run_id:       args.runId,
        workspace_id: args.workspaceId ?? null,
      },
      created_at: new Date().toISOString(),
    });
    if (error) console.warn('[base-agent] ai_usage_logs insert failed (non-blocking):', error.message);
  } catch (err) {
    console.warn('[base-agent] ai_usage_logs insert threw (non-blocking):', err instanceof Error ? err.message : err);
  }
}

// ── Heartbeat helper factory ──────────────────────────────────────────────────

export function createHeartbeatHelper(supabase: SupabaseClient, runId: string) {
  return async function heartbeat(): Promise<{ ok: boolean }> {
    try {
      // Combined update+read: bump heartbeat and read status in one round-trip.
      // If the admin dashboard (or anyone) flipped status to 'cancelled', we throw
      // CancelledError so the runner unwinds cleanly instead of pushing more work.
      const { data, error } = await supabase
        .from('agent_runs')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', runId)
        .select('status')
        .single();
      if (error) {
        console.error('[base-agent] Failed to update heartbeat:', error.message);
        return { ok: false };
      }
      if (data?.status === 'cancelled') {
        throw new CancelledError(runId);
      }
      return { ok: true };
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      console.error('[base-agent] Failed to update heartbeat (unexpected):', err);
      return { ok: false };
    }
  };
}
