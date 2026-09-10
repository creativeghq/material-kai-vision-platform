/** Relative-time formatting. */

export interface FormatDateOptions {
  /** Rendered when the value is null/undefined/unparseable. "—" by default. */
  fallback?: string;
  /** Append hour:minute. */
  withTime?: boolean;
  /** Prefix the weekday ("Tue, Aug 5, 2026"). */
  weekday?: boolean;
}

/** Absolute date for display. */
export function formatDate(
  value: string | Date | null | undefined,
  opts: FormatDateOptions = {},
): string {
  const fallback = opts.fallback ?? '—';
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  return d.toLocaleString('en-US', {
    ...(opts.weekday ? { weekday: 'short' as const } : {}),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(opts.withTime ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
  });
}

/**
 * Time of day only — for logs, attendance rows and session timestamps where the date is already
 * obvious from context.
 */
export function formatTime(
  value: string | Date | null | undefined,
  opts: { fallback?: string; seconds?: boolean; hour12?: boolean } = {},
): string {
  const fallback = opts.fallback ?? '—';
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(opts.seconds ? { second: '2-digit' as const } : {}),
    hour12: opts.hour12 ?? false,
  });
}

export interface TimeAgoOptions {
  /** Rendered when the timestamp is null/undefined/unparseable. */
  never?: string;
}

/**
 * "just now" under a minute, then minutes, hours, days. Past timestamps only — a future one
 * yields "just now" rather than a negative, which is what all five call sites already did.
 */
export function timeAgo(iso: string | null | undefined, opts: TimeAgoOptions = {}): string {
  const fallback = opts.never ?? 'never';
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return fallback;

  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Today's date in the VIEWER'S calendar, as `YYYY-MM-DD`. */
export function todayLocalISO(): string {
  return toLocalISODate(new Date());
}

/**
 * A `Date` (or epoch ms) rendered as its LOCAL calendar date, `YYYY-MM-DD`.
 *
 * Use this instead of `.toISOString().slice(0, 10)` on anything a user picked or the app
 * constructed locally — `new Date(2026, 7, 1)` is midnight local, which is 31 July in UTC.
 *
 * Only accepts a `Date`/number on purpose. Passing a `'YYYY-MM-DD'` string through `new Date()`
 * parses it as UTC midnight, so re-rendering it locally can shift it a day west — a date-only
 * string is already in this format and needs no conversion.
 */
export function toLocalISODate(value: Date | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * `days` calendar days from today (negative = in the past), as a local `YYYY-MM-DD`.
 *
 * Calendar arithmetic via `setDate`, not `Date.now() ± n * 86400000`: on a DST boundary a day is
 * 23 or 25 hours, so the millisecond form lands at 23:00 the previous day and slices off the
 * wrong date. Every "last 30 days" range in the app was written the millisecond way.
 */
export function localISODateOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}
