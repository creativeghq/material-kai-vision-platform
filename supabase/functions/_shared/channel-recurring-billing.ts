/**
 * Bill the recurring line the platform records and never charged for: rented phone numbers.
 *
 * A number is a real monthly cost Zernio puts on the operator's card, tied to one workspace, and
 * it was being absorbed in full.
 *
 * Connected CHANNELS are deliberately NOT billed (2026-08-24). Zernio charges per account past
 * the free two and the platform absorbs it: a workspace onboards as many accounts as it wants
 * rather than meeting a wall while setting up. The count still reaches the operator cost view, so
 * the absorbed total is visible per tenant instead of arriving as one unattributed invoice line —
 * measuring a cost and charging for it are separate decisions, and only the second was reversed.
 *
 * Charged in CREDITS, not as Stripe subscription items: a credit debit lands in the same ledger as
 * every other kind of spend, so it appears beside the message and image charges instead of in a
 * parallel system nobody reconciles.
 *
 * Idempotency is the UNIQUE (workspace, type, month) constraint, not a flag or a timestamp
 * comparison: the cron can fire twice, or be re-run by hand after a partial failure, and the
 * second attempt collides instead of billing again.
 */
import { CREDIT_SALE_PRICE_USD, MARKUP_MULTIPLIER } from './pricing-constants.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export interface ChargeLine {
  workspaceId: string;
  workspaceName: string;
  chargeType: 'seat' | 'number';
  quantity: number;
  unitCostUsd: number;
  credits: number;
  status: 'charged' | 'failed' | 'skipped';
  error?: string;
}

/**
 * Credits for a recurring USD cost.
 *
 * Passthrough maths, deliberately — the same rule the WhatsApp template rate uses. A seat is
 * resold infrastructure, not our own compute: at the AI multiplier a $6 seat would bill the
 * tenant $76/month, which nobody would pay for something Zernio sells at $6.
 */
export function recurringCredits(costUsd: number, quantity: number): number {
  return Math.round(((costUsd * quantity * MARKUP_MULTIPLIER) / CREDIT_SALE_PRICE_USD) * 100) / 100;
}

/** First day of the month a timestamp falls in, as YYYY-MM-DD. */
export function periodMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Charge one workspace for one line, once per month.
 *
 * `billingUserId` is the workspace owner: credits are debited through the same router the rest of
 * the platform uses, which prefers the workspace pool and falls back to the personal balance.
 */
async function chargeOne(
  supabase: SupabaseLike,
  params: {
    workspaceId: string;
    workspaceName: string;
    billingUserId: string;
    chargeType: 'seat' | 'number';
    quantity: number;
    unitCostUsd: number;
    month: string;
    detail: Record<string, unknown>;
  },
): Promise<ChargeLine> {
  const credits = recurringCredits(params.unitCostUsd, params.quantity);
  const base = {
    workspaceId: params.workspaceId,
    workspaceName: params.workspaceName,
    chargeType: params.chargeType,
    quantity: params.quantity,
    unitCostUsd: params.unitCostUsd,
    credits,
  };

  if (params.quantity <= 0 || credits <= 0) {
    return { ...base, status: 'skipped' };
  }

  // Claim the month FIRST. Writing the row before the debit means a crash between the two leaves
  // a 'failed' row to investigate rather than an untracked successful charge — and the unique
  // constraint refuses a second attempt at a month already billed.
  const { error: claimErr } = await supabase.from('channel_recurring_charges').insert({
    workspace_id: params.workspaceId,
    charge_type: params.chargeType,
    period_month: params.month,
    quantity: params.quantity,
    unit_cost_usd: params.unitCostUsd,
    credits_charged: credits,
    status: 'failed', // upgraded below once the debit succeeds
    detail: params.detail,
  });

  if (claimErr) {
    // 23505 is the unique violation: this month is already billed. Not an error — it is the
    // idempotency working, and reporting it as a failure would make every second run look broken.
    if (String((claimErr as { code?: string }).code) === '23505') {
      return { ...base, status: 'skipped', error: 'already billed for this month' };
    }
    return { ...base, status: 'failed', error: String(claimErr.message ?? claimErr) };
  }

  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: params.billingUserId,
    p_amount: credits,
    p_operation_type: params.chargeType === 'seat' ? 'channel_seat_monthly' : 'phone_number_monthly',
    p_description: params.chargeType === 'seat'
      ? `${params.quantity} extra connected channel${params.quantity === 1 ? '' : 's'} — ${params.month}`
      : `${params.quantity} phone number${params.quantity === 1 ? '' : 's'} — ${params.month}`,
    p_metadata: { ...params.detail, period_month: params.month, unit_cost_usd: params.unitCostUsd },
    p_workspace_id: params.workspaceId,
  });

  const ok = !error && (data === null || data === undefined || (data as { success?: boolean })?.success !== false);
  await supabase.from('channel_recurring_charges')
    .update({
      status: ok ? 'charged' : 'failed',
      detail: { ...params.detail, debit_error: ok ? null : String(error?.message ?? 'insufficient credits') },
    })
    .eq('workspace_id', params.workspaceId)
    .eq('charge_type', params.chargeType)
    .eq('period_month', params.month);

  return ok
    ? { ...base, status: 'charged' }
    : { ...base, status: 'failed', error: String(error?.message ?? 'insufficient credits') };
}

/**
 * Bill every workspace for the month.
 *
 * Numbers only. Each is priced from its own captured `monthly_cents` rather than a blended rate,
 * because a $3 Greek line and a $21 line are not the same line.
 */
export async function billChannelsForMonth(
  supabase: SupabaseLike,
  now: Date,
): Promise<{ month: string; lines: ChargeLine[] }> {
  const month = periodMonth(now);
  const lines: ChargeLine[] = [];

  const { data: workspaces } = await supabase
    .from('workspaces').select('id, name');

  for (const ws of ((workspaces ?? []) as Array<{ id: string; name: string }>)) {
    // Who pays. Owner first, then any admin — a workspace with neither cannot be billed, and that
    // is worth recording rather than skipping quietly.
    const { data: member } = await supabase
      .from('workspace_members').select('user_id, role')
      .eq('workspace_id', ws.id).eq('status', 'active')
      .in('role', ['owner', 'admin']).order('role').limit(1).maybeSingle();

    if (!member?.user_id) {
      lines.push({
        workspaceId: ws.id, workspaceName: ws.name, chargeType: 'number', quantity: 0,
        unitCostUsd: 0, credits: 0, status: 'skipped',
        error: 'no owner or admin to bill',
      });
      continue;
    }

    // No seat charge. Channels are unmetered by decision (2026-08-24) — a workspace connects as
    // many accounts as it wants and the platform absorbs Zernio's per-account fee. The count is
    // still surfaced in the operator cost view, which is where that absorbed cost becomes
    // visible per tenant instead of arriving as one unattributed invoice line.

    // Numbers are priced from what Zernio actually charges for each one, captured at purchase —
    // a $3 Greek line and a $21 line must not be billed at one blended rate.
    const { data: numbers } = await supabase
      .from('workspace_phone_numbers').select('phone_number, monthly_cents')
      .eq('workspace_id', ws.id).is('released_at', null);

    const owned = (numbers ?? []) as Array<{ phone_number: string; monthly_cents: number | null }>;
    const priced = owned.filter((n) => (n.monthly_cents ?? 0) > 0);
    if (priced.length) {
      const totalUsd = priced.reduce((sum, n) => sum + (n.monthly_cents ?? 0) / 100, 0);
      lines.push(await chargeOne(supabase, {
        workspaceId: ws.id, workspaceName: ws.name, billingUserId: member.user_id,
        chargeType: 'number', quantity: priced.length,
        // The average is only the reporting unit; the CHARGE is built from the real total above,
        // so a mixed-country set bills correctly.
        unitCostUsd: Math.round((totalUsd / priced.length) * 10000) / 10000,
        month,
        detail: { numbers: priced.map((n) => n.phone_number), total_cost_usd: totalUsd },
      }));
    }

    // A number with no known cost cannot be billed. The silent-zero probe already watches for it;
    // recording the skip here means the monthly run says so too, rather than under-billing quietly.
    const unpriced = owned.length - priced.length;
    if (unpriced > 0) {
      lines.push({
        workspaceId: ws.id, workspaceName: ws.name, chargeType: 'number', quantity: unpriced,
        unitCostUsd: 0, credits: 0, status: 'skipped',
        error: `${unpriced} number(s) have no monthly_cents — run reconcile-phone-numbers`,
      });
    }
  }

  return { month, lines };
}
