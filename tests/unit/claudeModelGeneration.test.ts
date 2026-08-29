/**
 * No retired Claude model id reaches a call site.
 *
 * A superseded model id is the quietest possible defect. It is a valid string, it typechecks, and
 * the provider either serves the old model (so you silently pay for and get worse output than you
 * think) or 404s a path nobody exercises in CI. Neither shows up as a failure anyone can see.
 *
 * It had spread: `claude-opus-4-8` was retired from the platform in 0d20b768, and 36 live call
 * sites in MIVAA kept passing it — the vision classifier, segmentation, OCR, product enrichment
 * and the whole RAG synthesis path — while `config.py` had already moved its DEFAULTS to
 * `claude-opus-5`. The defaults were right and the code did not read them.
 *
 * The current families are Claude 5 (`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`) and
 * `claude-haiku-4-5`, which IS current — Haiku has no 5 yet, so it is not on the retired list.
 *
 * MIVAA is a separate repo and is EMPTY in this repo's CI checkout, so it carries its own copy of
 * this check (tests/unit/test_claude_model_generation.py). Changing one means changing both.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();

/** Retired ids. `claude-haiku-4-5` is deliberately absent — it is the current Haiku. */
const RETIRED = /claude-(?:opus-4-(?:6|7|8)|sonnet-4-(?:5|6|7)|3(?:-[a-z0-9-]+)?|2|instant)\b/g;

const ROOTS = ['src', 'supabase/functions', 'scripts', 'api'];
const SKIP_DIRS = new Set(['node_modules', '.deno', 'dist', '.git', 'coverage']);
/** Files whose whole job is to name the old ids. */
const ALLOWED = new Set<string>([
  // The retired-id list itself.
  'tests/unit/claudeModelGeneration.test.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|json)$/.test(e)) out.push(p);
  }
  return out;
}

describe('Claude model generation', () => {
  const files = ROOTS.flatMap((r) => walk(join(ROOT, r)));

  it('scans a non-empty tree (guards against a walk that silently finds nothing)', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('no retired Claude model id appears in executable code', () => {
    const hits: string[] = [];
    for (const abs of files) {
      const rel = relative(ROOT, abs).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      // `blankComments`, not `stripComments`: it preserves every byte offset, so the line number
      // reported below is the line in the real file. A comment recording WHY a model was retired
      // ("was `claude-opus-4-8` at 15.00/75.00, the real rate is 5.00/25.00") is what makes the
      // fix legible six months later, so only executable code is matched.
      const code = blankComments(readFileSync(abs, 'utf8'));
      for (const m of code.matchAll(RETIRED)) {
        const line = code.slice(0, m.index).split('\n').length;
        hits.push(`${rel}:${line} → ${m[0]}`);
      }
    }
    expect(
      hits,
      'Retired Claude model ids in live code. Use claude-opus-5 / claude-sonnet-5 / '
      + 'claude-haiku-4-5 (Haiku 4.5 IS current):\n  ' + hits.join('\n  '),
    ).toEqual([]);
  });
});
