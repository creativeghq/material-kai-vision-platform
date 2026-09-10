/** Regenerate src/utils/blueprintComposition.ts from the authoritative edge copy. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = join(root, 'supabase/functions/_shared/blueprint/composition.ts');
export const TARGET = join(root, 'src/utils/blueprintComposition.ts');

const BANNER = [
  '// GENERATED MIRROR of supabase/functions/_shared/blueprint/composition.ts — do not edit here.',
  '// Regenerate: npm run blueprint:mirror. Behaviour parity is enforced by',
  '// tests/unit/blueprintComposition.test.ts, which runs one corpus through both copies.',
  '',
].join('\n');

/** The ONLY permitted difference: Deno resolves `./formula.ts`, Vite resolves `./blueprintFormula`. */
export function renderMirror(source) {
  return BANNER + source.replace(
    "import { computeLinePricing, round2 } from './formula.ts';",
    "import { computeLinePricing, round2 } from './blueprintFormula';",
  );
}

export function expectedMirror() {
  return renderMirror(readFileSync(SOURCE, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(TARGET, expectedMirror(), 'utf8');
  console.log('Wrote src/utils/blueprintComposition.ts from the edge copy.');
}
