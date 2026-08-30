/**
 * The script that decides which prompts are "never read" must not under-detect (#347 phase 3P).
 *
 * `scripts/prompt-readers.mjs` derives `prompts.used_in` from loader CALL SITES, and
 * `ops.prompt_never_read` reports any active prompt it did not attribute. So an extractor that
 * misses a call site does not fail — it manufactures a finding, and a probe that cries wolf gets
 * ignored and then switched off.
 *
 * Two ways it under-detected, both found 2026-08-30 by running it:
 *
 *  1. **`TS_LOADERS[fn]` inherited from `Object.prototype`.** Any call ending in `.toString`
 *     (`validateUrl.toString()`) resolved to a real function, was invoked as
 *     `Object.prototype.toString.call(args)`, returned the string `"[object Array]"`, and
 *     destructuring a STRING gave its characters — prompt_type `"["`, category `"o"`. The guard
 *     caught it, so nothing was mis-attributed; what it cost was noise on every run, and that
 *     noise hid (2).
 *  2. **`PROMPT_TYPES` had drifted from the database.** `embed` and `system` are both in use and
 *     were both missing, so every loader call for them was dropped silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const script = readFileSync(join(ROOT, 'scripts/prompt-readers.mjs'), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const name of entries) {
    const rel = `${dir}/${name}`;
    if (rel.includes('node_modules') || rel.includes('/.git')) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.ts$/.test(name)) out.push(rel);
  }
  return out;
}

/** The prompt_type literals the codebase actually passes to `loadPrompt`. */
function typesUsedInCode(): Set<string> {
  const found = new Set<string>();
  for (const file of walk('supabase/functions')) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    if (!src.includes('loadPrompt')) continue;
    for (const m of src.matchAll(/loadPrompt\(\s*[\w.]+\s*,\s*'([a-z_]+)'/g)) found.add(m[1]);
  }
  return found;
}

describe('#347 3P — the prompt-reader extractor cannot silently miss a call', () => {
  it('the loader table cannot be reached through Object.prototype', () => {
    // `{}` here means `TS_LOADERS['toString']` is a function, and every `.toString()` call in the
    // codebase is read as a prompt load.
    expect(script).toMatch(/Object\.create\(null\)/);
    expect(script).toMatch(/Object\.hasOwn\(TS_LOADERS, fn\)/);
    expect(script, 'the loader table is a plain object literal again')
      .not.toMatch(/const TS_LOADERS = \{/);
  });

  it('every prompt_type the code passes is one the extractor accepts', () => {
    // The real drift check. `PROMPT_TYPES` is a hand-kept mirror of
    // `select distinct prompt_type from public.prompts` — there is no CHECK constraint — so this
    // compares it against what the codebase demonstrably uses, which a repo test CAN see.
    const listed = script.slice(script.indexOf('const PROMPT_TYPES'));
    const allowed = new Set([...listed.slice(0, listed.indexOf(']')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    expect(allowed.size).toBeGreaterThanOrEqual(8);

    const used = typesUsedInCode();
    expect(used.size).toBeGreaterThan(3);

    const missing = [...used].filter((t) => !allowed.has(t));
    expect(missing,
      'These prompt_type values are passed to loadPrompt in the codebase and the extractor '
      + 'ignores them, so their prompts get no `used_in` and ops.prompt_never_read reports them '
      + `forever:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('an unrecognised type is dropped loudly, not silently', () => {
    // The guard is what kept the `[object Array]` mis-read from writing garbage. It must keep
    // reporting rather than returning quietly.
    expect(script).toMatch(/implausible prompt_type/);
    expect(script).toMatch(/console\.error/);
  });
});
