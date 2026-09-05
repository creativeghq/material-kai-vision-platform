/**
 * Profile → Services IS Finance → Settings → Services, and a draft paid online is ISSUED.
 *
 * Two defects this pins, both of the "two records, one fact" / "silent zero" shapes:
 *
 *  1. Services lived twice. `user_profiles.services_detail` (a jsonb blob with a free-text price)
 *     fed the public profile and the Hire form; `products(item_type='service')` + `product_prices`
 *     fed the invoice picker and myDATA. Nothing connected them, so a service a member typed on
 *     their profile could never be put on an invoice, and a service Finance priced never showed on
 *     a profile. The blob is dropped; a profile LISTS a Finance service (`products.profile_user_id`),
 *     every surface reads the one RPC, and `user_profiles.services` is a trigger-derived cache.
 *
 *  2. A draft paid in full online stayed a draft. The storefront receipt and the quote pre-invoice
 *     are born `status='draft'` with a pay token; `recordInvoicePayment` allocated the money and
 *     the allocation trigger set `paid` — on a document with no legal number, no issue date and
 *     nothing filed with AADE. The customer held a payment confirmation for a document that legally
 *     did not exist. `issue_invoice_on_online_payment` now runs BEFORE the allocation, and the
 *     order of those two calls is what this test asserts: a check after the side effect is not a
 *     check (CLAUDE.md anti-regression §4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (p.split(sep).includes('node_modules') || p.split(sep).includes('.deno')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|py|sql)$/.test(e)) out.push(p);
  }
  return out;
}

describe('profile services are finance services', () => {
  it('nothing in the codebase reads or writes the dropped user_profiles.services_detail column', () => {
    const offenders = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase')), ...walk(join(ROOT, 'api'))]
      .filter((p) => readFileSync(p, 'utf8').includes('services_detail'))
      .map((p) => p.slice(ROOT.length + 1).split(sep).join('/'));
    expect(
      offenders,
      'services_detail was DROPPED (a second store of the services Finance already holds). A reader gets ' +
        'PostgREST 400 on every profile load; a writer is a runtime error. Read services through ' +
        'servicesService.listForProfile (get_public_profile_services).\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every surface that shows a profile\'s services reads the ONE RPC — never a hand-built list', () => {
    for (const rel of [
      'src/pages/PublicProfilePage.tsx',
      'src/components/features/discover/ProfileModal.tsx',
      'src/components/core/Profile/ProfileTab.tsx',
    ]) {
      const src = read(rel);
      expect(src, `${rel} must load services via servicesService.listForProfile`).toMatch(/servicesService\.listForProfile\(/);
      // The legacy fallback synthesised ServiceItems out of the text[] names, so a name with no
      // row behind it could be "hired". The names are a search cache, not a service.
      expect(src, `${rel} still builds services out of user_profiles.services names`).not.toMatch(/services\.map\(\(name, i\)/);
    }
    const svc = read('src/modules/finance/services/servicesService.ts');
    expect(svc).toMatch(/rpc\('get_public_profile_services'/);
    expect(svc).toMatch(/rpc\('upsert_profile_service'/);
    expect(svc).toMatch(/rpc\('set_profile_service_listing'/);
  });

  it('the profile form never writes user_profiles.services — it is a trigger-derived cache', () => {
    const tab = read('src/components/core/Profile/ProfileTab.tsx');
    // `patch({ ... services: ... })` was the client writing the search cache by hand.
    expect(tab).not.toMatch(/patch\(\{[^}]*\bservices\b/);
  });

  it('a hire only ever orders what the PROFILE OWNER lists, with a price', () => {
    const edge = read('supabase/functions/inbox-api/index.ts');
    // The products read that resolves a visitor's ids is bound to the owner's listing.
    const resolve = edge.slice(edge.indexOf('async function resolveProfileHire'), edge.indexOf('async function resolveHireParty'));
    expect(resolve).toMatch(/\.eq\('item_type', 'service'\)/);
    expect(resolve).toMatch(/\.eq\('profile_user_id', profileUserId\)/);
    // An unpriced service demotes the whole hire to an enquiry — never a €0 order.
    const handler = edge.slice(edge.indexOf('async function handleProfileContact'));
    expect(handler).toMatch(/hire\.unpriced\.length === 0/);
    // The VAT rate per line comes from the mirrored vocabulary, not a literal.
    expect(edge).toMatch(/from '\.\.\/_shared\/vatVocabulary\.generated\.ts'/);
    expect(edge).toMatch(/vatPctForCat\(s\.vat_category, defaultRate\)/);
  });
});

describe('a draft paid in full online is issued', () => {
  const src = read('supabase/functions/_shared/payments/record-payment.ts');
  const fn = src.slice(src.indexOf('export async function recordInvoicePayment'), src.indexOf('export async function recordStatementPayment'));

  it('issues BEFORE it allocates — the order is the guarantee', () => {
    const issueAt = fn.indexOf('issueDraftOnFullPayment(');
    const allocAt = fn.indexOf(".from('payment_allocations')");
    expect(issueAt, 'recordInvoicePayment does not issue a paid draft at all').toBeGreaterThan(-1);
    expect(allocAt).toBeGreaterThan(-1);
    expect(issueAt, 'the issue step must run before the allocation insert, or the trigger flips a DRAFT to paid').toBeLessThan(allocAt);
  });

  it('only a DRAFT settled in FULL is issued; a deposit leaves the pre-invoice alone', () => {
    expect(fn).toMatch(/inv\.status === 'draft'/);
    expect(fn).toMatch(/applied >= due - 0\.005/);
  });

  it('the myDATA payment method is a NAMED code, and the issue goes through the one SQL writer', () => {
    expect(src).toMatch(/MYDATA_PAYMENT_CODE\.pos/);
    expect(src).toMatch(/MYDATA_PAYMENT_CODE\.domestic_account/);
    expect(src).not.toMatch(/p_payment_method_code:\s*\d/);
    expect(src).toMatch(/rpc\('issue_invoice_on_online_payment'/);
    // The issued/receipt flow and the transmission reuse the shared emitter and the ONE
    // transmission function rather than a second copy.
    expect(src).toMatch(/emitDocumentIssued\(/);
    expect(src).toMatch(/functions\/v1\/finance-issue-invoice/);
  });

  it('finance-issue-invoice recognises the trusted server caller and bills the workspace, not nobody', () => {
    const issue = read('supabase/functions/finance-issue-invoice/index.ts');
    expect(issue).toMatch(/auth\.level !== 'secret' && !\(await userCanAccessWorkspace/);
    expect(issue).toMatch(/resolveBillingUser\(/);
    // The emitter lives in _shared now; a local copy here would be the second implementation.
    expect(issue).not.toMatch(/^async function emitDocumentIssued/m);
    expect(issue).toMatch(/from '\.\.\/_shared\/fiscal\/document-issued\.ts'/);
  });
});
