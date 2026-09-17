import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const API = 'supabase/functions/products-3d-api/index.ts';
const BUILDER = 'src/embed/materialkai-builder.ts';

describe('the embed catalogue search does not hand raw input to PostgREST', () => {
  const code = blankComments(read(API));

  it('sanitises the query before it reaches an or() filter', () => {
    const or = code.match(/\.or\(`[^`]*`/);
    expect(or, 'the list action should build an or() filter for the text search').not.toBeNull();
    expect(or![0], 'the raw query must not be interpolated into a PostgREST expression')
      .not.toMatch(/\$\{q\}/);
    expect(or![0]).toMatch(/\$\{safe\}/);
  });

  it('strips the characters PostgREST reads as syntax rather than as text', () => {
    const cls = code.match(/replace\(\/\[([^\]]*)\]\/g/);
    expect(cls, 'the query should be run through a character-class replace').not.toBeNull();
    const stripped = cls![1];
    for (const ch of [',', '.', '(', ')', '\\', ':', '"', '*', '%']) {
      expect(stripped.includes(ch), `${ch} must be stripped from the query`).toBe(true);
    }
  });

  it('a query that sanitises away returns nothing, never the whole catalogue', () => {
    expect(code).toMatch(/if \(!safe\) return embedJson\(\{ ok: true, products: \[\] \}/);
  });

  it('the search narrows the same id intersection the key scope already applies', () => {
    expect(code, 'a caller must not be able to widen past their embed key scope')
      .toMatch(/intersectIdFilters\(\s*await scopeRestriction\([^)]*\), modelledIds, matchedIds,?\s*\)/);
  });
});

describe('the builder tells an empty shelf apart from a broken one', () => {
  const code = blankComments(read(BUILDER));

  it('records that the load failed instead of just emptying the shelf', () => {
    expect(code).toMatch(/this\.shelfFailed = true/);
    expect(code).toMatch(/this\.shelfFailed = false/);
  });

  it('a non-ok response is a failure, not an empty catalogue', () => {
    expect(code).toMatch(/if \(!res\.ok\) throw new Error/);
  });

  it('typing does not re-render, which would drop focus on every keystroke', () => {
    const handler = code.match(/private onShelfQuery\([\s\S]*?\n  \}/);
    expect(handler, 'onShelfQuery should exist').not.toBeNull();
    expect(handler![0], 'the input handler must not render synchronously')
      .not.toMatch(/this\.render\(\)/);
    expect(handler![0]).toMatch(/setTimeout/);
  });
});
