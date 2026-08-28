/**
 * The generation-model probe value-set, written ONCE (#391).
 *
 * `ProbeStatus` was the same seven-member union in `GenerationProviderHealth` and
 * `model-health-check-agent` — one on each side of the Vite/Deno boundary.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `generation_models_last_probe_status_check`. Pinned to the constraint text by
 * `tests/unit/probeVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/**
 * `generation_models_last_probe_status_check`.
 *
 * These are seven answers to "why did this model not work", and the distinctions are the
 * point — they route to different people. `credit_exhausted` (402) is an ACCOUNT problem:
 * add funds, the models are fine. `not_found` is the model id being wrong.
 * `schema_rejected` means the id is right and our request body is not. `auth_failed` is
 * the key. Collapsing any of them into `error` is how a whole provider reads as broken
 * when the only thing wrong is a balance — which is the live state of Replicate here.
 *
 * The column is NULLABLE (`last_probe_status IS NULL OR ...`): never probed is not a
 * status and is NOT a member.
 */
export const PROBE_STATUSES = [
  'ok', 'credit_exhausted', 'not_found', 'schema_rejected', 'auth_failed', 'error', 'timeout',
] as const;
export type ProbeStatus = (typeof PROBE_STATUSES)[number];

/**
 * The verdicts we trust enough to act on, DERIVED from the set above.
 *
 * `error` and `timeout` are "we could not tell" — a transient network failure looks
 * identical to a dead endpoint — so they must not flip a model's availability on their
 * own. `schema_rejected` is excluded for the opposite reason: it is a real answer about
 * OUR request, not about the model, so it should not mark the model unavailable either.
 */
export const AUTHORITATIVE_PROBE_STATUSES = [
  'ok', 'credit_exhausted', 'not_found', 'auth_failed',
] as const;

export function isProbeStatus(v: unknown): v is ProbeStatus {
  return typeof v === 'string' && (PROBE_STATUSES as readonly string[]).includes(v);
}
