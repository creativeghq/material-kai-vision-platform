/**
 * The Inbox's SOURCE tag — "where did this conversation come from".
 *
 * This exists because the platform used to answer that question by keeping messages in different
 * TABLES. A "Hire me" enquiry off a public profile page lived in `profile_contact_requests` with
 * its own screen at `/profile?tab=inbox`; everything else lived in `inbox_threads` at `/inbox`.
 * The split bought nothing and cost the enquiry every feature the real Inbox has — a reply that
 * reaches the sender, assignment, labels, archive, search. So the two merged, and the distinction
 * they encoded became a derived tag on one row.
 *
 * What can go wrong now is quieter and worth pinning:
 *
 *   • A source that never resolves. `metadata.source` is honoured only for keys the derivation
 *     knows, so a producer writing `source: 'contact_form'` with no matching entry silently gets
 *     the channel's generic answer — a thread tagged "Email" that nothing can tell apart from
 *     cold mail. Every filter option must be reachable from some thread shape.
 *   • The reverse: an option in the filter that no thread can ever carry, which returns an empty
 *     list and reads as "you have none".
 *   • A source filter that stops narrowing the server request, so picking "WhatsApp" pulls the
 *     whole mailbox and trims it client-side — correct-looking, and wrong past 200 threads.
 *   • `metadata.source` losing to the transport. A public-profile enquiry replies BY EMAIL, so
 *     `channel === 'email'`; if channel won, the tag would be right back to saying nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  SOURCE_FILTER_ORDER,
  channelForSource,
  inboxRequestedServices,
  inboxSourceKey,
  inboxSourceOptions,
  inboxThreadSource,
  type InboxSourceKey,
} from '@/pages/Inbox/inboxSource';
import type { InboxChannel, InboxThread, InboxThreadType } from '@/services/inboxApi';

type ThreadShape = Pick<InboxThread, 'channel' | 'thread_type' | 'metadata'>;

const thread = (
  channel: InboxChannel,
  thread_type: InboxThreadType,
  metadata: Record<string, unknown> = {},
): ThreadShape => ({ channel, thread_type, metadata });

/** One example thread per source key — also the proof that every key is reachable. */
const EXAMPLES: Record<InboxSourceKey, ThreadShape> = {
  public_profile: thread('email', 'customer', { source: 'public_profile', email_from: 'a@b.gr' }),
  email: thread('email', 'customer', { email_from: 'a@b.gr' }),
  whatsapp: thread('whatsapp', 'customer', { zernio_conversation_id: 'c1' }),
  social_dm: thread('social', 'customer', { platform: 'instagram' }),
  social_comments: thread('social', 'customer', { platform: 'facebook', social_kind: 'comments' }),
  team: thread('internal', 'internal'),
  customer: thread('internal', 'customer'),
  dealer: thread('internal', 'upstream'),
};

describe('inbox source — every tag is reachable and every thread has one', () => {
  it('each source key is produced by some real thread shape', () => {
    for (const [key, t] of Object.entries(EXAMPLES) as Array<[InboxSourceKey, ThreadShape]>) {
      expect(inboxSourceKey(t), `no thread shape produces the '${key}' source`).toBe(key);
    }
  });

  it('every filter option is a key some thread can carry — no option that always returns nothing', () => {
    const reachable = new Set(Object.keys(EXAMPLES));
    const unreachable = inboxSourceOptions().map((o) => o.value).filter((v) => !reachable.has(v));
    expect(
      unreachable,
      'these Source options can never match a thread, so picking one shows an empty mailbox ' +
        'that reads as "you have none": ' + unreachable.join(', '),
    ).toEqual([]);
  });

  it('every key is offered in the filter — a source you cannot filter by is a tag you cannot use', () => {
    const offered = new Set(inboxSourceOptions().map((o) => o.value));
    const missing = Object.keys(EXAMPLES).filter((k) => !offered.has(k));
    expect(missing, `sources with no filter option: ${missing.join(', ')}`).toEqual([]);
    expect(new Set(SOURCE_FILTER_ORDER).size).toBe(SOURCE_FILTER_ORDER.length);
  });

  it('every combination of channel and thread type resolves to a source', () => {
    const channels: InboxChannel[] = ['internal', 'whatsapp', 'email', 'social'];
    const types: InboxThreadType[] = ['internal', 'customer', 'upstream'];
    for (const c of channels) {
      for (const ty of types) {
        const src = inboxThreadSource(thread(c, ty));
        expect(src.key, `${c}/${ty} has no source`).toBeTruthy();
        expect(src.label.length, `${c}/${ty} has an empty label`).toBeGreaterThan(0);
      }
    }
  });
});

describe('inbox source — an explicit source outranks the transport', () => {
  it('a public-profile enquiry is not filed as ordinary email, though it replies by email', () => {
    const enquiry = EXAMPLES.public_profile;
    expect(enquiry.channel, 'the enquiry must still reply over email').toBe('email');
    expect(inboxSourceKey(enquiry)).toBe('public_profile');
    expect(inboxThreadSource(enquiry).label).toBe('Public profile');
    // …and the thread NEXT to it, on the same channel, still reads as email.
    expect(inboxSourceKey(EXAMPLES.email)).toBe('email');
  });

  it('an unknown metadata.source falls back to the transport rather than inventing a tag', () => {
    const t = thread('email', 'customer', { source: 'not_a_registered_source' });
    expect(inboxSourceKey(t)).toBe('email');
  });

  it('a non-string metadata.source is ignored', () => {
    expect(inboxSourceKey(thread('whatsapp', 'customer', { source: 42 }))).toBe('whatsapp');
    expect(inboxSourceKey({ channel: 'email', thread_type: 'customer', metadata: null as never })).toBe('email');
  });
});

describe('inbox source — the label names the network for social', () => {
  it('separates a public comment from a private DM, and says which app', () => {
    expect(inboxThreadSource(EXAMPLES.social_dm).label).toBe('Instagram DM');
    expect(inboxThreadSource(EXAMPLES.social_comments).label).toBe('Facebook comments');
  });

  it('falls back to the generic label when the platform is unknown', () => {
    expect(inboxThreadSource(thread('social', 'customer')).label).toBe('Social DM');
  });
});

describe('inbox source — the filter still narrows the server request', () => {
  it('every source maps to the channel it arrives on', () => {
    const expected: Record<InboxSourceKey, InboxChannel> = {
      public_profile: 'email', email: 'email', whatsapp: 'whatsapp',
      social_dm: 'social', social_comments: 'social',
      team: 'internal', customer: 'internal', dealer: 'internal',
    };
    for (const [key, channel] of Object.entries(expected) as Array<[InboxSourceKey, InboxChannel]>) {
      expect(channelForSource(key), `'${key}' would fetch the whole mailbox`).toBe(channel);
      // The narrowing must be CORRECT, not merely present: the example thread has to survive it.
      expect(EXAMPLES[key].channel).toBe(channel);
    }
  });

  it('no filter at all fetches everything', () => {
    expect(channelForSource(null)).toBeNull();
    expect(channelForSource(undefined)).toBeNull();
    expect(channelForSource('')).toBeNull();
    expect(channelForSource('nonsense')).toBeNull();
  });
});

describe('inbox source — the services a visitor ticked', () => {
  it('reads them off the thread, and tolerates every shape the metadata can be in', () => {
    expect(inboxRequestedServices(thread('email', 'customer', { services_requested: ['Design', 'Survey'] })))
      .toEqual(['Design', 'Survey']);
    expect(inboxRequestedServices(thread('email', 'customer'))).toEqual([]);
    expect(inboxRequestedServices(thread('email', 'customer', { services_requested: 'Design' }))).toEqual([]);
    expect(inboxRequestedServices(thread('email', 'customer', { services_requested: ['', null, 'Design'] })))
      .toEqual(['Design']);
  });
});
