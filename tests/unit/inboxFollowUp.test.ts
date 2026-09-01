/**
 * Open / Follow-up / Done — three statuses that existed for a long time and did nothing.
 *
 * THE DEFECT
 * ----------
 * Measured 2026-09-01: all 56 live threads sat in `open`. Neither of the other two had ever been
 * used once, and three separate things explain why.
 *
 *  1. It was named twice. The dropdown that SET it said Open / Snoozed / Closed; the tabs that
 *     FOUND it, directly beside them, said Open / Follow-up / Done. One enum, two vocabularies.
 *  2. "Follow-up" never came back. No date, no cron — a shelf you had to remember to walk past.
 *     A follow-up with no moment attached is just a second Done.
 *  3. Every message forced it back to `open`, including OUR OWN reply and even a private note.
 *     Which is exactly backwards: the moment you mark a thread "chase this" is right after you
 *     answered it, so the act of answering undid it.
 *
 * (3) was written out three times — inbox-api's send path, the Zernio social refresh and the
 * inbound-email handler — so it is now a database trigger, and these tests watch the app for its
 * return rather than trusting that three copies stay deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

/**
 * Read with LF endings.
 *
 * `core.autocrlf` is on, so half of these files arrive CRLF on a Windows checkout — and a
 * slice keyed on a bare newline then matches nothing, `indexOf` returns -1, and the span
 * silently widens to the whole file. A source-scanning test that reads the wrong span passes
 * on the wrong evidence, which is worse than failing.
 */
const read = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), 'utf8').split('\r\n').join('\n');

/**
 * The same file with its comments blanked and its offsets preserved.
 *
 * Every assertion below about the SHAPE of the code reads this rather than the raw text. A
 * comment explaining that `status: 'open'` was removed contains the string `status: 'open'`,
 * and a guard that convicts its own explanation is a guard nobody can write a fix for.
 */
const code = (src: string) => blankComments(src);

const PAGE = read('src', 'pages', 'Inbox', 'InboxPage.tsx');
const API = read('supabase', 'functions', 'inbox-api', 'index.ts');
const CRON = read('supabase', 'functions', 'inbox-follow-up-cron', 'index.ts');
const ZERNIO = read('supabase', 'functions', 'zernio-webhook-handler', 'index.ts');
const EMAIL = read('supabase', 'functions', '_shared', 'inbound-email.ts');

describe('one status, one vocabulary', () => {
  it('names the three the same way in the setter and in the tabs', () => {
    // Same screen, same enum. A control that calls a value "Snoozed" while the tab beside it
    // calls the same value "Follow-up" is two features as far as the reader is concerned.
    for (const word of ['>Open<', '>Follow-up<', '>Done<']) {
      expect(PAGE, `the status dropdown does not offer ${word}`).toContain(`<option value=`);
    }
    const select = PAGE.slice(PAGE.indexOf('<option value="open">'), PAGE.indexOf('</select>'));
    expect(select).toContain('>Open<');
    expect(select).toContain('>Follow-up<');
    expect(select).toContain('>Done<');
    // ...and the words it used to use are gone from it, not merely joined by the new ones.
    expect(select).not.toContain('>Snoozed<');
    expect(select).not.toContain('>Closed<');
  });
});

describe('what a message does to a conversation', () => {
  /*
   * The rule itself is a Postgres trigger (`inbox_message_moves_thread_state`) and is exercised
   * against the live database — six cases, including "a note never moves anything" and "a social
   * commenter has no participant row and is still the other side".
   *
   * What a repo test CAN see is whether an application writer has quietly started answering the
   * same question again, which is how it came to be written three times before.
   */
  it('no application writer sets the status on a message any more', () => {
    const api = code(API);
    const sendPath = api.slice(api.indexOf('async function insertMessageAndNotify'));
    const body = sendPath.slice(0, sendPath.indexOf('\n}\n'));
    expect(body, 'the send path no longer touches the thread at all').toMatch(/from\('inbox_threads'\)/);
    expect(body, 'insertMessageAndNotify is setting status again').not.toMatch(/status:\s*'open'/);

    // The other two copies. Both updated a thread on an inbound message; both are the trigger's
    // job now, and a re-added line here reintroduces the split with no visible symptom.
    const zernio = code(ZERNIO);
    const social = zernio.slice(zernio.indexOf("from('inbox_threads').update({"),
                                zernio.indexOf("from('inbox_threads').update({") + 300);
    expect(social).toMatch(/last_message_at: params\.at/);
    expect(social, 'the Zernio social refresh is forcing open again').not.toMatch(/status:\s*'open'/);

    const email = code(EMAIL);
    const at = email.indexOf('update({ metadata: meta');
    expect(at).toBeGreaterThan(-1);
    const emailUpdate = email.slice(at, at + 200);
    expect(emailUpdate, 'the inbound-email handler is forcing open again').not.toMatch(/status:\s*'open'/);
  });
});

describe('a follow-up is a moment, and optionally a message', () => {
  const setBlock = API.slice(API.indexOf("case 'set_follow_up'"), API.indexOf("case 'clear_follow_up'"));

  it('refuses a follow-up with no time attached', () => {
    // A status with no date is the exact state this replaces.
    expect(setBlock).toMatch(/at or days is required/);
    expect(setBlock).toMatch(/has already passed/);
  });

  it('puts the thread in Follow-up, because that IS the bucket', () => {
    expect(setBlock).toMatch(/status: 'snoozed'/);
  });

  it('warns at SCHEDULING time that a WhatsApp chase will not send', () => {
    /*
     * Meta accepts a freeform message only inside 24 hours of the customer's last one, and a
     * follow-up is usually days away — so on WhatsApp the automatic send normally cannot happen
     * at all. Discovering that on Thursday means three days of believing a message is going out.
     *
     * The client repeats it beside the checkbox, before the operator types the message.
     */
    expect(setBlock).toMatch(/whatsappWindow/);
    expect(setBlock).toMatch(/24-hour service window/);
    expect(PAGE).toMatch(/otherwise you will just be reminded/i);
  });

  it('offsets CALENDAR days in the client, not 24-hour blocks', () => {
    // A DST day is 23 or 25 hours, so `Date.now() + n * 86400000` lands "in a week" an hour
    // early twice a year. And it is computed client-side because that is the only runtime that
    // knows the operator's timezone — the database session is UTC.
    const fn = PAGE.slice(PAGE.indexOf('function daysFromNow'), PAGE.indexOf('function toLocalInputValue'));
    expect(fn).toMatch(/d\.setDate\(d\.getDate\(\) \+ n\)/);
    expect(fn, 'the offset is back to a 24-hour block').not.toMatch(/86400000/);
    expect(PAGE).toMatch(/at: at\.toISOString\(\)/);
  });
});

describe('firing one', () => {
  it('claims the row BEFORE it sends, in the database', () => {
    /*
     * This sends a real message to a real customer and that half cannot be rolled back, so a
     * retry after a timeout must not chase somebody twice. `claim_due_inbox_follow_ups` stamps
     * `follow_up_fired_at` in the same statement that selects the row — a lost race returns zero
     * rows rather than a second message.
     */
    expect(CRON).toMatch(/claim_due_inbox_follow_ups/);
    const claimAt = CRON.indexOf('claim_due_inbox_follow_ups');
    const sendAt = CRON.indexOf('sendChase(row.thread_id');
    expect(claimAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(-1);
    expect(claimAt, 'the send happens before the claim').toBeLessThan(sendAt);
  });

  it('sends through the ordinary send path, never by writing a row', () => {
    // An insert into `inbox_messages` would produce a follow-up the operator can see and the
    // customer never got — the same lie as a sent bubble for a message Meta refused, inverted.
    expect(CRON).toMatch(/internal_send_follow_up/);
    expect(CRON).not.toMatch(/from\('inbox_messages'\)/);
    // ...and that action is service-role only, and checks the scheduler is still a member.
    const internal = API.slice(API.indexOf("action === 'internal_send_follow_up'"));
    const block = internal.slice(0, internal.indexOf("action === 'internal_agent_reply'"));
    expect(block).toMatch(/Bearer \$\{SERVICE_ROLE_KEY\}/);
    expect(block).toMatch(/callerRoleInWorkspace/);
    expect(block).toMatch(/whatsappWindow/);
  });

  it('reopens the thread whether or not the message went', () => {
    /*
     * A chase Meta refused needs the operator MORE than one that worked, not less. And
     * `follow_up_fired_at` is already stamped by the claim, so leaving the status alone on
     * failure would strand the thread in Follow-up having fired, never to fire again.
     */
    const loop = CRON.slice(CRON.indexOf('for (const row of rows)'));
    expect(loop).toMatch(/status: 'open'/);
    expect(loop).toMatch(/follow_up_error: sendError/);
    // The status write is not inside a success branch.
    const statusAt = loop.indexOf("status: 'open'");
    const successOnly = loop.slice(0, statusAt).lastIndexOf('if (res.ok)');
    const closes = loop.slice(0, statusAt).lastIndexOf('}');
    expect(closes, 'the reopen is nested under the success branch').toBeGreaterThan(successOnly);
  });

  it('tells somebody through the flows engine, not a hardcoded notification', () => {
    expect(CRON).toMatch(/emitFlowEvent\('inbox\.follow_up_due'/);
    expect(CRON).not.toMatch(/user_notifications/);
    expect(CRON).not.toMatch(/email-api/);
  });

  it('surfaces a refused chase in the conversation itself', () => {
    // The operator now has to do by hand the thing they scheduled, and the commonest reason is
    // only fixable by them. A `follow_up_error` with no reader is the silent-zero shape.
    expect(PAGE).toMatch(/follow_up_error/);
    expect(PAGE).toMatch(/was not sent/);
  });
});
