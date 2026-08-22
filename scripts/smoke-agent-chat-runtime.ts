/**
 * Runtime smoke test for the agent-chat dependency set.
 *
 * `deno check` cannot see this class of failure and neither can vitest. On 2026-08-21 a
 * regenerated `agent-chat/deno.lock` pinned `@langchain/langgraph` against `zod@3.24.0`, whose
 * package.json exports only `.`, `./package.json` and `./locales/*` — while langgraph's
 * `dist/graph/graph.js` does `import ... from "zod/v4"`. Every JARVIS turn 500'd in production
 * with:
 *
 *   ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './v4' is not defined by "exports"
 *
 * It typechecked clean, every unit test passed, and the API tests that were run answered from
 * the previous deploy. It was found by a person opening the app.
 *
 * This script does the one thing that catches it: it actually EXECUTES the imports and builds
 * the same objects agent-chat builds on a real turn — a zod tool schema, a bound ChatAnthropic,
 * a compiled StateGraph — and drives one turn against a local stub of the Anthropic API. No
 * network, no key, no database. If the module graph cannot resolve, this exits non-zero.
 *
 * Run:  deno run -A --config supabase/functions/agent-chat/deno.json scripts/smoke-agent-chat-runtime.ts
 */

const PORT = 8799;
let captured: Record<string, unknown> | null = null;

/** Anthropic's SSE wire format, so the stub exercises the streaming path the agent uses. */
const sse = (events: unknown[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');

const server = Deno.serve({ port: PORT, onListen: () => {} }, async (req) => {
  captured = await req.json();
  return new Response(
    sse([
      { type: 'message_start', message: {
        id: 'msg_smoke', type: 'message', role: 'assistant', model: 'claude-opus-4-8', content: [],
        usage: { input_tokens: 11, output_tokens: 1, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'po' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ng' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
      { type: 'message_stop' },
    ]),
    { headers: { 'content-type': 'text/event-stream' } },
  );
});

const deltas: string[] = [];

function fail(message: string): never {
  console.error(`✗ ${message}`);
  Deno.exit(1);
}

try {
  // Exactly the specifiers initRuntime() loads, through the same import map.
  const [anthropicMod, toolsMod, msgMod, lgMod, zodMod] = await Promise.all([
    import('@langchain/anthropic'),
    import('@langchain/core/tools'),
    import('@langchain/core/messages'),
    import('@langchain/langgraph'),
    import('zod'),
  ]);

  const { ChatAnthropic } = anthropicMod;
  const { tool } = toolsMod;
  const { SystemMessage, HumanMessage } = msgMod;
  const { StateGraph, Annotation, START, END } = lgMod;
  const { z } = zodMod;

  // A zod tool schema — this is what pulls zod through langchain's json-schema interop.
  const ping = tool(async ({ text }: { text: string }) => `pong: ${text}`, {
    name: 'ping',
    description: 'Echo the text back',
    schema: z.object({ text: z.string().describe('anything') }),
  });

  const model = new ChatAnthropic({
    model: 'claude-opus-4-8',
    apiKey: 'sk-smoke',
    maxTokens: 32,
    clientOptions: { baseURL: `http://localhost:${PORT}` },
  });

  // The graph shape agent-chat compiles, including the node-level timeout option that only
  // exists from langgraph 1.4.0 — so a silent downgrade fails here too.
  const State = Annotation.Root({
    messages: Annotation<unknown[]>({
      reducer: (prev: unknown[], next: unknown[]) => [...prev, ...next],
      default: () => [],
    }),
  });

  const graph = new StateGraph(State)
    .addNode('agent', async (state: { messages: unknown[] }) => {
      const systemMessage = new SystemMessage({
        content: [{ type: 'text', text: 'You are a smoke test.', cache_control: { type: 'ephemeral' } }],
      });
      // Streamed, exactly as agentNode does it: deltas out as they arrive, chunks concatenated
      // back into one message because tool_calls only exist on the aggregate.
      const stream = await model.bindTools([ping]).stream([systemMessage, ...state.messages]);
      let res: any = null;
      for await (const part of stream) {
        res = res === null ? part : res.concat(part);
        // With tools bound, chunk content is an ARRAY of blocks rather than a string — the
        // same reason agentNode runs it through extractTextContent instead of reading it raw.
        const t = typeof part.content === 'string'
          ? part.content
          : Array.isArray(part.content)
            ? part.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('')
            : '';
        if (t) deltas.push(t);
      }
      return { messages: [res] };
    }, { timeout: 30_000 })
    .addEdge(START, 'agent')
    .addEdge('agent', END)
    .compile();

  await graph.invoke({ messages: [new HumanMessage('ping')] });

  if (!captured) fail('the model call never reached the stub server');
  const system = (captured as { system?: unknown }).system;
  if (!Array.isArray(system) || system.length === 0) {
    fail(`the request carried no system prompt (system = ${JSON.stringify(system)}). ` +
         'The prompt must be a SystemMessage at messages[0] — a `system` call option is dropped.');
  }
  const block = system[0] as { cache_control?: unknown };
  if (!block?.cache_control) {
    fail('the system block carries no cache_control — the prompt cache breakpoint is missing');
  }
  const tools = (captured as { tools?: { name?: string }[] }).tools;
  if (!tools?.some((t) => t.name === 'ping')) fail('the zod tool was not bound into the request');
  if ((captured as { stream?: boolean }).stream !== true) {
    fail('the request did not ask for a stream — agentNode must call .stream(), not .invoke(), ' +
         'or the user waits for the whole completion before seeing anything');
  }
  if (deltas.length < 2) {
    fail(`expected incremental text deltas, got ${JSON.stringify(deltas)}`);
  }

  console.log('✓ agent-chat runtime smoke passed');
  console.log(`  langgraph + zod resolve together (zod ${z.string().constructor ? 'loaded' : '?'})`);
  console.log('  system prompt present as a cached content block; zod tool bound');
  console.log(`  streamed in ${deltas.length} deltas: ${JSON.stringify(deltas.join(''))}`);
} catch (err) {
  fail(`agent-chat's dependency set does not load or run: ${err instanceof Error ? err.stack : err}`);
} finally {
  await server.shutdown();
}
