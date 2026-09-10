/** "Is the model we are about to call actually able to run?" — asked BEFORE the credit debit. */

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
