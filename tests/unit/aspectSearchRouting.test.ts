/**
 * Aspect-search routing guard (#277).
 *
 * The bug this exists to stop: an `aspect` sent to an endpoint that does not read it.
 *
 * `/api/rag/search` accepts `aspect` on its request model, but only the `multi_vector`
 * branch ever looks at it — that branch re-weights the fusion toward the chosen aspect's
 * channel. The `image` branch ranks on the SLIG visual vector alone. `visual_search`
 * pointed at `strategy=image` and passed `aspect` anyway, so for months every "find
 * materials with a similar TEXTURE to this image" returned plain overall visual
 * similarity: the field was accepted by Pydantic, dropped on the floor, and nothing
 * anywhere raised. A silently ignored parameter is indistinguishable from a working one
 * — the results are plausible, just not aspect-biased.
 *
 * It could not be fixed by passing the flag harder. The per-aspect collections hold no
 * image vectors at all: `image_<aspect>_embeddings` are Voyage embeddings of
 * vision-analysis TEXT, so an image only reaches them by re-running the same
 * analyze → serialize → embed pipeline ingestion ran. `/api/search/by-<aspect>` is the
 * endpoint that does that — it existed, correct and metered, with zero callers.
 *
 * So there are exactly TWO endpoints that honor an aspect, and this fails the build if a
 * caller sends one somewhere else:
 *   - `/api/rag/search?strategy=multi_vector`  → re-weights the fusion
 *   - `/api/search/by-<aspect>`                → queries the collection directly
 *
 * SCOPE — a clean run here does not mean the invariant holds end to end. This scans repo
 * files, so it sees the TypeScript half only. The MIVAA half lives in a separate repo
 * (`creativeghq/mivaa-pdf-extractor`) that CI does not check out as a submodule; its side
 * of this guard — that any strategy other than multi_vector REFUSES an aspect instead of
 * ignoring it — is `mivaa-pdf-extractor/tests/unit/test_aspect_strategy_guard.py`.
 */
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

  it('only reaches for strategy=image when there is no aspect', () => {
    expect(
      visualSearch,
      "setting strategy='image' must be guarded by `if (!aspect)`",
    ).toMatch(/!aspect[\s\S]{0,120}'strategy',\s*'image'/);
  });

  it('gates the aspect path on credits before the vision spend', () => {
    // The aspect path makes MIVAA run a Claude vision analysis of the image. Invariant 10:
    // the check happens BEFORE the upstream call, never after. The plain path compares
    // stored vectors only and is deliberately left ungated.
    const gate = visualSearch.match(/if \(aspect\)[\s\S]{0,400}?reserveCredits\([\s\S]{0,200}?\}/);
    expect(gate, 'the aspect branch must call reserveCredits before fetching').not.toBeNull();

    const gateAt = visualSearch.indexOf('reserveCredits');
    const fetchAt = visualSearch.indexOf('await fetch(');
    expect(gateAt).toBeGreaterThan(-1);
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
