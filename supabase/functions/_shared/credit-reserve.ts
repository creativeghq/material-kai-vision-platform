/**
 * Shared credit reserve → settle helper (invariant #10).
 *
 * Paid tools whose upstream cost is only known AFTER the call (token-metered LLMs,
 * variable scrapes) must gate the caller BEFORE spending money and settle the exact
 * amount after. The pattern (mirrors real-estate-api/ai.ts):
 *
 *   const res = await reserveCredits(supabase, userId, workspaceId, CEILING, 'op');
 *   if (!res.ok) return res.message;            // 0-credit user blocked, no upstream spend
 *   try { ...upstream... } catch { await refundCredits(supabase, userId, workspaceId, CEILING, 'op'); throw; }
 *   await settleCredits(supabase, userId, workspaceId, CEILING, actualCredits, 'op');
 *
 * `debit_credits` fails soft (returns success=false) and routes pool-vs-personal,
 * so reserve just inspects that flag. Refund/settle are best-effort (never throw).
 */

// deno-lint-ignore no-explicit-any
type Sb = any;

import { captureMessage } from './sentry.ts';

export interface ReserveResult {
  ok: boolean;
  /** User-facing message when ok=false (safe to return straight from an agent tool). */
  message: string;
}

/** Reserve a credit ceiling up front. Returns ok=false (does NOT throw) when the pool/wallet can't cover it. */
export async function reserveCredits(
  supabase: Sb,
  userId: string | undefined,
  workspaceId: string | undefined,
  credits: number,
  opType: string,
): Promise<ReserveResult> {
  // No identified user → nothing to meter against; allow (matches prior behaviour for
  // anonymous/service contexts, which are gated elsewhere).
  if (!userId) return { ok: true, message: '' };
  try {
    const { data, error } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: credits,
      p_operation_type: `${opType}_reserve`,
      p_description: `Reserve — ${opType}`,
      p_metadata: { reserve: true },
      p_workspace_id: workspaceId ?? null,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || (row && row.success === false)) {
      return { ok: false, message: row?.error_message || error?.message || 'Not enough credits to run this. Please top up.' };
    }
    return { ok: true, message: '' };
  } catch (e) {
    // Fail-open on an infra error so a transient RPC blip doesn't block paid users
    // (mirrors meter_operation's fail-open in the Python path). The policy stands; the SILENCE
    // did not. A permanently broken debit RPC would run every reserve-gated paid tool free with
    // no symptom but a console line. Stable fingerprint, so a persistent break is one issue.
    console.warn(`[credit-reserve] reserve error for ${opType} (allowing):`, (e as Error)?.message);
    void captureMessage('credit reserve failed open — paid work ran unreserved', 'warning', {
      tags: { subsystem: 'credit-reserve', operation: opType },
      extra: { workspaceId: workspaceId ?? null, error: e instanceof Error ? e.message : String(e) },
      fingerprint: ['credit-reserve', 'fail-open'],
    });
    return { ok: true, message: '' };
  }
}

/** Refund the full reserved ceiling (call on upstream failure / no-output). Best-effort. */
export async function refundCredits(
  supabase: Sb,
  userId: string | undefined,
  workspaceId: string | undefined,
  credits: number,
  opType: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!userId || !(credits > 0)) return;
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: credits,
      p_operation_type: `${opType}_refund`,
      p_description: `Refund — ${opType}`,
      p_metadata: meta,
      p_workspace_id: workspaceId ?? null,
    });
  } catch (e) {
    console.warn(`[credit-reserve] refund failed for ${opType} (non-fatal):`, (e as Error)?.message);
  }
}

/**
 * Settle a reserved ceiling against the actual cost: refund the surplus, or debit the
 * overage if the real usage exceeded the reserve. Best-effort. Returns the net credits kept.
 */
export async function settleCredits(
  supabase: Sb,
  userId: string | undefined,
  workspaceId: string | undefined,
  reserved: number,
  actual: number,
  opType: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return;
  const delta = reserved - actual;
  if (delta > 0) {
    await refundCredits(supabase, userId, workspaceId, delta, opType, { settle: true, ...meta });
  } else if (delta < 0) {
    // Actual exceeded the reserve — charge the difference (best-effort; the work is done).
    try {
      await supabase.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: -delta,
        p_operation_type: `${opType}_overage`,
        p_description: `Overage — ${opType}`,
        p_metadata: { settle: true, ...meta },
        p_workspace_id: workspaceId ?? null,
      });
    } catch (e) {
      console.warn(`[credit-reserve] overage debit failed for ${opType} (non-fatal):`, (e as Error)?.message);
    }
  }
}
