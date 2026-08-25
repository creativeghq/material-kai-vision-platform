/**
 * How a conversation's mood LOOKS — one definition, used everywhere it is shown.
 *
 * Three surfaces read this: the ring around the contact's avatar, the mood panel in the drawer,
 * and the urgency flag on the thread row. Written out three times they drift, and a customer
 * shown as "frustrated" in the panel with a calm green ring beside it is worse than no signal at
 * all — the reader believes the one that agrees with what they already assumed.
 *
 * The mood itself comes from `inbox-api analyze_sentiment`, which is also what the assistant is
 * told before it drafts a reply. One verdict, so the screen and the reply cannot disagree.
 */
import type { ConversationMood, ConversationUrgency } from '@/services/inboxApi';

export interface MoodStyle {
  /** What the operator reads. */
  label: string;
  /** A single glyph for the avatar corner — legible at 14px, where words are not. */
  face: string;
  /**
   * Ring around the avatar. A raw palette shade is a light/dark PAIR (design-system rule): these
   * are -600 on light and -400 on dark, written out in full because Tailwind's scanner reads
   * source text and a class assembled from a template literal lands in no stylesheet at all.
   */
  ring: string;
  /** Tinted chip, matching the platform's status-tag treatment — never a saturated fill. */
  chip: string;
  /** True for the moods that mean somebody should look at this today. */
  needsAttention: boolean;
}

const STYLES: Record<ConversationMood, MoodStyle> = {
  happy: {
    label: 'Happy', face: '😄',
    ring: 'ring-emerald-600 dark:ring-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    needsAttention: false,
  },
  satisfied: {
    label: 'Satisfied', face: '🙂',
    ring: 'ring-teal-600 dark:ring-teal-400',
    chip: 'bg-teal-500/15 text-teal-800 dark:text-teal-300',
    needsAttention: false,
  },
  neutral: {
    label: 'Neutral', face: '😐',
    ring: 'ring-slate-500 dark:ring-slate-400',
    chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    needsAttention: false,
  },
  confused: {
    label: 'Confused', face: '😕',
    ring: 'ring-sky-600 dark:ring-sky-400',
    chip: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
    needsAttention: true,
  },
  waiting: {
    label: 'Waiting on us', face: '⏳',
    ring: 'ring-amber-600 dark:ring-amber-400',
    chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    needsAttention: true,
  },
  frustrated: {
    label: 'Frustrated', face: '😠',
    ring: 'ring-orange-600 dark:ring-orange-400',
    chip: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
    needsAttention: true,
  },
  angry: {
    label: 'Angry', face: '😡',
    ring: 'ring-red-600 dark:ring-red-400',
    chip: 'bg-red-500/15 text-red-800 dark:text-red-300',
    needsAttention: true,
  },
};

/**
 * Unknown moods fall back to NEUTRAL, never to an attention state.
 *
 * The model is constrained to the enum, but a value added there before this map is updated would
 * otherwise light every conversation up as urgent — and a flag that fires on everything is one
 * people learn to ignore, which costs more than the flag was worth.
 */
export function moodStyle(mood: ConversationMood | string | null | undefined): MoodStyle {
  return STYLES[mood as ConversationMood] ?? STYLES.neutral;
}

const URGENCY_LABEL: Record<ConversationUrgency, string> = {
  none: 'No action needed',
  low: 'Low',
  medium: 'Worth a look',
  high: 'Needs a reply today',
  critical: 'Needs someone now',
};

export function urgencyLabel(u: ConversationUrgency | string | null | undefined): string {
  return URGENCY_LABEL[u as ConversationUrgency] ?? URGENCY_LABEL.none;
}

/** Only the top two urgencies earn a flag on the thread row. */
export function urgencyIsLoud(u: ConversationUrgency | string | null | undefined): boolean {
  return u === 'high' || u === 'critical';
}

export const MOODS = Object.keys(STYLES) as ConversationMood[];
