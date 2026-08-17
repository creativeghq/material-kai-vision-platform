/**
 * Product-relationship derivation guard (issue #267).
 *
 * The bug this exists to stop: "what relates to this product" was answered TWICE.
 * MIVAA's search enrichment, the agent tools and the admin backfill all read the
 * gold-layer `product_edges` table (derived once by `rebuild_product_edges`, served
 * by `get_related_products`). The product-detail *Related* tab did not — it called
 * `find_similar_products` / `find_complementary_products`, which re-derived the
 * answer live per query from a different signal mix. Same question, two answers,
 * and the user-facing one was the weaker: it scored same-name variants with
 * `random()` and, when nothing matched, fell through to "the most recently added
 * products" at a flat 0.50 — unrelated rows presented as similar.
 *
 * Both RPCs are dropped. This test fails the build if a second derivation reappears
 * on the client side.
 *
 * SCOPE — a clean run does NOT prove the invariant holds. This scans REPO FILES, so
 * it sees only the TypeScript half; this project's SQL lives in `pg_proc` and is
 * never committed (CLAUDE.md), so a new SQL function that re-derives relationships
 * is invisible here. The DB-side rules are: one derivation (`rebuild_product_edges`)
 * and one read path (`get_related_products`), and `product_edges` rows must pass the
 * `product_edges_workspace_parity` trigger.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** The read path. Everything client-side goes through this one RPC. */
const READ_RPC = 'get_related_products';

/** The dropped second derivation. These names must not come back. */
const BANNED_RPCS = ['find_similar_products', 'find_complementary_products'];

/** The single file allowed to talk to the relationship layer. */
const SERVICE = 'src/services/productRecommendationsService.ts';

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

describe('product relationships have exactly one derivation', () => {
  const files = walk(SRC);
  const sources = files.map((f) => ({
    path: relative(ROOT, f).replace(/\\/g, '/'),
    code: stripComments(readFileSync(f, 'utf8')),
  }));

  it('finds sources to scan', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('does not reintroduce the dropped per-query derivation RPCs', () => {
    const offenders = sources.filter((s) =>
      BANNED_RPCS.some((rpc) => s.code.includes(rpc)),
    );
    expect(
      offenders.map((o) => o.path),
      `${BANNED_RPCS.join(' / ')} were dropped in favour of ${READ_RPC} — ` +
      'reintroducing them recreates the two-derivations bug',
    ).toEqual([]);
  });

  it('routes every relationship read through the one service', () => {
    const callers = sources
      .filter((s) => s.code.includes(READ_RPC))
      .map((s) => s.path)
      // The generated Supabase types name every RPC; that is a type surface, not a call.
      .filter((p) => p !== 'src/integrations/supabase/types.ts');

    expect(callers).toEqual([SERVICE]);
  });

  it('never reads the edge table directly, bypassing the read RPC', () => {
    // `get_related_products` dedupes to the best edge per neighbour and joins the
    // product row inside one workspace-asserted call. A raw .from('product_edges')
    // select skips all of that and re-implements the ranking.
    const offenders = sources.filter((s) =>
      /from\(\s*['"`]product_edges['"`]/.test(s.code),
    );
    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it('keeps the mode → edge-type mapping in the service, not in components', () => {
    // Edge types are a DB vocabulary (CHECK-constrained). A component that names one
    // is deciding what "similar" means a second time.
    const EDGE_TYPES = ['material_family', 'pattern_match', 'complementary', 'alternative'];
    const offenders = sources.filter(
      (s) =>
        s.path !== SERVICE &&
        s.path !== 'src/integrations/supabase/types.ts' &&
        !s.path.startsWith('src/components/features/products/ProductRecommendationsPanel') &&
        EDGE_TYPES.filter((t) => s.code.includes(`'${t}'`)).length >= 2,
    );
    expect(offenders.map((o) => o.path)).toEqual([]);
  });
});
