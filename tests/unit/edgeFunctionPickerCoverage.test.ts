/** Flow-builder edge-function picker ↔ endpoint catalogue parity. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOGUE = join(ROOT, 'scripts/edge-endpoints.json');
const PICKER = join(
  ROOT,
  'src/components/Admin/FlowsManagement/panels/configs/entitySearchService.ts',
);

/** Names in the generated catalogue that builds the public OpenAPI spec. */
function catalogueNames(): string[] {
  const entries = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as { name: string }[];
  return entries.map((e) => e.name).sort();
}

/**
 * Names in the picker's EDGE_FUNCTIONS array. Parsed from source rather than imported
 * because the module pulls in the Supabase client and half the service layer, which a unit
 * test has no business booting.
 */
function pickerNames(): string[] {
  const src = readFileSync(PICKER, 'utf8');
  const start = src.indexOf('const EDGE_FUNCTIONS');
  expect(start, 'EDGE_FUNCTIONS declaration not found — was it renamed?').toBeGreaterThan(-1);
  const end = src.indexOf('];', start);
  const block = src.slice(start, end);
  return [...block.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('flow edge-function picker ↔ endpoint catalogue', () => {
  const catalogue = catalogueNames();
  const picker = pickerNames();

  it('parses both sides (guards against an empty read)', () => {
    expect(catalogue.length, 'edge-endpoints.json parsed empty').toBeGreaterThan(50);
    expect(picker.length, 'EDGE_FUNCTIONS parsed empty').toBeGreaterThan(50);
  });

  it('every catalogued function is offered in the picker', () => {
    const missing = catalogue.filter((n) => !picker.includes(n));
    expect(
      missing,
      `Edge function(s) missing from the flow picker: ${missing.join(', ')}. ` +
        `Regenerate EDGE_FUNCTIONS from scripts/edge-endpoints.json — a flow author ` +
        `cannot select what the dropdown does not list.`,
    ).toEqual([]);
  });

  it('the picker offers no function that is not in the catalogue', () => {
    const phantom = picker.filter((n) => !catalogue.includes(n));
    expect(
      phantom,
      `Flow picker offers function(s) with no catalogue entry: ${phantom.join(', ')}. ` +
        `Selecting one builds a flow node that calls a function we do not document ` +
        `(and may not deploy).`,
    ).toEqual([]);
  });

  it('picker entries are unique', () => {
    const dupes = picker.filter((n, i) => picker.indexOf(n) !== i);
    expect(dupes, `duplicate picker entries: ${dupes.join(', ')}`).toEqual([]);
  });
});
