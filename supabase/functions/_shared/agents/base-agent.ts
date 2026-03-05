/**
 * Background Agent Framework — Base Agent Helpers
 *
 * Shared utilities for all agent runners:
 * - LangGraph runner builder (reuses the agent-chat StateGraph pattern, no SSE)
 * - Log helper (writes to agent_run_logs)
 * - Heartbeat helper (updates agent_runs.last_heartbeat)
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { AgentRunContext, AgentRunResult, LogLevel } from './types.ts';

// ── Log helper factory ────────────────────────────────────────────────────────

export function createLogHelper(supabase: SupabaseClient, runId: string) {
  return async function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await supabase.from('agent_run_logs').insert({
        run_id:  runId,
        level,
        message,
        data:    data ?? null,
      });
    } catch (err) {
      console.error('[base-agent] Failed to write log:', err);
    }
  };
}

// ── Heartbeat helper factory ──────────────────────────────────────────────────

export function createHeartbeatHelper(supabase: SupabaseClient, runId: string) {
  return async function heartbeat(): Promise<void> {
    try {
      await supabase
        .from('agent_runs')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', runId);
    } catch (err) {
      console.error('[base-agent] Failed to update heartbeat:', err);
    }
  };
}

// ── LangGraph runner ──────────────────────────────────────────────────────────

export interface LangGraphRunOptions {
  /** Anthropic API key (required for claude-* models) */
  anthropicApiKey:  string;
  /** OpenAI API key (required for gpt-* models) */
  openaiApiKey?:    string;
  /** Google AI key (required for gemini-* models) */
  googleApiKey?:    string;
  model:            string;
  systemPrompt:     string;
  tools:            any[];
  userMessage:      string;
  maxIterations?:   number;
  onLog?:           (level: LogLevel, message: string, data?: Record<string, unknown>) => void;
}

export interface LangGraphRunOutput {
  finalResponse:  string;
  inputTokens:    number;
  outputTokens:   number;
  iterations:     number;
  toolResults:    any[];
}

/**
 * Build an LLM instance based on the model name prefix.
 *  claude-*  → ChatAnthropic
 *  gpt-*     → ChatOpenAI
 *  gemini-*  → ChatGoogleGenerativeAI
 */
async function buildLLM(opts: LangGraphRunOptions): Promise<any> {
  const { model, anthropicApiKey, openaiApiKey, googleApiKey } = opts;

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    const { ChatOpenAI } = await import('npm:@langchain/openai');
    (globalThis as any).process = {
      env: { ...((globalThis as any).process?.env ?? {}), OPENAI_API_KEY: openaiApiKey ?? '' },
    };
    return new ChatOpenAI({ model, openAIApiKey: openaiApiKey, maxTokens: 4096 });
  }

  if (model.startsWith('gemini-')) {
    const { ChatGoogleGenerativeAI } = await import('npm:@langchain/google-genai');
    (globalThis as any).process = {
      env: { ...((globalThis as any).process?.env ?? {}), GOOGLE_API_KEY: googleApiKey ?? '' },
    };
    return new ChatGoogleGenerativeAI({ model, apiKey: googleApiKey, maxOutputTokens: 4096 });
  }

  // Default: Anthropic (claude-*)
  const { ChatAnthropic } = await import('npm:@langchain/anthropic');
  (globalThis as any).process = {
    env: { ...((globalThis as any).process?.env ?? {}), ANTHROPIC_API_KEY: anthropicApiKey },
  };
  return new ChatAnthropic({ model, anthropicApiKey, maxTokens: 4096 });
}

export async function runLangGraphAgent(opts: LangGraphRunOptions): Promise<LangGraphRunOutput> {
  const {
    model,
    systemPrompt,
    tools,
    userMessage,
    maxIterations = 8,
    onLog,
  } = opts;

  const { StateGraph, Annotation, END, START }                 = await import('npm:@langchain/langgraph');
  const { BaseMessage, HumanMessage, AIMessage, ToolMessage }  = await import('npm:@langchain/core/messages');

  const llm = await buildLLM(opts);

  // State annotation
  const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer:  (prev, next) => [...prev, ...next],
      default:  () => [],
    }),
    iteration: Annotation<number>({
      reducer: (_, next) => next,
      default: () => 0,
    }),
    inputTokens: Annotation<number>({
      reducer: (prev, next) => prev + next,
      default: () => 0,
    }),
    outputTokens: Annotation<number>({
      reducer: (prev, next) => prev + next,
      default: () => 0,
    }),
    finalResponse: Annotation<string | null>({
      reducer: (_, next) => next,
      default: () => null,
    }),
    toolResults: Annotation<any[]>({
      reducer: (prev, next) => [...prev, ...next],
      default: () => [],
    }),
  });

  type AgentStateType = typeof AgentState.State;

  // Agent node
  async function agentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
    const iteration = state.iteration + 1;
    onLog?.('debug', `Agent iteration ${iteration}/${maxIterations}`);

    const modelWithTools = tools.length > 0 ? llm.bindTools(tools) : llm;
    const response = await modelWithTools.invoke(state.messages, { system: systemPrompt });

    const usage        = (response as any).response_metadata?.usage;
    const inputTokens  = usage?.input_tokens  || 0;
    const outputTokens = usage?.output_tokens || 0;

    if (!(response as any).tool_calls?.length) {
      const textContent = extractText(response.content);
      return { messages: [response], iteration, inputTokens, outputTokens, finalResponse: textContent };
    }

    return { messages: [response], iteration, inputTokens, outputTokens };
  }

  // Tools node
  async function toolsNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
    const lastMsg   = state.messages[state.messages.length - 1] as any;
    const toolCalls = lastMsg.tool_calls || [];
    const toolMsgs: any[] = [];
    const results:  any[] = [];

    for (const tc of toolCalls) {
      onLog?.('info', `Calling tool: ${tc.name}`, { args: tc.args });
      const toolFn = tools.find((t: any) => t.name === tc.name);
      if (!toolFn) {
        toolMsgs.push(new ToolMessage({ tool_call_id: tc.id, content: `Tool "${tc.name}" not found.` }));
        continue;
      }
      try {
        const result = await toolFn.invoke(tc.args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        toolMsgs.push(new ToolMessage({ tool_call_id: tc.id, content: resultStr }));
        results.push({ tool: tc.name, args: tc.args, result });
        onLog?.('debug', `Tool ${tc.name} completed`);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        onLog?.('warn', `Tool ${tc.name} failed: ${errMsg}`);
        toolMsgs.push(new ToolMessage({ tool_call_id: tc.id, content: `Error: ${errMsg}` }));
      }
    }

    return { messages: toolMsgs, toolResults: results };
  }

  // Router
  function shouldContinue(state: AgentStateType): 'tools' | typeof END {
    if (state.finalResponse !== null) return END;
    if (state.iteration >= maxIterations) return END;
    const last = state.messages[state.messages.length - 1] as any;
    if (last?.tool_calls?.length > 0) return 'tools';
    return END;
  }

  const graph = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', [END]: END })
    .addEdge('tools', 'agent')
    .compile();

  const initialMessages: BaseMessage[] = [new HumanMessage(userMessage)];
  const finalState = await graph.invoke({ messages: initialMessages });

  return {
    finalResponse: finalState.finalResponse || extractText(finalState.messages[finalState.messages.length - 1]?.content) || '',
    inputTokens:   finalState.inputTokens,
    outputTokens:  finalState.outputTokens,
    iterations:    finalState.iteration,
    toolResults:   finalState.toolResults,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b?.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(content ?? '');
}
