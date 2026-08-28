import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { normalizeVat } from '@/services/crm/vatNormalize';
import { normalizeVat as edgeNormalizeVat } from '../../supabase/functions/_shared/crm/vatNormalize.generated';

/**
 * Trust fields are stamped by the server, and money terms need the right role (#353 CRM-7).
 *
 * `vat_validated` means "this VAT number was verified against a tax authority". It is stamped on
 * records that feed invoicing, and it sat in the crm-api write allowlist — so any CRM-capable
 * caller could mark a number verified having done no lookup at all.
 *
 * It could not simply be removed: the real flow is a SERVER-SIDE registry lookup followed by a
 * client save, so dropping the field breaks genuine verification. The fix is a receipt — the
 * server records that IT verified, and the save reads that instead of believing the request.
 */

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const CRM = 'supabase/functions/crm-api/handlers/companies-api-handler.ts';
const VIES = 'supabase/functions/vies-validate/index.ts';
const AADE = 'supabase/functions/myaade-rgwspublic2/index.ts';

describe('#353 CRM-7 — the client cannot assert VAT verification', () => {
  const src = code(CRM);

  it('the three assertion fields are stripped from every client payload', () => {
    expect(src).toContain("const SERVER_STAMPED_VAT_COLUMNS = ['vat_validated', 'vat_validated_at', 'vat_validation_source']");
    // Both write paths, or the one that is missed becomes the way in.
    const stripCalls = [...src.matchAll(/stripServerStampedFields\(pickCompanyFields\(body\)/g)];
    expect(stripCalls.length, 'create AND update must both strip').toBe(2);
  });

  it('the DESCRIPTIVE fields are deliberately left writable', () => {
    // `vat_validated_name` / `_address` are what the registry SAID, not a claim that anyone
    // asked it. The worst a client can do is store a wrong name; stripping them would break the
    // identity-lookup save for no security gain.
    const list = src.slice(src.indexOf('SERVER_STAMPED_VAT_COLUMNS'), src.indexOf('COMMERCIAL_TERMS_COLUMNS'));
    expect(list).not.toContain('vat_validated_name');
    expect(list).not.toContain('vat_validated_address');
  });

  it('the stamp comes from a receipt, inside a trust window', () => {
    const fn = src.slice(src.indexOf('async function stampVatValidation'), src.indexOf('/** Verify a company id'));
    expect(fn).toContain('vat_validation_receipts');
    expect(fn).toContain('.gte(');
    // One hour on the READ. The table's own 24h TTL is a cleanup bound, not the trust window —
    // applying it here means shortening it later cannot be undone by a stale row surviving.
    expect(fn).toMatch(/60 \* 60 \* 1000/);
  });

  it('an update re-stamps rather than leaving the old number verified', () => {
    const block = src.slice(src.indexOf('const updates: Record<string, unknown> = {'));
    expect(block.slice(0, 600)).toContain('stampVatValidation(body.vat_number');
  });

  it('both registry functions write a receipt, and only on a positive result', () => {
    const vies = code(VIES);
    const aade = code(AADE);
    expect(vies).toContain('vat_validation_receipts');
    expect(aade).toContain('vat_validation_receipts');
    // A VIES "not recognised" and an ΑΑΔΕ deactivated business are real answers; recording them
    // would let a later save stamp `vat_validated` for a number the registry rejected.
    expect(vies).toMatch(/result\.valid === true/);
    expect(aade).toMatch(/deactivation_flag === '1'/);
  });
});

describe('#353 CRM-7 — commercial terms are owner/admin only', () => {
  const src = code(CRM);

  it('the restricted set is the money fields', () => {
    expect(src).toContain("const COMMERCIAL_TERMS_COLUMNS = ['discount_percent', 'discount_notes', 'credit_limit', 'user_level_key']");
    expect(src).toContain("const COMMERCIAL_TERMS_ROLES = ['owner', 'admin']");
  });

  it('it checks the WORKSPACE role, not the global tier', () => {
    // A supplier or architect who OWNS their own workspace legitimately manages their own
    // customers' terms — they are an `owner` there. The global tier says what someone is on the
    // platform; the workspace role says what they may do to this row. Checking the tier would
    // both over-block them and under-block a supplier invited into someone else's workspace.
    const fn = src.slice(src.indexOf('async function callerMayWriteCommercialTerms'), src.indexOf('async function stripServerStampedFields'));
    expect(fn).toContain("from('workspace_members')");
    expect(fn).toContain("eq('workspace_id', workspaceId)");
    // `status` matters: a REMOVED member whose row survives would otherwise keep the permission.
    expect(fn).toContain("eq('status', 'active')");
    expect(fn).not.toContain('user_profiles');
  });

  it('it fails closed without a user or a workspace', () => {
    const fn = src.slice(src.indexOf('async function callerMayWriteCommercialTerms'), src.indexOf('async function stripServerStampedFields'));
    expect(fn).toMatch(/if \(!userId \|\| !workspaceId\) return false;/);
  });

  it('a global operator is still allowed', () => {
    // That is what `isGlobalOperator` means, and a service-role caller has no workspace role at
    // all — refusing it would break every server-to-server write.
    const fn = src.slice(src.indexOf('async function callerMayWriteCommercialTerms'), src.indexOf('async function stripServerStampedFields'));
    expect(fn).toContain('if (scope.isGlobalOperator) return true;');
  });

  it('a refused write is logged, not silent', () => {
    const fn = src.slice(src.indexOf('async function stripServerStampedFields'), src.indexOf('async function stampVatValidation'));
    expect(fn).toContain('console.warn');
    expect(fn).toContain('dropped commercial terms');
  });
});

describe('#353 CRM-7 — the receipt key is one rule in three runtimes', () => {
  it('the Deno mirror matches the source', () => {
    // The receipt is WRITTEN by two edge functions and READ by a third, all keyed on this. A
    // drifted copy would make verification silently never stick.
    for (const v of ['EL800370260', 'GR 800 370 260', '800370260', 'DE123456789', 'GREECE', '', null]) {
      expect(edgeNormalizeVat(v), String(v)).toBe(normalizeVat(v));
    }
  });

  it('all three Greek spellings produce one receipt key', () => {
    const keys = new Set(['EL800370260', 'GR 800 370 260', '800370260'].map(normalizeVat));
    expect(keys.size).toBe(1);
  });
});
