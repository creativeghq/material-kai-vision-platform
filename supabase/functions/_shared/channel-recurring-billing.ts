/** Bill the recurring line the platform records and never charged for: rented phone numbers. */
import { CREDIT_SALE_PRICE_USD, MARKUP_MULTIPLIER } from './pricing-constants.ts';
import { listPhoneNumbers } from './zernio-phone-numbers.ts';

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

/** Who a workspace's credits are debited through: an active owner first, then an active admin. */
export async function workspaceBillingUser(supabase: SupabaseLike, workspaceId: string): Promise<string | null> {
  const { data } = await supabase
    .from('workspace_members').select('user_id, role')
    .eq('workspace_id', workspaceId).eq('status', 'active')
    .in('role', ['owner', 'admin']).order('role', { ascending: false }).limit(1).maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

export async function attributeProfileNumbers(
  supabase: SupabaseLike,
  workspaceId: string,
  profileId: string,
  purchasedBy: string | null,
): Promise<{ inserted: string[]; errors: string[] }> {
  const inserted: string[] = [];
  const errors: string[] = [];
  let owned: Awaited<ReturnType<typeof listPhoneNumbers>>;
  try {
    owned = await listPhoneNumbers(supabase as never, profileId);
  } catch (e) {
    return { inserted, errors: [`could not list the profile's numbers: ${e instanceof Error ? e.message : String(e)}`] };
  }
  for (const n of owned.filter((x) => !x.broughtYourOwn)) {
    const { data: existing, error: lookupErr } = await supabase
      .from('workspace_phone_numbers').select('id').eq('zernio_number_id', n.id).maybeSingle();
    if (lookupErr) { errors.push(`${n.phoneNumber}: ${lookupErr.message}`); continue; }
    if (existing) continue;
    const { error } = await supabase.from('workspace_phone_numbers').insert({
      workspace_id: workspaceId,
      zernio_number_id: n.id,
      phone_number: n.phoneNumber,
      country: n.country,
      monthly_cents: n.monthlyCents,
      status: n.status ?? 'active',
      purchased_by: purchasedBy,
    });
    if (error) errors.push(`${n.phoneNumber}: ${error.message}`);
    else inserted.push(n.id);
  }
  return { inserted, errors };
}

export interface ClaimedNumber { id: string; phone_number: string; monthly_cents: number }

/** Mark these numbers paid for the month, but only those not already paid; the claim decides who charges. */
export async function claimFirstMonth(
  supabase: SupabaseLike,
  workspaceId: string,
  zernioNumberIds: string[],
  month: string,
): Promise<{ claimed: ClaimedNumber[]; error?: string }> {
  if (!zernioNumberIds.length) return { claimed: [] };
  const { data, error } = await supabase
    .from('workspace_phone_numbers').update({ prepaid_through: month })
    .eq('workspace_id', workspaceId).in('zernio_number_id', zernioNumberIds)
    .or(`prepaid_through.is.null,prepaid_through.lt.${month}`).gt('monthly_cents', 0)
    .select('id, phone_number, monthly_cents');
  if (error) return { claimed: [], error: String(error.message ?? error) };
  return { claimed: (data ?? []) as ClaimedNumber[] };
}

export const firstMonthCredits = (claimed: ClaimedNumber[]) =>
  recurringCredits(claimed.reduce((sum, r) => sum + r.monthly_cents / 100, 0), 1);

/** Claim the unpaid first months and debit them in ONE transaction: a refused debit leaves nothing marked paid. */
export async function chargeFirstMonth(
  supabase: SupabaseLike,
  params: { workspaceId: string; billingUserId: string; zernioNumberIds: string[]; now?: Date },
): Promise<{ ok: boolean; credits: number; error?: string }> {
  if (!params.zernioNumberIds.length) return { ok: true, credits: 0 };
  const { data, error } = await supabase.rpc('charge_phone_numbers_first_month', {
    p_workspace_id: params.workspaceId,
    p_billing_user: params.billingUserId,
    p_zernio_ids: params.zernioNumberIds,
    p_month: periodMonth(params.now ?? new Date()),
    p_credits_per_cent: MARKUP_MULTIPLIER / CREDIT_SALE_PRICE_USD / 100,
  });
  const out = data as { success?: boolean; credits?: number; error?: string } | null;
  if (error || !out?.success) return { ok: false, credits: Number(out?.credits ?? 0), error: out?.error ?? error?.message ?? 'refused' };
  return { ok: true, credits: Number(out.credits ?? 0) };
}

export const FIRST_MONTH_HOLD = 'first month unpaid';

/**
 * Put a workspace's rented numbers ON HOLD — all of them for an unpaid month, or only the named
 * ones for an unpaid first month. Held, not released: paying restores the same line.
 */
export async function holdNumbers(
  supabase: SupabaseLike,
  workspaceId: string,
  reason: string,
  onlyZernioIds?: string[],
): Promise<{ held: number; error?: string }> {
  let q = supabase
    .from('workspace_phone_numbers')
    .update({ status: 'on_hold', held_at: new Date().toISOString(), held_reason: reason })
    .eq('workspace_id', workspaceId)
    .is('released_at', null)
    .eq('status', 'active');
  if (onlyZernioIds) q = q.in('zernio_number_id', onlyZernioIds);
  const { data: held, error } = await q.select('phone_number');

  if (error) return { held: 0, error: String(error.message ?? error) };

  // Stop the sends too. A number on hold whose channel still answers would keep accepting work
  // we are paying for and not being paid for — the hold has to reach the thing that spends.
  const numbers = ((held ?? []) as Array<{ phone_number: string }>).map((n) => n.phone_number);
  if (numbers.length) {
    const { error: chErr } = await supabase
      .from('messaging_channels')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .in('sender_id', numbers);
    if (chErr) return { held: numbers.length, error: `channels not deactivated: ${chErr.message}` };
  }
  return { held: numbers.length };
}

/** Take numbers off hold, in both tables. A month settling never lifts an unpaid first month. */
async function releaseHold(supabase: SupabaseLike, workspaceId: string, onlyIds?: string[]): Promise<number> {
  let q = supabase
    .from('workspace_phone_numbers')
    .update({ status: 'active', held_at: null, held_reason: null })
    .eq('workspace_id', workspaceId)
    .is('released_at', null)
    .eq('status', 'on_hold');
  q = onlyIds ? q.in('id', onlyIds) : q.not('held_reason', 'like', `${FIRST_MONTH_HOLD}%`);
  const { data: back } = await q.select('phone_number');

  const numbers = ((back ?? []) as Array<{ phone_number: string }>).map((n) => n.phone_number);
  if (numbers.length) {
    await supabase
      .from('messaging_channels')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .in('sender_id', numbers);
  }
  return numbers.length;
}

/** Numbers held because their first month was refused: charge again, and restore each one that pays. */
async function retryUnpaidFirstMonths(supabase: SupabaseLike, workspaceId?: string): Promise<{ settled: number; stillFailing: number }> {
  let q = supabase.from('workspace_phone_numbers').select('id, workspace_id, zernio_number_id')
    .eq('status', 'on_hold').is('released_at', null).is('prepaid_through', null)
    .like('held_reason', `${FIRST_MONTH_HOLD}%`);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data } = await q;
  const byWorkspace = new Map<string, Array<{ id: string; zernio_number_id: string }>>();
  for (const r of (data ?? []) as Array<{ id: string; workspace_id: string; zernio_number_id: string }>) {
    byWorkspace.set(r.workspace_id, [...(byWorkspace.get(r.workspace_id) ?? []), r]);
  }
  let settled = 0, stillFailing = 0;
  for (const [ws, rows] of byWorkspace) {
    const payer = await workspaceBillingUser(supabase, ws);
    const charge = payer
      ? await chargeFirstMonth(supabase, { workspaceId: ws, billingUserId: payer, zernioNumberIds: rows.map((r) => r.zernio_number_id) })
      : { ok: false };
    if (charge.ok) settled += await releaseHold(supabase, ws, rows.map((r) => r.id));
    else stillFailing += rows.length;
  }
  return { settled, stillFailing };
}

/**
 * Re-attempt months that failed.
 *
 * Runs nightly, not monthly: a workspace that tops up on the 3rd should settle without anyone
 * intervening, and waiting for the next 1st would leave a paying customer on hold for four weeks.
 * The UNIQUE (workspace, type, month) key makes this safe — the row is updated in place, never
 * duplicated.
 */
export async function retryFailedCharges(
  supabase: SupabaseLike,
  /**
   * Scope to ONE workspace. The nightly cron passes nothing and sweeps everybody; a tenant
   * clicking "retry now" on their own hold passes theirs, and the caller is responsible for
   * proving they run it. Without this parameter the only way to offer that button would be to
   * let a tenant trigger a debit against every other workspace on the platform.
   */
  workspaceId?: string,
): Promise<{ settled: number; stillFailing: number; restored: number }> {
  let query = supabase
    .from('channel_recurring_charges')
    .select('id, workspace_id, charge_type, period_month, quantity, unit_cost_usd, credits_charged, attempts, detail')
    .eq('status', 'failed');
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data: failed } = await query.order('period_month');

  let settled = 0, stillFailing = 0, restored = 0;
  const settledWorkspaces = new Set<string>();

  for (const row of ((failed ?? []) as Array<Record<string, string | number | null>>)) {
    const workspaceId = String(row.workspace_id);
    const payer = await workspaceBillingUser(supabase, workspaceId);
    if (!payer) { stillFailing++; continue; }

    const credits = Number(row.credits_charged) || 0;
    const { data, error } = await supabase.rpc('debit_credits', {
      p_user_id: payer,
      p_amount: credits,
      p_operation_type: 'phone_number_monthly',
      p_description: `${row.quantity} phone number(s) — ${row.period_month} (retry)`,
      p_metadata: { period_month: row.period_month, retry: true },
      p_workspace_id: workspaceId,
    });
    const ok = !error && (data === null || data === undefined || (data as { success?: boolean })?.success !== false);

    await supabase.from('channel_recurring_charges').update({
      status: ok ? 'charged' : 'failed',
      attempts: (Number(row.attempts) || 1) + 1,
      last_attempt_at: new Date().toISOString(),
    }).eq('id', String(row.id));

    if (ok) { settled++; settledWorkspaces.add(workspaceId); } else { stillFailing++; }
  }

  // Only lift the hold when the workspace has NO failed month left. Restoring on one settled
  // month while an older one is still owed would hand back the service for a partial payment.
  for (const workspaceId of settledWorkspaces) {
    const { count } = await supabase
      .from('channel_recurring_charges')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'failed');
    if ((count ?? 0) === 0) restored += await releaseHold(supabase, workspaceId);
  }

  const firstMonths = await retryUnpaidFirstMonths(supabase, workspaceId);
  return {
    settled: settled + firstMonths.settled,
    stillFailing: stillFailing + firstMonths.stillFailing,
    restored: restored + firstMonths.settled,
  };
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
    const payer = await workspaceBillingUser(supabase, ws.id);

    if (!payer) {
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
      .from('workspace_phone_numbers').select('phone_number, monthly_cents, prepaid_through')
      .eq('workspace_id', ws.id).is('released_at', null);

    const owned = ((numbers ?? []) as Array<{ phone_number: string; monthly_cents: number | null; prepaid_through: string | null }>)
      .filter((n) => !(n.prepaid_through && n.prepaid_through >= month));
    const priced = owned.filter((n) => (n.monthly_cents ?? 0) > 0);
    if (priced.length) {
      const totalUsd = priced.reduce((sum, n) => sum + (n.monthly_cents ?? 0) / 100, 0);
      lines.push(await chargeOne(supabase, {
        workspaceId: ws.id, workspaceName: ws.name, billingUserId: payer,
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

  // No grace period. Any workspace whose charge failed this run loses the service now.
  for (const workspaceId of new Set(lines.filter((l) => l.status === 'failed').map((l) => l.workspaceId))) {
    const { held, error } = await holdNumbers(supabase, workspaceId, `unpaid ${month}`);
    if (error) console.error('[channel-billing] hold failed for', workspaceId, error);
    if (held) console.warn(`[channel-billing] ${held} number(s) ON HOLD for ${workspaceId} — unpaid ${month}`);
  }

  return { month, lines };
}
