import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * CRM tenancy (#353 CRM-5/6/9).
 *
 * All three are the pattern CLAUDE.md names as the recurring root cause of pentest #250 —
 * "service-role client + trust a body-supplied id" — reached three different ways:
 *
 *  • CRM-5 asked the RIGHT question of the WRONG subject: "may the caller see this contact"
 *    instead of "is this contact in the same tenant as this company".
 *  • CRM-6 asked no tenancy question at all, and its stand-in (`created_by`, or a GLOBAL account
 *    tier) is not one.
 *  • CRM-9 took the tenant for billing straight from the request body.
 */

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const COMPANIES = 'supabase/functions/crm-api/handlers/companies-api-handler.ts';
const ENRICH = 'supabase/functions/company-enrich/index.ts';

describe('#353 CRM-5 — a contact cannot be attached across tenants', () => {
  const src = code(COMPANIES);

  it('the existing-contact branch compares against the COMPANY workspace', () => {
    // `scope.workspaceIds` is an ARRAY of every workspace the caller belongs to, so the old
    // `contactInScope` said yes to a contact from any of them. A caller in workspaces A and B
    // could attach one of B's contacts to a company in A — and GET /companies/{id} returns
    // nested contact name, email and phone, so B's PII became readable by every member of A.
    // Searched FORWARD from the branch, because `crm_company_contacts` is also read by the GET
    // handler earlier in the file — anchoring on its first occurrence sliced an empty string,
    // and an empty string satisfies nothing, so the case would have failed for the wrong reason.
    const from = src.indexOf('let createdContactId');
    const branch = src.slice(from, src.indexOf("from('crm_company_contacts')", from));
    expect(branch.length, 'the attach branch slice is empty — the anchors moved').toBeGreaterThan(200);
    expect(branch).toContain('contactWorkspace(contact_id)');
    expect(branch).toMatch(/contactWs !== companyWs/);
    expect(
      branch,
      'the attach branch is back to asking whether the CALLER can see the contact',
    ).not.toContain('contactInScope(contact_id, scope)');
  });

  it('both failures answer 404, so ids cannot be enumerated', () => {
    const from = src.indexOf('const contactWs =');
    const branch = src.slice(from, src.indexOf("from('crm_company_contacts')", from));
    expect(branch).toContain('Contact not found');
    expect(branch).toContain('status: 404');
  });

  it('the create-and-attach branch still stamps the company workspace', () => {
    // It was already correct, and the fix must not have disturbed it — a created contact has to
    // land in the company's tenant, not the caller's default.
    const branch = src.slice(src.indexOf('if (!contact_id) {'), src.indexOf('createdContactId = created.id'));
    expect(branch).toContain('workspace_id: companyWs');
  });
});

describe('#353 CRM-6 — company-enrich cannot write across tenants', () => {
  const src = code(ENRICH);

  it('the cache-write requires workspace membership', () => {
    // `created_by === user.id` is not a tenancy check: a user who created a company in a
    // workspace they have since LEFT still satisfies it. Nor is the account-tier fallback —
    // `public.roles` is the GLOBAL tier, true in every workspace at once.
    // Anchored on the cache-write SELECT specifically — `crm_companies` is read several times
    // in this file, and slicing from the first one reads a different block entirely.
    const anchor = src.indexOf("'id, created_by, workspace_id,");
    expect(anchor, 'the cache-write select no longer names workspace_id').toBeGreaterThan(-1);
    const block = src.slice(anchor, src.indexOf('return jsonResponse({ ok: true', anchor));
    expect(block).toContain('userCanAccessWorkspace');
    expect(block).toMatch(/const sameTenant = await userCanAccessWorkspace/);
    // Membership must GATE the creator/tier test, not sit beside it.
    expect(block).toMatch(/canWrite = sameTenant && company\.created_by === user\.id/);
    expect(block).toMatch(/if \(sameTenant && !canWrite\)/);
  });

  it('it selects workspace_id, or it has nothing to compare', () => {
    expect(src).toContain("'id, created_by, workspace_id,");
  });
});

describe('#353 CRM-9 — the billed workspace is verified, not asserted', () => {
  const src = code(ENRICH);

  it('a body workspace_id is checked against membership before it is used', () => {
    expect(src).toContain('const requestedWorkspaceId = cleanStr(body?.workspace_id)');
    expect(src).toMatch(/userCanAccessWorkspace\(admin, user\.id, requestedWorkspaceId\)/);
  });

  it('an unverified workspace degrades to personal billing rather than being used', () => {
    // Enrichment is legitimate for a user with no workspace context, and `reserveCredits`
    // already bills the person when the workspace is undefined — so dropping it is the safe
    // degradation. It is logged, so a real misconfiguration stays visible.
    expect(src).toMatch(/\?\s*requestedWorkspaceId\s*:\s*undefined;/);
    expect(src).toContain('billing the caller personally instead');
  });

  it('nothing downstream reads the raw body workspace again', () => {
    // The whole point is that there is ONE verified value. A second `body?.workspace_id` read
    // downstream would route straight around the check.
    const after = src.slice(src.indexOf('const workspaceId = requestedWorkspaceId'));
    expect(
      after,
      'company-enrich reads body.workspace_id again after verifying it',
    ).not.toContain('cleanStr(body?.workspace_id)');
  });
});
