/**
 * "Who owes a reply" is ONE derivation, and the mailbox must be able to show it.
 *
 * Before this, `inbox_threads.status` held the single value 'open' on every WhatsApp thread and
 * nothing ever moved it, so a conversation waiting on us was pixel-identical to a finished one.
 * 46 threads had a customer speaking last; 33 of them had been waiting over a week, and one
 * customer had sent 38 messages with no answer. `unread` could not catch it — that answers
 * "has anyone LOOKED at this", which a thread can satisfy while still owing a reply.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const API = read('supabase/functions/inbox-api/index.ts');
const FILTERS = read('src/pages/Inbox/inboxFilters.ts');
const PAGE = read('src/pages/Inbox/InboxPage.tsx');
const TYPES = read('src/services/inboxApi.ts');

describe('the inbox reply state is derived in SQL, once', () => {
  it('list_threads asks the RPC for it', () => {
    expect(API).toContain('inbox_thread_reply_state');
    expect(API, 'list_threads must return the derived verdict on each thread')
      .toMatch(/waiting_on:\s*rs\?\./);
  });

  it('nobody recomputes it on the client', () => {
    // The whole point of a single derivation: a second implementation drifts, and this one is a
    // join over participants that is easy to get subtly wrong (an `agent` reply IS a reply, and
    // the wait starts at the FIRST unanswered message). Both surfaces must READ the verdict.
    //
    // Deliberately not a ban on `sender_participant_id`: InboxPage uses it to render messages and
    // draw avatars, which is unrelated. What must not appear is a local reply-state computation.
    for (const [name, src] of [['InboxPage', PAGE], ['inboxFilters', FILTERS]] as const) {
      expect(src, `${name} defines its own reply-state computation instead of reading the verdict`)
        .not.toMatch(/(const|function|let)\s+(needsReply|isWaiting|computeWaiting|waitingOn)\b/i);
    }
    // The filter file is declarative — it has no business touching participants at all.
    expect(FILTERS).not.toMatch(/participant/i);
  });

  it('the age shown is measured from the FIRST unanswered message', () => {
    // `waiting_since`, not `last_message_at`. A customer who sent three messages over three days
    // has been waiting three days — rendering the newest one would report hours.
    expect(PAGE).toMatch(/timeAgo\(t\.waiting_since/);
  });
});

describe('an unknown verdict is not an answer', () => {
  it('the type admits null and says what it means', () => {
    expect(TYPES).toMatch(/waiting_on\?:\s*'us'\s*\|\s*'them'\s*\|\s*'nobody'\s*\|\s*null/);
    expect(TYPES).toMatch(/needs_reply\?:\s*boolean\s*\|\s*null/);
  });

  it('the row renders the badge only on a positive verdict', () => {
    // `=== 'us'` and never `!== 'them'` — the second renders a thread whose derivation failed
    // (null) as needing a reply, and more importantly its inverse would render an unknown as
    // answered. Both directions must key off the verdict we actually got.
    expect(PAGE).toMatch(/t\.waiting_on\s*===\s*'us'/);
    expect(PAGE).not.toMatch(/t\.waiting_on\s*!==\s*'them'/);
  });

  it('the filter is a separate question from Unread', () => {
    expect(FILTERS).toMatch(/key:\s*'needs_reply'/);
    expect(FILTERS).toMatch(/key:\s*'unread'/);
    // Distinct accessors — if `needs_reply` ever reads `t.unread` the two collapse into one
    // filter and the thing this exists to surface becomes invisible again.
    expect(FILTERS).toMatch(/accessor:\s*\(t: InboxThread\)\s*=>\s*t\.waiting_on\s*===\s*'us'/);
  });
});
