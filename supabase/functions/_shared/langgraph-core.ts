/**
 * LangGraph Core — shared graph utilities
 *
 * Single source of truth for:
 * - extractTextContent  : convert Claude content (string | block[]) → plain text
 * - LangGraphRunOptions : options for the self-contained background agent runner
 * - LangGraphRunOutput  : return shape of runLangGraphAgent
 * - buildLLM            : factory for ChatAnthropic / ChatOpenAI / ChatGoogleGenerativeAI
 * - runLangGraphAgent   : StateGraph runner used by all background agents
 *
 * Import path for _shared/agents/*  → '../langgraph-core.ts'
 * Import path for agent-chat/       → '../_shared/langgraph-core.ts'
 */

import type { LogLevel } from './agents/types.ts';
// Type-only — erased at compile time, so the lazy `npm:` imports below still do the actual
// loading. Without it `BaseMessage` is only the runtime binding destructured inside the
// function, and using it as a type is an error the edge typecheck gate reports.
import type { BaseMessage as BaseMessageT } from 'npm:@langchain/core@1.2.9/messages';

// ── Text extraction ────────────────────────────────────────────────────────────

/**
 * Extract plain text from a Claude API response content value.
 * Handles: string, content-block array, {text} object, and unknown fallback.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (typeof b === 'string') return b;
        if (b?.type === 'text') return b.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object' && 'text' in (content as any)) {
    return (content as any).text;
  }
  return String(content ?? '');
}

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── LLM factory ───────────────────────────────────────────────────────────────

/**
 * Build an LLM instance based on the model name prefix.
 *  claude-*  → ChatAnthropic
 *  gpt-* / o1* / o3* → ChatOpenAI
 *  gemini-*  → ChatGoogleGenerativeAI
 */
export async function buildLLM(opts: LangGraphRunOptions): Promise<any> {
  const { model, anthropicApiKey, openaiApiKey, googleApiKey } = opts;

  // Merge into the existing process.env shim rather than replacing it wholesale.
  // Replacing the entire object would wipe keys set by other concurrent agents.
  const procEnv: Record<string, string> = (globalThis as any).process?.env ?? {};
  if (!(globalThis as any).process) {
    (globalThis as any).process = { env: procEnv };
  }

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    const { ChatOpenAI } = await import('npm:@langchain/openai@1.5.8');
    procEnv.OPENAI_API_KEY = openaiApiKey ?? '';
    return new ChatOpenAI({ model, openAIApiKey: openaiApiKey, maxTokens: 4096 });
  }

  if (model.startsWith('gemini-')) {
    const { ChatGoogleGenerativeAI } = await import('npm:@langchain/google-genai@2.3.0');
    procEnv.GOOGLE_API_KEY = googleApiKey ?? '';
    return new ChatGoogleGenerativeAI({ model, apiKey: googleApiKey, maxOutputTokens: 4096 });
  }

  // Default: Anthropic (claude-*)
  const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.5.6');
  procEnv.ANTHROPIC_API_KEY = anthropicApiKey;
  return new ChatAnthropic({ model, anthropicApiKey, maxTokens: 4096 });
}

// ── Self-contained background agent runner ────────────────────────────────────

/**
 * Run a LangGraph StateGraph agent loop.
 * Used by all background agents (product-enrichment, material-tagger, kai-task, etc.).
 * No SSE streaming — progress is reported via onLog callbacks.
 */
export async function runLangGraphAgent(opts: LangGraphRunOptions): Promise<LangGraphRunOutput> {
  const {
    model,
    systemPrompt,
    tools,
    userMessage,
    maxIterations = 8,
    onLog,
  } = opts;

  const { StateGraph, Annotation, END, START }     = await import('npm:@langchain/langgraph@1.4.12');
  const { HumanMessage, SystemMessage, ToolMessage } = await import('npm:@langchain/core@1.2.9/messages');

  const llm = await buildLLM(opts);

  // State annotation
  const AgentState = Annotation.Root({
    messages: Annotation<BaseMessageT[]>({
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
    // The system prompt travels as the FIRST message, never as a call option.
    // `ChatAnthropic.invocationParams()` builds an allowlist and drops anything it does not
    // recognise, and the Anthropic `system` field is read from `messages[0]` alone — so
    // `invoke(msgs, { system })`, which is what this used to be, sent the model nothing at
    // all. Every background agent ran without its instructions and still returned plausible
    // text, so nothing ever failed. The same defect was live in agent-chat.
    //
    // Anthropic gets the prompt as a cached block (one breakpoint covers tools + system,
    // which is the whole stable prefix); the other providers get a plain string, because
    // `cache_control` is an Anthropic-only key and passing it to them is not defined.
    const systemMessage = model.startsWith('claude-')
      ? new SystemMessage({
          content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        })
      : new SystemMessage(systemPrompt);
    const response = await modelWithTools.invoke([systemMessage, ...state.messages]);

    const usage        = (response as any).response_metadata?.usage;
    const inputTokens  = usage?.input_tokens  || 0;
    const outputTokens = usage?.output_tokens || 0;

    if (!(response as any).tool_calls?.length) {
      return {
        messages:      [response],
        iteration,
        inputTokens,
        outputTokens,
        finalResponse: extractTextContent(response.content),
      };
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
        const result    = await toolFn.invoke(tc.args);
        // Use a replacer to safely handle circular references / BigInt values
        let resultStr: string;
        if (typeof result === 'string') {
          resultStr = result;
        } else {
          try {
            resultStr = JSON.stringify(result);
          } catch {
            resultStr = String(result);
          }
        }
        toolMsgs.push(new ToolMessage({ tool_call_id: tc.id, content: resultStr }));
        results.push({ tool: tc.name, args: tc.args, result });
        onLog?.('debug', `Tool ${tc.name} completed`);
      } catch (err: any) {
        const errMsg = err?.message || (err instanceof Error ? err.toString() : String(err));
        // Use 'error' level — tool failures are unexpected and must not be buried as warnings
        onLog?.('error', `Tool ${tc.name} failed: ${errMsg}`);
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

  const initialMessages: BaseMessageT[] = [new HumanMessage(userMessage)];

  // Guard against agents that get stuck in a tool loop or hit a slow model.
  // 5 minutes is generous for background agents; adjust via maxIterations if needed.
  // Capture the timer id so we can clear it once the graph resolves first —
  // otherwise the (rejecting) timeout keeps the Deno isolate alive past the
  // request lifetime, which on hot agents shows up as leaked handles + a
  // background "Unhandled rejection" log every 5 minutes.
  const TIMEOUT_MS = 5 * 60 * 1000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`runLangGraphAgent timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });

  let finalState: any;
  try {
    finalState = await Promise.race([
      graph.invoke({ messages: initialMessages }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }

  return {
    finalResponse: finalState.finalResponse
      || extractTextContent(finalState.messages[finalState.messages.length - 1]?.content)
      || '',
    inputTokens:   finalState.inputTokens,
    outputTokens:  finalState.outputTokens,
    iterations:    finalState.iteration,
    toolResults:   finalState.toolResults,
  };
}
