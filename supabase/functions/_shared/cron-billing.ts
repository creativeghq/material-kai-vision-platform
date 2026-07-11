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
