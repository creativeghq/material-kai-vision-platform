/** The generation-model probe value-set, written ONCE (#391). */

/** `generation_models_last_probe_status_check`. */
export const PROBE_STATUSES = [
  'ok', 'credit_exhausted', 'not_found', 'schema_rejected', 'auth_failed', 'error', 'timeout',
  'not_configured',
] as const;
export type ProbeStatus = (typeof PROBE_STATUSES)[number];

/** The verdicts we trust enough to act on, DERIVED from the set above. */
export const AUTHORITATIVE_PROBE_STATUSES = [
  'ok', 'credit_exhausted', 'not_found', 'auth_failed',
] as const;

export function isProbeStatus(v: unknown): v is ProbeStatus {
  return typeof v === 'string' && (PROBE_STATUSES as readonly string[]).includes(v);
}
