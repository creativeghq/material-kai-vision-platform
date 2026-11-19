import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const INSTALLATION_MIRRORS = [
  [
    'src/lib/installation/tilePieces.ts',
    'supabase/functions/_shared/installation/tilePieces.generated.ts',
    [["'@/lib/surfaceRenderer/patternVocabulary'", "'../surfacePatterns.generated.ts'"]],
  ],
  [
    'src/lib/installation/tileFloorTemplate.ts',
    'supabase/functions/_shared/installation/tileFloorTemplate.generated.ts',
    [
      ["'@/lib/surfaceRenderer/patternVocabulary'", "'../surfacePatterns.generated.ts'"],
      ["'./tilePieces'", "'./tilePieces.generated.ts'"],
    ],
  ],
];

const banner = (source) => [
  `// GENERATED MIRROR of ${source} — do not edit here.`,
  '// Regenerate: npm run installation:mirror (part of gen:all). Freshness is enforced by',
  '// tests/unit/installationMirror.test.ts, which fails the build on any drift.',
  '',
  '',
].join('\n');

export function expectedMirror(source, rewrites) {
  let text = readFileSync(join(root, source), 'utf8');
  for (const [from, to] of rewrites) {
    if (!text.includes(from)) throw new Error(`${source}: expected import ${from} is gone — update INSTALLATION_MIRRORS`);
    text = text.split(from).join(to);
  }
  return banner(source) + text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [source, target, rewrites] of INSTALLATION_MIRRORS) {
    mkdirSync(dirname(join(root, target)), { recursive: true });
    writeFileSync(join(root, target), expectedMirror(source, rewrites), 'utf8');
    console.log(`Wrote ${target} from ${source}.`);
  }
}
