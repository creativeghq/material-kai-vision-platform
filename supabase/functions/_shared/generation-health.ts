/**
 * "Is the model we are about to call actually able to run?" — asked BEFORE the credit debit.
 *
 * `generation_models` is the platform's declared source for which generation models exist and
 * are usable, and the health check writes `status` back to it. MIVAA's interior roster consults
 * it, so a down model is never queued into the grid. The edge functions did not, so the two
 * Replicate models that are reached ONLY from the edge — `flux-depth-pro` (redesign / copy-style)
 * and `runway-gen4-turbo` (video) — went debit → call → fail → refund on every attempt.
 *
 * Measured 2026-08-22: a `mode:'redesign'` call debited 20 credits, got
 * `500 REPLICATE_API_TOKEN not set`, and refunded 20. The ledger nets to zero, so nothing looks
 * wrong in billing — the user just waits, sees a generic failure, and the reason (no Replicate
 * credential in the EDGE environment, distinct from the MIVAA droplet where the token is set and
 * valid) appears nowhere they can see it.
 *
 * FAILS OPEN. An unreadable registry must not stop generation: the check exists to turn a
 * known-down model into a clear message, not to become a new single point of failure. Unknown
 * model id is also open — the registry is a health signal, not a whitelist.
 */

export interface GenerationHealth {
  /** False only when the registry positively says this model cannot run. */
  runnable: boolean;
  /** Operator-facing reason, straight from `last_probe_error`. Empty when runnable. */
  reason: string;
}

const RUNNABLE: GenerationHealth = { runnable: true, reason: '' };

/**
 * @param supabase  service-role client
 * @param modelId   the `generation_models.id` about to be called — NOT the roster/label name.
 *                  Callers map their own label first (see PRICING_KEY_BY_LABEL for the one case
 *                  where a label and a registry id differ).
 */
export async function checkGenerationModelHealth(
  supabase: { from: (t: string) => any },
  modelId: string,
): Promise<GenerationHealth> {
  if (!modelId) return RUNNABLE;
  try {
    const { data, error } = await supabase
      .from('generation_models')
      .select('id, enabled, status, last_probe_status, last_probe_error')
      .eq('id', modelId)
      .maybeSingle();

    // No row, or the read failed: stay out of the way. See FAILS OPEN above.
    if (error || !data) return RUNNABLE;
    if (data.enabled && data.status === 'active') return RUNNABLE;

    return {
      runnable: false,
      reason:
        data.last_probe_error ||
        `${modelId} is marked ${data.status}${data.enabled ? '' : ' and disabled'} in the model registry.`,
    };
  } catch {
    return RUNNABLE;
  }
}

/**
 * The message a user sees. Names the model, gives the operator reason, and says plainly that
 * nothing was charged — because the failure this replaces DID charge and refund, and "your
 * credits are fine" is the first thing anyone wants to know.
 */
export function unavailableMessage(modelLabel: string, reason: string): string {
  return `${modelLabel} is currently unavailable, so nothing was generated and no credits were charged. ${reason}`;
}
