/**
 * A reply waiting when you arrive — and never one that answers the previous question.
 *
 * "Draft with AI" was pull-only: a member had to open the thread and press it, so 46 conversations
 * waiting got nothing until somebody opened each one. `agent_state='suggesting'` drafts on arrival.
 *
 * The failure this guards is the stale draft. A draft written before the customer wrote again is a
 * perfectly valid string that answers the wrong message, so nothing downstream would raise — the
 * same shape as every silent zero in this codebase, one layer up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const EDGE = read('supabase/functions/inbox-api/index.ts');
const CRON = read('supabase/functions/inbox-draft-cron/index.ts');
const PAGE = read('src/pages/Inbox/InboxPage.tsx');
const CLIENT = read('src/services/inboxApi.ts');
const DOC = readFileSync(join(ROOT, 'docs/inbox-system.md'), 'utf8');

const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  expect(a, `anchor missing: ${from}`).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  return src.slice(a, b > -1 ? b : undefined);
};

describe('nothing reaches the customer', () => {
  const action = slice(EDGE, "if (action === 'internal_draft_reply')", "\n  // Internal branch");

  it('the draft is stored, never posted', () => {
    expect(action).toMatch(/from\('inbox_threads'\)/);
    // insertMessageAndNotify is what sends. It must not appear anywhere in this path.
    expect(action, 'the draft path posts a message — it must only store one')
      .not.toMatch(/insertMessageAndNotify/);
  });

  it('is service-role only', () => {
    expect(action).toMatch(/authHeader !== `Bearer \$\{SERVICE_ROLE_KEY\}`/);
  });

  it('stops if the assistant was switched off in between', () => {
    expect(action).toMatch(/agent_state !== 'suggesting'/);
  });
});

describe('a draft never answers the wrong message', () => {
  it('the write is conditional on the claim it was given', () => {
    const action = slice(EDGE, "if (action === 'internal_draft_reply')", "\n  // Internal branch");
    // A customer who wrote again while the model was thinking has already moved the claim on.
    expect(action).toMatch(/\.eq\('agent_draft_for_message_id', messageId\)/);
  });

  it('currency is DERIVED server-side, from the one definition', () => {
    expect(EDGE).toMatch(/rpc\('inbox_newest_inbound_message_id'/);
    expect(EDGE).toMatch(/agent_draft_is_current: draftIsCurrent/);
    // The client must not decide this for itself — that would be a second derivation of
    // "the message a reply is answering", and it would drift from the cron's claim.
    expect(PAGE, 'the page recomputes draft currency instead of reading the derived verdict')
      .not.toMatch(/agent_draft_for_message_id/);
  });

  it('the composer only loads a current draft', () => {
    expect(PAGE).toMatch(/if \(thread\.agent_draft && thread\.agent_draft_is_current\)/);
  });

  it('and says why a stale one is not there', () => {
    // Vanishing without a word reads as the assistant having done nothing.
    expect(PAGE).toMatch(/agent_draft_is_current === false/);
    expect(PAGE).toMatch(/agent_draft_error/);
  });
});

describe('the cron cannot bill the same turn twice', () => {
  it('claims through the RPC that stamps as it selects', () => {
    expect(CRON).toMatch(/rpc\('claim_due_inbox_drafts'/);
    // Reading the threads and then drafting would let two overlapping runs pick the same row.
    expect(CRON, 'the cron selects threads itself instead of claiming them')
      .not.toMatch(/from\('inbox_threads'\)\s*\n?\s*\.select/);
  });

  it('records a failure where the operator reads it, rather than stranding the claim', () => {
    expect(CRON).toMatch(/agent_draft_error: res\.error/);
    expect(CRON).toMatch(/\.eq\('agent_draft_for_message_id', row\.message_id\)/);
  });

  it('is cron-authorized and logged', () => {
    expect(CRON).toMatch(/isCronAuthorized\(req\)/);
    expect(CRON).toMatch(/withApiLogging\('inbox-draft-cron'/);
  });
});

describe('the third state is real', () => {
  it('set_agent accepts it', () => {
    expect(EDGE).toMatch(/\['off', 'suggesting', 'active'\]\.includes\(state\)/);
  });

  it('turning the assistant off discards the draft it had written', () => {
    const setAgent = slice(EDGE, "case 'set_agent': {", "case 'get_agent_settings'");
    expect(setAgent).toMatch(/agent_draft: null/);
  });

  it('the client type offers it', () => {
    expect(CLIENT).toMatch(/'off' \| 'suggesting' \| 'active'/);
  });

  it('the docs no longer describe a state that does not exist', () => {
    // docs/inbox-system.md named `suggesting` for months while no code accepted it.
    expect(DOC).toContain('suggesting');
    expect(DOC, 'the doc must say what suggesting actually does').toMatch(/agent_draft/);
  });
});
