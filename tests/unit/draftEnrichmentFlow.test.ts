import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));
const edge = read('supabase/functions/enrich-draft-products/index.ts');
const scraper = read('supabase/functions/_shared/tools/material-scrape-tools.ts');
const promote = read('mivaa-pdf-extractor/app/services/products/enrichment_promote.py');
const at = (src: string, needle: string) => {
  const i = src.indexOf(needle);
  expect(i, `${needle} not found`).toBeGreaterThan(-1);
  return i;
};

describe('draft enrichment: the order that makes a retry safe', () => {
  it('reserves credits before the model call, and saves the claims before it settles', () => {
    expect(at(edge, 'reserveCredits(')).toBeLessThan(at(edge, 'generateStructuredWithClaude('));
    expect(at(edge, "status: 'extracted'")).toBeLessThan(at(edge, 'settleCredits('));
  });

  it('crawls only a URL the gap report returned, never one built from the product name', () => {
    const calls = edge.match(/scrapeToMarkdown\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(edge).toContain('scrapeToMarkdown(row.source.url');
    expect(edge).not.toMatch(/webSearch|serp|dataforseo|perplexity/i);
  });

  it('claims pass acceptClaims, and only extracted claims reach the promote call', () => {
    expect(at(edge, 'acceptClaims(')).toBeLessThan(at(edge, "status: 'extracted'"));
    expect(at(edge, "status: 'extracted'")).toBeLessThan(at(edge, '/api/internal/product-enrichment/promote'));
  });

  it('refuses while the catalogue import job is still running', () => {
    expect(at(edge, "'pending', 'processing', 'retrying'")).toBeGreaterThan(-1);
    expect(at(edge, 'background_jobs')).toBeLessThan(at(edge, 'start_product_enrichment_attempt'));
  });

  it('only the caller that owns the attempt may crawl, and every checkpoint write is checked', () => {
    expect(at(edge, 'if (!attempt.owned)')).toBeLessThan(at(edge, 'scrapeToMarkdown(row.source.url'));
    expect(at(edge, 'const saveErr = await finish(')).toBeLessThan(at(edge, 'settleCredits('));
    expect(edge).toContain(').error;');
    expect(edge).toContain(': EXTRACTION_CEILING;');
  });

  it('checks the caller can publish in the workspace before doing anything', () => {
    expect(at(edge, "'catalog.import', 'pricing.manage'")).toBeLessThan(at(edge, "callMivaa('/api/internal/product-enrichment/gaps'"));
  });

  it('the scraper guards the URL before it debits or fetches', () => {
    const fn = scraper.slice(at(scraper, 'export async function scrapeToMarkdown'));
    expect(at(fn, 'assertSafeUrl(')).toBeLessThan(at(fn, 'debitOrRefuseTracked('));
    expect(at(fn, 'assertSafeUrl(')).toBeLessThan(at(fn, "fetch('https://api.firecrawl.dev"));
  });
});

describe('draft enrichment: promotion never replaces metadata wholesale', () => {
  it('writes through the per-key RPC and only to columns it owns', () => {
    expect(promote).toContain('merge_product_metadata_if_empty');
    expect(promote).not.toMatch(/update\(\{\s*["']metadata["']/);
    expect(promote).not.toMatch(/\.update\(\s*(metadata|product\[)/);
  });

  it('re-checks that a field is still empty and the product is still a draft before it merges', () => {
    const fn = promote.slice(at(promote, 'async def promote_attempt'));
    expect(at(fn, 'io.still_empty(')).toBeLessThan(at(fn, 'io.merge('));
    expect(at(fn, '!= "draft"')).toBeLessThan(at(fn, 'io.merge('));
  });

  it('rebuilds the derived data after the merge step whether or not it merged anything', () => {
    const fn = promote.slice(at(promote, 'async def promote_attempt'));
    expect(at(fn, 'io.merge(')).toBeLessThan(at(fn, 'io.canonicalize'));
    expect(fn).not.toMatch(/if not promoted:/);
  });

  it('never calls a model or a crawler', () => {
    expect(promote).not.toMatch(/firecrawl|anthropic|generate_text_embedding\(/i);
  });
});
