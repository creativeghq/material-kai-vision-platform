/** The human-in-the-loop approval gate (security invariant 9), enforced rather than requested. */

/** Fields a model may never author, whatever tool it is calling. */
export const MODEL_FORBIDDEN_ARG_KEYS = ['confirm', 'auto_add'] as const;

export interface StrippedArgs {
  /** The arguments as they should actually be invoked. */
  args: Record<string, unknown>;
  /** Keys that were present and removed — non-empty means the model tried to self-approve. */
  removed: string[];
}

/**
 * Remove approval fields from model-authored tool arguments.
 *
 * Returns a NEW object; the caller's copy is left alone so the raw model output can still be
 * logged for detection. A non-empty `removed` is worth surfacing: the model asking to skip a
 * human gate is either a prompt-injection attempt or a prompt bug, and both want to be visible.
 */
export function stripModelAuthoredApproval(rawArgs: unknown): StrippedArgs {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return { args: {}, removed: [] };
  }
  const args: Record<string, unknown> = { ...(rawArgs as Record<string, unknown>) };
  const removed: string[] = [];
  for (const key of MODEL_FORBIDDEN_ARG_KEYS) {
    // `in`, not truthiness: `confirm:false` is the same assertion of authority as `confirm:true`
    // and carries no information the tool needs — absent already means "not approved". Leaving
    // an explicit false through would also let a future gate distinguish "model said no" from
    // "model said nothing", which is a distinction it must not be able to make.
    if (key in args) {
      removed.push(key);
      delete args[key];
    }
  }
  return { args, removed };
}
