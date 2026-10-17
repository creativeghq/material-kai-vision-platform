import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  planFactoryPropagation,
  isFactoryScopeColumn,
  fillEmptyFactoryFields,
} from '../../supabase/functions/_shared/agents/propagation-utils.ts';
import {
  productIdsInPayload,
  publicSearchResult,
  publicSpecResult,
} from '../../supabase/functions/_shared/embed-agent-tools.ts';
import type { EmbedKeyContext } from '../../supabase/functions/_shared/embed-key.ts';
import { escapeLike } from '../../supabase/functions/_shared/searchFold.ts';

const ROOT = join(__dirname, '..', '..');
const FN = 'supabase/functions';
const read = (p: string) => stripComments(readFileSync(join(ROOT, FN, p), 'utf8'));

function productChainsUnscoped(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf(".from('products')");
  while (at >= 0) {
    const end = src.indexOf(';', at);
    const chain = src.slice(at, end < 0 ? undefined : end);
    if (!chain.includes(".eq('workspace_id'")) out.push(chain.slice(0, 160));
    at = src.indexOf(".from('products')", at + 1);
  }
  return out;
}

describe('factory propagation stays inside one manufacturer and fills only gaps', () => {
  const meta = (name: string | null, factory: Record<string, unknown>) => ({
    ...(name ? { factory_name: name } : {}),
    factory: { ...(name ? { factory_name: name } : {}), ...factory },
  });

  it('never copies one manufacturer onto another', () => {
    const updates = planFactoryPropagation([
      { id: 'a1', metadata: meta('Alpha', { city: 'Milan', country: 'IT', phone: '1', email: 'a@x', website: 'https://a', address: 'x', country_of_origin: 'IT', employee_count: 5 }) },
      { id: 'b1', metadata: meta('Beta', { city: 'Porto' }) },
    ]);
    expect(updates.find((u) => u.id === 'b1')).toBeUndefined();
  });

  it('fills only empty fields from the same manufacturer', () => {
    const updates = planFactoryPropagation([
      { id: 'a1', metadata: meta('Alpha', { city: 'Milan', country: 'IT', phone: '1' }) },
      { id: 'a2', metadata: meta('alpha ', { city: 'Rome' }) },
    ]);
    const a2 = updates.find((u) => u.id === 'a2')!;
    expect((a2.metadata.factory as Record<string, unknown>).city).toBe('Rome');
    expect((a2.metadata.factory as Record<string, unknown>).phone).toBe('1');
  });

  it('an unnamed product inherits only when the scope has a single manufacturer', () => {
    const single = planFactoryPropagation([
      { id: 'a1', metadata: meta('Alpha', { city: 'Milan' }) },
      { id: 'u', metadata: {} },
    ]);
    expect(single.find((u) => u.id === 'u')).toBeDefined();
    const multi = planFactoryPropagation([
      { id: 'a1', metadata: meta('Alpha', { city: 'Milan' }) },
      { id: 'b1', metadata: meta('Beta', { city: 'Porto' }) },
      { id: 'u', metadata: {} },
    ]);
    expect(multi.find((u) => u.id === 'u')).toBeUndefined();
  });

  it('fillEmptyFactoryFields never overwrites', () => {
    expect(fillEmptyFactoryFields({ city: 'Rome', phone: '' }, { city: 'Milan', phone: '9' }))
      .toEqual({ city: 'Rome', phone: '9' });
  });

  it('the scope column is a runtime allowlist', () => {
    expect(isFactoryScopeColumn('source_document_id')).toBe(true);
    for (const bad of ['status', 'workspace_id', 'scrape_session_id', 'id', '', null]) {
      expect(isFactoryScopeColumn(bad)).toBe(false);
    }
  });
});

describe('service-role product writers are bounded by the authorized workspace', () => {
  const files = [
    'trigger-factory-enrichment/index.ts',
    '_shared/agents/propagation-utils.ts',
    '_shared/agents/factory-enrichment-agent.ts',
    '_shared/agents/product-enrichment-agent.ts',
    '_shared/agents/material-tagger-agent.ts',
  ];
  it.each(files)('%s', (f) => {
    expect(productChainsUnscoped(read(f))).toEqual([]);
  });

  it('agents take the workspace from the run context, never from input, and fail closed', () => {
    for (const f of files.slice(2)) {
      const src = read(f);
      expect(src, f).toMatch(/const workspaceId = ctx\.workspaceId;/);
      expect(src, f).toMatch(/workspace_required/);
    }
  });

  it('the trigger verifies product ids belong to the workspace and 404s otherwise', () => {
    const src = read('trigger-factory-enrichment/index.ts');
    expect(src).toMatch(/isFactoryScopeColumn\(scope_column\)/);
    expect(src).toMatch(/owned \?\? \[\]\)\.length !== requestedIds\.length[\s\S]{0,160}status: 404/);
  });

  it('the platform repair agent refuses a workspace-owned copy', () => {
    expect(read('_shared/agents/embedding-backfill-agent.ts')).toMatch(/agentConfig\.workspace_id !== null/);
  });
});

describe('LLM product writers are server-constrained, fenced and merge attributes', () => {
  for (const f of ['_shared/agents/product-enrichment-agent.ts', '_shared/agents/material-tagger-agent.ts']) {
    it(f, () => {
      const src = read(f);
      expect(src).toMatch(/generateStructuredWithClaude\(/);
      expect(src).toMatch(/wrapUntrusted\('product record'/);
      expect(src).not.toMatch(/JSON\.parse|runLangGraphAgent/);
      expect(src).toMatch(/\.\.\.\(\(product\.attributes \?\? \{\}\)/);
    });
  }

  it('material_category is the registry vocabulary', () => {
    const src = read('_shared/agents/product-enrichment-agent.ts');
    expect(src).toMatch(/loadMaterialCategoryVocab\(supabase\)/);
    expect(src).toMatch(/resolveMaterialCategory\(enriched\.material_category, vocab\)/);
  });
});

describe('catalogue access matches emails exactly', () => {
  const src = read('catalog-access/index.ts');
  it('matches case-insensitively, with every wildcard in the typed address escaped', () => {
    expect(src).toMatch(/const emailPattern = escapeLike\(email\);/);
    expect(src.match(/\.ilike\(/g)?.length).toBe(4);
    expect(src.match(/\.ilike\('email', emailPattern\)/g)?.length).toBe(4);
    expect(src).not.toMatch(/\.eq\('email', email\)/);
    expect(src).toMatch(/resolveEmailMatch\(supabase, catalog\.id, normalizeEmail\(log\.email\)/);
  });
  it('escapeLike neutralises %, _ and backslash', () => {
    expect(escapeLike('a_b%c\\d@x.com')).toBe('a\\_b\\%c\\\\d@x.com');
  });
  it('a lead token survives verify while the catalogue still admits leads', () => {
    expect(src).toMatch(/log\.matched_kind === 'lead' && \(mode === 'any_email' \|\| mode === 'open'\)/);
  });
  it('sending and rendering check a capability on the catalogue workspace', () => {
    const send = read('catalog-send-to-customers/index.ts');
    expect(send).not.toMatch(/roles!user_profiles_role_id_fkey/);
    expect(send).toMatch(/userHasWorkspaceCapability\(\s*supabase, auth\.userId, catalog\.workspace_id/);
    expect(read('generate-catalog-pdf/index.ts')).toMatch(/userHasWorkspaceCapability\(supabase, auth\.userId, catalog\.workspace_id/);
  });
  it('a translated catalogue persists a path, never a signed URL', () => {
    const src = read('catalog-translate-pdf/index.ts');
    expect(src).not.toMatch(/m\.image_url = data\.image_url/);
    expect(src).toMatch(/m\.image_storage_path = data\.storage_path/);
  });
});

describe('moodboard sheet renders are scoped even as the service role', () => {
  const src = read('generate-moodboard-sheet-pdf/index.ts');
  const fetcher = read('generate-moodboard-sheet-pdf/data-fetcher.ts');
  it('a service render scopes to the sheet creator', () => {
    expect(src).not.toMatch(/auth\.isService \? null/);
    expect(src).toMatch(/\(auth\.isService \? sheet\.created_by : auth\.userId\) \?\? NIL_UUID/);
    expect(src).toMatch(/\.eq\('status', 'active'\)/);
  });
  it('a failed read fails the render instead of printing an empty section', () => {
    expect(fetcher).not.toMatch(/console\.error/);
    expect(fetcher).toMatch(/if \(productsErr\) throw/);
    expect(fetcher).toMatch(/FF&E schedule unreadable/);
  });
});

describe('agent catalogue search fences supplier text', () => {
  const src = read('_shared/tools/search-tools.ts');
  it('material_search and visual_search return through fenceSearchPayload', () => {
    expect(src.match(/JSON\.stringify\(fenceSearchPayload\(/g)?.length).toBe(3);
    expect(src).toMatch(/data\._untrusted = UNTRUSTED_FIELDS_NOTE/);
  });
});

describe('catalog-image-search and intake enrichment', () => {
  it('image search is workspace-scoped and a failed catalogue search never buys web results', () => {
    const src = read('catalog-image-search/index.ts');
    expect(src).toMatch(/workspace_id: workspaceId, top_k: limit/);
    expect(src).not.toMatch(/if \(!res\.ok\) return \[\]/);
    expect(src).toMatch(/Catalogue image search failed' \}, 502/);
    expect(src).toMatch(/p\.product_name \|\| p\.name/);
  });
  it('intake enrichment is schema-constrained, reads global fields and checks every record', () => {
    const src = read('intake-enrich-products/index.ts');
    expect(src).toMatch(/generateStructuredWithClaude\(userMessage, extractionSchema\(fieldKeys\)/);
    expect(src).not.toMatch(/parseReply|indexOf\('\{'\)|\.limit\(60\)/);
    expect(src).toMatch(/applies_to_categories\.is\.null/);
    expect(src).not.toMatch(/await supabase\.rpc\('record_product_enrichment'[^;]*;\s*\n\s*(enriched|noSource|lowConfidence)\+\+/);
  });
  it('an exhausted credit reserve records every remaining claimed product, never leaves one running', () => {
    const src = read('intake-enrich-products/index.ts');
    expect(src).toMatch(/for \(const \[idx, p\] of batch\.entries\(\)\)/);
    expect(src).toMatch(/if \(!reserve\.ok\) \{[\s\S]{0,200}for \(const rest of batch\.slice\(idx\)\) await fail\(rest, reason\);\s*break;/);
  });
});

describe('embed search returns a public projection only', () => {
  const ctx = (over: Partial<EmbedKeyContext> = {}): EmbedKeyContext => ({
    keyId: 'k', workspaceId: 'ws', scopeType: 'all', scopeValues: [], cors: {}, ...over,
  });

  function fakeDb(rows: unknown[]) {
    const calls: Array<[string, unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'in']) {
      builder[m] = (...args: unknown[]) => { calls.push([m, args]); return builder; };
    }
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    const db = {
      from: (t: string) => { calls.push(['from', [t]]); return builder; },
      rpc: async (_fn: string, args: { p_bag: Record<string, unknown> }) => ({
        data: Object.fromEntries(Object.entries(args.p_bag).filter(([k]) => k !== 'net_price')),
        error: null,
      }),
    };
    return { db: db as never, calls };
  }

  it('reads ids from either payload shape, in order', () => {
    expect(productIdsInPayload({ results: [{ product_id: 'b' }, { id: 'a' }], products: [{ id: 'b' }] }))
      .toEqual(['b', 'a']);
  });

  it('filters to active, published, workspace rows and strips chunks and internal fields', async () => {
    const { db, calls } = fakeDb([{
      product_id: 'p1', variant_key: null, list_price: 10, currency: 'EUR', unit: 'm2',
      product: { id: 'p1', name: 'Tile', description: 'd', attributes: { color: 'red', net_price: 3 } },
    }]);
    const out = await publicSearchResult(db, ctx(), {
      results: [{ id: 'p1', content: 'raw chunk' }, { id: 'draft' }],
      chunks: [{ content: 'pdf text' }],
    });
    expect(out.results).toEqual([{
      id: 'p1', name: 'Tile', description: 'd', attributes: { color: 'red' },
      price: { list_price: 10, currency: 'EUR', unit: 'm2' },
    }]);
    expect(out.chunks).toBeUndefined();
    expect(calls).toContainEqual(['eq', ['workspace_id', 'ws']]);
    expect(calls).toContainEqual(['eq', ['storefront_published', true]]);
    expect(calls).toContainEqual(['eq', ['product.status', 'active']]);
  });

  it('honours a products-scoped key and a blueprint key', async () => {
    const { db, calls } = fakeDb([]);
    await publicSearchResult(db, ctx({ scopeType: 'products', scopeValues: ['p2'] }), { results: [{ id: 'p1' }, { id: 'p2' }] });
    expect(calls).toContainEqual(['in', ['product_id', ['p2']]]);
    const bp = fakeDb([]);
    const out = await publicSearchResult(bp.db, ctx({ scopeType: 'blueprints', scopeValues: ['b'] }), { results: [{ id: 'p1' }] });
    expect(out.results).toEqual([]);
    expect(bp.calls).toEqual([]);
  });

  it('a category-scoped key filters on the product category', async () => {
    const { db, calls } = fakeDb([]);
    await publicSearchResult(db, ctx({ scopeType: 'categories', scopeValues: ['c1'] }), { results: [{ id: 'p1' }] });
    expect(calls).toContainEqual(['in', ['product.category_id', ['c1']]]);
  });

  it('price_my_spec drops an exact match the public may not see, and internal vocabulary keys', async () => {
    const { db } = fakeDb([]);
    const out = await publicSpecResult(db, ctx(), {
      success: true, match_kind: 'exact', product: { product_id: 'draft', net_price: 5 },
      near_matches: [{ product_id: 'draft', name: 'x' }],
      available_vocabulary: [{ key: 'color', values: ['red'] }, { key: 'net_price', values: ['3'] }],
    });
    expect(out.product).toBeNull();
    expect(out.match_kind).toBe('none');
    expect(out.near_matches).toEqual([]);
    expect(out.available_vocabulary).toEqual([{ key: 'color', values: ['red'] }]);
  });
});
