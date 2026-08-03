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
