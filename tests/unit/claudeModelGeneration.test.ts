/** No retired Claude model id reaches a call site. */
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
