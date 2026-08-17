/**
 * Cron credit metering (client side of public.cron_charge_workspace).
 *
 * A workspace-scoped cron calls chargeCronWorkspace() per UNIT OF WORK (a monitoring refresh, one
 * statement, one campaign, one sync). It charges the workspace owner (pool → personal) the registry
 * cost (default 3 credits) and returns whether to PROCEED:
 *   - allowed=true  → do the work.
 *   - allowed=false → skip (owner out of credits). The per-(workspace,cron) state is set to
 *                     `paused_insufficient_credits`; the NEXT tick re-charges and auto-resumes the
 *                     moment the owner tops up — no separate signal needed.
 *
 * Fails OPEN on any RPC/infra error (never block scheduled work because metering itself failed).
 * Maintenance/cleanup crons don't call this at all — only registered, metered cron keys do.
 */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface CronChargeResult {
  allowed: boolean;
  charged: number;
  status: 'active' | 'paused_insufficient_credits' | string;
  justPaused: boolean;   // transitioned active → paused this call (surface/notify once)
  justResumed: boolean;  // transitioned paused → active this call (owner topped up)
}

export async function chargeCronWorkspace(
  supabase: SupabaseLike,
  workspaceId: string,
  cronKey: string,
  opts: { units?: number; description?: string } = {},
): Promise<CronChargeResult> {
  if (!workspaceId) {
    // No workspace to bill → treat as free pass (caller decides what to do with orphan work).
    return { allowed: true, charged: 0, status: 'active', justPaused: false, justResumed: false };
  }
  try {
    const { data, error } = await supabase.rpc('cron_charge_workspace', {
      p_workspace_id: workspaceId,
      p_cron_key: cronKey,
      p_units: opts.units ?? 1,
      p_description: opts.description ?? null,
    });
    if (error) {
      console.error(`[cron-billing] ${cronKey}/${workspaceId} charge RPC error (failing open):`, error.message);
      return { allowed: true, charged: 0, status: 'active', justPaused: false, justResumed: false };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed !== false,
      charged: Number(row?.charged ?? 0),
      status: row?.status ?? 'active',
      justPaused: !!row?.just_paused,
      justResumed: !!row?.just_resumed,
    };
  } catch (e) {
    console.error(`[cron-billing] ${cronKey}/${workspaceId} charge threw (failing open):`, e);
    return { allowed: true, charged: 0, status: 'active', justPaused: false, justResumed: false };
  }
}

/** Refund a workspace cron charge when the work turned out to be impossible.
 *
 *  Invariant #10 requires the debit BEFORE the upstream call, which means some charges land for
 *  work that then cannot run — a precondition checked downstream, a provider outage. Without a
 *  refund path those become a standing daily charge for nothing.
 *  Best-effort: a failed refund must never break the cron. */
export async function refundCronWorkspace(
  supabase: SupabaseLike,
  workspaceId: string,
  cronKey: string,
  amount: number,
  description?: string,
): Promise<boolean> {
  if (!workspaceId || !(amount > 0)) return false;
  try {
    const { data, error } = await supabase.rpc('cron_refund_workspace', {
      p_workspace_id: workspaceId,
      p_cron_key: cronKey,
      p_amount: amount,
      p_description: description ?? null,
    });
    if (error) {
      console.error(`[cron-billing] ${cronKey}/${workspaceId} refund failed:`, error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(`[cron-billing] ${cronKey}/${workspaceId} refund threw:`, e);
    return false;
  }
}

/** Charge a USER's personal balance for a cron whose subject has no workspace (e.g. a personal
 *  saved search). Fails open on any error. */
export async function chargeCronUser(
  supabase: SupabaseLike,
  userId: string,
  cronKey: string,
  opts: { units?: number; description?: string } = {},
): Promise<{ allowed: boolean; charged: number }> {
  if (!userId) return { allowed: true, charged: 0 };
  try {
    const { data, error } = await supabase.rpc('cron_charge_user', {
      p_user_id: userId, p_cron_key: cronKey, p_units: opts.units ?? 1, p_description: opts.description ?? null,
    });
    if (error) {
      console.error(`[cron-billing] user ${cronKey}/${userId} charge error (failing open):`, error.message);
      return { allowed: true, charged: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: row?.allowed !== false, charged: Number(row?.charged ?? 0) };
  } catch (e) {
    console.error(`[cron-billing] user ${cronKey}/${userId} charge threw (failing open):`, e);
    return { allowed: true, charged: 0 };
  }
}

/** Personal-wallet twin of `refundCronWorkspace`, for the ownerless/workspaceless charge path.
 *  There is no `cron_refund_user` RPC — a user charge is a plain credit debit, so its refund is a
 *  plain `refund_credits`. Best-effort: a failed refund must never break the caller. */
export async function refundCronUser(
  supabase: SupabaseLike,
  userId: string,
  cronKey: string,
  amount: number,
  description?: string,
): Promise<boolean> {
  if (!userId || !(amount > 0)) return false;
  try {
    const { error } = await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: `cron_${cronKey}_refund`,
      p_description: description ?? `Refund — ${cronKey}`,
      p_metadata: { cron_key: cronKey, refund: true },
      p_workspace_id: null,
    });
    if (error) {
      console.error(`[cron-billing] user ${cronKey}/${userId} refund failed:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[cron-billing] user ${cronKey}/${userId} refund threw:`, e);
    return false;
  }
}
