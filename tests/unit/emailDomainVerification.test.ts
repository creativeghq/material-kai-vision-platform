/**
 * A verified domain says WHO verified it, and when (#357 AE-11).
 *
 * `mark-domain-verified` wrote `verification_status: 'verified'` because the operator pressed a
 * button. The UI text was explicit about what it was: verify in the Resend dashboard, then assert
 * it here.
 *
 * Not a spoofing vector — Resend enforces domain verification at send time, so a self-asserted flag
 * cannot make an unverified domain deliverable. The defect is divergence: this screen claims
 * Verified while every send fails at the provider with an opaque error, and nothing in the platform
 * can tell the two apart. A status with no provenance also cannot be distinguished from a status
 * nobody has ever checked, which is anti-regression rule 3 — a metric is a value or a stated reason
 * there is no value.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const api = read('supabase/functions/email-api/index.ts');
const tab = read('src/modules/email/components/EmailDomainsTab.tsx');
const service = read('src/modules/email/services/emailService.ts');

/** The domain block of email-api, from the check action to the next unrelated one. */
const verifyAction = api.slice(api.indexOf("case 'verify-domain'"), api.indexOf("case 'analytics'"));

describe('#357 AE-11 — the provider answers, the button does not', () => {
  it('the self-asserting action is gone, not merely renamed around', () => {
    expect(api, 'mark-domain-verified is back').not.toContain('mark-domain-verified');
    expect(api).toContain("case 'verify-domain'");
    expect(service, 'the client can still assert a domain verified').not.toMatch(/markDomainVerified/);
  });

  it('the status is read from Resend, not taken from the request', () => {
    expect(verifyAction).toContain('https://api.resend.com/domains');
    // The verdict must be derived from the provider's word, never from anything in the body.
    expect(verifyAction).toMatch(/providerStatus === 'verified'/);
    expect(verifyAction, 'the request body can set the status again').not.toMatch(
      /verification_status: requestBody|verification_status: body/,
    );
  });

  it('an unreachable provider leaves the stored row exactly as it was', () => {
    // FAIL CLOSED, in the sense that matters here: writing anything on a failed check — even
    // 'pending', even just a fresh timestamp — restates an unverified claim as a freshly
    // confirmed one, which is worse than the stale claim it replaced.
    const beforeWrite = verifyAction.slice(0, verifyAction.indexOf(".from('email_domains')"));
    expect(beforeWrite).toMatch(/throw new HttpError\(503,/);   // no key configured
    expect(beforeWrite).toMatch(/throw new HttpError\(502,/);   // provider error
    expect(beforeWrite).toMatch(/if \(!listRes\.ok\)/);
  });

  it('"Resend does not hold this domain" is recorded as an answer, not a failure', () => {
    // It means the DNS side was never started — actionable, and different from "we asked and it
    // is still propagating". Collapsing both into `pending` is how a domain sits for weeks.
    expect(verifyAction).toMatch(/'not_found'/);
  });

  it('every write stamps who said so and when', () => {
    for (const field of ['provider_status', 'provider_checked_at']) {
      expect(verifyAction, field).toContain(field);
    }
    // The bulk sync stamps them too, on every pass rather than only when the verdict changed:
    // "Resend still says verified, asked a minute ago" and "nobody has asked since March" are
    // different facts and only one of them is reassuring.
    const sync = api.slice(api.indexOf("case 'sync-domains'"));
    expect(sync).toContain('provider_checked_at');
    expect(sync).toMatch(/is_verified: verificationStatus === 'verified'/);
  });

  it('is_verified and verification_status are written together', () => {
    // Two columns holding one fact. They were written by different code paths and could disagree.
    expect(verifyAction).toMatch(/is_verified: verified/);
    expect(verifyAction).toMatch(/verification_status: localStatus/);
  });
});

describe('#357 AE-11 — the screen distinguishes unknown from pending', () => {
  it('a never-checked domain renders as such, not as Pending', () => {
    expect(tab).toMatch(/if \(!domain\.provider_checked_at\) return <Badge variant="neutral">/);
    expect(tab).toContain('Not checked yet');
  });

  it('a verified badge carries the time it was read', () => {
    // Otherwise a green badge from March is indistinguishable from a live reading.
    expect(tab).toMatch(/const checkedHint = /);
    expect(tab).toContain('provider_checked_at');
  });

  it('the button asks rather than asserts, and says so', () => {
    expect(tab).toContain('Check verification');
    expect(tab, 'the assert-it-yourself button is back').not.toContain('Mark Verified');
    expect(tab).toMatch(/emailService\.verifyDomainWithProvider\(domain\)/);
  });

  it('a still-pending answer is reported, not swallowed as an error', () => {
    // The check succeeded; the domain is simply not ready. Treating that as a failure teaches
    // people to ignore the button.
    expect(tab).toMatch(/result\.verified \? 'Verified by Resend' : 'Not verified yet'/);
    expect(tab).toMatch(/if \(result\.verified && onDomainVerified\)/);
  });

  it('the check is latched per domain, so one click is one Resend call', () => {
    expect(tab).toMatch(/verifyingDomains\.current\.has\(domain\)/);
    expect(tab).toMatch(/verifyingDomains\.current\.delete\(domain\)/);
  });
});
