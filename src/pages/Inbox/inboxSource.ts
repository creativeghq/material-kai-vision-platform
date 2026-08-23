/**
 * Where a conversation came from — the ONE derivation, used by the badge, the filter and the
 * thread header alike.
 *
 * `channel` is the TRANSPORT (how we talk back: whatsapp / email / social / in-app). It is not
 * the same question as "where did this land from", and answering the second with the first is
 * what made the platform carry two inboxes: a "Hire me" enquiry off a public profile page and a
 * cold email are both `channel='email'`, yet one is a stranger who found your profile and the
 * other is someone who already had your address. They were kept apart by living in two different
 * TABLES with two different screens, which is a distinction the reader has to learn rather than
 * see.
 *
 * So: SOURCE is derived from the transport wherever the transport genuinely answers it, and read
 * from `metadata.source` only where it does not. That is the rule for adding one — an explicit
 * `metadata.source` is new information (a form on a public page), never a restatement of the
 * channel the row already carries. A second copy of `channel` under another name would drift the
 * moment one of them is written and the other is not.
 *
 * Pinned by tests/unit/inboxSource.test.ts.
 */
import { Mail, MessageCircle, MessageSquare, MessagesSquare, Share2, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FilterOption } from '@/components/core/filters';
import type { InboxChannel, InboxThread } from '@/services/inboxApi';

export type InboxSourceKey =
  | 'public_profile'
  | 'whatsapp'
  | 'email'
  | 'social_dm'
  | 'social_comments'
  | 'team'
  | 'customer'
  | 'dealer';

export interface InboxSource {
  key: InboxSourceKey;
  /** What the chip says. Social sources fold the network in ("Instagram DM"). */
  label: string;
  Icon: LucideIcon;
  /** Tailwind chip classes — tinted tag, never a saturated fill (design system). */
  className: string;
}

/**
 * The channel a source arrives on, so a source filter can still be pushed into the
 * `list_threads` request instead of only narrowing the page the server already sent.
 * `null` = the source does not pin one channel.
 */
const SOURCE_CHANNEL: Record<InboxSourceKey, InboxChannel | null> = {
  public_profile: 'email',
  whatsapp: 'whatsapp',
  email: 'email',
  social_dm: 'social',
  social_comments: 'social',
  team: 'internal',
  customer: 'internal',
  dealer: 'internal',
};

/** Static chip presentation. Social labels are overridden per-thread with the network name. */
const SOURCE_META: Record<InboxSourceKey, { label: string; Icon: LucideIcon; className: string }> = {
  public_profile: { label: 'Public profile', Icon: UserRound, className: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle, className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  email: { label: 'Email', Icon: Mail, className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  social_dm: { label: 'Social DM', Icon: Share2, className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
  social_comments: { label: 'Social comments', Icon: MessagesSquare, className: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
  team: { label: 'Team', Icon: Users, className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  customer: { label: 'Customer', Icon: MessageSquare, className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  dealer: { label: 'Dealer', Icon: MessageSquare, className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
};

/**
 * Sources a producer states outright because no transport implies them. Keep this SMALL: an
 * entry here is a promise that some writer sets `metadata.source`, and a key nobody writes is a
 * filter option that always returns nothing.
 *
 *  • `public_profile` — the "Hire me" form on a public profile page (inbox-api `profile_contact`).
 */
const EXPLICIT_SOURCES = new Set<InboxSourceKey>(['public_profile']);

function explicitSource(metadata: unknown): InboxSourceKey | null {
  const raw = (metadata as Record<string, unknown> | null)?.source;
  return typeof raw === 'string' && EXPLICIT_SOURCES.has(raw as InboxSourceKey)
    ? (raw as InboxSourceKey)
    : null;
}

/** Which source key a thread carries — the answer everything else formats. */
export function inboxSourceKey(t: Pick<InboxThread, 'channel' | 'thread_type' | 'metadata'>): InboxSourceKey {
  const stated = explicitSource(t.metadata);
  if (stated) return stated;
  if (t.channel === 'whatsapp') return 'whatsapp';
  if (t.channel === 'email') return 'email';
  if (t.channel === 'social') {
    // A comment is PUBLIC and a DM is not, and the reply composer behaves differently for each.
    // Labelling both "Social" would leave an operator one keystroke from answering a private
    // question underneath a public post.
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    return meta.social_kind === 'comments' ? 'social_comments' : 'social_dm';
  }
  if (t.thread_type === 'upstream') return 'dealer';
  if (t.thread_type === 'customer') return 'customer';
  return 'team';
}

/** Source key + chip presentation for one thread. */
export function inboxThreadSource(t: Pick<InboxThread, 'channel' | 'thread_type' | 'metadata'>): InboxSource {
  const key = inboxSourceKey(t);
  const base = SOURCE_META[key];
  if (key !== 'social_dm' && key !== 'social_comments') return { key, ...base };

  // Fold the network into the label — "Instagram DM" tells an operator which app the person is
  // sitting in; "Social DM" makes them open the thread to find out.
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  const platform = typeof meta.platform === 'string' && meta.platform ? meta.platform : null;
  if (!platform) return { key, ...base };
  const pretty = platform.charAt(0).toUpperCase() + platform.slice(1);
  return { key, ...base, label: key === 'social_comments' ? `${pretty} comments` : `${pretty} DM` };
}

/** The `channel` request parameter a source filter implies, or null when it pins none. */
export function channelForSource(key: string | null | undefined): InboxChannel | null {
  if (!key) return null;
  return SOURCE_CHANNEL[key as InboxSourceKey] ?? null;
}

/** Filter options, in the order an operator scans them: outside world first, then inside. */
export const SOURCE_FILTER_ORDER: InboxSourceKey[] = [
  'public_profile', 'email', 'whatsapp', 'social_dm', 'social_comments', 'customer', 'dealer', 'team',
];

export function inboxSourceOptions(): FilterOption[] {
  return SOURCE_FILTER_ORDER.map((key) => ({ value: key, label: SOURCE_META[key].label }));
}

/** Services a visitor ticked on the public "Hire me" form, when the thread came from one. */
export function inboxRequestedServices(t: Pick<InboxThread, 'metadata'>): string[] {
  const raw = (t.metadata as Record<string, unknown> | null)?.services_requested;
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
}
