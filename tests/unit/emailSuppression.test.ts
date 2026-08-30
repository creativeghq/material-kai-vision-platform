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

/**
 * ── The webhook side, 2026-08-30 ────────────────────────────────────────────────────────────
 *
 * A hard bounce and a spam complaint are mandatory opt-outs — the mailbox is gone, or the
 * recipient has told a provider we are spam. `email-webhooks` is the only thing that records
 * either. Two defects there, both silent:
 *
 * (a) `bounce_type` was written as the literal `'Permanent'` while the suppression decision
 *     forty lines below correctly read `bounce.type` from the payload. So the stored evidence
 *     disagreed with the action taken on it: a Transient bounce was recorded as Permanent and
 *     (rightly) not suppressed, leaving the row unable to explain the behaviour — and any
 *     deliverability report reading that column counts every soft bounce as hard.
 *
 * (b) `email_unsubscribes` is keyed on `(workspace_id, email)`, so a send whose log carries no
 *     workspace could not be suppressed at all — and the `if (wsId && toEmail)` guard skipped
 *     it in silence. The SEND path skips its own check for the same reason, so nothing stopped
 *     the next message either.
 *
 * MEASURED on this platform 2026-08-30: both hard bounces ever recorded
 * (2026-07-31, 2026-08-03) landed on logs with a NULL `workspace_id`, and `email_unsubscribes`
 * is empty. Two addresses that hard-bounced are still mailable. The CAUSE is already fixed —
 * workspace attribution on `email_logs` closed in mid-August and all 82 logs since carry one —
 * so what was missing is the part that would have told anyone. The integrity probe
 * `email_hard_bounce_unsuppressed` (in `dic_detect__ops_silent_zero`, rostered in
 * `ops.silent_zero_probe_missing`) is that part; it reports the two historical addresses.
 */
const HOOK = readFileSync(resolve(process.cwd(), 'supabase/functions/email-webhooks/index.ts'), 'utf8');

describe('a recorded bounce says what the provider said', () => {
  it('is pointed at the real file', () => {
    expect(HOOK).toContain('bounce_type');
    expect(HOOK, 'the bounced-event branch is what this guards').toMatch(/email\.bounced/);
  });

  it('never writes a constant severity', () => {
    // The exact defect: `eventRecord.bounce_type = 'Permanent';`. Assigning ANY literal is the
    // bug, not just that one — 'Transient' hardcoded would be the same lie in the other
    // direction, and it is the one a well-meaning fix would reach for.
    expect(HOOK, 'bounce_type is assigned a string literal — it must come from the payload')
      .not.toMatch(/bounce_type\s*=\s*['"`](?:Permanent|Transient|Undetermined)['"`]/);
  });

  it('reads the severity off the payload', () => {
    // The value assigned must trace back to `bounce.type`. Checked as a PAIR — a const derived
    // from the payload, and that same const landing in the column — because either half alone
    // passes while the other is a literal.
    const derive = HOOK.match(/const (\w+) = String\([^;]*?bounce\?\.type[^;]*?\);/);
    expect(derive, 'nothing in the file derives a bounce severity from the payload').not.toBeNull();
    const assigned = HOOK.match(/bounce_type = ([A-Za-z_$][\w$]*)/);
    expect(assigned, 'bounce_type is not assigned from a variable at all').not.toBeNull();
    expect(assigned![1], 'bounce_type is assigned from something other than the value read off '
      + 'the payload — that split between what is recorded and what is acted on IS the defect')
      .toBe(derive![1]);
  });

  it('defaults an absent type to the honest answer, not the severe one', () => {
    // Resend sends Permanent | Transient | Undetermined. An unstated type is unknown; recording
    // it as Permanent invents a fact, and recording it as Transient hides one.
    expect(HOOK, "an absent bounce type must fall back to 'Undetermined'")
      .toMatch(/\|\|\s*'Undetermined'/);
  });

  it('and the suppression decision still reads the same field', () => {
    // The two must not drift apart again — that split IS the defect.
    expect(HOOK).toMatch(/bounceType\s*=\s*String\(/);
    expect(HOOK, 'only a permanent bounce suppresses').toMatch(/bounceType === 'permanent'/);
  });
});

describe('a suppression that could not happen is not silent', () => {
  it('still guards on having a workspace and a recipient', () => {
    // The guard is correct — the table is keyed on (workspace_id, email) and there is nothing
    // to write without one. What was wrong is that failing it produced nothing at all.
    expect(HOOK).toMatch(/if \(wsId && toEmail\)/);
  });

  it('has an else branch, and it reports', () => {
    const i = HOOK.indexOf('if (wsId && toEmail)');
    expect(i, 'the suppression guard is gone').toBeGreaterThan(-1);
    const after = HOOK.slice(i, i + 2400);
    expect(after, 'the unsuppressable case falls through in silence — an address that hard-bounced '
      + 'keeps being mailed and nothing anywhere says so').toMatch(/\}\s*else\s*\{/);

    // Scoped to the ELSE BODY, not the surrounding window. The `try` wrapping this guard ends in
    // `catch (e) { console.error(...) }`, so a window-wide search for console.error passes while
    // the report itself is downgraded to console.debug — which is the `segmentation_service`
    // shape: a fallback that fires forever at a level nobody reads.
    const elseAt = after.search(/\}\s*else\s*\{/);
    const catchAt = after.indexOf('} catch');
    expect(catchAt, 'the else body is not bounded by the catch this expects').toBeGreaterThan(elseAt);
    const body = after.slice(elseAt, catchAt);
    expect(body, 'the report must be an error — a debug line is not a report')
      .toMatch(/console\.error\(/);
    expect(body, 'the report must name the address it could not suppress').toContain('toEmail');
  });

  it('the hard-bounce path is what reaches that guard', () => {
    const i = HOOK.indexOf('if (wsId && toEmail)');
    const before = HOOK.slice(Math.max(0, i - 900), i);
    expect(before, 'complaints and hard bounces are the two mandatory opt-outs')
      .toMatch(/email\.complained' \|\| isHardBounce/);
  });
});
