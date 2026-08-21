/**
 * Regenerate the Deno-side mirrors of the two dependency-free finance modules that BOTH the
 * React invoice preview and the pdf-lib invoice generator have to agree on:
 *
 *   • who the document is addressed to (billing identity + issue-time snapshot), and
 *   • the myDATA VAT-exemption catalog (the legal ground printed on a 0% line).
 *
 * Neither can be imported across runtimes — Vite resolves the `@/` alias, Deno resolves by URL —
 * and both are load-bearing on a legal document. A hand-kept second copy is precisely how the
 * printer came to read the live CRM row while the transmission read the frozen snapshot, so the
 * copies are GENERATED: one banner prepended, nothing else changed. Both source modules are
 * deliberately import-free so this stays a byte copy.
 *
 * Guarded by tests/unit/financeMirrors.test.ts, which fails the build when a checked-in mirror
 * is not what this script would produce.
 *
 * NO SHEBANG, deliberately: `core.autocrlf` is on, so a Windows checkout can hand this file CRLF,
 * and a `#!` line followed by CRLF makes vitest's loader throw "Invalid or unexpected token" —
 * reported against the IMPORT in the test, nowhere near the actual cause. Nothing executes this
 * file directly; package.json runs it as `node scripts/gen-finance-mirrors.mjs`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** [source, target] pairs, repo-relative. */
export const MIRRORS = [
  [
    'src/modules/finance/invoice-templates/counterparty.ts',
    'supabase/functions/_shared/finance/invoice-party.ts',
  ],
  [
    'src/lib/mydataExemptionCategories.ts',
    'supabase/functions/_shared/finance/vat-exemptions.ts',
  ],
];

const banner = (source) => [
  `// GENERATED MIRROR of ${source} — do not edit here.`,
  '// Regenerate: npm run finance:mirror (part of gen:all). Freshness is enforced by',
  '// tests/unit/financeMirrors.test.ts, which fails the build on any drift.',
  '',
  '',
].join('\n');

export function expectedMirror(source) {
  return banner(source) + readFileSync(join(root, source), 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [source, target] of MIRRORS) {
    writeFileSync(join(root, target), expectedMirror(source), 'utf8');
    console.log(`Wrote ${target} from ${source}.`);
  }
}
