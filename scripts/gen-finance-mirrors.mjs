/**
 * Regenerate the Deno-side mirrors of the two dependency-free finance modules that BOTH the
 * React invoice preview and the pdf-lib invoice generator have to agree on:
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
  [
    // #375 — the configurator choices on a line, rendered the same way on the customer's PDF
    // (Deno) and on the operator's screen (Vite). One source, because a document and the screen
    // that produced it disagreeing about what was configured is the whole defect.
    'src/modules/finance/invoice-templates/configuredOptions.ts',
    'supabase/functions/_shared/finance/configured-options.ts',
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
