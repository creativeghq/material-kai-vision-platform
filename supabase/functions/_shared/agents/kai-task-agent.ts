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
import { runLangGraphAgent } from './base-agent.ts';

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

function makeKBSearchTool(supabase: any, workspaceId: string | null) {
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
    invoke: async ({ query, top_k = 5 }: { query: string; top_k?: number }) => {
      const { data, error } = await supabase.rpc('search_knowledge_base', {
        query_text: query,
        workspace_id_filter: workspaceId,
        match_count: top_k,
      });
      if (error) throw error;
      return data ?? [];
    },
  };
}

// ── KAI Task Agent implementation ─────────────────────────────────────────────

export class KaiTaskAgent implements AgentRunner {
  readonly agentType    = 'kai-task';
  readonly name         = 'KAI Background Task';
  readonly description  = 'Executes any natural-language task dispatched from KAI chat — research, enrichment, analysis, and more.';
  readonly defaultTools = ['material_search', 'knowledge_base_search', 'web_search'];
  readonly defaultModel = 'claude-sonnet-4-5-20250929';

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
      makeKBSearchTool(supabase, workspaceId),
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

    const result = await runLangGraphAgent({
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

    await log('info', `KAI background task completed`, {
      iterations:    result.iterations,
      input_tokens:  result.inputTokens,
      output_tokens: result.outputTokens,
    });

    return {
      success:       true,
      output:        { report: result.finalResponse, tool_calls: result.toolResults.length },
      inputTokens:   result.inputTokens,
      outputTokens:  result.outputTokens,
      creditsDebited: 0,
      triggerChain:  false,
    };
  }
}
