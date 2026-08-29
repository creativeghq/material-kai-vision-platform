// deno-lint-ignore-file no-explicit-any
// PUBLIC workspace clock-in kiosk (anonymous). A shared-device / mobile page at
// /{workspace-slug}/clockin where an employee identifies by VAT (VAT) — optionally a PIN —
// and clocks arrival/departure. No session; resolves the workspace from `slug`.
// SECURITY POSTURE (deliberate speed/security trade-off, opt-in):
//  • Kiosk is OFF by default — a workspace must set hr_settings.kiosk_enabled=true.
//  • Identity = VAT (the employee must already exist as an active employee of THIS workspace).
//  • Second factor, ALWAYS: a per-employee 4–8 digit PIN. It used to be optional
//    (hr_settings.kiosk_require_pin) — see the `requirePin` constant for why it no longer is.
//  • Returns minimal data (name + in/out state); never other employees, salary, or ids.
//  • The punch is recorded and filed to Ergani (WRKCardSE) when the workspace has it configured.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { fileWorkcardPunch } from '../_shared/ergani/workcard.ts';
import { sha256hex } from '../_shared/hash.ts';


/** Trusted-ish client IP from the proxy hop. */
function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}
const KIOSK_RATE_LIMIT_PER_MIN = 20; // lookups + clocks per IP per minute
const PIN_MAX_FAILS = 8;             // wrong-PIN attempts per (workspace, VAT) before lockout
const PIN_LOCKOUT_WINDOW_MS = 15 * 60_000;

interface KioskEmployee { id: string; name: string; work_start_time: string | null; clock_pin_hash: string | null; }

/** Resolve an active employee of `workspaceId` by VAT, or null. */
async function findEmployeeByVat(supabase: any, workspaceId: string, vat: string): Promise<KioskEmployee | null> {
  const { data: contact } = await supabase
    .from('crm_contacts').select('id, name').eq('workspace_id', workspaceId).eq('vat_number', vat).maybeSingle();
  if (!contact) return null;
  const { data: emp } = await supabase
    .from('hr_employees').select('id, status, work_start_time, clock_pin_hash')
    .eq('workspace_id', workspaceId).eq('crm_contact_id', contact.id).eq('status', 'active').maybeSingle();
  if (!emp) return null;
  return { id: emp.id, name: contact.name ?? '', work_start_time: emp.work_start_time ?? null, clock_pin_hash: emp.clock_pin_hash ?? null };
}

/**
 * Is the employee clocked in — as of their LAST punch, whenever it was (#354 HR-9).
 *
 * This used to look only at punches whose `reference_date` is today in workspace time. Clock in at
 * 23:30 and at 00:10 the kiosk searched a different day, found nothing, showed "clocked out" and
 * accepted a second arrival while the first shift stayed open. Night shifts are ordinary in
 * several of the industries this serves. A shift is a span, not a calendar day, so the state comes
 * from the last punch full stop — which is also exactly what the table's sequence guard enforces.
 *
 * `tz` is no longer needed and the parameter is gone; the two callers passed the same value.
 */
async function currentlyIn(supabase: any, workspaceId: string, employeeId: string): Promise<boolean> {
  const { data } = await supabase
    .from('hr_time_punches').select('punch_type').eq('workspace_id', workspaceId).eq('employee_id', employeeId)
    .order('punched_at', { ascending: false }).limit(1).maybeSingle();
  return data?.punch_type === 'arrival';
}

Deno.serve(withApiLogging('hr-kiosk', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const action = String(body?.action ?? '').trim();
  const slug = String(body?.slug ?? '').trim();
  if (!action || !slug) return json({ error: 'action and slug are required' }, 400);

  const { data: ws } = await supabase.from('workspaces').select('id, name').eq('slug', slug).maybeSingle();
  if (!ws) return json({ error: 'not found' }, 404);

  const { data: settings } = await supabase
    .from('hr_settings').select('kiosk_enabled, kiosk_require_pin').eq('workspace_id', ws.id).maybeSingle();
  const kioskEnabled = !!settings?.kiosk_enabled;
  /**
   * A PIN is ALWAYS required (#354 HR-6).
   *
   * This endpoint is `verify_jwt = false` and identified the employee by ΑΦΜ alone whenever
   * `kiosk_require_pin` was off. An ΑΦΜ is not a secret — it is on every payslip and contract and
   * known to colleagues — so slug + ΑΦΜ was enough to punch someone else's attendance, which is
   * buddy-punching: the precise fraud a kiosk exists to prevent. The QR scanner does not help
   * either: it reads the ΑΦΜ out of clear text, so the code is an encoding, not an authenticator.
   *
   * `hr_settings.kiosk_require_pin` stays in the schema and the admin screen still shows it, but
   * an anonymous endpoint that writes a statutory attendance record does not get a switch that
   * turns its only authenticator off.
   */
  const requirePin = true;

  // Public metadata — lets the page render the workspace name + whether a PIN is needed.
  if (action === 'resolve') {
    return json({ enabled: kioskEnabled, workspace_name: ws.name, require_pin: requirePin });
  }
  if (!kioskEnabled) return json({ error: 'kiosk_disabled', message: 'Clock-in kiosk is not enabled for this workspace.' }, 403);

  // Rate limit: cap lookups + clocks per IP per minute (blunts VAT/PIN probing + punch spam).
  const ip = clientIp(req);
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase.from('hr_kiosk_attempts')
    .select('*', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  const limited = (count ?? 0) >= KIOSK_RATE_LIMIT_PER_MIN;
  await supabase.from('hr_kiosk_attempts').insert({ workspace_id: ws.id, ip, outcome: limited ? 'rate_limited' : 'attempt' });
  if (limited) return json({ error: 'rate_limited', message: 'Too many attempts. Please wait a minute and try again.' }, 429);

  const vat = String(body?.vat ?? '').trim();
  if (!vat) return json({ error: 'vat is required' }, 400);
  const pin = String(body?.pin ?? '').trim();

  const emp = await findEmployeeByVat(supabase, ws.id, vat);
  // Uniform "not found" so a wrong VAT and a wrong PIN look the same (no enumeration signal).
  if (!emp) return json({ error: 'not_recognized', message: 'VAT number not recognized for this workspace.' }, 404);
  if (requirePin) {
    if (!pin) return json({ error: 'pin_required', message: 'A PIN is required.' }, 401);
    // An employee with no PIN set cannot be authenticated at all, and must not fall through to
    // being authenticated by ΑΦΜ. Say what has to happen instead of failing anonymously.
    if (!emp.clock_pin_hash) {
      return json({
        error: 'pin_not_set',
        message: 'No clock-in PIN has been set for you yet. Ask your manager to set one in HR → Employees.',
      }, 401);
    }
    // Per-(workspace, VAT) PIN lockout: blunts distributed brute-force that the per-IP limit misses
    // (a 4-digit PIN is only 10⁴). Lock the subject after PIN_MAX_FAILS failures in the window.
    const subject = await sha256hex(`vat:${ws.id}:${vat}`);
    const pinSince = new Date(Date.now() - PIN_LOCKOUT_WINDOW_MS).toISOString();
    const { count: failCount } = await supabase.from('hr_kiosk_attempts')
      .select('*', { count: 'exact', head: true }).eq('subject', subject).eq('outcome', 'pin_fail').gte('created_at', pinSince);
    if ((failCount ?? 0) >= PIN_MAX_FAILS) return json({ error: 'locked_out', message: 'Too many PIN attempts. Please wait and try again later.' }, 429);
    const ok = emp.clock_pin_hash && (await sha256hex(`${ws.id}:${pin}`)) === emp.clock_pin_hash;
    if (!ok) {
      await supabase.from('hr_kiosk_attempts').insert({ workspace_id: ws.id, ip, outcome: 'pin_fail', subject });
      return json({ error: 'not_recognized', message: 'VAT number or PIN not recognized.' }, 401);
    }
  }

  if (action === 'lookup') {
    return json({ name: emp.name, clocked_in: await currentlyIn(supabase, ws.id, emp.id), work_start_time: emp.work_start_time });
  }

  if (action === 'clock') {
    const punchType = String(body?.punch_type ?? '').trim();
    if (!['arrival', 'departure'].includes(punchType)) return json({ error: "punch_type must be 'arrival' or 'departure'" }, 400);
    const r = await fileWorkcardPunch(supabase, ws.id, null, {
      employeeId: emp.id, punchType: punchType as 'arrival' | 'departure', source: 'kiosk',
    }, { requireErgani: false });
    return json({
      ok: true, name: emp.name, clocked_in: punchType === 'arrival',
      filed: r.filed, is_late: r.isLate ?? null, protocol: r.result?.protocol ?? null, reason: r.reason ?? null,
    });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
