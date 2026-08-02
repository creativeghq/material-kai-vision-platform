// deno-lint-ignore-file no-explicit-any
// Late check-in cron. For every workspace with late alerts on, finds active employees who
// are scheduled to work today, were due to clock in by (work_start_time + grace), and haven't — then
// fires ONE `hr_late_checkin` flow event per resolved recipient (bell + email via the seeded default
// flow). Deduped to one alert per employee per day via hr_checkin_alerts. Runs every few minutes.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { chargeCronWorkspace } from '../_shared/cron-billing.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function minutesInTz(d: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === 'hour')?.value ?? '0') * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? '0');
}
function dateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function isodowOf(dateStr: string): number {
  return ((new Date(dateStr + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
}
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Resolve the alert recipients for a workspace from its hr_settings. */
async function resolveRecipients(supabase: any, s: any): Promise<{ user_id: string | null; email: string | null }[]> {
  const userIds = new Set<string>();
  const roles: string[] = [];
  if (s.notify_owner) roles.push('owner');
  if (s.notify_finance) { roles.push('owner'); roles.push('admin'); }
  if (roles.length) {
    const { data: mems } = await supabase.from('workspace_members')
      .select('user_id').eq('workspace_id', s.workspace_id).eq('status', 'active').in('role', roles);
    for (const m of (mems ?? [])) if (m.user_id) userIds.add(m.user_id);
  }
  for (const uid of (s.notify_user_ids ?? [])) if (uid) userIds.add(uid);

  const out: { user_id: string | null; email: string | null }[] = [];
  if (userIds.size) {
    const { data: profs } = await supabase.from('user_profiles').select('user_id, email').in('user_id', Array.from(userIds));
    const emailByUid = new Map((profs ?? []).map((p: any) => [p.user_id, p.email]));
    for (const uid of userIds) out.push({ user_id: uid, email: emailByUid.get(uid) ?? null });
  }
  for (const email of (s.notify_emails ?? [])) if (email) out.push({ user_id: null, email });
  return out;
}

Deno.serve(withApiLogging('hr-checkin-cron', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Prune the kiosk rate-limit log (only the last minute matters; keep 1h for admin visibility).
  await supabase.from('hr_kiosk_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString());

  const { data: settingsRows } = await supabase.from('hr_settings').select('*').eq('late_alert_enabled', true);
  let checked = 0, alerted = 0;
  const now = new Date();

  for (const s of (settingsRows ?? [])) {
    const tz = s.timezone || 'Europe/Athens';
    const today = dateInTz(now, tz);
    const isodow = isodowOf(today);
    const nowMin = minutesInTz(now, tz);
    const grace = s.late_grace_minutes ?? 15;

    const { data: emps } = await supabase.from('hr_employees')
      .select('id, work_start_time, work_days, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name )')
      .eq('workspace_id', s.workspace_id).eq('status', 'active');

    let recipients: { user_id: string | null; email: string | null }[] | null = null;
    // Meter lazily: only charge when this workspace actually produces a late alert this run (empty
    // 5-min scans are free). One charge per workspace per run-with-alerts; skips the workspace's
    // alerting if the owner is out of credits (auto-resumes on top-up).
    let wsCharged = false;

    for (const e of (emps ?? [])) {
      const start = timeToMinutes(e.work_start_time ?? null);
      if (start == null) continue;
      const days: number[] = Array.isArray(e.work_days) ? e.work_days : [1, 2, 3, 4, 5];
      if (!days.includes(isodow)) continue;
      if (nowMin <= start + grace) continue; // not late yet
      checked++;

      // First late employee for this workspace this run → charge the owner once. No credits → stop
      // alerting for this workspace this run (nothing claimed yet; resumes when funded).
      if (!wsCharged) {
        const gate = await chargeCronWorkspace(supabase, s.workspace_id, 'hr-checkin', { description: 'HR late check-in alerts' });
        if (!gate.allowed) break;
        wsCharged = true;
      }

      // Already clocked in today?
      const { data: arr } = await supabase.from('hr_time_punches').select('id')
        .eq('workspace_id', s.workspace_id).eq('employee_id', e.id).eq('reference_date', today)
        .eq('punch_type', 'arrival').limit(1).maybeSingle();
      if (arr) continue;

      // Claim the day's alert (unique(employee_id, reference_date) makes this idempotent under races).
      const { error: claimErr } = await supabase.from('hr_checkin_alerts')
        .insert({ workspace_id: s.workspace_id, employee_id: e.id, reference_date: today, expected_at: now.toISOString() });
      if (claimErr) continue; // already alerted (or raced)

      if (recipients === null) recipients = await resolveRecipients(supabase, s);
      if (!recipients.length) { alerted++; continue; }

      const empName = e.contact?.name || 'An employee';
      const title = 'Late check-in';
      const bodyText = `${empName} has not clocked in yet${e.work_start_time ? ` (expected ${String(e.work_start_time).slice(0, 5)})` : ''}.`;
      for (const r of recipients) {
        await emitFlowEvent('hr_late_checkin', {
          workspace_id: s.workspace_id, employee_id: e.id, employee_name: empName,
          user_id: r.user_id, email: r.email,
          title, body: bodyText, action_url: '/hr?tab=attendance', type: 'hr_late_checkin',
        });
      }
      alerted++;
    }
  }

  return json({ ok: true, checked, alerted });
}));
