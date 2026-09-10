/** LangGraph Core — shared graph utilities */

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
 */
/** NEVER write to `process.env` here — on Supabase edge it is not a shim you can merge into. */
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
    const systemMessage = model.startsWith('claude-')
      ? new SystemMessage({
          content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        })
      : new SystemMessage(systemPrompt);
    const response = await modelWithTools.invoke([systemMessage, ...state.messages]);

    const usage        = (response as any).response_metadata?.usage;
    const inputTokens  = usage?.input_tokens  || 0;
    const outputTokens = usage?.output_tokens || 0;

    // Mirror into the out-of-graph transcript so a deadline that fires INSIDE a node still has
    // something to report. Pushed before returning, because the return may never be observed.
    transcript.push(response);

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
      // The deadline is checked HERE as well as in the router, because the router only gets a say
      // BETWEEN nodes. A model turn can request many tools at once and this loop runs them one by
      // one: a 21-call batch of web fetches held the node for minutes, so the run sailed past the
      // 95s router deadline without the router ever being consulted, and the rejecting backstop
      // won the race — losing the graceful wrap-up the deadline exists to reach. Measured, not
      // theoretical: that is exactly what run 517ed569 did.
      if (outOfTime()) {
        toolMsgs.push(new ToolMessage({
          tool_call_id: tc.id,
          content: 'Not executed: this run is out of time. Do not retry it — summarise what you have.',
        }));
        continue;
      }
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

    transcript.push(...toolMsgs);
    toolResultsSoFar.push(...results);
    return { messages: toolMsgs, toolResults: results };
  }

  /** Wall-clock deadline for the TOOL LOOP, leaving room to write the answer. */
  // 95 SECONDS, and the number is measured, not chosen. The first version of this was 3.5 minutes,
  // reasoning from the "400s limit" quoted elsewhere in this repo. That limit is not what governs
  // here: `background-agent-runner` runs the loop SYNCHRONOUSLY inside the request, and the
  // Supabase gateway kills the request at ~150s. Two runs on 2026-08-25 died at 165s and 177s of
  // wall time having never reached a 210s deadline — a graceful exit that cannot be reached is
  // the same as no graceful exit, and both runs orphaned exactly as before.
  /**
   * A running copy of what the graph has produced, kept OUTSIDE the graph.
   *
   * `graph.invoke()` resolves with the final state or not at all, so when the hard deadline fires
   * inside a node there is no way to ask the graph what it had. These two are that answer, and
   * they are the difference between "out of time" costing a summary and costing everything.
   */
  const transcript: BaseMessageT[] = [];
  const toolResultsSoFar: any[] = [];

  //
  // MUST stay below HARD_DEADLINE_MS. These are two deadlines for two different failures and the
  // order between them is the contract: this one stops the loop cleanly BETWEEN nodes and lets
  // the in-graph `finalize` write the answer with the whole remaining window; the hard one exists
  // only for a node that is already running and cannot be asked to stop. Set above it — as it
  // briefly was at 95s against a 75s hard deadline — and the graceful path can never win, so
  // every run takes the salvage route instead of the good one.
  const LOOP_DEADLINE_MS = 60 * 1000;
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
  // The wrap-up needs to know what was ASKED, not only what came back.
  transcript.push(...initialMessages);

  /**
   * Hard deadline. Unlike the router's, this one CANNOT be missed by a node that is already
   * running — and that distinction is the whole point.
   */
  // 75s, not 105s, and the wrap-up's budget is derived from the WALL rather than from this
  // number. The first version computed the remaining window as `HARD_DEADLINE_MS + 25_000 -
  // elapsed`, and since elapsed IS the deadline when this fires, that arithmetic always produced
  // 25 seconds no matter what the deadline was — moving the deadline could never have bought the
  // wrap-up any more room. 25s is not enough to generate a summary over a 20-tool transcript, so
  // it fell to the raw listing every time (run 224dca7c).
  const HARD_DEADLINE_MS = 75 * 1000;
  /** The gateway kills the request at ~150s; stay inside it with room to write the response. */
  const WALL_MS = 145 * 1000;
  const DEADLINE = Symbol('deadline');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const deadlinePromise = new Promise<typeof DEADLINE>((resolve) => {
    timeoutId = setTimeout(() => resolve(DEADLINE), HARD_DEADLINE_MS);
  });

  let finalState: any;
  try {
    finalState = await Promise.race([
      graph.invoke({ messages: initialMessages }),
      deadlinePromise,
    ]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }

  if (finalState === DEADLINE) {
    onLog?.('warn', 'Hard deadline reached mid-node — writing the report from what was retrieved', {
      elapsed_ms: Date.now() - startedAt,
      messages: transcript.length,
      tool_results: toolResultsSoFar.length,
    });
    return await reportWhatWeHave();
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

  /**
   * Salvage the run when the hard deadline fires inside a node.
   *
   * Tries a short, tool-less model turn first; if that does not land in the remaining window, it
   * falls back to a DETERMINISTIC listing built from the tool results with no model call at all.
   * That fallback is the actual safety net: it cannot time out, so the retrieved data is never
   * lost no matter how little time is left.
   */
  async function reportWhatWeHave(): Promise<LangGraphRunOutput> {
    const deterministic = () => {
      const lines = toolResultsSoFar.map((r, i) => {
        let body: string;
        try { body = typeof r.result === 'string' ? r.result : JSON.stringify(r.result); }
        catch { body = String(r.result); }
        return `${i + 1}. ${r.tool}(${JSON.stringify(r.args)}) → ${body.slice(0, 1500)}`;
      });
      return [
        'This task ran out of time before it could be summarised, so here is the raw material it '
        + 'retrieved. NOTHING below has been checked or cross-referenced — treat every line as an '
        + 'unverified tool result, and re-run with a narrower scope to get a written answer.',
        '',
        `${toolResultsSoFar.length} tool result(s):`,
        ...lines,
      ].join('\n');
    };

    if (transcript.length === 0) {
      return { finalResponse: deterministic(), inputTokens: 0, outputTokens: 0, iterations: 0, toolResults: toolResultsSoFar };
    }

    const wrapUp = new HumanMessage(
      'You are out of time and cannot call any more tools. Write up ONLY what the tool results in '
      + 'this conversation actually established: every concrete name, URL and number you '
      + 'retrieved, then what is still outstanding. Mark anything unverified as unverified, never '
      + 'present a partial list as complete, and never fill a gap from your own knowledge.',
    );

    /** The wrap-up reads a TRIMMED transcript, and that is what makes it reachable at all. */
    /** Close any tool call the deadline interrupted, or the wrap-up cannot be sent at all. */
    const answered = new Set(
      transcript.filter((m: any) => m.tool_call_id).map((m: any) => m.tool_call_id),
    );
    const closed: BaseMessageT[] = [];
    for (const m of transcript) {
      closed.push(m);
      const calls = (m as any).tool_calls;
      if (!Array.isArray(calls) || calls.length === 0) continue;
      for (const c of calls) {
        if (c?.id && !answered.has(c.id)) {
          closed.push(new ToolMessage({
            tool_call_id: c.id,
            content: 'Did not finish: the run reached its time limit before this call returned.',
          }));
          answered.add(c.id);
        }
      }
    }

    const WRAP_UP_MSG_CHARS = 2_000;
    const trimmed = closed.map((m: any) => {
      const text = typeof m.content === 'string' ? m.content : null;
      if (text === null || text.length <= WRAP_UP_MSG_CHARS) return m;
      const clone = Object.create(Object.getPrototypeOf(m));
      Object.assign(clone, m);
      clone.content = `${text.slice(0, WRAP_UP_MSG_CHARS)}\n…[trimmed ${text.length - WRAP_UP_MSG_CHARS} chars for the summary]`;
      return clone;
    });

    // Whatever is left before the WALL, minus a margin to return the response. Derived from the
    // wall rather than from the deadline, so lowering the deadline actually buys time here.
    const left = Math.max(10_000, WALL_MS - (Date.now() - startedAt) - 8_000);
    try {
      const response: any = await Promise.race([
        llm.invoke([new SystemMessage(systemPrompt), ...trimmed, wrapUp]),
        new Promise((resolve) => setTimeout(() => resolve(null), left)),
      ]);
      if (!response) throw new Error('wrap-up turn did not finish inside the remaining window');
      const usage = response.response_metadata?.usage;
      return {
        finalResponse: extractTextContent(response.content) || deterministic(),
        inputTokens:  usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
        iterations:   0,
        toolResults:  toolResultsSoFar,
      };
    } catch (err) {
      onLog?.('error', `Wrap-up turn failed, returning the raw tool results: ${(err as Error).message}`);
      return { finalResponse: deterministic(), inputTokens: 0, outputTokens: 0, iterations: 0, toolResults: toolResultsSoFar };
    }
  }
}
