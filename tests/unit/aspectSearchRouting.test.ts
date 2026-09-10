/** Aspect-search routing guard (#277). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SEARCH_TOOLS = join(ROOT, 'supabase/functions/_shared/tools/search-tools.ts');
const SEARCH_SERVICE = join(ROOT, 'src/services/unifiedSearchService.ts');

/** The four aspects, in the order the rest of the platform lists them. */
const ASPECTS = ['color', 'texture', 'style', 'material'] as const;

const read = (p: string) => readFileSync(p, 'utf8');

/** Slice out one `export const <name> = ...` block, up to the next top-level export. */
function extractExport(src: string, name: string): string {
  const start = src.indexOf(`export const ${name}`);
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
  const next = src.indexOf('\nexport const ', start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('visual_search routes an aspect to an endpoint that honors it', () => {
  const visualSearch = extractExport(read(SEARCH_TOOLS), 'createVisualSearchTool');

  it('sends the aspect case to /api/search/by-<aspect>', () => {
    expect(
      visualSearch,
      'visual_search must target /api/search/by-${aspect} when an aspect is set — it is the ' +
        'only endpoint that can match an IMAGE against the per-aspect collections.',
    ).toContain('/api/search/by-${aspect}');
  });

  it('never sends `aspect` in a body alongside the image strategy', () => {
    // The original bug, verbatim: `...(aspect ? { aspect } : {})` spread into the
    // strategy=image body. Anything of that shape is the regression coming back.
    expect(
      visualSearch,
      'strategy=image ignores `aspect`. Sending it there produces unbiased results that ' +
        'look correct. Use /api/search/by-<aspect> instead.',
    ).not.toMatch(/\baspect\s*\?\s*\{\s*aspect\s*\}/);
  });

  it('never falls back to strategy=image, which returns unusable rows', () => {
    // strategy=image ranks on the SLIG vector alone and returns bare
    // `{image_id, similarity_score}`. The route's enrichment keys on a product id those rows
    // do not carry, so the agent received UUIDs it could not turn into an answer. The
    // non-aspect path uses multi_vector, which returns named products with related images.
    expect(visualSearch).not.toMatch(/'strategy',\s*'image'/);
    expect(
      visualSearch,
      'the non-aspect path must ask for multi_vector',
    ).toMatch(/!aspect[\s\S]{0,120}'strategy',\s*'multi_vector'/);
  });

  it('gates every path that spends a vision call, before it spends it', () => {
    // MIVAA runs Claude vision in two cases: an aspect search, and an image search with no
    // text (the text channels stand down, so the image must supply the query vectors).
    // Invariant 10 — the check happens BEFORE the upstream call, never after. An image WITH
    // words reuses stored vectors and is deliberately left ungated.
    expect(
      visualSearch,
      'the gate must cover both the aspect case and the no-text case',
    ).toMatch(/willRunVision\s*=\s*Boolean\(aspect\)\s*\|\|\s*!\(query \|\| ''\)\.trim\(\)/);

    const gateAt = visualSearch.indexOf('reserveCredits');
    const fetchAt = visualSearch.indexOf('await fetch(');
    expect(gateAt, 'reserveCredits must be called').toBeGreaterThan(-1);
    expect(gateAt, 'the credit gate must run before the upstream call, not after').toBeLessThan(fetchAt);
  });

  it('does not rerank the aspect results', () => {
    // Reranking sorts by text relevance to the user's phrasing. On the aspect path that
    // would discard the exact bias a vision call was just spent computing, which is the
    // silent-no-op this whole guard is about — arriving one layer later.
    expect(visualSearch).toMatch(/if \(aspect\)[\s\S]{0,600}return JSON\.stringify\(data\)/);
  });
});

describe('the aspect vocabulary agrees across every surface', () => {
  it('the agent tools and the frontend service offer the same four aspects', () => {
    const toolsSrc = read(SEARCH_TOOLS);
    const serviceSrc = read(SEARCH_SERVICE);

    // z.enum(['color', 'texture', 'style', 'material']) in the agent tool schemas.
    const enums = [...toolsSrc.matchAll(/z\.enum\(\[([^\]]*)\]\)[\s\S]{0,40}?aspect|aspect:\s*z\.enum\(\[([^\]]*)\]\)/g)]
      .map((m) => (m[1] ?? m[2] ?? '').match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [])
      .filter((v) => v.length > 0);

    expect(enums.length, 'expected at least one `aspect: z.enum([...])` in search-tools.ts').toBeGreaterThan(0);
    for (const values of enums) {
      expect([...values].sort()).toEqual([...ASPECTS].sort());
    }

    // aspect?: 'color' | 'texture' | 'style' | 'material' in the service.
    const unions = [...serviceSrc.matchAll(/aspect\??:\s*((?:'[a-z_]+'\s*\|\s*)+'[a-z_]+')/g)].map((m) =>
      (m[1].match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, '')),
    );

    expect(unions.length, 'expected an `aspect?: ...` union in unifiedSearchService.ts').toBeGreaterThan(0);
    for (const values of unions) {
      expect([...values].sort()).toEqual([...ASPECTS].sort());
    }
  });

  it('searchMultiVector pins the one strategy that reads the aspect', () => {
    // The service's aspect can only ever reach the fusion re-weighting, so this must not
    // become caller-supplied without the caller being checked against the guard above.
    const serviceSrc = read(SEARCH_SERVICE);
    const method = serviceSrc.slice(serviceSrc.indexOf('static async searchMultiVector'));
    expect(method).toContain("strategy: 'multi_vector'");
  });
});
