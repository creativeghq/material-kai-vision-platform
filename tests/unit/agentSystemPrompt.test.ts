import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The system prompt is a MESSAGE. It is never a call option.
 *
 * `ChatAnthropic.invocationParams()` builds an ALLOWLISTED request object — model,
 * stop_sequences, stream, max_tokens, tools, tool_choice, thinking, context_management,
 * container, betas, output_format, mcp_servers — and drops every other key without a word.
 * The Anthropic `system` field is filled from exactly one place: a SystemMessage sitting
 * FIRST in the messages array (`_convertMessagesToAnthropicPayload` reads `messages[0]` and
 * nothing else). So `model.invoke(messages, { system })` sends the model no instructions at
 * all, and `{ cache_control }` alongside it caches nothing.
 *
 * This has now happened three times in this repo:
 *   - the sub-agent tools, found 2026-08-11;
 *   - `agent-chat`'s main graph — every JARVIS turn since the function was written, with
 *     ~10.2K tokens of persona + doctrine + skills assembled and thrown away (measured: 10.2K
 *     built, 3.4K median actually sent), plus a comment promising a 90% cache discount that
 *     was never once earned;
 *   - `_shared/langgraph-core.ts`, the runner behind every background agent.
 *
 * It is invisible in all three: the request succeeds, the model answers from the user turn
 * alone, and the answer reads fine. No typecheck catches it either while the model is `any`.
 * Hence a test.
 */

const ROOT = join(__dirname, '..', '..');
const FN_DIR = join(ROOT, 'supabase', 'functions');

/** Files that own a LangChain agent loop and must hand the prompt over as a message. */
const AGENT_LOOPS = [
  'supabase/functions/agent-chat/index.ts',
  'supabase/functions/_shared/langgraph-core.ts',
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Arguments of every `.invoke(...)` call in `text`, split at top level.
 *
 * Hand-scanned rather than regexed because the interesting case is precisely a nested object
 * literal in argument two, and a regex either stops at the first `}` or swallows the file.
 */
function invokeArgLists(text: string): { args: string[]; index: number }[] {
  const calls: { args: string[]; index: number }[] = [];
  const CALL = /\.invoke\(/g;
  for (const m of text.matchAll(CALL)) {
    const start = m.index! + m[0].length;
    let depth = 1;
    let i = start;
    const args: string[] = [];
    let current = '';
    let inString: string | null = null;
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      const prev = text[i - 1];
      if (inString) {
        if (ch === inString && prev !== '\\') inString = null;
        current += ch;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inString = ch; current += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) break;
      }
      if (ch === ',' && depth === 1) { args.push(current); current = ''; continue; }
      current += ch;
    }
    if (depth !== 0) continue; // unbalanced (comment, template, minified) — not our business
    if (current.trim()) args.push(current);
    calls.push({ args, index: m.index! });
  }
  return calls;
}

describe('the agent system prompt travels as a message', () => {
  it('the scanner finds invoke() calls at all', () => {
    const total = sourceFiles(FN_DIR).reduce(
      (n, f) => n + invokeArgLists(readFileSync(f, 'utf8')).length, 0);
    expect(total, 'no .invoke() calls found — the scan is broken, not the code').toBeGreaterThan(20);
  });

  it('no invoke() passes system or cache_control as a call option', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(FN_DIR)) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('.invoke(')) continue;
      for (const call of invokeArgLists(text)) {
        // Argument 1 is the message list; the options object is argument 2 onward.
        for (const arg of call.args.slice(1)) {
          for (const dead of ['system', 'cache_control']) {
            if (new RegExp(`(^|[{\\s,])${dead}\\s*:`).test(arg)) {
              const line = text.slice(0, call.index).split('\n').length;
              offenders.push(
                `${relative(ROOT, file).replace(/\\/g, '/')}:${line} passes '${dead}' as a call option`);
            }
          }
        }
      }
    }

    expect(
      offenders,
      "ChatAnthropic drops unknown call options silently. The system prompt belongs in a " +
      "SystemMessage at messages[0]; cache_control belongs on that message's content block " +
      '(one breakpoint there covers the tool definitions too, since Anthropic orders a ' +
      'request tools → system → messages).',
    ).toEqual([]);
  });

  it('every agent loop builds a SystemMessage and puts it first', () => {
    for (const rel of AGENT_LOOPS) {
      const text = readFileSync(join(ROOT, rel), 'utf8');

      expect(text, `${rel} no longer constructs a SystemMessage — the prompt cannot reach the model`)
        .toMatch(/new SystemMessage\(/);

      // The message list handed to the model must LEAD with it.
      const leadsWithSystem = invokeArgLists(text).some(
        (call) => /^\s*\[\s*systemMessage\s*,/.test(call.args[0] ?? ''));
      expect(
        leadsWithSystem,
        `${rel} builds a SystemMessage but no model invoke passes it as the first message. ` +
        'Anthropic reads messages[0] and nowhere else.',
      ).toBe(true);
    }
  });

  it('the cache breakpoint sits on the system content block', () => {
    for (const rel of AGENT_LOOPS) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(
        text,
        `${rel} builds no cache_control block. ~10K tokens of stable preamble re-bills on ` +
        'every iteration of the tool loop without one.',
      ).toMatch(/type:\s*'text'[\s\S]{0,120}cache_control:\s*\{\s*type:\s*'ephemeral'\s*\}/);
    }
  });
});
