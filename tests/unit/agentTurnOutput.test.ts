import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * What one agent turn puts on the screen.
 *
 * Both failures guarded here came out of the same turn (conversation de92b987, 2026-09-15) and
 * both are silent by construction: a duplicate card is a correct render of a duplicate event, and
 * a reply of '' is a valid string that ends the graph as a clean success.
 */

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const RECORD_SEARCH = 'supabase/functions/_shared/tools/record-search-tools.ts';

describe('a turn that ends with no text says why', () => {
  const src = code(AGENT_CHAT);
  /** The agent node's "no tool calls, so we are done" branch. */
  const branch = (() => {
    const from = src.indexOf('if (!response.tool_calls || response.tool_calls.length === 0)');
    return src.slice(from, src.indexOf('async function toolsNode', from));
  })();

  it('the branch anchor still exists', () => {
    expect(branch.length).toBeGreaterThan(400);
  });

  it('finalResponse is never the empty string', () => {
    // `shouldContinue` ends the graph on `finalResponse !== null`, and '' is not null — so an
    // empty answer ended the turn as a success and the caller rethrew it as "Agent execution
    // failed to return a valid result": a generic crash report for a turn that did not crash.
    expect(branch).toMatch(/if \(!text\)/);
    expect(branch, 'the empty text is still handed straight back as the answer')
      .not.toMatch(/finalResponse: extractTextContent\(response\.content\)/);
  });

  it('an unparseable tool call is read, not discarded', () => {
    // A tool call truncated mid-JSON lands in `invalid_tool_calls`, never in `tool_calls`. Left
    // unread, the action the model attempted vanishes and the turn looks like it said nothing.
    expect(branch).toContain('invalid_tool_calls');
  });

  it('the three states are told apart', () => {
    // "I ran out of room", "I was cut off mid-action" and "I stopped and nothing says why" mean
    // different things to the person reading the reply and to whoever debugs it next.
    expect(branch).toContain('stop_reason');
    expect(branch).toMatch(/'max_tokens'/);
    expect(branch).toMatch(/'refusal'/);
  });

  it('whether anything already RAN is derived, never assumed', () => {
    // This branch sits after any number of tool iterations, so a flat "nothing was changed"
    // would invite a retry straight into a duplicate of a write that had already committed —
    // and a retry is how a half-done pair becomes two (anti-regression rule 4). `toolResults`
    // is the state that knows, and every stated reason has to be built from it.
    expect(branch).toMatch(/state\.toolResults\?\.length/);
    // Exactly one occurrence: the derived value. A second is a branch asserting it on its own.
    expect(
      (branch.match(/Nothing was changed\./g) ?? []).length,
      'a reason hard-codes the no-op claim instead of deriving it',
    ).toBe(1);
    // The claim is made once, from the derived value, and every branch reuses it.
    expect(branch).toMatch(/const didWhat\s*=/);
    expect((branch.match(/\$\{didWhat\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('the log records it too, so the next reader does not have to guess', () => {
    const warn = branch.slice(branch.indexOf('console.warn('), branch.indexOf('}));'));
    expect(warn).toMatch(/toolResults:/);
  });
});

describe('the output ceiling leaves room for the turn to answer', () => {
  const src = code(AGENT_CHAT);

  it('the agent model is not capped at 4096', () => {
    // On Opus 5, omitting `thinking` runs ADAPTIVE thinking (a change from Opus 4.8/4.7) and
    // `display` defaults to omitted, so those blocks arrive with empty text — and they are paid
    // for out of the same maxTokens. At 4096 a turn could spend the entire budget reasoning and
    // return content holding no text and no parseable tool call.
    const opus = src.slice(src.indexOf('modelOpus = new ChatAnthropic('), src.indexOf('_initialized = true'));
    const cap = opus.match(/maxTokens:\s*(\d+)/);
    expect(cap, 'modelOpus no longer declares maxTokens').not.toBeNull();
    expect(Number(cap![1])).toBeGreaterThanOrEqual(8192);
  });

  it('a pinned model gets the same ceiling as the router default', () => {
    // An A/B pin measured against a smaller output budget than the model it is compared with is
    // not measuring the model.
    const byName = src.slice(src.indexOf('function getModelByName'), src.indexOf('function getModelForAgent'));
    const cap = byName.match(/maxTokens:\s*(\d+)/);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBeGreaterThanOrEqual(8192);
  });

  it('the background-agent runner has the same ceiling', () => {
    // `buildLLM` in langgraph-core builds the model for kai-task-agent, which runs
    // claude-opus-5 — so it carries the identical hazard, and its own `|| ''` at the end of
    // runLangGraphAgent turns a thought-away budget into the same empty answer. One instance
    // fixed and its twin left at 4096 is how this comes back somewhere nobody is looking.
    const core = code('supabase/functions/_shared/langgraph-core.ts');
    const anthropic = core.slice(core.indexOf('const { ChatAnthropic }'));
    const cap = anthropic.match(/maxTokens:\s*(\d+)/);
    expect(cap, 'buildLLM no longer declares maxTokens').not.toBeNull();
    expect(Number(cap![1])).toBeGreaterThanOrEqual(8192);
  });

  it('the model reaches its own ceiling BEFORE the node timeout', () => {
    // The two bounds are not interchangeable. Hitting maxTokens is a clean stop this file can
    // name; hitting AGENT_NODE_TIMEOUT_MS is a thrown graph invoke that discards the streamed
    // text.
    const opus = src.slice(src.indexOf('modelOpus = new ChatAnthropic('), src.indexOf('_initialized = true'));
    const cap = Number(opus.match(/maxTokens:\s*(\d+)/)![1]);
    const timeoutMs = Number(src.match(/AGENT_NODE_TIMEOUT_MS = ([\d_]+)/)![1].replace(/_/g, ''));
    const reachableTokens = (timeoutMs / 1000) * 87;
    expect(cap, `maxTokens ${cap} is above the ~${Math.round(reachableTokens)} the node timeout allows`)
      .toBeLessThan(reachableTokens);
  });
});

describe('one card per distinct answer, not one per tool call', () => {
  const src = code(RECORD_SEARCH);

  it('find_records dedupes its result chunks within the turn', () => {
    // A model hedging the spelling of a Greek counterparty fires several searches in ONE
    // parallel turn. "New Plan" and "ΚΑΝΑΤΣΙΟΠΟΥΛΟΣ NEWPLAN" both resolved to the same company
    // and each emitted its own chunk, so the user got two cards titled "Records found" holding
    // the identical row — and the queries that told them apart were never on screen, because
    // the title in AGENT_RESULT_TITLES is a static string.
    expect(src).toContain('emittedSignatures');
    const emitAt = src.indexOf("type: 'record_search_results'");
    const guard = src.slice(src.lastIndexOf('if (', emitAt), emitAt);
    expect(guard, 'the emit is no longer behind the dedupe check').toContain('emittedSignatures.has');
  });

  it('identity is the set of rows, order-independent', () => {
    // Two different queries that land on the same records are one answer. `global_search` orders
    // per kind, so an unsorted signature would make the same set look like two.
    const sig = src.slice(src.indexOf('const signature ='), src.indexOf("type: 'record_search_results'"));
    expect(sig).toContain('.sort()');
    expect(sig).toMatch(/r\.kind/);
    expect(sig).toMatch(/r\.id/);
  });

  it('the set is per turn, not per module', () => {
    // A module-level set would silence the card for every later turn in the same isolate.
    const factory = src.slice(src.indexOf('export const createFindRecordsTool'));
    expect(factory).toContain('const emittedSignatures = new Set<string>()');
    const beforeFactory = src.slice(0, src.indexOf('export const createFindRecordsTool'));
    expect(beforeFactory).not.toContain('emittedSignatures');
  });

  it('the tool RESULT is unaffected — only the duplicate UI event is dropped', () => {
    // Every call still answers its own caller; suppressing the return value would make the model
    // think the second search found nothing.
    const after = src.slice(src.indexOf("type: 'record_search_results'"));
    expect(after).toContain('found: true');
    expect(after).toContain('found: false');
    const returns = after.match(/return JSON\.stringify\(/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(2);
  });
});
