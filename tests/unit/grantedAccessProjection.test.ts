/**
 * Guard: a grant says WHO may look, never WHAT they get, and a privileged storage handle is
 * derived rather than accepted. (Audit #364 — EX-2, EX-3, EX-4.)
 *
 * Three findings, one shape: the check that ran was row-level and the data that came back was
 * not.
 *
 *   EX-3  `catalog-access` resolved the CRM/membership lookups against the catalog OWNER's
 *         earliest active workspace membership rather than `presentation_catalogs.workspace_id`.
 *         For a multi-workspace owner that decided who may read a catalog using a different
 *         tenant's contact list. The same first-workspace mistake as `CM-22` in #359 — except
 *         here it is the access decision itself. And with no workspace resolved at all it fell
 *         through to an UNSCOPED lookup: any platform user's email on the whole instance
 *         matched, and the CRM searches spanned every tenant.
 *
 *   EX-4  `verify` then returned `cover_data` / `body_data` / `back_cover_data` as the raw jsonb
 *         the builder wrote. Every material carried `provenance` (the source PDF id and page it
 *         was lifted from), `price_source`/`price_source_ref`, `image_source_ref` (a product id
 *         or the supplier URL an image was scraped from) and `specs_raw`. None of it renders.
 *
 *   EX-2  `customer-assets-api` let the client write `document_bucket` / `document_path` through
 *         `warranty.save`, and then handed both to the SERVICE-ROLE storage client to sign and
 *         to remove. Owning one warranty row was enough to read — or delete — any object in any
 *         bucket. RLS never saw it: the row was legitimately theirs.
 *
 * Static, over source text. The value is in pinning the shape at the boundary, because all three
 * of these were invisible at every other layer: the queries were valid, the rows were real, and
 * every response was a 200.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const FUNCS = join(__dirname, '..', '..', 'supabase', 'functions');

function codeOnly(src: string): string {
  return sharedStripComments(src);
}
const read = (rel: string) => codeOnly(readFileSync(join(FUNCS, rel), 'utf8'));

describe('EX-3 — catalog access is scoped by the CATALOG\'s workspace', () => {
  const src = read('catalog-access/index.ts');

  it('never resolves a workspace by picking the owner\'s first membership', () => {
    // The exact shape of the bug: order workspace_members by joined_at and take one.
    expect(src, 'the owner-first-workspace guess is back — it answers for the wrong tenant')
      .not.toMatch(/from\('workspace_members'\)[\s\S]{0,400}order\('joined_at'/);
  });

  it('passes the catalog\'s own workspace_id into the email match', () => {
    expect(src, 'resolveEmailMatch is no longer given the catalog\'s workspace')
      .toMatch(/resolveEmailMatch\([^)]*catalog\.workspace_id/);
    // Both entry points — minting a token (`request`) and re-validating one (`verify`) — must
    // use the SAME resolution, or a revoked viewer keeps a 30-day cookie. Three occurrences: the
    // declaration plus those two call sites.
    const calls = src.match(/resolveEmailMatch\(/g) ?? [];
    expect(calls.length, 'one of request/verify stopped re-resolving the grant').toBe(3);
  });

  it('fails closed when there is no workspace to scope by', () => {
    // No workspace must mean "fall through to the per-catalog allowlist", never "search
    // everything". A filter that switches itself off when it cannot resolve its scope is the
    // same defect as a sensitivity check that treats an unresolved verdict as public.
    const unscoped: string[] = [];
    for (const m of src.matchAll(/from\('(crm_contacts|crm_companies|user_profiles)'\)/g)) {
      const chain = src.slice(m.index!, m.index! + 300);
      // `user_profiles` is matched by id against a member list rather than by workspace_id, so
      // either form of scoping counts — what must not appear is a bare email lookup.
      if (!/workspace_id/.test(chain) && !/\.in\('user_id'/.test(chain)) {
        unscoped.push(chain.split('\n').slice(0, 3).join(' ').trim());
      }
    }
    expect(
      unscoped,
      'an unscoped lookup came back — it matches an email against every tenant on the instance:\n  ' +
        unscoped.join('\n  '),
    ).toEqual([]);
    expect(src, 'the workspace-scoped branch is no longer required for the CRM lookups')
      .toMatch(/if\s*\(workspaceId\)\s*\{/);
  });
});

describe('EX-4 — an email-gated viewer gets a projection, not the row', () => {
  const src = read('catalog-access/index.ts');

  it('builds the viewer payload from an explicit allowlist', () => {
    expect(src, 'the viewer projection is gone').toContain('projectCatalogForViewer');
    expect(src, 'the verify response hands back the raw catalog columns again')
      .not.toMatch(/catalog:\s*\{[\s\S]{0,400}body_data:\s*catalog\.body_data/);
  });

  it('does not pass through the internal per-material fields', () => {
    const fn = src.slice(src.indexOf('function projectCatalogForViewer'));
    const projection = fn.slice(0, fn.indexOf('\n}'));
    for (const internal of ['provenance', 'price_source', 'image_source', 'specs_raw']) {
      expect(projection, `${internal} is back in the public catalog payload`)
        .not.toContain(internal);
    }
    // The fields the page actually renders must still be there, or the guard is passing by
    // breaking the feature.
    for (const shown of ['image_url', 'price', 'currency', 'specs']) {
      expect(projection, `${shown} was dropped from the payload the public page renders`)
        .toContain(shown);
    }
  });

  it('projects the specification tables row by row rather than passing the jsonb through', () => {
    const fn = src.slice(src.indexOf('function projectCatalogForViewer'));
    const projection = fn.slice(0, fn.indexOf('\n}'));
    expect(projection, 'the public page renders spec_tables — it is no longer projected')
      .toContain('spec_tables');
    // The whole point of the allowlist: `spec_tables` is operator-editable jsonb, so handing
    // the stored group object straight out re-opens EX-4 for any key a future writer adds.
    expect(projection, 'spec_tables is passed through as stored — project title + label/value instead')
      .not.toMatch(/spec_tables:\s*(catalog\.)?body_data/);
    for (const field of ['label', 'value']) {
      expect(projection, `spec rows no longer project ${field}`).toContain(field);
    }
  });
});

describe('EX-2 — a storage path the service role acts on is derived, not supplied', () => {
  const src = read('customer-assets-api/index.ts');

  it('does not accept document_bucket / document_path from the request body', () => {
    const writable = src.slice(src.indexOf('const WARRANTY_WRITABLE'));
    const list = writable.slice(0, writable.indexOf('] as const'));
    expect(list, 'document_bucket is client-writable again — it is signed by the service role')
      .not.toContain('document_bucket');
    expect(list, 'document_path is client-writable again — it is signed AND deleted by the service role')
      .not.toContain('document_path');
  });

  it('re-checks the stored bucket and prefix before signing or removing', () => {
    expect(src, 'the stored-object check is gone').toContain('warrantyObjectRef');
    // A row written before the fix still carries whatever was set then, so the read side has to
    // check too — the allowlist alone would leave existing rows exploitable.
    const ref = src.slice(src.indexOf('function warrantyObjectRef'));
    expect(ref.slice(0, ref.indexOf('\n}')), 'the bucket is no longer pinned to ours')
      .toContain('WARRANTY_BUCKET');
    expect(ref.slice(0, ref.indexOf('\n}')), 'the path is no longer pinned to this workspace\'s prefix')
      .toMatch(/startsWith\(`warranties\/\$\{workspaceId\}\//);
  });

  it('signs and deletes only through the checked reference', () => {
    // The two privileged operations. Passing `row.document_bucket || WARRANTY_BUCKET` straight
    // to the service-role client is the exact call that made this a read/delete primitive.
    expect(src, 'a raw stored bucket is handed to the service-role storage client again')
      .not.toMatch(/\.from\(row\.document_bucket/);
    expect(src, 'a raw stored path is signed again')
      .not.toMatch(/createSignedUrl\(row\.document_path/);
    expect(src, 'a raw stored path is removed again')
      .not.toMatch(/remove\(\[row\.document_path\]/);
  });
});
