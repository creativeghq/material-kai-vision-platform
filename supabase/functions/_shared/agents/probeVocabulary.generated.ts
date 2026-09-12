// GENERATED MIRROR of src/services/generation/probeVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** The generation-model probe value-set, written ONCE (#391). */

/**
 * `generation_models_last_probe_status_check`.
 *
 * `not_configured` (no credential deployed) and `no_probe_implemented` (credential present, but
 * nobody has written this provider's submit shape) are different facts with different remedies.
 * Before the second existed, such a provider was stamped with nothing at all and sat at
 * `last_probe_at IS NULL` forever, which reads as "never probed" and sent the reader to enable an
 * agent that was already running hourly.
 */
export const PROBE_STATUSES = [
  'ok', 'credit_exhausted', 'not_found', 'schema_rejected', 'auth_failed', 'error', 'timeout',
  'not_configured', 'no_probe_implemented',
] as const;
export type ProbeStatus = (typeof PROBE_STATUSES)[number];

/** The verdicts we trust enough to act on, DERIVED from the set above. */
export const AUTHORITATIVE_PROBE_STATUSES = [
  'ok', 'credit_exhausted', 'not_found', 'auth_failed',
] as const;

export function isProbeStatus(v: unknown): v is ProbeStatus {
  return typeof v === 'string' && (PROBE_STATUSES as readonly string[]).includes(v);
}
