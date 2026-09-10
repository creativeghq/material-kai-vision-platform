/** Guard: the prompt WRITER follows the prompt READER. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/prompt-utils.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

/**
 * Every `.select(...)` in prompt-utils paired with the `prompt_type` filtered right after it.
 * A loader that takes the type as a variable (loadPrompt) is reported as 'dynamic'.
 */
function readers(): Array<{ columns: string; promptType: string }> {
  const out: Array<{ columns: string; promptType: string }> = [];
  const re = /\.select\('([^']+)'\)([\s\S]{0,200}?)\.eq\('prompt_type',\s*(?:'([a-z_]+)'|([A-Za-z]\w*))\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC))) {
    out.push({ columns: m[1].replace(/\s+/g, ' ').trim(), promptType: m[3] ?? 'dynamic' });
  }
  return out;
}

/** The prompt types the admin editor MUST write to `system_prompt`, because nothing else is read. */
const SYSTEM_PROMPT_ONLY_TYPES = ['agent', 'system'];

describe('prompts: the writer follows the reader', () => {
  it('finds the loaders at all (an empty scan would pass forever)', () => {
    expect(readers().length).toBeGreaterThanOrEqual(4);
  });

  it('exactly these prompt types are read from system_prompt alone', () => {
    const systemOnly = readers()
      .filter((r) => r.columns === 'system_prompt')
      .map((r) => r.promptType)
      .sort();

    expect(
      systemOnly,
      `The set of prompt types whose loader reads ONLY system_prompt has changed.\n` +
        `update_prompt_with_history (in pg_proc, NOT in this repo) branches on exactly this set:\n` +
        `  v_uses_system := v_prompt.prompt_type IN ('agent', 'system');\n` +
        `Apply a migration updating that list to match, or the admin editor will write the column ` +
        `this loader does not read — which succeeds, records history, and changes nothing.`,
    ).toEqual([...SYSTEM_PROMPT_ONLY_TYPES].sort());
  });

  it('every other loader reads prompt_text first, so the editor writing prompt_text is correct', () => {
    const others = readers().filter((r) => r.columns !== 'system_prompt');
    expect(others.length).toBeGreaterThan(0);
    for (const r of others) {
      expect(
        r.columns.startsWith('prompt_text'),
        `A loader for prompt_type='${r.promptType}' selects "${r.columns}". Column order is the ` +
          `contract here: prompt_text must come first, because that is what the editor writes for ` +
          `every type outside ${JSON.stringify(SYSTEM_PROMPT_ONLY_TYPES)}.`,
      ).toBe(true);
    }
  });

  it('no loader silently discards its error (an RLS denial must not read as "not configured")', () => {
    // The other half of the same family: supabase-js RESOLVES on an RLS denial rather than
    // throwing, so `const { data } = await …` turns a permissions outage into "no such prompt".
    const offenders = [...SRC.matchAll(/const\s*\{\s*data\s*\}\s*=\s*await[\s\S]{0,200}?from\('prompts'\)/g)];
    expect(offenders.map((m) => m[0].slice(0, 60)), 'a prompts read discards its error').toEqual([]);
  });
});
