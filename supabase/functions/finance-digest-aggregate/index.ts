// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// Sales/Finance — digest aggregator.
//
// Replaces the standalone finance-send-digest function. Invoked via:
//   - The 'Finance digest' flows row (cron='5 * * * *', single run_edge_function node) → mode='cron'
//   - The Finance Settings 'Run now' / 'Send test' buttons → mode='now' (admin-auth)
//
// Renders a flat variable bag (string-only — including pre-rendered HTML
// fragments for sections that need looping) and calls email-api with
// templateSlug='finance.digest'. The HTML layout lives in the
// email_templates row, editable via the GrapesJS builder.

interface CronBody { mode: 'cron'; job?: 'digest' | 'followups' }
interface NowBody {
  mode: 'now';
  job?: 'digest' | 'followups';
  workspace_id?: string;
  recipients_override?: string[];
}

interface FollowUpRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  quote_number: string | null;
  name: string | null;
  status: string;
  grand_total: number | null;
  currency: string | null;
  days_since_activity: number | null;
  last_activity_logged_at: string | null;
  next_scheduled_follow_up: string | null;
}

const STALE_THRESHOLD_DAYS = 7;

interface Settings {
  workspace_id: string;
  digest_enabled: boolean;
  digest_frequency: 'daily' | 'weekly' | 'monthly';
  digest_day_of_week: number | null;
  digest_hour_utc: number;
  digest_recipients: string[];
  digest_last_sent_at: string | null;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fmtMoney(value: number | null | undefined, currency = 'EUR'): string {
  if (value == null || isNaN(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function escapeHtml(s: string): string {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isDueNow(s: Settings, nowUtc: Date): boolean {
  if (!s.digest_enabled) return false;
  if (!s.digest_recipients || s.digest_recipients.length === 0) return false;
  if (nowUtc.getUTCHours() !== s.digest_hour_utc) return false;

  if (s.digest_frequency === 'daily') {
    return !wasSentToday(s.digest_last_sent_at, nowUtc);
  }
  if (s.digest_frequency === 'weekly') {
    if (s.digest_day_of_week === null) return false;
    if (nowUtc.getUTCDay() !== s.digest_day_of_week) return false;
    return !wasSentInLastN(s.digest_last_sent_at, nowUtc, 6);
  }
  if (s.digest_frequency === 'monthly') {
    if (nowUtc.getUTCDate() !== 1) return false;
    return !wasSentInLastN(s.digest_last_sent_at, nowUtc, 25);
  }
  return false;
}
function wasSentToday(last: string | null, now: Date): boolean {
  if (!last) return false;
  const l = new Date(last);
  return l.getUTCFullYear() === now.getUTCFullYear()
    && l.getUTCMonth() === now.getUTCMonth()
    && l.getUTCDate() === now.getUTCDate();
}
function wasSentInLastN(last: string | null, now: Date, days: number): boolean {
  if (!last) return false;
  return (now.getTime() - new Date(last).getTime()) < days * 24 * 3600 * 1000;
}

// ───────────────────────────────────────────────────────────
// Build the variable bag for ONE workspace
// ───────────────────────────────────────────────────────────
async function buildVariables(supabase: any, workspaceId: string): Promise<Record<string, string>> {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthStart = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const next30 = new Date(today.getTime() + 30 * 86400_000);
  const next60 = new Date(today.getTime() + 60 * 86400_000);
  const next90 = new Date(today.getTime() + 90 * 86400_000);

  const [arAging, apAging, cashFlow, monthPnl, topAr, topAp, planned, followUps] = await Promise.all([
    supabase.from('vw_ar_aging').select('age_bucket, amount_due').eq('workspace_id', workspaceId),
    supabase.from('vw_ap_aging').select('age_bucket, amount_due').eq('workspace_id', workspaceId),
    supabase.from('vw_cash_flow_forecast').select('expected_date, direction, amount').eq('workspace_id', workspaceId).lte('expected_date', fmt(next90)),
    supabase.from('vw_monthly_pnl').select('period_month, revenue_net, gross_margin').eq('workspace_id', workspaceId).gte('period_month', fmt(monthStart)),
    supabase.rpc('report_top_customer_outstanding', { p_workspace_id: workspaceId }),
    supabase.rpc('report_top_supplier_outstanding', { p_workspace_id: workspaceId }),
    supabase.from('planned_payments').select('*').eq('workspace_id', workspaceId)
      .in('status', ['planned', 'overdue'])
      .lte('scheduled_for', fmt(new Date(today.getTime() + 7 * 86400_000))),
    supabase.from('vw_quote_followup_queue').select('id').eq('workspace_id', workspaceId),
  ]);

  // Aggregates
  const arRows = (arAging.data ?? []) as Array<{ age_bucket: string; amount_due: number }>;
  const apRows = (apAging.data ?? []) as Array<{ age_bucket: string; amount_due: number }>;
  const arOutstanding = arRows.reduce((acc, r) => acc + Number(r.amount_due || 0), 0);
  const apOutstanding = apRows.reduce((acc, r) => acc + Number(r.amount_due || 0), 0);
  const overdueAr = arRows.filter((r) => r.age_bucket !== 'current' && r.age_bucket !== 'paid' && r.age_bucket !== 'no_due_date').reduce((acc, r) => acc + Number(r.amount_due || 0), 0);

  const pnl = (monthPnl.data ?? []) as Array<{ revenue_net: number; gross_margin: number }>;
  const monthRevenue = pnl.reduce((acc, r) => acc + Number(r.revenue_net || 0), 0);
  const monthMargin = pnl.reduce((acc, r) => acc + Number(r.gross_margin || 0), 0);
  const monthMarginPct = monthRevenue > 0 ? (monthMargin / monthRevenue) * 100 : null;

  // Cash flow windowed
  const cfRows = (cashFlow.data ?? []) as Array<{ expected_date: string; direction: 'in'|'out'; amount: number }>;
  const window = (cutoffDate: Date) => {
    let inSum = 0, outSum = 0;
    for (const r of cfRows) {
      if (new Date(r.expected_date) <= cutoffDate) {
        if (r.direction === 'in') inSum += Number(r.amount || 0);
        else outSum += Number(r.amount || 0);
      }
    }
    return { inSum, outSum, net: inSum - outSum };
  };
  const w30 = window(next30), w60 = window(next60), w90 = window(next90);

  const topArRows = ((topAr.data ?? []) as any[]).slice(0, 5);
  const topApRows = ((topAp.data ?? []) as any[]).slice(0, 5);
  const plannedRows = ((planned.data ?? []) as any[]);
  const plannedIn = plannedRows.filter((r) => r.direction === 'in').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const plannedOut = plannedRows.filter((r) => r.direction === 'out').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const followUpsCount = (followUps.data ?? []).length;

  // ── HTML fragments (the renderer can't loop, so we render each table here)
  const cashFlowTableHtml = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead><tr style="background:#fafafa;">
        <th style="padding:8px; text-align:left; font-size:11px; color:#666; text-transform:uppercase;">Window</th>
        <th style="padding:8px; text-align:right; font-size:11px; color:#666; text-transform:uppercase;">Expected in</th>
        <th style="padding:8px; text-align:right; font-size:11px; color:#666; text-transform:uppercase;">Expected out</th>
        <th style="padding:8px; text-align:right; font-size:11px; color:#666; text-transform:uppercase;">Net</th>
      </tr></thead>
      <tbody>
        ${[
          ['Next 30 days', w30],
          ['Next 60 days', w60],
          ['Next 90 days', w90],
        ].map(([label, w]: any) => `
          <tr>
            <td style="padding:8px; border-top:1px solid #f0f0f0;">${label}</td>
            <td style="padding:8px; border-top:1px solid #f0f0f0; text-align:right; color:#10b981;">${fmtMoney(w.inSum)}</td>
            <td style="padding:8px; border-top:1px solid #f0f0f0; text-align:right; color:#cc3333;">${fmtMoney(w.outSum)}</td>
            <td style="padding:8px; border-top:1px solid #f0f0f0; text-align:right; font-weight:600; color:${w.net < 0 ? '#cc3333' : '#1a1a2e'};">${fmtMoney(w.net)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  const topCustomersHtml = renderRowsTable(
    topArRows,
    ['Customer','Open inv.','Outstanding','Max overdue'],
    'No customers with open balances 🎉',
    (r) => [
      escapeHtml(r.display_name),
      String(r.open_invoice_count ?? 0),
      `<span style="color:#cc3333; font-weight:600;">${fmtMoney(Number(r.outstanding))}</span>`,
      r.max_days_overdue > 0 ? `${r.max_days_overdue}d` : '—',
    ],
  );

  const topSuppliersHtml = renderRowsTable(
    topApRows,
    ['Supplier','Open bills','Outstanding','Max overdue'],
    'No open supplier bills',
    (r) => [
      escapeHtml(r.display_name),
      String(r.open_bill_count ?? 0),
      `<span style="font-weight:600;">${fmtMoney(Number(r.outstanding))}</span>`,
      r.max_days_overdue > 0 ? `${r.max_days_overdue}d` : '—',
    ],
  );

  const plannedPaymentsHtml = renderRowsTable(
    plannedRows,
    ['Title','Direction','Amount','Date'],
    'Nothing scheduled in the next 7 days',
    (r) => [
      escapeHtml(r.title),
      r.direction === 'in' ? '↓ in' : '↑ out',
      `<span style="font-weight:600; color:${r.direction === 'in' ? '#10b981' : '#cc3333'};">${fmtMoney(Number(r.amount), r.currency)}</span>`,
      r.scheduled_for,
    ],
  ) + `
    <p style="margin:8px 0 0 0; font-size:12px; color:#666;">
      Net planned this week: <strong style="color:${(plannedIn - plannedOut) < 0 ? '#cc3333' : '#10b981'};">${fmtMoney(plannedIn - plannedOut)}</strong>
      (${fmtMoney(plannedIn)} in − ${fmtMoney(plannedOut)} out)
    </p>
  `;

  const followUpsBlockHtml = followUpsCount > 0 ? `
    <div style="padding:0 24px 20px;">
      <div style="background:#fff7e6; border-left:3px solid #f0ad4e; padding:12px; border-radius:4px;">
        <strong style="color:#1a1a2e;">${followUpsCount} quote(s) need a follow-up.</strong>
        <div style="margin-top:4px; font-size:12px; color:#666;">Open the Finance dashboard → Follow-ups tab.</div>
      </div>
    </div>` : '';

  const monthName = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Variables must be string-valued (email-api's substituter is /\{\{(\w+)\}\}/g).
  return {
    month_name: monthName,
    ar_outstanding_fmt: fmtMoney(arOutstanding),
    ar_outstanding_color: overdueAr > 0 ? '#cc3333' : '#1a1a2e',
    ap_outstanding_fmt: fmtMoney(apOutstanding),
    overdue_ar_fmt: fmtMoney(overdueAr),
    overdue_ar_color: overdueAr > 0 ? '#cc3333' : '#1a1a2e',
    month_revenue_fmt: fmtMoney(monthRevenue),
    month_margin_fmt: fmtMoney(monthMargin),
    month_margin_pct_fmt: monthMarginPct != null ? `${monthMarginPct.toFixed(1)}%` : '—',
    cash_flow_table_html: cashFlowTableHtml,
    top_customers_html: topCustomersHtml,
    top_suppliers_html: topSuppliersHtml,
    planned_payments_html: plannedPaymentsHtml,
    follow_ups_block_html: followUpsBlockHtml,
  };
}

function renderRowsTable(rows: any[], headers: string[], emptyText: string, mapRow: (r: any) => string[]): string {
  const head = `<thead><tr style="background:#fafafa;">${headers.map((h) => `<th style="padding:8px; text-align:${h === headers[0] ? 'left' : 'right'}; font-size:11px; color:#666; text-transform:uppercase;">${h}</th>`).join('')}</tr></thead>`;
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}" style="padding:12px; color:#999; text-align:center; font-size:12px;">${emptyText}</td></tr>`
    : rows.map((r) => `<tr>${mapRow(r).map((cell, i) => `<td style="padding:8px; border-top:1px solid #f0f0f0; text-align:${i === 0 ? 'left' : 'right'};">${cell}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%; border-collapse:collapse; font-size:13px;">${head}<tbody>${body}</tbody></table>`;
}

// ───────────────────────────────────────────────────────────
// Dispatch one digest
// ───────────────────────────────────────────────────────────
async function dispatchDigest(
  supabase: any,
  workspaceId: string,
  recipients: string[],
  stampLastSent: boolean,
): Promise<{ ok: boolean; delivered: number; attempted: number; errors: string[] }> {
  if (recipients.length === 0) return { ok: false, delivered: 0, attempted: 0, errors: ['no recipients'] };

  const variables = await buildVariables(supabase, workspaceId);

  let delivered = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    try {
      const { data: dispatch, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'send',
          to,
          subject: 'Finance digest', // overridden by template's subject_template
          templateSlug: 'finance.digest',
          variables,
          emailType: 'transactional',
          tags: { feature: 'finance_digest', workspace_id: workspaceId },
        },
      });
      if (error || !(dispatch as any)?.success) {
        errors.push(`${to}: ${error?.message ?? (dispatch as any)?.error ?? 'send failed'}`);
      } else {
        delivered += 1;
      }
    } catch (err: any) {
      errors.push(`${to}: ${err?.message ?? 'send threw'}`);
    }
  }

  if (delivered > 0 && stampLastSent) {
    await supabase.from('finance_settings').update({ digest_last_sent_at: new Date().toISOString() }).eq('workspace_id', workspaceId);
  }
  return { ok: delivered > 0, delivered, attempted: recipients.length, errors };
}

// ───────────────────────────────────────────────────────────
// Follow-up bell-notification dispatcher (folded in from finance-followup-cron).
// Scans the follow-up queue and emits a bell to the quote owner for:
//   1. Submitted/quoted quotes idle for STALE_THRESHOLD_DAYS without a logged activity
//   2. Activities whose scheduled_for is due now and not yet completed
// Dedupe via a `reminder_dispatched` quote_activities row within 24h.
// ───────────────────────────────────────────────────────────
async function dispatchFollowUps(supabase: any): Promise<{ dispatched: number; skipped: number; queue_size: number }> {
  const { data: queue, error: queueErr } = await supabase
    .from('vw_quote_followup_queue')
    .select('*');
  if (queueErr) {
    console.error('vw_quote_followup_queue read failed', queueErr.message);
    return { dispatched: 0, skipped: 0, queue_size: 0 };
  }

  const rows = (queue as FollowUpRow[] | null) ?? [];
  const nowMs = Date.now();
  let dispatched = 0;
  let skipped = 0;

  for (const r of rows) {
    const stale =
      (r.days_since_activity ?? 0) >= STALE_THRESHOLD_DAYS &&
      (r.last_activity_logged_at === null ||
        (nowMs - new Date(r.last_activity_logged_at).getTime()) > 24 * 3600 * 1000);

    const dueScheduled =
      r.next_scheduled_follow_up !== null &&
      new Date(r.next_scheduled_follow_up).getTime() <= nowMs;

    if (!stale && !dueScheduled) { skipped += 1; continue; }

    // 24h dedupe
    const { data: recent } = await supabase
      .from('quote_activities')
      .select('id')
      .eq('quote_id', r.id)
      .eq('kind', 'reminder_dispatched')
      .gt('created_at', new Date(nowMs - 24 * 3600 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) { skipped += 1; continue; }

    const title = dueScheduled
      ? `Follow-up due: ${r.quote_number ?? r.name ?? 'quote'}`
      : `Quote idle for ${r.days_since_activity}d: ${r.quote_number ?? r.name ?? 'quote'}`;
    const body = dueScheduled
      ? `A scheduled follow-up for this ${r.status} quote is due now.`
      : `No activity in ${r.days_since_activity} days. Worth a nudge to the customer?`;

    if (r.owner_user_id) {
      await supabase.from('user_notifications').insert({
        user_id: r.owner_user_id,
        type: 'finance_follow_up',
        title,
        body,
        action_url: `/quotes/${r.id}`,
        is_read: false,
        metadata: {
          quote_id: r.id,
          workspace_id: r.workspace_id,
          stale,
          due_scheduled: dueScheduled,
          grand_total: r.grand_total,
          currency: r.currency,
        },
      });
      await supabase.from('quote_activities').insert({
        quote_id: r.id,
        kind: 'reminder_dispatched',
        body: title,
        metadata: { stale, due_scheduled: dueScheduled, channel: 'bell' },
      });
    }
    dispatched += 1;
  }

  return { dispatched, skipped, queue_size: rows.length };
}

// ───────────────────────────────────────────────────────────
// HTTP entry
// ───────────────────────────────────────────────────────────
Deno.serve(withApiLogging('finance-digest-aggregate', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({ mode: 'cron' }))) as CronBody | NowBody;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    if (body.mode === 'cron') {
      // Invoked by the flow-engine via run_edge_function. Runs both finance
      // notification jobs (digest + follow-ups) unless `job` narrows it.
      const job = (body as CronBody).job;
      const runDigest = !job || job === 'digest';
      const runFollowUps = !job || job === 'followups';

      const out: Record<string, any> = {};

      if (runDigest) {
        const { data: rows, error } = await supabase
          .from('finance_settings')
          .select('*')
          .eq('digest_enabled', true);
        if (error) return json({ error: error.message }, 500);

        const now = new Date();
        const digestResults: Array<{ workspace_id: string; outcome: string }> = [];
        for (const s of (rows ?? []) as Settings[]) {
          if (!isDueNow(s, now)) {
            digestResults.push({ workspace_id: s.workspace_id, outcome: 'not_due' });
            continue;
          }
          const r = await dispatchDigest(supabase, s.workspace_id, s.digest_recipients, true);
          digestResults.push({ workspace_id: s.workspace_id, outcome: r.ok ? 'sent' : `failed:${r.errors.join(';')}` });
        }
        out.digest = { processed: digestResults.length, dispatched: digestResults.filter((r) => r.outcome === 'sent').length, results: digestResults };
      }

      if (runFollowUps) {
        out.followups = await dispatchFollowUps(supabase);
      }

      return json({ ok: true, ...out });
    }

    // ─── Now (admin-triggered) path ──────────────────────────────────────
    const auth = await authenticate(req, {
      requireUser: true,
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const nb = body as NowBody;
    let workspaceId = nb.workspace_id;
    if (!workspaceId) {
      const { data: m } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', auth.userId)
        .eq('status', 'active')
        .limit(1).maybeSingle();
      workspaceId = m?.workspace_id;
    }
    if (!workspaceId) return json({ error: 'no workspace' }, 400);

    const { data: settings } = await supabase
      .from('finance_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const recipients = (nb.recipients_override && nb.recipients_override.length > 0)
      ? nb.recipients_override
      : (settings?.digest_recipients ?? []);

    const result = await dispatchDigest(
      supabase,
      workspaceId,
      recipients,
      !nb.recipients_override, // don't stamp last_sent when this is an override (test send)
    );
    return json({
      ok: result.ok,
      recipients_attempted: result.attempted,
      recipients_delivered: result.delivered,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error('finance-digest-aggregate error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
}));
