import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';

/**
 * A marketing send fails CLOSED on both of its compliance controls (#387, #366 BU-2).
 *
 * The subsystem applied one philosophy — "never block the send" — to two controls, and
 * it is right for only one category of mail. For a TRANSACTIONAL email, never blocking
 * is correct: the recipient asked for it. For a MARKETING send the safe failure is
 * inverted — not sending is recoverable, sending bulk mail without a working opt-out is
 * not, and deliverability damage is not something a later fix undoes.
 *
 * WHAT MADE #387 HARD TO SEE
 * The email still contained AN unsubscribe link, because the body fell back to a generic
 * `${appBase}/unsubscribe`. So it looked compliant. What actually vanished was the
 * `List-Unsubscribe` / `List-Unsubscribe-Post` header pair, and the fallback link
 * carried no workspace and no recipient token — so the page could not tell who had
 * clicked and could not honour the request without them re-entering their details. That
 * is precisely the friction one-click exists to remove.
 *
 * RFC 8058 one-click unsubscribe has been a requirement for bulk senders under the Gmail
 * and Yahoo rules since February 2024.
 */

const ROOT = join(__dirname, '..', '..');
const EMAIL_API = join(ROOT, 'supabase/functions/email-api/index.ts');

function source(): string {
  return stripComments(readFileSync(EMAIL_API, 'utf8'));
}

describe('#387 — marketing sends fail closed on their compliance controls', () => {
  it('a missing CRON_SECRET refuses the send instead of dropping the headers', () => {
    const src = source();
    const at = src.indexOf('async function buildUnsubscribe');
    expect(at, 'buildUnsubscribe is gone — this test is guarding nothing').toBeGreaterThan(-1);
    const body = src.slice(at, at + 1200);

    expect(
      /if\s*\(\s*!secret\s*\)\s*\{?\s*return null/.test(body),
      'buildUnsubscribe returns null on a missing CRON_SECRET again (#387). That drops ' +
        'the List-Unsubscribe headers and degrades the body link to one with no ' +
        'workspace and no recipient token — an opt-out that cannot identify who clicked.',
    ).toBe(false);
    expect(body).toContain('throw new HttpError');
  });

  it('the anonymous unsubscribe fallback stays gone', () => {
    const src = source();
    expect(
      /unsubscribeUrl:\s*built\?\.url\s*\|\|/.test(src),
      'the `built?.url || `${appBase}/unsubscribe`` fallback is back. It is what made ' +
        'this defect quiet: the email still looked compliant while carrying a link that ' +
        'could not honour the request.',
    ).toBe(false);
    expect(src).toContain('unsubscribeUrl: built.url');
  });

  it('a marketing send with no from-address is refused', () => {
    // The second silent path, which produced the identical outcome: no from-address
    // meant `built` was null, so the headers vanished the same way. List-Unsubscribe
    // needs a mailto, so there is nothing to build.
    const src = source();
    expect(src).toContain('if (!fromForUnsub)');
  });

  it('the suppression lookup still fails closed', () => {
    // #366 BU-2, already fixed — pinned here because it is the same subsystem applying
    // the same philosophy to the other compliance control, and the two are only safe
    // together. A marketing send that skipped BOTH would go out without consulting the
    // opt-out list AND without a working way to join it.
    const src = source();
    expect(src).toContain('suppression_check_failed');
    expect(
      /const \{ data: supp \} = await/.test(src),
      'the suppression lookup discards its error again — that leaves `supp` undefined, ' +
        'the `if (supp)` false, and the send going out: a compliance control that ' +
        'switches itself off exactly when it cannot do its job',
    ).toBe(false);
  });

  it('transactional sends are not caught by any of this', () => {
    // The point is the CATEGORY split, not blocking mail in general. If the refusals
    // ever move outside the marketing branch, a password reset starts failing because a
    // cron secret is unset — which is the opposite mistake, made just as confidently.
    const src = source();
    const at = src.indexOf('if (!fromForUnsub)');
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(0, at);
    expect(
      before.lastIndexOf("emailType === 'marketing'"),
      'the from-address refusal is no longer inside the marketing branch',
    ).toBeGreaterThan(-1);
  });
});
