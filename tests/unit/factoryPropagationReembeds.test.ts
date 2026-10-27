import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));
const utils = read('supabase/functions/_shared/agents/propagation-utils.ts');
const admin = read('supabase/functions/_shared/mivaa-admin.ts');
const at = (src: string, needle: string) => {
  const i = src.indexOf(needle);
  expect(i, `${needle} not found`).toBeGreaterThan(-1);
  return i;
};

describe('factory propagation: it writes its own keys and the vector follows the name', () => {
  it('never replaces the whole metadata object', () => {
    expect(utils).not.toMatch(/\.update\(\s*\{\s*metadata/);
    expect(utils).toContain("rpc('set_product_metadata_keys'");
  });

  it('carries only the keys it owns', () => {
    expect(utils).toContain("const FACTORY_KEYS = ['factory', 'factory_name', 'factory_group_name']");
    expect(utils).toMatch(/for \(const k of FACTORY_KEYS\)/);
  });

  it('re-embeds after the batch writes, and after the single write, only when a name changed', () => {
    const batch = utils.slice(at(utils, 'export async function propagateFactoryFieldsInScope'));
    expect(at(batch, 'setFactoryKeys(')).toBeLessThan(at(batch, 'reembedLazily('));
    expect(at(batch, 'embeddingNamesChanged(')).toBeLessThan(at(batch, 'reembedLazily('));
    const single = utils.slice(at(utils, 'export async function writeFactoryToProduct'));
    expect(at(single, 'setFactoryKeys(')).toBeLessThan(at(single, 'reembedLazily('));
    expect(single).toContain('embeddingNamesChanged(');
  });

  it('keeps the pure planners importable without a Deno runtime', () => {
    expect(utils).not.toMatch(/^import \{[^}]*\} from '\.\.\/mivaa-admin\.ts'/m);
    expect(utils).toContain("await import('../mivaa-admin.ts')");
  });

  it('the re-embed is targeted at exactly the changed products and does not touch chunks', () => {
    expect(admin).toContain('/api/admin/text-embeddings/backfill');
    expect(admin).toContain('product_ids: ids');
    expect(admin).toContain('include_chunks: false');
  });

  it('a failed re-embed is reported, never silent', () => {
    expect(admin).toContain('captureMessage(');
    expect(admin).toContain('out.failed += ids.length');
  });
});
