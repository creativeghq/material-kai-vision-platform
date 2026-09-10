/** Per-channel send pacing. */

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
