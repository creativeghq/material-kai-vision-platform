/**
 * KAI Task Agent
 *
 * General-purpose background agent that executes any natural-language task
 * dispatched from the KAI chat interface.
 *
 * Tools available (same as KAI admin toolset):
 *   - material_search     — 7-vector fusion search
 *   - knowledge_base_search
 *   - web_search          — Anthropic built-in web search
 *
 * The agent receives a task_prompt written by the user plus optional
 * context (conversation history excerpt, workspace_id, etc.) and runs
 * a full LangGraph loop until it produces a final report.
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';
import { runLangGraphAgent, logAgentAiUsage } from './base-agent.ts';
import { reserveCredits, refundCredits, settleCredits } from '../credit-reserve.ts';

// Up-front credit ceiling reserved before the Opus loop, then settled down to the actual
// token-based cost after the run (surplus refunded, overage charged best-effort). Admin-triggered,
// but the spend is real (Opus 4.8, up to 20 iterations) so it must be metered — previously $0.
const KAI_TASK_CREDIT_CEILING = 100;

// Per-1M-token USD pricing for settling the actual cost (mirrors base-agent's MODEL_USD_PER_M_TOKENS).
// Unknown models default to Opus (the most expensive) so we never silently undercharge.
const KAI_TASK_MODEL_PRICE: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 1.0,  output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0,  output: 15.0 },
  'claude-opus-4-8':   { input: 15.0, output: 75.0 },
};

// ── Inline tool definitions ───────────────────────────────────────────────────
// (Minimal copies — no SSE streaming, just value return)

function makeMaterialSearchTool(mivaaGatewayUrl: string, mivaaApiKey: string, workspaceId: string | null) {
  return {
    name: 'material_search',
    description: 'Search the product/material database using semantic + visual search. Returns matching products with scores.',
    schema: {
      type: 'object',
      properties: {
        query:   { type: 'string', description: 'Natural language search query' },
        top_k:   { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    invoke: async ({ query, top_k = 10 }: { query: string; top_k?: number }) => {
      const params = new URLSearchParams({ query, top_k: String(top_k) });
      if (workspaceId) params.set('workspace_id', workspaceId);
      const res = await fetch(`${mivaaGatewayUrl}/api/rag/search?${params}`, {
        headers: { Authorization: `Bearer ${mivaaApiKey}` },
      });
      if (!res.ok) throw new Error(`material_search failed: ${res.status}`);
      const json = await res.json();
      return json?.results ?? json;
    },
  };
}

function makeKBSearchTool(
  mivaaGatewayUrl: string,
  mivaaApiKey: string | undefined,
  workspaceId: string | null,
  agentId: string,
) {
  return {
    name: 'knowledge_base_search',
    description: 'Search the knowledge base for relevant documents, articles, and product info.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        top_k: { type: 'number' },
      },
      required: ['query'],
    },
    // Routes through MIVAA's 7-vector KB search (the same endpoint the chat
    // agents use) rather than a bespoke RPC. caller='agent' + agent_id lets
    // MIVAA enforce per-doc allowed_agents allow-lists for this background agent.
    invoke: async ({ query, top_k = 5 }: { query: string; top_k?: number }) => {
      const resp = await fetch(`${mivaaGatewayUrl}/api/rag/search/knowledge-base`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(mivaaApiKey ? { Authorization: `Bearer ${mivaaApiKey}` } : {}),
        },
        body: JSON.stringify({
          query,
          workspace_id: workspaceId,
          search_types: ['kb_docs'],
          top_k,
          caller: 'agent',
          agent_id: agentId,
        }),
      });
      if (!resp.ok) {
        throw new Error(`Knowledge base search failed: ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      return data?.chunks ?? [];
    },
  };
}

// ── KAI Task Agent implementation ─────────────────────────────────────────────

export class KaiTaskAgent implements AgentRunner {
  readonly agentType    = 'kai-task';
  readonly name         = 'KAI Background Task';
  readonly description  = 'Executes any natural-language task dispatched from KAI chat — research, enrichment, analysis, and more.';
  readonly defaultTools = ['material_search', 'knowledge_base_search', 'web_search'];
  readonly defaultModel = 'claude-opus-4-8';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const {
      supabase, agentConfig, run, input,
      workspaceId, mivaaGatewayUrl, mivaaApiKey, anthropicApiKey,
      log, heartbeat,
    } = ctx;

    const taskPrompt     = String(input.task_prompt ?? '');
    const contextSnippet = String(input.context_snippet ?? '');
    const model          = String(input.model_override ?? agentConfig.model ?? this.defaultModel);

    if (!taskPrompt) {
      return { success: false, output: { error: 'No task_prompt provided' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    await log('info', `KAI background task started`, { task_preview: taskPrompt.slice(0, 200), model });

    // ── Build tools ────────────────────────────────────────────────────────────
    const tools: any[] = [
      makeMaterialSearchTool(mivaaGatewayUrl, mivaaApiKey, workspaceId),
      makeKBSearchTool(mivaaGatewayUrl, mivaaApiKey, workspaceId, this.agentType),
    ];

    // ── System prompt ──────────────────────────────────────────────────────────
    const systemPrompt = agentConfig.system_prompt_override || [
      'You are KAI, a material intelligence agent working on a background task assigned by an admin user.',
      'Complete the task thoroughly, use your tools as needed, and produce a detailed structured report.',
      'Be precise: cite data, counts, and sources in your output.',
      contextSnippet ? `\n## Context from user session\n${contextSnippet}` : '',
    ].join('\n');

    // ── Run LangGraph loop ─────────────────────────────────────────────────────
    const openaiApiKey  = Deno.env.get('OPENAI_API_KEY')  ?? '';
    const googleApiKey  = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') ?? '';

    // Heartbeat every ~10 iterations via onLog callback
    let iterationsSinceHeartbeat = 0;
    const onLog = async (level: any, message: string, data?: Record<string, unknown>) => {
      await log(level, message, data);
      iterationsSinceHeartbeat++;
      if (iterationsSinceHeartbeat >= 3) {
        await heartbeat();
        iterationsSinceHeartbeat = 0;
      }
    };

    // ── Meter the run (invariant #10) ──────────────────────────────────────────
    // Reserve a ceiling before the Opus loop; block if the triggering admin can't afford it.
    // Keyed on the agent's creator + their workspace pool. Settled to actual cost after the run.
    const billUserId = (agentConfig.created_by ?? undefined) as string | undefined;
    const billWorkspaceId = (agentConfig.workspace_id ?? undefined) as string | undefined;
    const reserve = await reserveCredits(supabase, billUserId, billWorkspaceId, KAI_TASK_CREDIT_CEILING, 'kai_task_agent');
    if (!reserve.ok) {
      return {
        success: false,
        output: { error: reserve.message || 'Insufficient credits to run this task' },
        inputTokens: 0, outputTokens: 0, creditsDebited: 0,
      };
    }

    let result: Awaited<ReturnType<typeof runLangGraphAgent>>;
    try {
      result = await runLangGraphAgent({
        anthropicApiKey,
        openaiApiKey,
        googleApiKey,
        model,
        systemPrompt,
        tools,
        userMessage:   taskPrompt,
        maxIterations: Number(agentConfig.config?.max_iterations ?? 20),
        onLog,
      });
    } catch (err) {
      // Refund the full reserved ceiling — the run produced nothing billable.
      await refundCredits(supabase, billUserId, billWorkspaceId, KAI_TASK_CREDIT_CEILING, 'kai_task_agent', { reason: 'agent_run_failed' });
      throw err;
    }

    await log('info', `KAI background task completed`, {
      iterations:    result.iterations,
      input_tokens:  result.inputTokens,
      output_tokens: result.outputTokens,
    });

    if (result.inputTokens > 0 || result.outputTokens > 0) {
      logAgentAiUsage(supabase, {
        runId:        run.id,
        agentId:      agentConfig.id,
        agentType:    this.agentType,
        userId:       agentConfig.created_by,
        workspaceId:  agentConfig.workspace_id,
        model,
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
        metadata: {
          iterations:    result.iterations,
          tool_call_count: result.toolResults.length,
        },
      });
    }

    // Settle the reserve against the actual token-based cost: refund the unused surplus (or charge
    // the overage best-effort when a long run exceeded the ceiling).
    const price = KAI_TASK_MODEL_PRICE[model] ?? { input: 15, output: 75 };
    const rawUsd = (result.inputTokens / 1_000_000) * price.input + (result.outputTokens / 1_000_000) * price.output;
    const actualCredits = Math.max(1, Math.ceil(rawUsd * 1.5 * 100)); // ×1.5 markup, 1 credit = $0.01
    await settleCredits(supabase, billUserId, billWorkspaceId, KAI_TASK_CREDIT_CEILING, actualCredits, 'kai_task_agent', { run_id: run.id });

    return {
      success:       true,
      output:        { report: result.finalResponse, tool_calls: result.toolResults.length },
      inputTokens:   result.inputTokens,
      outputTokens:  result.outputTokens,
      creditsDebited: actualCredits,
      triggerChain:  false,
    };
  }
}
