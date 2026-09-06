/**
 * A thread you cannot read does not exist, and an id in a request body is checked against you
 * (#359 CM-9 / CM-11).
 *
 * CM-11: handlers answered `403 You are not a participant of this thread`, which confirms the id
 * is real and a conversation exists behind it. Invariant 1 is explicit — *"Return 404 (not 403) on
 * ownership mismatch to avoid id enumeration."* One handler (`loadThreadIntake`) already did the
 * right thing; the rest did not, and the capability refusals sat in front of the visibility check
 * so a non-participant got the capability message.
 *
 * CM-9: `open_marketplace_inquiry` stored `demand_id` straight from the body, and `accept` then
 * wrote a `stock_allocations` row keyed on it. The `order_items` read carried a workspace filter;
 * the `quote_items` read did not, and could not have had a simple one — `quote_items` has no
 * workspace column, so tenancy lives on the parent quote. Fifth confirmed instance of two ids each
 * individually valid, never checked against each other (CRM-5 #353, RE-4 #356, PQ-4 #358).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const api = stripComments(readFileSync(join(ROOT, 'supabase/functions/inbox-api/index.ts'), 'utf8').replace(/\r\n/g, '\n'));

/** One `case` block, anchored forward to the next one. Never keyed on comment text. */
function sliceCase(header: string): string {
  const start = api.indexOf(header);
  if (start < 0) throw new Error(`case not found: ${header}`);
  const next = api.indexOf("    case '", start + header.length);
  const body = api.slice(start, next > -1 ? next : undefined);
  if (body.length < 200) throw new Error(`case body suspiciously short: ${header}`);
  return body;
}

describe('#359 CM-11 — an unreadable thread answers 404', () => {
  it('the visibility refusal is a 404, in one helper', () => {
    expect(api).toMatch(/function assertThreadVisible/);
    expect(api).toMatch(/throw new HttpError\(404, 'Conversation not found'\)/);
  });

  it('no handler answers 403 for "not a participant"', () => {
    // That sentence is the disclosure: it confirms the thread exists.
    expect(api, 'a participant refusal is a 403 again')
      .not.toMatch(/HttpError\(403, 'You are not a participant of this thread'\)/);
  });

  it('every resolveThreadAccess is followed by the visibility check', () => {
    // The capability refusals (`isMember`) used to sit in FRONT of any visibility check, so a
    // non-participant received "Only thread members may archive conversations" — which tells them
    // the thread is real and roughly what it is.
    const sites = [...api.matchAll(/const access = await resolveThreadAccess\([^)]*\);/g)];
    expect(sites.length).toBeGreaterThan(10);
    for (const m of sites) {
      const line = api.slice(0, m.index!).split('\n').length;
      const after = api.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
      // The PROPERTY, not the helper: whatever refuses first must be a 404. Two handlers refuse
      // inline with `!access.isMember && !operator → 404`, which is the same guarantee written
      // differently — demanding the helper by name would fail them for being right.
      const notFound = Math.min(
        ...[after.indexOf('assertThreadVisible(access)'), after.search(/HttpError\(404,/)]
          .map((i) => (i === -1 ? Number.POSITIVE_INFINITY : i)),
      );
      const forbidden = after.search(/HttpError\(403,/);
      expect(Number.isFinite(notFound), `no 404 visibility refusal after line ${line}`).toBe(true);
      if (forbidden > -1) {
        expect(notFound < forbidden, `a 403 precedes the visibility refusal at line ${line}`).toBe(true);
      }
    }
  });

  it('mark_read stops confirming the thread too', () => {
    const mark = api.slice(api.indexOf("case 'mark_read'"), api.indexOf("case 'mark_read'") + 600);
    expect(mark).toMatch(/if \(!me\) throw new HttpError\(404, 'Conversation not found'\)/);
  });

  it('a capability refusal to somebody who CAN read stays a 403', () => {
    // "Only members may leave private notes" tells a customer participant nothing they did not
    // already know — they are looking at the thread. Collapsing every refusal into 404 would make
    // a real permission error unreadable.
    expect(api).toMatch(/HttpError\(403, 'Only members may leave private notes'\)/);
  });
});

describe('#359 CM-9 — a sourcing demand must be the buyer own line', () => {
  it('the id is verified where it ENTERS, not only where it is used', () => {
    // An unverified id sitting in a stored row is a decision already taken.
    // Anchored on CODE, not on comment text: the source is comment-stripped, so a slice keyed on
    // a comment silently comes back empty and the assertions pass over nothing.
    const create = sliceCase("case 'create_marketplace_inquiry'");
    expect(create).toMatch(/rpc\('demand_line_belongs_to_workspace'/);
    expect(create).toMatch(/p_workspace_id: buyerWorkspaceId/);
    expect(create).toMatch(/throw new HttpError\(404, 'not found'\)/);
  });

  it('the stored row uses the verified values, not the raw payload', () => {
    // Anchored on CODE, not on comment text: the source is comment-stripped, so a slice keyed on
    // a comment silently comes back empty and the assertions pass over nothing.
    const create = sliceCase("case 'create_marketplace_inquiry'");
    expect(create).toMatch(/demand_type: demandType,/);
    expect(create).toMatch(/demand_id: demandId,/);
    expect(create, 'the raw payload id is stored again')
      .not.toMatch(/demand_id: payload\.demand_id \? String\(payload\.demand_id\) : null/);
  });

  it('accept re-checks before it writes an allocation', () => {
    // The row was written by a verified caller, but a stored id is still an id — the quote could
    // have moved workspace, or the row could predate the check.
    const accept = sliceCase("case 'accept_marketplace_inquiry'");
    expect(accept).toMatch(/rpc\('demand_line_belongs_to_workspace'/);
    const check = accept.indexOf("rpc('demand_line_belongs_to_workspace'");
    const alloc = accept.indexOf("from('stock_allocations')");
    expect(alloc).toBeGreaterThan(-1);
    expect(check < alloc, 'the allocation is written before the demand line is verified').toBe(true);
  });

  it('the quote_items read is tenant-bound through its parent quote', () => {
    // `quote_items` has no workspace column, which is why the bare `.eq('id', …)` looked complete.
    const accept = sliceCase("case 'accept_marketplace_inquiry'");
    expect(accept).toMatch(/quote:quotes!quote_id\(workspace_id\)/);
    expect(accept).toMatch(/q\?\.workspace_id === buyerWs/);
  });
});

describe('#359 CM-2 — one derivation of the 24-hour window', () => {
  it('the composer asks the shared SQL function for the local half', () => {
    // `messaging-api` grew its own version of "when did the customer last write". Two definitions
    // of one fact is how a member's composer and a campaign send come to disagree about whether
    // they may write to somebody.
    expect(api).toMatch(/rpc\('whatsapp_thread_last_inbound_at', \{ p_thread_id: threadId \}\)/);
    // Scoped to whatsappWindow: the email relay path reads the same marker for a DIFFERENT
    // purpose (In-Reply-To threading), and forbidding it globally would be a rule about the
    // wrong thing.
    const fn = api.slice(api.indexOf('async function whatsappWindow'), api.indexOf('async function getThreadOrThrow'));
    expect(fn.length).toBeGreaterThan(200);
    expect(fn, 'the private inbound query is back').not.toMatch(/from\('inbox_messages'\)/);
  });

  it('it keeps the provider fallback, which only a thread can do', () => {
    // Only a thread knows its conversation id, so asking Zernio when our mirror is silent is this
    // function's own enrichment rather than a second derivation.
    expect(api).toMatch(/fetchLastInboundAt\(\{/);
    expect(api).toMatch(/source: 'unknown'/);
  });
});

describe('#359 CM-10 — a customer sees the customer projection', () => {
  it('participants and messages are column-listed for a non-member', () => {
    // `select('*')` handed a client-role user every internal member's user_id and last_read_at,
    // and each message's delivery metadata and provider ids.
    const get = sliceCase("case 'get_thread'");
    expect(get).toMatch(/select\(isMember \? '\*' : 'id, participant_type, thread_role'\)/);
    // `cards:metadata->cards` is a projection of ONE json key (the catalog cards the business
    // sent this customer), not the `metadata` column — delivery state, provider ids and relay
    // addresses stay behind the list. A bare `metadata` here is the leak this test exists for.
    expect(get).toMatch(/select\(isMember \? '\*' : 'id, body, attachments, message_type, sender_participant_id, created_at, cards:metadata->cards'\)/);
    expect(get).not.toMatch(/: 'id, body, attachments[^']*\bmetadata,/);
  });

  it('the thread row is projected too', () => {
    // It carries the routing metadata the relay reads — the mailbox we send FROM, the provider
    // conversation id — plus assignment and internal counters.
    //
    // Asserted as the customer branch's KEY SET rather than as `isMember ? thread : {`, which is
    // what this used to pin. That shape was a proxy for the rule and it broke the moment the
    // MEMBER half was legitimately enriched (`counterparty_participant_id`) — a change that
    // cannot widen what a customer receives, but failed the anchor anyway. A proxy that fires on
    // safe edits gets relaxed by whoever hits it next, and the relaxation is where the real leak
    // walks in. So: name the seven columns. Adding an eighth to the customer's copy fails here.
    const get = sliceCase("case 'get_thread'");
    expect(get).toMatch(/const threadForCaller = isMember \?/);
    const decl = get.slice(get.indexOf('const threadForCaller = isMember ?'));
    const body = decl.slice(0, decl.indexOf('\n      };') + 9);
    // Everything after the ternary's own `: {` is the customer's half. The member half holds no
    // object literal of its own, so the LAST occurrence is the ternary's — true whether that half
    // is a bare `thread` or a spread.
    const forCustomer = body.slice(body.lastIndexOf(': {') + 3);
    const keys = [...forCustomer.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(new Set(keys)).toEqual(new Set([
      'id', 'subject', 'status', 'channel', 'thread_type', 'last_message_at', 'created_at',
    ]));
    expect(get).toMatch(/return json\(\{ thread: threadForCaller,/);
  });

  it('it matches what the unauthenticated token path already gave the same person', () => {
    // `token_get_thread` is this screen without an account. Two projections for one audience is
    // how the narrower one comes to be treated as the special case.
    const token = api.slice(api.indexOf("case 'token_get_thread'"), api.indexOf("case 'token_request_code'"));
    for (const field of ['id, participant_type, thread_role', 'id, body, attachments, message_type, sender_participant_id, created_at, cards:metadata->cards']) {
      expect(token, field).toContain(field);
    }
  });

  it('notes stay excluded — the loud half of the rule', () => {
    const get = sliceCase("case 'get_thread'");
    expect(get).toMatch(/if \(!isMember\) mq = mq\.neq\('message_type', 'note'\)/);
  });
});
