/**
 * #342 — the addressing round trip: how a user gets an address, and how a reply finds its thread.
 *
 * These four functions are the difference between "email works" and "email silently doesn't".
 * Every one of them was, at some point in this build, either absent or dead code:
 *   • `handleFromIdentity` had no transliteration, so a Greek name produced `user4821@…`
 *   • `buildOutboundMessageId` was defined and never called
 *   • `splitPlusTag` did not exist, so a reply to our own Reply-To resolved to no recipient at all
 *
 * Pure functions, so they are unit-testable outside Deno — which is the whole reason the addressing
 * logic lives in helpers rather than inline in the webhook.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  bareAddress,
  normalizeSubject,
  parseMessageIdRefs,
  buildOutboundMessageId,
  threadIdFromOurMessageId,
  splitPlusTag,
  threadIdFromTag,
  buildReplyToAddress,
  handleFromIdentity,
  validateChosenLocalPart,
} from '../../supabase/functions/_shared/inbound-email-addressing.ts';

const src = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/inbound-email-addressing.ts'), 'utf8',
);

const THREAD = '3f2a91cc-7b41-4d2e-9a55-0c1e8b7d4f60';

describe('#342 envelope parsing', () => {
  it('pulls the bare address out of every shape a client sends', () => {
    expect(bareAddress('Basilis <b@mail.x>')).toBe('b@mail.x');
    expect(bareAddress('<b@mail.x>')).toBe('b@mail.x');
    expect(bareAddress('  B@Mail.X  ')).toBe('b@mail.x');
    expect(bareAddress('not an address')).toBeNull();
    expect(bareAddress(null)).toBeNull();
  });

  it('strips reply prefixes in Greek as well as English', () => {
    // A Greek client answers with ΑΠ: / ΣΧΕΤ:. Missing these makes the heuristic treat every
    // Greek reply as a brand-new conversation — for most of this platform's users.
    expect(normalizeSubject('ΑΠ: Παραγγελία')).toBe('παραγγελία');
    expect(normalizeSubject('ΣΧΕΤ: Order 12')).toBe('order 12');
    expect(normalizeSubject('Re: Fwd: Re: Order 12')).toBe('order 12');
    expect(normalizeSubject('RE[2]: Order 12')).toBe('order 12');
  });

  it('reads every Message-ID out of a References chain', () => {
    const refs = parseMessageIdRefs('<a@x>', '<b@y> <c@z> <b@y>');
    expect(refs).toEqual(['a@x', 'b@y', 'c@z']);  // deduped, order preserved
  });
});

describe('#342 thread token round trip', () => {
  it('a Message-ID we minted resolves back to its thread', () => {
    const mid = buildOutboundMessageId(THREAD, 'msg-1', 'mail.materialshub.gr');
    expect(threadIdFromOurMessageId(mid)).toBe(THREAD);
  });

  it("a stranger's Message-ID resolves to nothing", () => {
    expect(threadIdFromOurMessageId('CAF=abc123@mail.gmail.com')).toBeNull();
    // Shaped like ours but not a UUID — must not be accepted as a thread id.
    expect(threadIdFromOurMessageId('inbox.not-a-uuid.msg@mail.x')).toBeNull();
  });

  it('the Reply-To we send round-trips to the same thread', () => {
    // This is the deterministic path: the recipient address is the one field no intermediary
    // rewrites, unlike a custom Message-ID header which an ESP may replace.
    const replyTo = buildReplyToAddress('basilis@mail.materialshub.gr', THREAD);
    expect(replyTo).toBe(`basilis+t.${THREAD}@mail.materialshub.gr`);

    const { base, tag } = splitPlusTag(`Customer <${replyTo}>`);
    expect(base).toBe('basilis@mail.materialshub.gr');
    expect(threadIdFromTag(tag)).toBe(THREAD);
  });

  it('an untagged address still resolves to the mailbox', () => {
    // Mail sent to the printed address, not a reply. Must not be mistaken for a malformed tag.
    const { base, tag } = splitPlusTag('basilis@mail.materialshub.gr');
    expect(base).toBe('basilis@mail.materialshub.gr');
    expect(tag).toBeNull();
    expect(threadIdFromTag(tag)).toBeNull();
  });

  it('a junk or forged tag falls through to the next ladder step rather than matching', () => {
    expect(threadIdFromTag('t.not-a-uuid')).toBeNull();
    expect(threadIdFromTag('spam')).toBeNull();
    expect(threadIdFromTag(`t.${THREAD}.extra`)).toBeNull();
    // The base still resolves, so the message is delivered — just not into a guessed thread.
    expect(splitPlusTag('basilis+spam@mail.x').base).toBe('basilis@mail.x');
  });
});

describe('#342 handle allocation reaches the users this platform actually has', () => {
  /** The column CHECK: `^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$`. A handle that fails it means
   *  the INSERT is rejected and the user ends up with no address at all. */
  const CHECK = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

  it('transliterates a Greek name instead of discarding it', () => {
    // Without the transliterator this stripped to nothing and produced `user4821@…` — an address
    // you cannot print on a business card, handed to most of this platform's users.
    const handle = handleFromIdentity('Γιάννης Παπαδόπουλος', null);
    expect(handle).toMatch(CHECK);
    expect(handle).not.toMatch(/^user\d+$/);
    expect(handle.startsWith('gi')).toBe(true);
  });

  it('transliterates a Cyrillic name', () => {
    const handle = handleFromIdentity('Трендафил Ташков', null);
    expect(handle).toMatch(CHECK);
    expect(handle).not.toMatch(/^user\d+$/);
  });

  it('handles Latin names, accents and email fallback', () => {
    expect(handleFromIdentity('Basilis Kanonidis', null)).toBe('basilis.kanonidis');
    expect(handleFromIdentity('Renée Dupont-Léger', null)).toMatch(CHECK);
    expect(handleFromIdentity('Renée Dupont-Léger', null)).toBe('renee.dupont.leger');
    expect(handleFromIdentity(null, 'sales.team@acme.co')).toBe('sales.team');
  });

  it('never mints a local part the column CHECK would reject', () => {
    for (const input of ['', '   ', '...', '!!!', '你好', '-leading', 'trailing-', '.']) {
      const handle = handleFromIdentity(input, null);
      expect(handle, `input ${JSON.stringify(input)} produced ${handle}`).toMatch(CHECK);
    }
    // A very long name must be truncated without leaving a trailing separator.
    const long = handleFromIdentity('A'.repeat(30) + ' ' + 'B'.repeat(30), null);
    expect(long).toMatch(CHECK);
    expect(long.length).toBeLessThanOrEqual(40);
  });

  it('mints no suffix of any kind — a collision allocates nothing and asks', () => {
    // An address is printed on a business card. Obscurity is not what protects it (setReject on
    // unknown recipients, the DKIM gate and per-sender limits are), and `basilis.kanonidis2@` is
    // an address its owner has to spell out every time, assigned to whoever signed up second.
    const alloc = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/inbound-email.ts'), 'utf8',
    );
    expect(alloc, 'a numeric collision suffix came back').not.toMatch(/\$\{base\}\$\{n\}/);
    expect(alloc, 'allocation is looping over candidate handles again')
      .not.toMatch(/for \(let n = 1; n <= \d+; n\+\+\)/);
    expect(alloc, 'a taken handle must be reported, not worked around').toMatch(/reason: 'taken'/);
    expect(src).not.toMatch(/randomUUID|Math\.random\(\)\.toString\(36\)/);
  });
});

describe('#342 a chosen local part is validated before it reaches the column', () => {
  it('accepts the shapes a person would actually type', () => {
    for (const input of ['basilis.kanonidis', 'b.kanonidis2', 'basilis-k', 'basilis_k', 'bk']) {
      const r = validateChosenLocalPart(input);
      expect(r.ok, `${input} was refused`).toBe(true);
    }
    // Trimmed and folded, so the address the user sees is the address that was stored.
    expect(validateChosenLocalPart('  Basilis.Kanonidis  ')).toEqual({
      ok: true, localPart: 'basilis.kanonidis',
    });
  });

  it('refuses a plus, and says so, because plus is the thread delimiter', () => {
    // buildReplyToAddress mints `basilis+t.<uuid>@…`. A local part containing a plus would make
    // splitPlusTag truncate every reply to that mailbox onto a base address that is not theirs.
    const r = validateChosenLocalPart('basilis+sales');
    expect(r).toEqual({ ok: false, reason: 'plus' });
    expect(splitPlusTag('basilis+sales@mail.x').base).toBe('basilis@mail.x');
  });

  it('refuses role addresses on the shared domain', () => {
    // `find` is here for a different reason than the rest: it is the platform's own FROM
    // address, so claiming it would divert every reply to our mail into a tenant's Inbox.
    for (const reserved of ['postmaster', 'abuse', 'no-reply', 'support', 'sales', 'admin', 'find']) {
      expect(validateChosenLocalPart(reserved), `${reserved} was claimable`)
        .toEqual({ ok: false, reason: 'reserved' });
    }
  });

  it('refuses anything the column CHECK would reject', () => {
    for (const bad of ['', '   ', '.leading', 'trailing.', 'has space', 'διεύθυνση', 'a'.repeat(65)]) {
      const r = validateChosenLocalPart(bad);
      expect(r.ok, `${JSON.stringify(bad)} was accepted`).toBe(false);
    }
  });

  it('every accepted local part satisfies the real column CHECK', () => {
    // Same pattern as user_email_addresses_local_part_shape. Duplicated here deliberately: the
    // point of the test is that the validator and the constraint agree, so it must not read the
    // validator's own copy of the regex.
    const columnCheck = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
    for (const input of ['basilis.kanonidis', 'b-k_2', 'x9']) {
      const r = validateChosenLocalPart(input);
      expect(r.ok, `${input} was refused`).toBe(true);
      if (r.ok) expect(r.localPart).toMatch(columnCheck);
    }
  });
});
