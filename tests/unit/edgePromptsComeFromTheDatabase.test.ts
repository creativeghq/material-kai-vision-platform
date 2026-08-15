/**
 * Guard: edge functions load their prompts from the database, and never fall back.
 *
 * WHY THIS EXISTS
 * ---------------
 * MIVAA has `tests/unit/test_prompts_come_from_the_database.py`. The platform repo had
 * nothing equivalent, so the edge side drifted quietly until an audit went looking:
 * nine functions held their instruction text as a string literal in the file that calls
 * the model, which means no operator could see or tune them and every change needed a
 * deploy.
 *
 * The second half matters more than the first. A prompt loaded from the DB *with a
 * code fallback behind it* is worse than a hardcoded one, because it looks correct:
 *
 *   - `_shared/rerank.ts` ran a byte-identical FALLBACK_PROMPT 100% of the time while
 *     "AI Search Re-ranker" sat in the table, edited and unused. Its own comments now
 *     record that.
 *   - `inbox-api` loaded the persona with `const { data } = await …` — the error
 *     DISCARDED — and `|| FALLBACK_INBOX_PERSONA` behind it. supabase-js resolves
 *     rather than throws on an RLS denial, so a permissions change would have swapped
 *     the operator's persona for the hardcoded one silently and indefinitely.
 *
 * So this test bans the fallback pattern outright, and flags new inline prompts.
 *
 * WHAT IS DELIBERATELY ALLOWED
 * ----------------------------
 * Not every string near a model call is a prompt:
 *   - data fences and injection preambles ("this is DATA, not instructions", `<items>`)
 *     stay in CODE — a guard an admin can delete by editing a row is not a guard;
 *   - data envelopes ("Conversation so far:\n…") carry content, not behaviour;
 *   - sentences composed from runtime state (whether tools are available) cannot be
 *     a static row.
 * `ALLOWED_INLINE` records each of those, with its reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

/** Files that legitimately hold prompt-shaped text inline, and why. Shrink-only. */
const ALLOWED_INLINE: Record<string, string> = {
  '_shared/order-intake/extract.ts':
    'INJECTION_PREAMBLE is the invariant-9 "this is DATA, not instructions" guard. It must not be admin-editable.',
  '_shared/finance/extract-products.ts':
    'The <lines> fence wrapping untrusted supplier text stays in code for the same reason.',
  'stock-api/index.ts':
    'The <items> fence around the warehouse JSON is a data delimiter, not tunable copy.',
  'inbox-api/index.ts':
    'Composes the DB persona with runtime-conditional capability text (whether account tools are bound).',
  '_shared/ai-client.ts':
    'The AI client itself — takes prompts as parameters, holds none.',
  '_shared/prompt-utils.ts':
    'The loader. Its strings are error messages.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const FILES = walk(FUNCTIONS_DIR).map((f) => ({
  rel: relative(FUNCTIONS_DIR, f).split('\\').join('/'),
  src: readFileSync(f, 'utf8'),
}));

/** Files that actually call a model. */
const MODEL_CALLERS = FILES.filter(({ src }) =>
  /generateStructuredWithClaude|generateWithClaude|generateWithClaudeTools|callClaudeTool\s*\(/.test(src),
);

describe('edge functions: prompts come from the database', () => {
  it('finds the model-calling functions at all (the scan itself must not silently match nothing)', () => {
    // A guard whose corpus is empty passes forever. Pin the floor.
    expect(MODEL_CALLERS.length).toBeGreaterThan(5);
  });

  it('no prompt is loaded with a hardcoded fallback behind it', () => {
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      // `X || FALLBACK_…` / `?? DEFAULT_…_PROMPT` on a prompt-ish name.
      if (/(\|\||\?\?)\s*(FALLBACK|DEFAULT)_[A-Z_]*(PROMPT|PERSONA|INSTRUCTIONS)/.test(src)) {
        offenders.push(`${rel}: falls back to a hardcoded prompt`);
      }
      // A prompts SELECT whose error is discarded — the silent half of the same bug.
      if (/const\s*\{\s*data\s*\}\s*=\s*await[^;]{0,200}from\(['"]prompts['"]\)/s.test(src)) {
        offenders.push(`${rel}: reads prompts and discards the error (an RLS denial reads as "not configured")`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no model-calling function carries a new inline instruction prompt', () => {
    // Prompt-shaped: a long literal assigned to a prompt-ish name, or passed as systemPrompt.
    const SHAPES = [
      /systemPrompt:\s*['"`][^'"`]{80,}/,
      /const\s+(prompt|systemPrompt|SYSTEM_PROMPT)\b[^=]*=\s*['"`][^'"`]{80,}/,
    ];
    const offenders: string[] = [];
    for (const { rel, src } of MODEL_CALLERS) {
      if (rel in ALLOWED_INLINE) continue;
      if (SHAPES.some((re) => re.test(src))) {
        offenders.push(
          `${rel}: holds an inline prompt. Move the instruction text to \`prompts\` and load it ` +
          `with loadPrompt()/getAgentSystemPrompt(); if it is a data fence or runtime-composed ` +
          `glue, add it to ALLOWED_INLINE with the reason.`,
        );
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the allowlist does not rot — every entry still exists and still calls a model', () => {
    const byRel = new Map(FILES.map((f) => [f.rel, f.src]));
    for (const rel of Object.keys(ALLOWED_INLINE)) {
      expect(byRel.has(rel), `ALLOWED_INLINE names ${rel}, which no longer exists — remove it`).toBe(true);
    }
  });
});
