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
 *  gemini-*  → ChatGoogleGenerativeAI
 *
 * There is no OpenAI branch. It existed until 2026-08-23 and was unreachable the whole
 * time: every model in `agent_usage_logs` and every `background_agents.model` row is a
 * Claude one, and the branch pulled a whole LangChain OpenAI package into the bundle to
 * serve a prefix nothing ever asked for.
 *
 * (The package name is written out here rather than as an import specifier on purpose —
 * `langchainVersionPins` scans this tree for unpinned `@langchain` specifiers and a
 * comment quoting one reads to it exactly like an import.)
 */
/**
 * NEVER write to `process.env` here — on Supabase edge it is not a shim you can merge into.
 *
 * This used to do `procEnv.ANTHROPIC_API_KEY = anthropicApiKey` on the theory that
 * `globalThis.process.env` is a plain object it could top up. Under Deno's node-compat layer
 * `process.env` is a live proxy backed by `Deno.env`, and `Deno.env.set` is unavailable on this
 * runtime — so the assignment threw `NotSupported: The operation is not supported` and took
 * `buildLLM` with it. EVERY background agent died in ~490 ms, before a single token was spent:
 * `dispatch_background_task` returned `refused_500`, and the chat agent that dispatched it was
 * told (correctly) that nothing was running. `secrets-bootstrap` logs this same constraint on
 * every cold start; this file was the one place that had not read the message.
 *
 * The writes were redundant on top of being fatal: both constructors below take the key as an
 * explicit argument, so nothing ever read the env var they were setting.
 */
export async function buildLLM(opts: LangGraphRunOptions): Promise<any> {
  const { model, anthropicApiKey, googleApiKey } = opts;

  if (model.startsWith('gemini-')) {
    const { ChatGoogleGenerativeAI } = await import('npm:@langchain/google-genai@2.3.0');
    return new ChatGoogleGenerativeAI({ model, apiKey: googleApiKey, maxOutputTokens: 4096 });
  }

  // Default: Anthropic (claude-*).
  //
  // No `temperature` — and do not add one. Sampling parameters were REMOVED on Opus 4.7+ and
  // Sonnet 5; the API returns 400 and langchain-anthropic rejects it client-side before the
  // request is even sent. See `assertNoSamplingParams` in the guard test.
  const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.5.6');
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

  /**
   * Wall-clock deadline for the TOOL LOOP, leaving room to write the answer.
   *
   * The loop used to be bounded only by `maxIterations`, with a 5-minute REJECTING race around
   * the whole thing. Both are the wrong shape for real research work:
   *
   *  - A rejection throws away everything the run learned. The run is marked failed and the
   *    tool results — which cost real money and minutes — are gone.
   *  - The rejection frequently never fires at all, because the platform kills the isolate
   *    first. Then nothing marks the run terminal and it sits in `processing` forever. There is
   *    a `pending` run in this database from 2026-07-31 that nothing has ever reaped.
   *
   * So the deadline is checked in the router instead, and crossing it routes to a wrap-up turn
   * that reports what was actually found. Same reasoning as agent-chat's `finalize` node, for
   * the same reason: a partial answer that says it is partial beats a clean failure.
   */
  const LOOP_DEADLINE_MS = 3.5 * 60 * 1000;
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > LOOP_DEADLINE_MS;

  /**
   * Last turn of a run that ran out of iterations or time: write up the partial result.
   * No tools bound — there is nothing left to call, and binding them invites a tool_use block
   * that can never be executed.
   */
  async function finalizeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
    onLog?.('info', 'Wrapping up with partial findings', {
      iterations: state.iteration,
      elapsed_ms: Date.now() - startedAt,
      tool_results: state.toolResults.length,
    });
    const wrapUp = new HumanMessage(
      'You are out of time for this task, so you cannot call any more tools. Do NOT apologise '
      + 'and do NOT ask a question. Write up what you actually established from the tool results '
      + 'in this conversation:\n'
      + '1. The findings themselves — every concrete name, URL, number and record you retrieved.\n'
      + '2. What is still outstanding, specifically, and how far you got.\n'
      + '3. Any tool that failed and what it returned.\n'
      + 'Mark anything you could not verify as unverified. Never present a partial list as '
      + 'complete, and never fill a gap from your own knowledge.',
    );
    try {
      const response = await llm.invoke([new SystemMessage(systemPrompt), ...state.messages, wrapUp]);
      const usage = (response as any).response_metadata?.usage;
      return {
        messages: [response],
        inputTokens: usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
        finalResponse: extractTextContent(response.content),
      };
    } catch (err) {
      // The wrap-up failing must not take the run down — report what we know without it.
      onLog?.('error', `Finalize turn failed: ${(err as Error).message}`);
      return {
        finalResponse:
          `The task ran out of time after ${state.iteration} iterations and `
          + `${state.toolResults.length} tool call(s), and the summary turn also failed. `
          + 'Nothing here is a verified result — re-run with a narrower scope.',
      };
    }
  }

  // Router
  function shouldContinue(state: AgentStateType): 'tools' | 'finalize' | typeof END {
    if (state.finalResponse !== null) return END;
    // Out of budget — go and report the partial result rather than discarding it. Only worth a
    // wrap-up when there is something to report; with no tool results there is nothing to save.
    if (state.iteration >= maxIterations || outOfTime()) {
      return state.toolResults.length > 0 ? 'finalize' : END;
    }
    const last = state.messages[state.messages.length - 1] as any;
    if (last?.tool_calls?.length > 0) return 'tools';
    return END;
  }

  const graph = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', finalize: 'finalize', [END]: END })
    .addEdge('tools', 'agent')
    // Terminal by construction: finalize binds no tools and always sets finalResponse.
    .addEdge('finalize', END)
    .compile();

  const initialMessages: BaseMessageT[] = [new HumanMessage(userMessage)];

  // Backstop only. `LOOP_DEADLINE_MS` above is the deadline that actually governs the run and it
  // exits GRACEFULLY, so this race should never win — it exists for the case the deadline cannot
  // catch: a single model or tool call that hangs past it inside one node. Kept above the loop
  // deadline plus a wrap-up turn so it does not pre-empt the graceful path.
  //
  // Capture the timer id so we can clear it once the graph resolves first — otherwise the
  // (rejecting) timeout keeps the Deno isolate alive past the request lifetime, which on hot
  // agents shows up as leaked handles + a background "Unhandled rejection" log.
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
