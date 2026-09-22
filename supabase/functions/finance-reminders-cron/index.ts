/**
 * finance-reminders-cron — `plan.due_tomorrow` and `vat.return_ready`.
 *
 * Both lists are DERIVED in SQL (`finance_due_plan_reminders`, `finance_vat_periods_ready`); this
 * function decides nothing about what is due. A plan is stamped only once the emit REPORTED
 * delivery; a VAT period is claimed first and the claim released if it did not, because missing a
 * filing deadline is worse than the small risk of a duplicate notice.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

interface PlanRow {
  plan_id: string;
  workspace_id: string;
  title: string;
  amount: number;
  currency: string;
  direction: 'in' | 'out';
  scheduled_for: string;
  category: string | null;
  reason: string;
}

interface VatRow {
  workspace_id: string;
  period_month: string;
  period_key: string;
  output_vat: number;
  input_vat: number;
  vat_return: number;
}

const money = (v: number, ccy: string) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: ccy || 'EUR' }).format(Number(v) || 0);

serve(withApiLogging('finance-reminders-cron', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  /** Who hears about a workspace event is answered once, in the shared module. */
  const TO_ROLES = ['owner', 'admin'];
  const PLAN_LIMIT = 200;

  let plansNotified = 0;
  let vatNotified = 0;
  const failures: string[] = [];

  // ── Planned payments ────────────────────────────────────────────────────────
  const { data: plans, error: planErr } = await supabase.rpc('finance_due_plan_reminders', { p_limit: PLAN_LIMIT });
  if (planErr) failures.push(`plans: ${planErr.message}`);
  // The window is one day wide, so anything past the cap is not picked up tomorrow either — it
  // is simply never sent. Reported rather than dropped into a clean 200.
  const plansTruncated = (plans ?? []).length >= PLAN_LIMIT;

  for (const p of (plans ?? []) as PlanRow[]) {
    try {
      const incoming = p.direction === 'in';
      const lead = p.reason === 'reminder' ? 'Coming up' : incoming ? 'Expected tomorrow' : 'Due tomorrow';
      const sent = await emitFlowEventToWorkspaceRoles(p.workspace_id, TO_ROLES, 'plan.due_tomorrow', (userId) => ({
        type: 'plan.due_tomorrow',
        user_id: userId,
        workspace_id: p.workspace_id,
        plan_id: p.plan_id,
        direction: p.direction,
        amount: p.amount,
        currency: p.currency,
        scheduled_for: p.scheduled_for,
        category: p.category ?? undefined,
        title: `${lead}: ${p.title}`,
        body: `${money(p.amount, p.currency)} ${incoming ? 'expected in' : 'to pay'} on ${p.scheduled_for}.`,
        action_url: '/finance?tab=planning',
      }));
      // Only a delivered reminder is stamped. The helper swallows its own errors, so without
      // reading `ok` a flow-engine outage would mark every plan reminded and the RPC's
      // `reminder_sent_at is null` filter would never return them again.
      if (!sent.ok) {
        failures.push(`plan ${p.plan_id}: ${sent.failed} of ${sent.recipients} recipient(s) not notified`);
        continue;
      }
      const { error: stampErr } = await supabase
        .from('planned_payments')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', p.plan_id)
        .is('reminder_sent_at', null);
      if (stampErr) throw stampErr;
      plansNotified += 1;
    } catch (e) {
      failures.push(`plan ${p.plan_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── VAT periods ─────────────────────────────────────────────────────────────
  const { data: periods, error: vatErr } = await supabase.rpc('finance_vat_periods_ready');
  if (vatErr) failures.push(`vat: ${vatErr.message}`);

  for (const v of (periods ?? []) as VatRow[]) {
    try {
      // Claim FIRST. The primary key is (workspace, kind, period), so a second run conflicts
      // here and stops — emitting first left both overlapping runs free to notify.
      const { error: claimErr } = await supabase
        .from('finance_reminder_log')
        .insert({ workspace_id: v.workspace_id, kind: 'vat_return_ready', key: v.period_key });
      if (claimErr) {
        if (claimErr.code === '23505') continue;
        throw claimErr;
      }

      const refund = Number(v.vat_return) < 0;
      const sent = await emitFlowEventToWorkspaceRoles(v.workspace_id, TO_ROLES, 'vat.return_ready', (userId) => ({
        type: 'vat.return_ready',
        user_id: userId,
        workspace_id: v.workspace_id,
        period: v.period_key,
        output_vat: v.output_vat,
        input_vat: v.input_vat,
        vat_return: v.vat_return,
        title: `VAT return ready — ${v.period_key}`,
        body: `${money(Math.abs(Number(v.vat_return)), 'EUR')} ${refund ? 'refundable' : 'payable'} `
          + `(${money(v.output_vat, 'EUR')} collected − ${money(v.input_vat, 'EUR')} paid), from ΑΑΔΕ's own book.`,
        action_url: '/finance?tab=vat_return',
      }));
      if (!sent.ok) {
        // Release the claim, or a VAT deadline is silently never mentioned again. Missing one is
        // worse than the small risk of a duplicate notice.
        await supabase.from('finance_reminder_log').delete()
          .eq('workspace_id', v.workspace_id).eq('kind', 'vat_return_ready').eq('key', v.period_key);
        failures.push(`vat ${v.period_key}: ${sent.failed} of ${sent.recipients} recipient(s) not notified`);
        continue;
      }
      vatNotified += 1;
    } catch (e) {
      failures.push(`vat ${v.workspace_id} ${v.period_key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // A run that could not read its sources is NOT a quiet run with nothing to do, so the status
  // says so rather than reporting a cheerful zero.
  const readFailed = !!planErr || !!vatErr;
  return new Response(JSON.stringify({
    ok: !readFailed && !plansTruncated,
    plans_notified: plansNotified,
    plans_truncated: plansTruncated,
    vat_notified: vatNotified,
    failures: failures.slice(0, 20),
    failure_count: failures.length,
  }), { status: readFailed ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
}));
