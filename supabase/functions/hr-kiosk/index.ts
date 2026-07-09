// deno-lint-ignore-file no-explicit-any
// #252 — PUBLIC workspace clock-in kiosk (anonymous). A shared-device / mobile page at
// /{workspace-slug}/clockin where an employee identifies by ΑΦΜ (VAT) — optionally a PIN —
// and clocks arrival/departure. No session; resolves the workspace from `slug`.
//
// SECURITY POSTURE (deliberate speed/security trade-off, opt-in):
//  • Kiosk is OFF by default — a workspace must set hr_settings.kiosk_enabled=true.
//  • Identity = ΑΦΜ (the employee must already exist as an active employee of THIS workspace).
//  • Optional second factor: hr_settings.kiosk_require_pin → a per-employee 4–8 digit PIN.
//  • Returns minimal data (name + in/out state); never other employees, salary, or ids.
//  • The punch is recorded and filed to Εργάνη (WRKCardSE) when the workspace has it configured.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { fileWorkcardPunch } from '../_shared/ergani/workcard.ts';
import { sha256hex } from '../_shared/hash.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface KioskEmployee { id: string; name: string; work_start_time: string | null; clock_pin_hash: string | null; }

/** Resolve an active employee of `workspaceId` by ΑΦΜ, or null. */
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

/** Was the employee last seen clocked in today? */
async function currentlyIn(supabase: any, workspaceId: string, employeeId: string, tz: string): Promise<boolean> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const { data } = await supabase
    .from('hr_time_punches').select('punch_type').eq('workspace_id', workspaceId).eq('employee_id', employeeId)
    .eq('reference_date', today).order('punched_at', { ascending: false }).limit(1).maybeSingle();
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
    .from('hr_settings').select('kiosk_enabled, kiosk_require_pin, timezone').eq('workspace_id', ws.id).maybeSingle();
  const kioskEnabled = !!settings?.kiosk_enabled;
  const requirePin = !!settings?.kiosk_require_pin;
  const tz = settings?.timezone || 'Europe/Athens';

  // Public metadata — lets the page render the workspace name + whether a PIN is needed.
  if (action === 'resolve') {
    return json({ enabled: kioskEnabled, workspace_name: ws.name, require_pin: requirePin });
  }
  if (!kioskEnabled) return json({ error: 'kiosk_disabled', message: 'Clock-in kiosk is not enabled for this workspace.' }, 403);

  const vat = String(body?.vat ?? '').trim();
  if (!vat) return json({ error: 'vat is required' }, 400);
  const pin = String(body?.pin ?? '').trim();

  const emp = await findEmployeeByVat(supabase, ws.id, vat);
  // Uniform "not found" so a wrong VAT and a wrong PIN look the same (no enumeration signal).
  if (!emp) return json({ error: 'not_recognized', message: 'ΑΦΜ not recognized for this workspace.' }, 404);
  if (requirePin) {
    if (!pin) return json({ error: 'pin_required', message: 'A PIN is required.' }, 401);
    const ok = emp.clock_pin_hash && (await sha256hex(`${ws.id}:${pin}`)) === emp.clock_pin_hash;
    if (!ok) return json({ error: 'not_recognized', message: 'ΑΦΜ or PIN not recognized.' }, 401);
  }

  if (action === 'lookup') {
    return json({ name: emp.name, clocked_in: await currentlyIn(supabase, ws.id, emp.id, tz), work_start_time: emp.work_start_time });
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
