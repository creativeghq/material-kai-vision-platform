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

/**
 * How a source is PAINTED, in the two forms the Inbox needs it — and each class is a
 * light/dark PAIR, which is the whole point of this type existing.
 *
 * The source tags were written once, against the dark theme, in raw palette shades
 * (`bg-amber-500/15 text-amber-300`). The platform has FOUR themes — dark/light x
 * green/blue — and a `-300` shade is a pale, high-lightness colour: it reads on
 * plum-black and it is invisible on cream. So in both light themes the "Email" tag was
 * pale yellow on near-white, at roughly 1.6:1. Nothing raised: a wrong colour is a valid
 * class. `src/utils/statusTone.ts` had already solved this shape for status words
 * (`text-emerald-600 dark:text-emerald-400`); this is the same pairing for sources.
 */
export interface SourceTone {
  /**
   * Squared tinted tag — for where the source stands ALONE and has to name itself: the
   * conversation header, the details rail. Tinted, never a saturated fill (design system).
   */
  tag: string;
  /**
   * Plain coloured word — for a dense list row. House style (statusTone) is no pill
   * backgrounds inside a row: at twenty rows a tag per row reads as twenty buttons, and
   * the tint that makes a pill quiet is exactly what makes its text hard to read.
   */
  text: string;
  /** Solid dot. No text sits on it, so it needs no light/dark pairing to stay legible. */
  dot: string;
}

export interface InboxSource {
  key: InboxSourceKey;
  /** What the chip says. Social sources fold the network in ("Instagram DM"). */
  label: string;
  Icon: LucideIcon;
  tone: SourceTone;
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

/**
 * One tint per source, written OUT — Tailwind's scanner reads source text, not runtime values,
 * so a class assembled from a template literal (`text-${c}-${shade}`) ends up in no stylesheet
 * at all. That is the same failure as an off-scale opacity step: the class looks right in the
 * source and no rule is ever emitted. Verbose here is the point.
 *
 * `-700` on a 10% wash carries ~6:1 on cream; `-300` on a 15% wash carries the dark themes.
 * A new source needs BOTH halves, or it is unreadable in two of the four themes, silently.
 */
const SOURCE_META: Record<InboxSourceKey, { label: string; Icon: LucideIcon; tone: SourceTone }> = {
  public_profile: {
    label: 'Public profile', Icon: UserRound,
    tone: {
      tag: 'bg-teal-500/10 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/25 dark:border-teal-500/30',
      text: 'text-teal-700 dark:text-teal-300',
      dot: 'bg-teal-500 dark:bg-teal-400',
    },
  },
  whatsapp: {
    label: 'WhatsApp', Icon: MessageCircle,
    tone: {
      tag: 'bg-green-500/10 dark:bg-green-500/15 text-green-800 dark:text-green-300 border-green-500/25 dark:border-green-500/30',
      text: 'text-green-800 dark:text-green-300',
      dot: 'bg-green-500 dark:bg-green-400',
    },
  },
  email: {
    label: 'Email', Icon: Mail,
    tone: {
      tag: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/25 dark:border-amber-500/30',
      text: 'text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500 dark:bg-amber-400',
    },
  },
  social_dm: {
    label: 'Social DM', Icon: Share2,
    tone: {
      tag: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25 dark:border-fuchsia-500/30',
      text: 'text-fuchsia-700 dark:text-fuchsia-300',
      dot: 'bg-fuchsia-500 dark:bg-fuchsia-400',
    },
  },
  social_comments: {
    label: 'Social comments', Icon: MessagesSquare,
    tone: {
      tag: 'bg-pink-500/10 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/25 dark:border-pink-500/30',
      text: 'text-pink-700 dark:text-pink-300',
      dot: 'bg-pink-500 dark:bg-pink-400',
    },
  },
  team: {
    label: 'Team', Icon: Users,
    tone: {
      tag: 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25 dark:border-sky-500/30',
      text: 'text-sky-700 dark:text-sky-300',
      dot: 'bg-sky-500 dark:bg-sky-400',
    },
  },
  customer: {
    label: 'Customer', Icon: MessageSquare,
    tone: {
      tag: 'bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25 dark:border-violet-500/30',
      text: 'text-violet-700 dark:text-violet-300',
      dot: 'bg-violet-500 dark:bg-violet-400',
    },
  },
  dealer: {
    label: 'Dealer', Icon: MessageSquare,
    tone: {
      tag: 'bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25 dark:border-violet-500/30',
      text: 'text-violet-700 dark:text-violet-300',
      dot: 'bg-violet-500 dark:bg-violet-400',
    },
  },
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

/**
 * Presentation for a bare source KEY — the sidebar lists sources it has counted, so it holds a
 * key with no thread in hand. Social folds in the network name per thread and cannot here, so
 * this returns the generic label; that is correct for a nav row that has to cover every
 * Instagram and Facebook DM at once.
 */
export function inboxSourceMeta(key: InboxSourceKey): { label: string; Icon: LucideIcon; tone: SourceTone } {
  return SOURCE_META[key];
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

/**
 * The sales order a PRICED hire opened from the public form (inbox-api `profile_contact`
 * stamps `metadata.hire_order`). Carries the pay token so the rail can hand the customer the
 * same link again; the amount is the pre-invoice's total, VAT included.
 */
export interface InboxHireOrder {
  order_id: string;
  invoice_id: string;
  internal_number: string;
  total: number;
  currency: string;
  pay_token: string;
  document_type: string | null;
}

export function inboxHireOrder(t: Pick<InboxThread, 'metadata'>): InboxHireOrder | null {
  const raw = (t.metadata as Record<string, unknown> | null)?.hire_order as Record<string, unknown> | undefined;
  if (!raw || typeof raw.order_id !== 'string' || typeof raw.pay_token !== 'string') return null;
  return {
    order_id: raw.order_id,
    invoice_id: typeof raw.invoice_id === 'string' ? raw.invoice_id : '',
    internal_number: typeof raw.internal_number === 'string' ? raw.internal_number : '',
    total: Number(raw.total ?? 0),
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : 'EUR',
    pay_token: raw.pay_token,
    document_type: typeof raw.document_type === 'string' ? raw.document_type : null,
  };
}
