/**
 * Guards for the real-estate half of audit #356 (`RE-1` … `RE-13`).
 *
 * The module's ENTRY gate is the reference implementation of invariant 1 in this codebase —
 * body `workspace_id` verified with `userCanAccessWorkspace`, 404 not 403, module and
 * entitlement checks before RBAC. Every finding here is downstream of a correctly authenticated
 * workspace, and that is what made them easy to miss: nothing was wrong with the tenancy
 * boundary, so the *agent* boundary inside it went unexamined.
 *
 * Two ideas account for most of them:
 *   • `open_for_all` is a VIEW grant. It was read as an edit grant by the importer (`RE-3`) and
 *     as a share of the lead book by `get-property` (`RE-2`).
 *   • Authorise the object you are about to MUTATE. `upsert-tenancy` authorised a property from
 *     the body and then updated a tenancy named separately (`RE-1`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const fn = (rel: string) => stripComments(readFileSync(join(ROOT, 'supabase', 'functions', rel), 'utf8'));
const src = (rel: string) => stripComments(readFileSync(join(ROOT, 'src', rel), 'utf8'));

const api = fn('real-estate-api/index.ts');
const pub = fn('real-estate-public/index.ts');
const shared = fn('_shared/real-estate.ts');
const digests = fn('real-estate-buyer-digests/index.ts');

/** The body of one `case '<action>':` block, up to the next case label. */
function action(source: string, name: string): string {
  const at = source.indexOf(`case '${name}':`);
  expect(at, `action ${name} not found`).toBeGreaterThan(-1);
  const rest = source.slice(at);
  const next = rest.slice(10).search(/\n {6}case '/);
  return next > 0 ? rest.slice(0, next + 10) : rest;
}

describe('RE-1 — authorise the object you are about to mutate', () => {
  it('upsert-tenancy loads the TENANCY before updating it', () => {
    const block = action(api, 'upsert-tenancy');
    // The property came from the body; the update targets a tenancy named separately. Passing a
    // property you own plus another agent's tenancy_id rewrote their rent, tenant and dates.
    expect(block, 'the tenancy branch no longer re-authorises through the tenancy\'s own property')
      .toMatch(/from\('property_tenancies'\)[\s\S]{0,200}?\.eq\('id', tenancyId\)[\s\S]{0,200}?loadEditable/);
  });
});

describe('RE-2 / RE-3 — open_for_all is a VIEW grant', () => {
  it('get-property withholds the lead surface from a non-owner', () => {
    const block = action(api, 'get-property');
    expect(block, 'inquiries/viewings/documents are fetched unconditionally again — that is the '
      + "other agent's buyer PII on an open_for_all listing")
      .toMatch(/if \(owns\)/);
    expect(block, 'the caller can no longer tell withheld from empty').toContain('leads_withheld');
  });

  it('the importer requires edit rights, not view rights', () => {
    expect(api, 'the importer is back to canViewProperty — open_for_all lets an agent overwrite '
      + "another agent's listing through a reference-code collision")
      .not.toMatch(/if \(existing && !access\.isBroker && !canViewProperty\(existing\)\)/);
    expect(api).toMatch(/if \(existing && !access\.isBroker && !ownsProperty\(existing\)\)/);
  });
});

describe('RE-4 — a foreign key from the body must belong to the workspace', () => {
  it('there is one shared helper rather than a per-site query', () => {
    const helper = fn('_shared/same-workspace.ts');
    expect(helper, 'the helper no longer filters by workspace — proving a row EXISTS is not '
      + 'proving it is yours').toMatch(/\.eq\('workspace_id', workspaceId\)/);
    // 404 not 403: a caller who may not reference the row must not learn it exists.
    expect(helper).toMatch(/HttpError\(404/);
  });

  it.each([
    ['create-offer', 'buyer_contact_id'],
    ['upsert-tenancy', 'tenant/landlord contact'],
    ['upsert-buyer-requirement', 'crm_contact_id'],
    ['upsert-contact-ext', 'crm_contact_id'],
  ])('%s checks its %s', (name) => {
    expect(action(api, name), `${name} stores a contact id it never verified`)
      .toMatch(/assert(All)?SameWorkspace\(/);
  });
});

describe('RE-5 — canView is every active member, and must not reach PII', () => {
  it.each([
    'list-sellers',
    'kyc-status',
    'buyers-for-property',
    'list-rent-charges',
    'list-offers',
  ])('%s is manager-gated', (name) => {
    expect(action(api, name), `${name} is readable by any active workspace member — a warehouse `
      + 'or accountant user can read seller/buyer PII, KYC state or a rent ledger')
      .toMatch(/requireManage(ForPii)?\(\)/);
  });

  it('list-rent-charges authorises the tenancy itself', () => {
    // It took a tenancy_id and never checked it against the caller at all.
    expect(action(api, 'list-rent-charges')).toMatch(/from\('property_tenancies'\)[\s\S]{0,300}?loadEditable/);
  });
});

describe('RE-6 — rent invoicing is idempotent', () => {
  it('claims the charge conditionally and checks the result', () => {
    expect(shared, 'the charge→invoice link is unconditional again, so two cron runs both create '
      + 'a draft and the loser is orphaned but still payable')
      .toMatch(/\.is\('invoice_id', null\)/);
    expect(shared, 'the claim result is discarded again').toMatch(/claimed\.length === 0/);
  });

  it('withdraws the losing draft instead of leaving it payable', () => {
    expect(shared).toMatch(/from\('invoices'\)\.delete\(\)/);
  });
});

describe('RE-7 — the digest window follows delivery', () => {
  it('does not treat a failed listings query as "nothing new"', () => {
    expect(digests, 'the listings error is discarded again — a failed query looks exactly like a '
      + 'quiet day and the window advances on it').toContain('listErr');
  });

  it('stamps the window only after a confirmed send', () => {
    const sendArea = digests.slice(digests.indexOf('functions/v1/email-api'));
    expect(sendArea, 'last_digest_at is stamped outside the res.ok branch again — a day of '
      + 'email-api being down loses those listings permanently')
      .toMatch(/if \(res\.ok\)[\s\S]{0,400}?last_digest_at/);
  });
});

describe('RE-8 — internal viewing notes are not vendor-facing', () => {
  it('only quotes feedback explicitly shared with the vendor', () => {
    expect(shared, "the vendor report quotes every viewing's feedback again — those are the "
      + "agent's internal notes and routinely contain the buyer's name and phone")
      .toMatch(/\.eq\('share_with_vendor', true\)/);
  });
});

describe('RE-9 — the anonymous valuation does not expose its comps set', () => {
  it('returns the estimate and range but not the aggregates', () => {
    const block = pub.slice(pub.indexOf('request-valuation'));
    expect(block, 'comps_count / median_per_sqm are back in the anonymous response — varying '
      + "town, type and area reconstructs the agency's private book")
      .not.toMatch(/comps_count:|median_per_sqm:/);
    expect(block).toMatch(/range_low/);
  });
});

describe('RE-10 — public tokens expire', () => {
  it.each([
    ['real-estate-public/index.ts', 3],
    ['real-estate-ical/index.ts', 1],
  ])('%s checks expiry', (rel, atLeast) => {
    const s = fn(rel);
    const hits = (s.match(/_expires_at/g) ?? []).length;
    expect(hits, `${rel} resolves a public token without an expiry check`).toBeGreaterThanOrEqual(atLeast);
  });

  it('treats NULL as "never expires" so links already sent keep working', () => {
    expect(pub, 'a null expiry now rejects — that would break every token issued before RE-10')
      .toMatch(/exp === null/);
  });
});

describe('RE-11 — money is only additive within one currency', () => {
  it('the commission panel groups by currency', () => {
    const page = src('modules/real-estate/pages/RealEstatePage.tsx');
    expect(page, 'commission is summed across rows and labelled with rows[0].currency again — '
      + '€5,000 + £4,000 rendered as "€9,000"')
      .not.toMatch(/const ccy = rows\[0\]\?\.currency/);
    expect(page).toContain('commissionByCurrency');
  });
});

describe('RE-12 — a revaluation is recorded', () => {
  it('writes history when the value actually changes, and exposes it', () => {
    expect(action(api, 'upsert-contact-ext'), 'a revaluation silently overwrites the previous '
      + 'figure again').toContain('property_contact_valuations');
    expect(action(api, 'get-contact-ext'), 'the history is stored but unreadable')
      .toContain('property_contact_valuations');
  });
});

describe('RE-13 — trusted values win over the caller spread', () => {
  it('spreads first', () => {
    const svc = src('modules/real-estate/services/realEstateService.ts');
    expect(svc, "extra can override action/workspace_id again")
      .not.toMatch(/\{ action, workspace_id: workspaceId, \.\.\.extra \}/);
    expect(svc).toMatch(/\{ \.\.\.extra, action, workspace_id: workspaceId \}/);
  });
});
