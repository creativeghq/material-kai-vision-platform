/** Product in Place cut-outs (#474): the PNG check, and the order the edge function does things in. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { pngInfo } from '../../supabase/functions/_shared/png-info';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

function png(colorType: number, extraChunk?: string): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = [0, 0, 0, 13, ...'IHDR'.split('').map((c) => c.charCodeAt(0)), 0, 0, 1, 44, 0, 0, 0, 200, 8, colorType, 0, 0, 0, 0, 0, 0, 0];
  const extra = extraChunk ? [0, 0, 0, 0, ...extraChunk.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0] : [];
  const iend = [0, 0, 0, 0, ...'IEND'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
  return new Uint8Array([...sig, ...ihdr, ...extra, ...iend]);
}

describe('a cut-out must actually be transparent', () => {
  it('reads the size and sees RGBA as transparent', () => {
    expect(pngInfo(png(6))).toEqual({ width: 300, height: 200, hasAlpha: true });
  });

  it('an opaque RGB PNG is not a cut-out, unless it carries a transparency chunk', () => {
    expect(pngInfo(png(2))?.hasAlpha).toBe(false);
    expect(pngInfo(png(2, 'tRNS'))?.hasAlpha).toBe(true);
  });

  it('a JPEG is not a PNG at all', () => {
    expect(pngInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]))).toBeNull();
  });
});

describe('product-cutouts does things in the order that keeps money and tenants safe', () => {
  const fn = read('supabase/functions/product-cutouts/index.ts');
  const processRow = fn.slice(fn.indexOf('async function processRow('), fn.indexOf('Deno.serve('));

  it('the workspace is checked against the caller, and products are read only inside it', () => {
    expect(fn).toMatch(/userHasWorkspaceCapability\(supabase, user\.id, workspaceId, /);
    expect(fn).toMatch(/\.from\('products'\)[\s\S]{0,80}\.eq\('workspace_id', workspaceId\)/);
  });

  it('a row is claimed before work starts, so two runs cannot bill one cut-out twice', () => {
    const claim = fn.indexOf("update({ claimed_at:");
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(fn.indexOf('await processRow('));
  });

  it('credits are debited before Replicate is called, and refunded when anything fails', () => {
    expect(processRow.indexOf("rpc('debit_credits'")).toBeGreaterThan(-1);
    expect(processRow.indexOf("rpc('debit_credits'")).toBeLessThan(processRow.indexOf('removeBackground('));
    expect(processRow).toMatch(/catch \(err\)[\s\S]*rpc\('refund_credits'/);
  });

  it('the output is refused unless it is a PNG with transparency', () => {
    expect(processRow).toMatch(/if \(!info\.hasAlpha\) throw/);
  });

  it('every cut-out is written to a fresh path and claimed by the storage reaper', () => {
    expect(processRow).toMatch(/crypto\.randomUUID\(\)\}\.png/);
  });
});

describe('a shop product gets a size and a cut-out without being copied to us', () => {
  const fn = read('supabase/functions/product-cutouts/index.ts');
  const store = fn.slice(fn.indexOf('async function handleStore('), fn.indexOf('Deno.serve('));

  it('store actions run only after the caller is checked against the workspace', () => {
    expect(fn.indexOf('userHasWorkspaceCapability(supabase, user.id, workspaceId, '))
      .toBeLessThan(fn.indexOf('return await handleStore('));
  });

  it('a shop is only reachable when it is an allowed origin of the workspace’s own active embed keys', () => {
    expect(fn).toMatch(/from\('material_kai_keys'\)[\s\S]{0,120}\.eq\('workspace_id', workspaceId\)\.eq\('is_active', true\)/);
    expect(store).toMatch(/if \(!origin \|\| !origins\.includes\(origin\)\)/);
  });

  it('the image to cut out is read from the shop by the server, never taken from the request', () => {
    expect(store).toContain('const shop = await readShop(origin)');
    expect(store).toMatch(/source_url: t\.image/);
    expect(store).not.toMatch(/body\.(image|source_url|url)\b/);
  });

  it('the shop is fetched through the SSRF guard', () => {
    expect(fn).toMatch(/fetchTextGuarded\(origin \+ path/);
  });

  it('a size write is an allowlisted payload, never the request body', () => {
    const setSize = store.slice(store.indexOf("body.action === 'store_set_size'"), store.indexOf('const shop = await readShop'));
    expect(setSize).not.toMatch(/\.\.\.body/);
    expect(setSize).toMatch(/workspace_id: workspaceId/);
  });

  it('store cut-outs are claimed by the storage reaper through their own table', () => {
    expect(store).toMatch(/table: 'store_product_overlays'/);
  });
});
