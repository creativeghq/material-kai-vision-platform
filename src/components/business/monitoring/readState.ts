/**
 * "We could not read this" is not "there is nothing" (#360 CB-21).
 *
 * On a monitoring surface, zero is a meaningful answer: no new mentions, no price changes. That is
 * precisely why a FAILED read must not look like one. `.catch(() => null)` on a panel's data
 * source turns an outage into a calm empty state, on the screens whose entire purpose is noticing
 * that something changed — CLAUDE.md's dominant historical bug, pointed at the feature that exists
 * to detect it.
 *
 * The same shape the SEO surfaces already fixed with `seo_metric`'s `collector_failed` status;
 * this is the minimum version of it for the reads that have no SQL derivation behind them.
 *
 * Import-free so a test can load it directly.
 */

export type ReadResult<T> =
  | { ok: true; value: T }
  /** The read ran and failed. NOT an empty result. */
  | { ok: false; reason: string };

/** Run a read, keeping the failure instead of collapsing it to null. */
export async function readOrReason<T>(
  label: string,
  run: () => Promise<T>,
): Promise<ReadResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Logged as well as returned: the reason shown to a user is deliberately short, and whoever
    // is debugging wants the whole thing.
    console.error(`[monitoring] ${label} read failed:`, e);
    return { ok: false, reason: message || 'the read failed' };
  }
}

/** The value when the read worked, `null` when it did not — for callers that only need the happy path. */
export function valueOf<T>(r: ReadResult<T> | null | undefined): T | null {
  return r && r.ok ? r.value : null;
}

/** True when this panel should say "we could not read this" rather than render an empty state. */
export function failed(r: ReadResult<unknown> | null | undefined): boolean {
  return !!r && !r.ok;
}

/**
 * The failure message, or undefined when there is no failure.
 *
 * A helper rather than an inline ternary at each call site: `r && !r.ok ? r.reason : undefined`
 * does not narrow the union through the `&&` chain, so every call site wrote it and every one
 * failed to compile. Written as an if-statement here for the same reason.
 */
export function reasonOf(r: ReadResult<unknown> | null | undefined): string | undefined {
  // `in` rather than `!r.ok`: with `ReadResult<unknown>` the `value: unknown` member makes the
  // discriminant narrowing unreliable, and a helper that does not compile is not a helper.
  if (!r || !('reason' in r)) return undefined;
  return r.reason;
}
