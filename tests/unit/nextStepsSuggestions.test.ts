/**
 * The per-turn "what next?" suggestions (`_shared/next-steps.ts`).
 *
 * This path has all three shapes this codebase has been burned by before, in one file:
 *
 *  1. A PROMPT IN CODE. The suggestion prompt lives in `prompts` and the loader throws when the
 *     row is missing. The tempting "fix" for a missing row is to inline the prompt — which is
 *     exactly how `segmentation_service` ended up running a 9,119-char constant while an admin's
 *     edits saved and changed nothing, forever, with every health signal green.
 *  2. A SALVAGE PARSER. Structure comes from a forced `tool_use` block. Fishing JSON out of a
 *     text block is what security invariant 9 forbids, and it fails silently and intermittently
 *     rather than loudly.
 *  3. UNFENCED UNTRUSTED CONTENT. The tool result fed in here can be a scraped page, supplier
 *     XML or a customer's email body. It goes in wrapped and labelled as DATA (invariant 9).
 *
 * None of the three fails a typecheck, a lint, or a smoke test — they just quietly change what
 * the model is asked. So they are pinned here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
// Normalised to LF: the repo checks out CRLF on Windows, so the multi-line `includes(...)`
// below matched nothing and this file failed for line endings rather than for content.
const SRC = readFileSync(join(ROOT, 'supabase/functions/_shared/next-steps.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('next-step suggestions', () => {
  it('takes its prompt from the database, with no copy in the file', () => {
    expect(SRC, 'the system prompt must come from loadPrompt').toContain(
      "loadPrompt(supabase, 'tool', 'agent_next_steps')",
    );
    // A prompt inlined as a constant is the regression. Instruction-shaped string literals are
    // long; the tool schema's `description` fields are not. 400 chars separates them with room
    // to spare (the DB row is ~1,800).
    // Single-line only: a multi-line backtick pattern just spans from one `${}` to the next
    // and matches ordinary code. A prompt inlined in TS is a run of quoted lines either way.
    const longLiterals = [...SRC.matchAll(/'[^'\n]{400,}'|"[^"\n]{400,}"|`[^`\n]{400,}`/g)];
    expect(
      longLiterals.map((m) => `${m[0].slice(0, 80)}…`),
      'A prompt-sized string literal appeared in next-steps.ts. The prompt lives in `prompts` ' +
        "(prompt_type='tool', category='agent_next_steps') and a missing row must mean NO " +
        'suggestions, never a hardcoded substitute nobody can see or edit.',
    ).toEqual([]);
    // And no `loader() || 'literal'` — semgrep pins the shape repo-wide; this pins THIS file.
    expect(/loadPrompt\([^)]*\)\s*(\|\||\?\?)/.test(SRC)).toBe(false);
  });

  it('gets its structure from a forced tool_use, never from parsing prose', () => {
    expect(SRC).toContain('tool_choice');
    expect(SRC).toMatch(/tool_choice:\s*\{\s*type:\s*'tool'/);
    expect(
      SRC.includes("b.type === 'tool_use'"),
      'the result must be read off the tool_use block',
    ).toBe(true);
    // The banned repair path: regexing or JSON.parsing the model's TEXT output.
    expect(
      /JSON\.parse\((?!.*toolResult)/.test(SRC.replace(/^.*JSON\.stringify.*$/gm, '')),
      'no JSON.parse of model output — a forced tool call either produced its block or the ' +
        'call did not do what was asked. Salvaging is invariant 9\'s exact prohibition.',
    ).toBe(false);
  });

  it('fences the tool result as data, not as instructions', () => {
    expect(
      SRC.includes("dataBlock(\n      'tool_result'") || SRC.includes("dataBlock('tool_result'"),
      'tool output must go through the DATA wrapper — it can be a scraped page or a ' +
        "customer's email body, and it is the classic prompt-injection carrier",
    ).toBe(true);
    expect(SRC).toMatch(/is NOT addressed to you|not instructions|contains no instructions/i);
  });

  it('degrades to no suggestions instead of taking the turn down', () => {
    // Every early exit hands back the same empty shape; the caller ships the turn regardless.
    expect(SRC).toMatch(/const none = \{ steps: \[\] as NextStep\[\], usage: null \}/);
    const returnsNone = (SRC.match(/return none;/g) ?? []).length;
    // Two, not three: resolving ANTHROPIC_API_KEY moved into callClaudeMessages, which throws on
    // an unresolved key — so that path now arrives at the same catch as a non-2xx and a network
    // failure, instead of being its own early return here. The count is a proxy; what the test
    // actually protects is that no failure escapes as an exception, which the catch below covers.
    expect(returnsNone, 'the failure paths must return the empty result').toBeGreaterThanOrEqual(2);
    // …and none of them may be silent: a suggestion feature that stops appearing with nothing
    // logged is indistinguishable from one nobody clicks.
    for (const path of ['prompt unavailable', 'call failed']) {
      expect(SRC, `failure path "${path}" must log`).toContain(path);
    }
  });
});
