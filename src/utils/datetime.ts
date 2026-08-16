/**
 * Relative-time formatting.
 *
 * `timeAgo` was declared in eleven files. Five of them produced byte-identical output
 * ("never" / "just now" / "12m ago" / "3h ago" / "5d ago") and differed only in local variable
 * names — those are consolidated here.
 *
 * The other six are NOT the same function and are deliberately left alone:
 *   • InboxPage                — compact, no "ago" ("now" / "5m" / "3h" / "2d")
 *   • WebsiteDomainIntelPanel  — day granularity only ("today" / "yesterday" / "5d ago")
 *   • SocialMediaAccountsPage  — hours upward, never minutes
 *   • SocialAccountsTab        — no "just now" floor
 *   • ProductMonitorTab        — also renders FUTURE times ("in 20m")
 *   • toolsShared              — its own absolute-date helper
 * Collapsing those into an options bag would mean four flags for four callers, which is a worse
 * abstraction than four functions. Duplication is only a defect when the copies are meant to agree.
 */

export interface FormatDateOptions {
  /** Rendered when the value is null/undefined/unparseable. "—" by default. */
  fallback?: string;
  /** Append hour:minute. */
  withTime?: boolean;
  /** Prefix the weekday ("Tue, Aug 5, 2026"). */
  weekday?: boolean;
}

/**
 * Absolute date for display.
 *
 * Locale is PINNED, for the same reason `formatMoney`'s is: eleven of these were written by hand
 * and three passed `undefined`, which means the browser's language decides. The same timestamp
 * rendered "Aug 5, 2026" for one user and "5 Αυγ 2026" for another, on the same screen, with no
 * way to tell from the code. English is the platform default for all UI and documents.
 *
 * `en-US` because that is what the majority of the explicit call sites already chose (4 of 5);
 * this keeps the visible change to the three that had specified nothing.
 *
 * Two callers deliberately keep their own and are NOT folded in here:
 *   • QuoteDocument     — `en-GB` dd/mm/yyyy on a printed customer document
 *   • AppointmentsPage  — parses a date-only string as `T00:00:00` to avoid a UTC day-shift
 */
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
 *
 * Added because 7 call sites were doing `new Date(x).toLocaleTimeString()`, which is the same
 * browser-locale problem `formatDate` exists to solve, and there was nowhere to send them: the
 * date formatter has no time-only mode. Same pinned locale, so a time and a date rendered next to
 * each other agree.
 *
 * 24-hour by default. These are operational readouts — a log line at "14:05" is unambiguous, and
 * "2:05 PM" is longer for no gain in a dense table.
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

/**
 * Today's date in the VIEWER'S calendar, as `YYYY-MM-DD`.
 *
 * The thing this replaces was `new Date().toISOString().slice(0, 10)`, written by hand at 25
 * sites because there was nowhere to send them — this module had only display formatters.
 * `toISOString()` renders in UTC, and this platform serves Greek customers (UTC+2 winter,
 * UTC+3 summer), so between local midnight and 02:00–03:00 every one of those returned
 * YESTERDAY. It produces a perfectly valid `YYYY-MM-DD`, raises nothing, and typechecks —
 * the same shape as a wrong money number, applied to dates.
 *
 * The sites it was wrong at were not cosmetic: the invoice `issueDate` is a fiscal document of
 * record submitted to AADE via myDATA (numbering is sequential by date and the period is
 * classified from it), `paidAt` feeds `get_order_settlements`, and attendance dates feed payroll.
 *
 * "Local" is the browser's zone, which is the operator's own calendar — the frame in which they
 * mean "today" when they click a button labelled today. This is deliberately NOT derived in SQL:
 * the database session runs in UTC, so `current_date` there is the same defect with a longer
 * stack trace. A workspace-pinned business timezone is the real answer for server-side date
 * stamping and is not built.
 */
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
