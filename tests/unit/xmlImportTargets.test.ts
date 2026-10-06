import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const read = (p: string) => blankComments(
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'),
);

const ORCHESTRATOR = 'supabase/functions/xml-import-orchestrator/index.ts';
const MODAL = 'src/components/Admin/DataImport/XMLFieldMappingModal.tsx';

function arrayLiteral(src: string, name: string): string[] {
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function modalTargets(src: string): string[] {
  const m = src.match(/const TARGET_FIELDS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!m) throw new Error('TARGET_FIELDS not found');
  return [...m[1].matchAll(/value:\s*'([^']+)'/g)].map((x) => x[1]);
}

describe('what the mapping UI offers is what the importer can resolve', () => {
  const orch = read(ORCHESTRATOR);
  const resolvable = new Set([
    ...arrayLiteral(orch, 'STRUCTURAL_TARGET_FIELDS'),
    ...arrayLiteral(orch, 'ATTRIBUTE_TARGET_FIELDS'),
    ...arrayLiteral(orch, 'COLUMN_TARGET_FIELDS'),
    'external_sku',
    'images',
    'material_category',
  ]);

  it('every target the operator can pick is one the resolver handles', () => {
    const offered = modalTargets(read(MODAL));
    const orphans = offered.filter((t) => !resolvable.has(t));
    expect(
      orphans,
      'an offered target the resolver does not know is accepted by the form, stored, and silently '
      + 'never applied — including the operator\'s job-level default for it',
    ).toEqual([]);
  });

  it('the three attributes a marketplace makes mandatory are offerable at all', () => {
    const offered = new Set(modalTargets(read(MODAL)));
    for (const t of ['mpn', 'barcode']) {
      expect(offered.has(t), `${t} is mandatory on Skroutz and BestPrice; with no target for it the `
        + 'only route is the metadata catch-all, which leaves the column NULL').toBe(true);
    }
  });

  it('column targets stay OUT of the facet metadata mirror', () => {
    const columns = arrayLiteral(orch, 'COLUMN_TARGET_FIELDS');
    const attributes = new Set(arrayLiteral(orch, 'ATTRIBUTE_TARGET_FIELDS'));
    for (const c of columns) {
      expect(attributes.has(c), `${c} is a products column, not a facet — mirroring it into metadata `
        + 'feeds it to the canonicalizer whitelist').toBe(false);
    }
  });
});
