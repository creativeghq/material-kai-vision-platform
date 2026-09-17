import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const FN = blankComments(read('supabase/functions/product-document-url/index.ts'));

describe('the signed-document endpoint does not decide who may read', () => {
  it('asks the RPC as the CALLER, not as the service role', () => {
    const rpcCall = FN.slice(FN.indexOf('get_product_document_path') - 400, FN.indexOf('get_product_document_path'));
    expect(rpcCall, 'the gate runs on auth.uid(); service role would refuse everyone')
      .toMatch(/asUser/);
    expect(FN).toMatch(/SUPABASE_ANON_KEY[\s\S]*?Authorization/);
  });

  it('signs with the service role, because storage policy keys reads to the uploader', () => {
    const signBlock = FN.slice(FN.indexOf('createSignedUrl') - 500, FN.indexOf('createSignedUrl'));
    expect(signBlock).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('never persists the URL — it is minted per read with a short TTL', () => {
    expect(FN).toMatch(/URL_TTL_SECONDS\s*=\s*\d{2,3}\b/);
    const ttl = Number(FN.match(/URL_TTL_SECONDS\s*=\s*(\d+)/)?.[1]);
    expect(ttl, 'a long-lived link on a private bucket is a persisted URL by another name')
      .toBeLessThanOrEqual(3600);
  });
});

describe('refusals and failures are different answers', () => {
  it('a refusal is 404, so "not yours" and "no such file" are indistinguishable', () => {
    expect(FN).toMatch(/if \(!row\?\.object_path\) return json\(\{ error: 'Not found' \}, 404\)/);
    expect(FN, 'a 403 would confirm the id exists').not.toMatch(/,\s*403\)/);
  });

  it('a signing failure is 502, never 404 — that would read as "no document"', () => {
    const fail = FN.slice(FN.indexOf('signed.error'), FN.indexOf('signed.error') + 300);
    expect(fail).toMatch(/502/);
    expect(fail).not.toMatch(/404/);
  });

  it('requires a product AND one of the two document references', () => {
    expect(FN).toMatch(/if \(!productId\) return json\([^)]*400\)/);
    expect(FN).toMatch(/if \(!body\.kb_doc_id && !body\.document_id\)/);
  });

  it('is wrapped for request logging and Sentry like every other function', () => {
    expect(FN).toMatch(/withApiLogging\('product-document-url'/);
  });
});
