/**
 * An unsubscribe is a compliance control, and it was wired two ways that both let mail through
 * (#366 BU-2).
 *
 * (a) The suppression lookup lived INSIDE `if (body.emailType === 'marketing')`. `emailType` is
 *     client-supplied and defaults to 'transactional' at three call sites, so omitting the field
 *     skipped the check — and so did setting it. The code comment claimed the marketing branch
 *     "closes the freeform / multi-`to` bypass"; the freeform composer is precisely the path that
 *     declares itself transactional. `SendEmailDialog` sends operator-typed free text to a CRM
 *     contact as 'transactional', and the meeting-invite sender and the real-estate buyer digest
 *     did the same.
 *
 * (b) The lookup destructured `{ data: supp }` and dropped `{ error }`. A failed query left `supp`
 *     undefined, `if (supp)` false, and the send proceeded — a control that switches itself off
 *     exactly when it cannot do its job.
 *
 * Both are source-shape defects with no runtime signal: nothing throws, nothing logs, and the
 * mail arrives. So they are pinned here, at the shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'supabase/functions/email-api/index.ts'), 'utf8');

const SUPPRESSION_QUERY = SRC.indexOf("from('email_unsubscribes')");
// Anchored to the start of a line so the sentence about the old shape, in the comment above the
// new code, is not mistaken for the branch itself.
const MARKETING_BRANCH = SRC.search(/^\s*if \(body\.emailType === 'marketing'\) \{/m);

describe('email-api suppression', () => {
  it('still has a suppression lookup at all', () => {
    expect(SUPPRESSION_QUERY, 'the email_unsubscribes lookup is gone').toBeGreaterThan(-1);
  });

  it('runs BEFORE, and outside, the marketing branch', () => {
    // The marketing branch still exists — it mints the unsubscribe token and the List-Unsubscribe
    // header, which genuinely are marketing-only. What it must not do again is own the check.
    expect(MARKETING_BRANCH).toBeGreaterThan(-1);
    expect(
      SUPPRESSION_QUERY,
      'the suppression lookup is inside the marketing branch again — a caller that omits '
        + "emailType, or declares 'transactional', skips it entirely",
    ).toBeLessThan(MARKETING_BRANCH);
  });

  it('fails CLOSED: the lookup error is read and refuses the send', () => {
    const near = SRC.slice(SUPPRESSION_QUERY - 400, SUPPRESSION_QUERY + 1200);
    expect(near, 'the lookup must destructure its error, not just its data').toMatch(/error:\s*suppError/);
    expect(near, 'a failed suppression lookup must refuse the send').toMatch(/suppression_check_failed/);
    expect(near, 'refusing means a non-2xx status').toMatch(/status:\s*503/);
  });

  it('exempts only server-to-server sends naming an allowlisted feature', () => {
    // Two conditions, both required. `isAdminAccess` is the non-forgeable half: a browser session
    // authenticates at level 'user', so nothing a page sends — tags included — buys an exemption.
    // That is what makes this different from the emailType field it replaces.
    expect(SRC).toMatch(/const\s+suppressionExempt\s*=\s*isAdminAccess\(auth\)/);
    expect(SRC).toMatch(/TRANSACTIONAL_FEATURES\.has\(sendFeature\)/);
  });

  it('keeps the periodic pushes OFF the transactional allowlist', () => {
    const list = SRC.slice(SRC.indexOf('const TRANSACTIONAL_FEATURES'), SRC.indexOf('const sendFeature'));
    expect(list).not.toContain('buyer_digest');       // periodic push to a saved property search
    expect(list).not.toContain('email_marketing');    // campaign-processor
    expect(list).not.toContain('presentation_catalogs'); // catalog-send-to-customers
    expect(list).not.toContain('automations');        // flow-engine
    // …and does still carry the genuine documents, or every invoice stops going out.
    expect(list).toContain('invoice_email');
    expect(list).toContain('finance_statement');
  });
});

describe('the senders that were bypassing', () => {
  it('the CRM freeform composer carries no feature tag, so it is never exempt', () => {
    const dialog = readFileSync(
      resolve(process.cwd(), 'src/components/business/crm/SendEmailDialog.tsx'), 'utf8');
    // It may keep declaring itself transactional — that classification is what `email_logs`
    // records. What it must not do is name an allowlisted feature and it cannot, being a browser
    // send. Assert it sends no `tags.feature` so the intent stays explicit in the file.
    expect(dialog).not.toMatch(/feature:\s*'(invoice_email|finance_statement|quotes|contracts)'/);
  });

  it('logging a meeting does not email the attendees unless asked', () => {
    const timeline = readFileSync(
      resolve(process.cwd(), 'src/components/business/crm/CrmActivityTimeline.tsx'), 'utf8');
    expect(
      timeline,
      'sendInvites defaulted to true, so recording a meeting that already happened mailed everyone in it',
    ).toMatch(/useState\(false\);\s*\/\/ email a calendar invite to attendees/);
  });
});
