/**
 * Guard: a foreign key taken from the REQUEST BODY is proved to belong to the caller's
 * workspace before it is stored.
 *
 * The shape, found independently in two modules (#356 `RE-4`, #353 `CRM-5`) and then in five
 * more places by sweeping for it: a route authenticates the workspace correctly — often
 * impeccably — and then accepts a foreign key out of the body and writes it. Both halves are
 * individually valid: the workspace is real and verified, the id is a real row. Nothing checks
 * them against each other. Later a service-role read joins the row and hands back the other
 * tenant's company name, product cost or employee record.
 *
 * It is invariant 1 one level down. Naming your own workspace honestly does not entitle you to
 * name a row inside somebody else's.
 *
 * This test is deliberately NOT a list of known sites — that is what let the class spread to
 * seven places. It pins the two things that keep the sweep possible: the shared helper still
 * does the one thing that makes it a check (filters by workspace), and the sites fixed by the
 * sweep still carry a check of some kind.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const FUNCS = join(__dirname, '..', '..', 'supabase', 'functions');
const read = (rel: string) => stripComments(readFileSync(join(FUNCS, rel), 'utf8'));

describe('the shared helper is a real check', () => {
  const helper = read('_shared/same-workspace.ts');

  it('filters by workspace, not merely by id', () => {
    // The inline version people write is `select('id').eq('id', x)`, which proves the row EXISTS
    // rather than that it is yours — a check that passes for exactly the case it exists to catch.
    expect(helper, 'assertSameWorkspace no longer constrains the workspace')
      .toMatch(/\.eq\('workspace_id', workspaceId\)/);
  });

  it('404s rather than 403s', () => {
    // A caller who may not reference the row must not learn that it exists.
    expect(helper).toMatch(/HttpError\(404/);
    expect(helper, 'a 403 here confirms the id is real to someone who should not know')
      .not.toMatch(/HttpError\(403/);
  });

  it('passes a null id through instead of forcing every caller to branch first', () => {
    // An optional FK that was not supplied is not a violation. Making callers guard the call is
    // how the call ends up omitted.
    expect(helper).toMatch(/id === null \|\| id === undefined \|\| id === ''/);
  });
});

describe('the sites the sweep fixed still check their body-supplied FKs', () => {
  it.each([
    ['real-estate-api/index.ts', /assert(All)?SameWorkspace\(/, 'RE-4: offers, tenancies, buyer requirements, contact ext'],
    ['stock-api/index.ts', /assertSameWorkspace\(/, 'warehouse item → another tenant\'s product or warehouse'],
    ['page-watches/index.ts', /assertSameWorkspace\(/, 'watch → another tenant\'s tech-radar subject'],
    ['hr-api/ergani.ts', /assertSameWorkspace\(/, 'ΕΡΓΑΝΗ audit row → another tenant\'s employee'],
    ['myaade-rgwspublic2/index.ts', /safeCompanyId/, 'ΑΑΔΕ lookup audit → another tenant\'s company'],
    ['mygemi-opendata/index.ts', /safeCompanyId/, 'ΓΕΜΗ lookup audit → another tenant\'s company'],
  ])('%s', (rel, pattern) => {
    expect(read(rel), `${rel} stores a body-supplied workspace-scoped FK it never verified`)
      .toMatch(pattern);
  });

  it('stock-api checks BOTH ids, not just the one that was noticed', () => {
    const src = read('stock-api/index.ts');
    // `product_id` is the one a scan spots because `body` appears on the same line;
    // `warehouse_id` arrives via a local and is just as much a cross-tenant reference.
    expect(src, 'the warehouse id is no longer checked').toMatch(/'warehouses',\s*warehouseId/);
    expect(src, 'the product id is no longer checked').toMatch(/'products',\s*body\?\.product_id/);
  });
});

describe('the two audit-log sites drop a foreign id rather than refusing the request', () => {
  it.each(['myaade-rgwspublic2/index.ts', 'mygemi-opendata/index.ts'])('%s', (rel) => {
    const src = read(rel);
    // These are best-effort audit rows on a paid external lookup. Refusing the whole lookup over
    // a bad provenance field would be the worse trade, so the id is resolved and dropped if it
    // is not ours — but it must be RESOLVED against the workspace, not passed through.
    expect(src, `${rel} passes body.company_id straight into the audit row again`)
      .not.toMatch(/company_id: body\.company_id/);
    expect(src).toMatch(/from\('crm_companies'\)[\s\S]{0,200}?\.eq\('workspace_id'/);
  });
});
