/**
 * The two generated finance mirrors must be what `npm run finance:mirror` would produce.
 *
 * Both source modules answer a question a legal document depends on:
 *   • who it is addressed to (issue-time snapshot + separate billing identity), and
 *   • the legal ground for charging no VAT on a 0% line.
 *
 * The React preview and the pdf-lib generator run on different runtimes and cannot share an
 * import, so each answer exists twice. Hand-keeping the second copy is exactly what let the
 * printer read the LIVE CRM row while the myDATA transmission read the frozen snapshot — the
 * paper and the envelope disagreeing with nothing to surface it. The copies are generated
 * instead, and this test fails the build the moment one goes stale.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MIRRORS, expectedMirror } from '../../scripts/gen-finance-mirrors.mjs';

/**
 * Line endings are not part of the contract. `core.autocrlf` is on for Windows clones, so the
 * mirror git wrote at checkout carries CRLF while the string the generator builds carries
 * whatever the source had. Comparing raw would fail a clean Windows clone for a reason that has
 * nothing to do with drift, so both sides go through this first.
 */
const normalizeEol = (text: string): string => text.split('\r\n').join('\n');

const root = join(__dirname, '..', '..');

describe('finance cross-runtime mirrors', () => {
  it.each(MIRRORS)('%s → %s is up to date', (source: string, target: string) => {
    const onDisk = readFileSync(join(root, target), 'utf8');
    expect(
      normalizeEol(onDisk),
      `${target} is not what ${source} would generate. Run \`npm run finance:mirror\` — and do ` +
        'NOT hand-edit the mirror: it exists so the printer and the myDATA transmission cannot ' +
        'answer "who is this addressed to" differently.',
    ).toBe(normalizeEol(expectedMirror(source)));
  });

  it('every mirror source is import-free, so the mirror can stay a byte copy', () => {
    for (const [source] of MIRRORS) {
      const text = readFileSync(join(root, source), 'utf8');
      const imports = text.match(/^\s*import\s.+$/gm) ?? [];
      expect(
        imports,
        `${source} gained an import. The generator copies the file verbatim, so a Vite-resolved ` +
          'specifier (`@/…`) would not resolve on Deno. Either inline what it needs, or teach ' +
          'scripts/gen-finance-mirrors.mjs to rewrite that specifier the way the blueprint ' +
          'mirror rewrites its one import.',
      ).toEqual([]);
    }
  });
});
