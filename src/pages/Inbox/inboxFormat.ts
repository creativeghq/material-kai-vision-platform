import { formatMoney } from '@/utils/decimal';
import { supabase } from '@/integrations/supabase/client';
import { castObjectFor, castObjectForSlot, normalizeCastSlot } from '@/utils/characterAvatar';
import { formatDate } from '@/utils/datetime';
import { LABEL_COLORS, type InboxThread } from '@/services/inboxApi';

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return formatDate(iso);
}

export function initials(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Stable subtle avatar tint derived from the name. Each entry is a light/dark PAIR — a `-300`
 * shade alone is pale by design and left initials invisible on the light themes' cream card.
 */
export function avatarTint(name: string | null | undefined): string {
  // All -800 on the light side, not -700: these initials are 10px sitting on a 15% wash,
  // which is a heavier tint than the tags use, and cyan-700 measured 4.44:1 there.
  const palette = [
    'bg-rose-500/15 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300',
    'bg-sky-500/15 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300',
    'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    'bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300',
    'bg-violet-500/15 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300',
    'bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300',
  ];
  const s = name || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function money(amount: number | null | undefined, currency: string | null | undefined): string {
  return formatMoney(amount, currency || 'EUR');
}

/** The solid dot for a label colour — the one lookup, so the fallback lives in one place. */
export function labelDot(color: string | null | undefined): string {
  return (LABEL_COLORS.find((c) => c.key === color) || LABEL_COLORS[0]).dot;
}

/** Bucket threads into Today / Yesterday / Earlier for the email-client day headers. */
export function dayBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - 86400000) return 'Yesterday';
  if (t >= startOfToday - 6 * 86400000) return 'This week';
  return 'Earlier';
}

/**
 * An attachment rendered as the thing it IS.
 *
 * Every attachment used to render as one paperclip link with a filename, so reviewing a
 * conversation meant opening each file in a new tab to find out what it was — and a customer's
 * photo of the damaged tile, which is the whole message, showed as "attachment".
 *
 * `content_type` is the primary signal and the extension is the fallback, because a channel
 * attachment often arrives with no MIME type at all.
 */
/**
 * Full view, in place.
 *
 * A photo or a spec sheet is often the whole message, and reviewing it used to mean opening a new
 * tab per file — which loses the conversation you are reading, and is why the operator ended up
 * looking at attachments on their phone instead. Download stays available, because sometimes you
 * genuinely do want the file.
 */
/** A thread's counterparty avatar, wherever one is drawn. */
/**
 * The public URL of the character assigned to `seed`.
 *
 * PUBLIC, not signed: `generation-images` is public-read and this face renders on every message
 * row in the thread. A signed URL would need re-minting constantly and would break mid-scroll the
 * moment one expired.
 */
export function castAvatarSrc(seed: string | null | undefined, slot?: number | null): string {
  // The SERVER'S answer wins whenever there is one. It knows the name behind the participant and
  // resolved the pool once for all five draw sites; hashing here would re-answer it per screen
  // off whichever of the four name strings this screen happens to hold. Hashing the seed is the
  // floor for an internal thread, a social commenter with no participant row, and a client
  // talking to an older deploy — all cases where nobody knows the name either.
  const resolved = normalizeCastSlot(slot);
  const { storage_bucket, storage_object_path } = resolved === null
    ? castObjectFor(seed)
    : castObjectForSlot(resolved);
  // RESIZED on the way out. The rendered cast is ~470KB per face at source, and this draws at
  // 40px on every row of the list and every message in the thread — a twenty-row inbox would
  // pull ~9MB of avatars. 128px covers the largest draw site at 2x; measured 2.8KB at 96px.
  return supabase.storage.from(storage_bucket).getPublicUrl(storage_object_path, {
    transform: { width: 128, height: 128, resize: 'cover', quality: 80 },
  }).data.publicUrl;
}

// ──────────────────────────────────────────────────────────────────────────
// Composer · slash commands and the catalog picker
// ──────────────────────────────────────────────────────────────────────────

/**
 * What the Ask-JARVIS button sends. JARVIS reads the thread itself through `manage_inbox`
 * action:"read", so this only has to name the conversation by id and say what a brief looks
 * like. The subject is deliberately NOT interpolated: on an email thread it is the customer's
 * own subject line, and this prompt is the operator's turn, where nothing is fenced.
 */
export function askJarvisAboutThreadPrompt(t: InboxThread): string {
  return `Read Inbox conversation ${t.id} with manage_inbox action:"read" and brief me: what it is about, `
    + 'who the customer is, the status of their orders, quotes and open invoices, and what you suggest I reply.';
}

/** A reader's machine reason, said the way the operator would say it. */
export function enrichmentReasonText(raw: string | undefined): string {
  if (!raw) return 'skipped';
  if (raw.startsWith('too_large')) return 'the file is too large to read';
  if (raw === 'no_billing_user') return 'no workspace owner to bill';
  if (raw === 'not_stored') return 'the file was never downloaded';
  if (raw === 'download_failed') return 'the file could not be fetched from storage';
  if (raw.startsWith('unsupported_image_type')) return 'this image type cannot be read';
  return raw.replace(/_/g, ' ');
}

/** `n` calendar days from now, same time of day, correct across a DST boundary. */
export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** A local datetime for `<input type="datetime-local">`, which refuses anything with a zone. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
