/**
 * A conversation becomes a piece of work in ONE call.
 *
 * The contact, the participant link, the deal and the activity have to land together. Four client
 * writes leave an operator holding a contact with no deal and a button that is still armed, and
 * the only thing on offer is to press it again (anti-regression rule 4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const EDGE = read('supabase/functions/inbox-api/index.ts');
const CLIENT = read('src/services/inboxApi.ts');
const PAGE = read('src/pages/Inbox/InboxPage.tsx');

const DIALOG = (() => {
  const start = PAGE.indexOf('const PromoteThreadDialog');
  expect(start, 'PromoteThreadDialog is gone from the Inbox').toBeGreaterThan(-1);
  const end = PAGE.indexOf('const DetailsRail', start);
  expect(end, 'the dialog is no longer followed by DetailsRail — re-anchor this slice').toBeGreaterThan(start);
  return PAGE.slice(start, end);
})();

const ACTION = (() => {
  const start = EDGE.indexOf("case 'promote_thread': {");
  expect(start, "the promote_thread action is gone from inbox-api").toBeGreaterThan(-1);
  return EDGE.slice(start, EDGE.indexOf("case 'set_status': {", start));
})();

describe('one call, one outcome', () => {
  it('the action delegates to the RPC and writes nothing itself', () => {
    expect(ACTION).toMatch(/rpc\('promote_inbox_thread'/);
    // A contact or deal inserted from here would be the second write this design removes.
    expect(ACTION).not.toMatch(/from\('crm_contacts'\)/);
    expect(ACTION).not.toMatch(/from\('crm_deals'\)/);
    expect(ACTION).not.toMatch(/from\('inbox_participants'\)/);
  });

  it('the client offers one method, not a contact call plus a deal call', () => {
    expect(CLIENT).toMatch(/promoteThread\(thread_id: string/);
    expect(CLIENT).toMatch(/'promote_thread'/);
  });

  it('the dialog calls it once', () => {
    expect((DIALOG.match(/inboxApi\.\w+\(/g) ?? [])).toEqual(['inboxApi.promoteThread(']);
  });
});

describe('tenancy and attribution', () => {
  it('checks thread membership BEFORE the RPC', () => {
    const access = ACTION.indexOf('resolveThreadAccess');
    const member = ACTION.indexOf('access.isMember');
    const rpc = ACTION.indexOf("rpc('promote_inbox_thread'");
    expect(access).toBeGreaterThan(-1);
    expect(member).toBeGreaterThan(-1);
    expect(member, 'the membership check must precede the write').toBeLessThan(rpc);
    expect(access).toBeLessThan(rpc);
  });

  it('takes the actor from the verified JWT, never from the body', () => {
    // The client here is service-role, so auth.uid() inside the function is null and the deal
    // would have no owner. `userId` comes from the authenticated request; `payload` does not.
    expect(ACTION).toMatch(/p_actor: userId,/);
    expect(ACTION, 'an actor supplied by the caller is a BOLA hole (invariant 1)')
      .not.toMatch(/p_actor: [^u\n]/);
  });

  it('refuses a non-member with 403 rather than writing', () => {
    expect(ACTION).toMatch(/if \(!access\.isMember\) throw new HttpError\(403/);
  });
});

describe('the deal vocabulary comes from the database', () => {
  it('the dialog fetches the types instead of listing them', () => {
    expect(DIALOG).toMatch(/from\('crm_deal_types'\)/);
    // A hardcoded list here would be a second copy of a DB vocabulary, and it would drift the
    // first time somebody adds a deal type.
    for (const hardcoded of ["'real_estate'", "'construction'"]) {
      expect(DIALOG, `${hardcoded} is hardcoded in the picker`).not.toContain(hardcoded);
    }
  });

  it('never picks the stage itself', () => {
    // Stages are per deal type and a composite FK enforces it, so a client-chosen stage is
    // either rejected outright or silently wrong. The RPC reads the first open stage of the type.
    expect(DIALOG).not.toMatch(/stage:/);
    expect(ACTION).not.toMatch(/p_stage/);
  });
});

describe('what the operator is told', () => {
  it('a second press is reported as such, not as a new deal', () => {
    expect(DIALOG).toMatch(/already_linked/);
    expect(ACTION).toMatch(/already_linked/);
  });

  it('the stage the deal landed in is named', () => {
    expect(DIALOG).toMatch(/r\.stage/);
  });
});
