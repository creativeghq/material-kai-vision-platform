/**
 * Per-channel send pacing.
 *
 * `messaging_channels.max_send_rate` is an admin-facing control ("Rate Limit (per min)" in
 * MessagingChannelsTab) that was **inert**: both send loops slept a hardcoded constant
 * instead — `setTimeout(res, 100)` in messaging-processor (600/min) and `setTimeout(res, 50)`
 * in messaging-api's send-bulk (1200/min). An admin who lowered the rate to 10/min after a
 * Meta throttling warning changed nothing at all. Its sibling on the same row,
 * `daily_quota`, IS enforced — which is what made the gap easy to miss.
 *
 * One derivation, used by both loops, so they cannot drift apart again.
 */

/** Fallback when a channel has no rate set. Matches the column default. */
const DEFAULT_RATE_PER_MIN = 100;

/**
 * Longest we will pause between two sends, regardless of the configured rate.
 *
 * Both callers run under an edge-function wall clock. Honouring a very low rate literally
 * (1/min → 60s between sends) would spend the entire invocation asleep and deliver almost
 * nothing, which is a worse failure than pacing slightly faster than asked: the batch would
 * time out mid-run and the remaining recipients would look "stuck" rather than "throttled".
 * The daily cap (`daily_quota`) is the hard limit; this is smoothing.
 */
const MAX_DELAY_MS = 5_000;

/**
 * Milliseconds to wait between two consecutive sends on this channel.
 *
 * @param maxSendRate `messaging_channels.max_send_rate` — messages per minute.
 */
export function sendDelayMs(maxSendRate: unknown): number {
  const rate = Number(maxSendRate);
  const perMin = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE_PER_MIN;
  return Math.min(MAX_DELAY_MS, Math.ceil(60_000 / perMin));
}
