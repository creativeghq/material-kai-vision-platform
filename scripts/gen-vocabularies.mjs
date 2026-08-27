/**
 * Regenerate the Deno-side mirrors of dependency-free VOCABULARY modules — the closed value-sets
 * that both runtimes have to agree on.
 *
 * WHY THIS EXISTS, AND WHY IT IS GENERIC. A sweep on 2026-08-27 found 59 value-sets typed out by
 * hand in both `src/` and `supabase/functions/`, of which 32 exactly match a Postgres enum or
 * CHECK constraint — meaning the database is the enforcer and TypeScript restates the same fact
 * two to six times, with nothing keeping them in step. That is not a hypothetical failure mode:
 * the flow vocabulary (the first entry below) had four hand-written copies and the palette copy
 * had drifted wider than the enforcer, so the builder offered nodes whose INSERT can only raise
 * 42501. A guard test on a copy detects drift afterwards; a generated copy cannot drift at all.
 *
 * Adding a vocabulary here is meant to be one line, because the plan is to keep adding them.
 *
 * Same contract as scripts/gen-finance-mirrors.mjs: source modules are deliberately IMPORT-FREE
 * so the mirror stays a byte copy — Vite resolves the `@/` alias, Deno resolves by URL, so a
 * single import makes the copy unbuildable in the other runtime.
 *
 * NO SHEBANG, deliberately: `core.autocrlf` is on, so a Windows checkout can hand this file CRLF,
 * and a `#!` line followed by CRLF makes vitest's loader throw "Invalid or unexpected token" —
 * reported against the IMPORT in the test, nowhere near the actual cause.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** [source, target] pairs, repo-relative. One line per vocabulary. */
export const VOCABULARIES = [
  [
    'src/services/flows/tenantVocabulary.ts',
    'supabase/functions/_shared/tools/tenantVocabulary.generated.ts',
  ],
  [
    // #391 — eight HR value-sets that were written across ten files, two to six copies
    // each. The DB CHECK constraints are the enforcer; this source equals them exactly.
    'src/modules/hr/hrVocabulary.ts',
    'supabase/functions/_shared/hrVocabulary.generated.ts',
  ],
];

const banner = (source) => [
  `// GENERATED MIRROR of ${source} — do not edit here.`,
  '// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by',
  '// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.',
  '',
  '',
].join('\n');

export function expectedMirror(source) {
  return banner(source) + readFileSync(join(root, source), 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [source, target] of VOCABULARIES) {
    writeFileSync(join(root, target), expectedMirror(source), 'utf8');
    console.log(`Wrote ${target} from ${source}.`);
  }
}
