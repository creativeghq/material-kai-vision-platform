// The HR value-sets come from the generated mirror of `src/modules/hr/hrVocabulary.ts`
// (#391). They were declared inline here and in nine other files; the DB CHECK
// constraints are the enforcer and the source equals them exactly. Do not re-declare —
// `npm run vocab:mirror` regenerates the mirror and vocabularyMirrors.test.ts fails the
// build on drift.
import { ABSENCE_TYPES, EMPLOYMENT_TYPES, isAbsenceType } from '../hrVocabulary.generated.ts';
// HR agent toolkit. Lets a workspace owner/admin ask the KAI agent natural-language HR
// questions ("who's on leave this week?", "record a sick day for John", "add an employee",
// "HR overview") from chat, instead of navigating the /hr module UI.
// DESIGN: the tool is a thin natural-language front-end over the existing `hr-api` edge function.
// It calls hr-api over HTTP with the CALLER'S JWT, so hr-api authenticates AS the user and applies
// its full security stack (workspace binding via userCanAccessWorkspace, isModuleEnabled('hr'),
// assertEntitled(ws,'hr') 402, and the owner/admin-only RBAC — reads need hr.view, writes need
// hr.manage). We re-implement NONE of that here; workspace_id is server-derived (never model-supplied).
// SECURITY:
//  • Gated on isModuleEnabled('hr') + is_workspace_entitled('hr') for a clean upsell message; hr-api
//    is the real enforcer (a plain member calling a write still gets 403 from hr-api regardless).
//  • Requires a real user JWT — without one (partner kai_ keys / admin-secret paths) hr-api can't
//    identify the caller, so the tool fails closed with a clear message rather than calling service-role.
//  • workspaceId is passed from agent-chat's server-resolved value, not from the model's tool args.

// deno-lint-ignore-file no-explicit-any

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'hr';

import { serviceClient as svcClient } from '../supabase-client.ts';
/** Call an hr-api action AS the user (so all hr-api RBAC/entitlement applies). */
async function callHrApi(jwt: string, workspaceId: string, action: string, extra: Record<string, unknown> = {}): Promise<any> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/hr-api`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, workspace_id: workspaceId, ...extra }),
    });
    const bodyText = await resp.text();
    let parsed: any = {};
    try { parsed = bodyText ? JSON.parse(bodyText) : {}; } catch { parsed = { error: bodyText }; }
    if (!resp.ok) return { ok: false, status: resp.status, error: parsed?.error || `hr-api ${action} failed (${resp.status})` };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: `hr-api ${action} call failed: ${(e as Error).message}` };
  }
}

/** UTC ISO date (YYYY-MM-DD). */
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

/** Monday..Sunday of the current UTC week. */
function currentWeek(): { from: string; to: string } {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
  const sun = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 6));
  return { from: isoDate(mon), to: isoDate(sun) };
}

/** Two [start,end] date ranges overlap (inclusive, string YYYY-MM-DD compares lexicographically). */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function empName(e: any): string {
  return e?.contact?.name
    || [e?.contact?.first_name, e?.contact?.last_name].filter(Boolean).join(' ')
    || 'Employee';
}

export const createManageHrTool = (
  _userId: string,
  workspaceId: string | undefined,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  async function moduleReady(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
      if (!jwt) return { ok: false, error: 'HR tools require an authenticated user session.' };
      const svc = svcClient();
      const { data: mod } = await svc.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
      if (!mod?.enabled) return { ok: false, error: 'The HR module is not enabled on this platform.' };
      const { data: entitled } = await svc.rpc('is_workspace_entitled', {
        p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG,
      });
      if (entitled !== true) {
        return { ok: false, error: 'This workspace has not activated the HR module. Activate it under Profile → Modules.' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `HR availability check failed: ${(e as Error).message}` };
    }
  }

  /** Resolve an employee reference (id or fuzzy name) → single employee row, or a clarification error. */
  async function resolveEmployee(ws: string, employee_id?: string, employee_name?: string): Promise<
    { ok: true; employee: any } | { ok: false; error: string; candidates?: any[] }
  > {
    const res = await callHrApi(jwt!, ws, 'list-employees');
    if (!res.ok) return { ok: false, error: res.error };
    const employees: any[] = res.data?.employees ?? [];
    if (employee_id) {
      const hit = employees.find((e) => e.id === employee_id);
      if (!hit) return { ok: false, error: 'No employee with that id in this workspace.' };
      return { ok: true, employee: hit };
    }
    if (employee_name) {
      const q = employee_name.trim().toLowerCase();
      const matches = employees.filter((e) => empName(e).toLowerCase().includes(q));
      if (matches.length === 0) return { ok: false, error: `No employee matching "${employee_name}".` };
      if (matches.length > 1) {
        return {
          ok: false,
          error: `Multiple employees match "${employee_name}". Ask the user which one.`,
          candidates: matches.map((e) => ({ id: e.id, name: empName(e), position: e.contact?.position })),
        };
      }
      return { ok: true, employee: matches[0] };
    }
    return { ok: false, error: 'Provide employee_id or employee_name.' };
  }

  return tool(
    async ({ action, employee_id, employee_name, absence_id, absence_type, start_date, end_date, note, from_date, to_date, name, email, position, department, employment_type }: any) => {
      const gate = await moduleReady();
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      const ws = workspaceId!;

      // ── Read: employee roster ──────────────────────────────────────────────
      if (action === 'list_employees' || action === 'overview') {
        const res = await callHrApi(jwt!, ws, 'list-employees');
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const employees: any[] = res.data?.employees ?? [];
        const roster = employees.map((e) => ({
          id: e.id,
          name: empName(e),
          position: e.contact?.position ?? null,
          department: e.contact?.department ?? null,
          status: e.status,
          on_leave_today: !!e.on_leave_today,
          total_absence_days: e.total_absence_days ?? 0,
          remaining_leave_days: e.remaining_leave_days ?? null,
        }));

        if (action === 'list_employees') {
          onChunk?.({ type: 'hr_employees', employees: roster, timestamp: Date.now() });
          return JSON.stringify({ success: true, count: roster.length, employees: roster });
        }

        // overview — aggregate
        const daysByType: Record<string, number> = {};
        for (const e of employees) {
          const dbt = e.days_by_type ?? {};
          for (const [k, v] of Object.entries(dbt)) daysByType[k] = (daysByType[k] ?? 0) + Number(v ?? 0);
        }
        const pend = await callHrApi(jwt!, ws, 'list-absences', { status: 'pending' });
        const pendingCount = pend.ok ? (pend.data?.absences?.length ?? 0) : 0;
        const overview = {
          headcount: employees.length,
          active: employees.filter((e) => e.status === 'active').length,
          on_leave_today: roster.filter((e) => e.on_leave_today).length,
          pending_absence_requests: pendingCount,
          absence_days_by_type: daysByType,
        };
        onChunk?.({ type: 'hr_overview', overview, timestamp: Date.now() });
        return JSON.stringify({ success: true, overview });
      }

      // ── Read: who's on leave in a window ───────────────────────────────────
      if (action === 'who_is_on_leave') {
        const wk = currentWeek();
        const from = (from_date && String(from_date)) || wk.from;
        const to = (to_date && String(to_date)) || wk.to;
        const res = await callHrApi(jwt!, ws, 'list-absences', { status: 'approved' });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const absences: any[] = res.data?.absences ?? [];
        const onLeave = absences
          .filter((a) => overlaps(String(a.start_date), String(a.end_date), from, to))
          .map((a) => ({
            employee: a.employee?.contact?.name ?? 'Employee',
            employee_id: a.employee_id,
            absence_type: a.absence_type,
            start_date: a.start_date,
            end_date: a.end_date,
            working_days: a.working_days,
          }));
        onChunk?.({ type: 'hr_on_leave', from, to, on_leave: onLeave, timestamp: Date.now() });
        return JSON.stringify({ success: true, from, to, count: onLeave.length, on_leave: onLeave });
      }

      // ── Write: record an absence (approval workflow → status 'pending') ─────
      if (action === 'record_absence') {
        if (!absence_type || !isAbsenceType(absence_type)) {
          return JSON.stringify({ success: false, error: `absence_type must be one of ${ABSENCE_TYPES.join(', ')}` });
        }
        if (!start_date || !end_date) return JSON.stringify({ success: false, error: 'start_date and end_date (YYYY-MM-DD) are required.' });
        const resolved = await resolveEmployee(ws, employee_id, employee_name);
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
        const res = await callHrApi(jwt!, ws, 'record-absence', {
          employee_id: resolved.employee.id,
          absence_type, start_date, end_date,
          note: note ? String(note) : undefined,
        });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const absence = res.data?.absence;
        onChunk?.({ type: 'hr_absence_recorded', absence, employee_name: empName(resolved.employee), timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          absence,
          message: `Recorded ${absence_type} leave for ${empName(resolved.employee)} (${start_date} → ${end_date}), pending approval.`,
        });
      }

      // ── Read: pending leave requests awaiting a decision (so they can be approved in chat) ──
      if (action === 'list_pending') {
        const res = await callHrApi(jwt!, ws, 'list-absences', { status: 'pending' });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const pending = (res.data?.absences ?? []).map((a: any) => ({
          absence_id: a.id, employee: a.employee?.contact?.name ?? 'Employee', employee_id: a.employee_id,
          absence_type: a.absence_type, start_date: a.start_date, end_date: a.end_date, working_days: a.working_days,
        }));
        return JSON.stringify({ success: true, count: pending.length, pending });
      }

      // ── Write: approve / reject a pending absence (manager action) ─────────────
      if (action === 'approve_absence' || action === 'reject_absence') {
        if (!absence_id) return JSON.stringify({ success: false, error: 'absence_id is required — use list_pending to find it.' });
        const res = await callHrApi(jwt!, ws, action === 'approve_absence' ? 'approve-absence' : 'reject-absence', { absence_id });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        return JSON.stringify({ success: true, absence: res.data?.absence ?? res.data, message: `Absence ${action === 'approve_absence' ? 'approved' : 'rejected'}.` });
      }

      // ── Write: add an employee ─────────────────────────────────────────────
      if (action === 'add_employee') {
        if (!name || !String(name).trim()) return JSON.stringify({ success: false, error: 'name is required to add an employee.' });
        const res = await callHrApi(jwt!, ws, 'create-employee', {
          contact: {
            name: String(name).trim(),
            ...(email ? { email: String(email) } : {}),
            ...(position ? { position: String(position) } : {}),
            ...(department ? { department: String(department) } : {}),
          },
          ...(employment_type ? { employment_type } : {}),
        });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const employee = res.data?.employee;
        onChunk?.({ type: 'hr_employee_added', employee, timestamp: Date.now() });
        return JSON.stringify({ success: true, employee, message: `Added ${String(name).trim()} as an employee.` });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_hr',
      description: [
        'Answer HR questions and take HR actions for the current user\'s workspace (employees + absences).',
        'Requires the HR module active for the workspace; write actions require HR manage permission',
        '(owner/admin) — enforced server-side.',
        '',
        'Actions:',
        '  list_employees  → the employee roster with status + total absence days + remaining leave.',
        '  overview        → headcount, active, on-leave-today, pending requests, absence days by type.',
        '  who_is_on_leave → approved absences overlapping a window (from_date/to_date; defaults to this week).',
        '  list_pending    → leave requests awaiting a decision (with absence_id, so they can be approved here).',
        '  record_absence  → log an absence (goes in as PENDING approval). Give employee_id OR employee_name,',
        '                    absence_type (vacation|sick|unpaid|other), start_date, end_date (YYYY-MM-DD), optional note.',
        '  approve_absence / reject_absence → decide a pending request by absence_id (from list_pending).',
        '  add_employee    → create an employee (name required; optional email/position/department/employment_type).',
        '',
        'Examples:',
        '  "who\'s on leave this week?"         → action=who_is_on_leave',
        '  "record a sick day for John today"  → action=record_absence, employee_name="John", absence_type="sick", start_date+end_date=today',
        '  "add Maria as a full-time designer" → action=add_employee, name="Maria", position="Designer", employment_type="full_time"',
        '  "give me an HR overview"            → action=overview',
        'If a name matches multiple employees, ask the user which one before writing.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list_employees', 'overview', 'who_is_on_leave', 'list_pending', 'record_absence', 'approve_absence', 'reject_absence', 'add_employee']),
        employee_id: z.string().uuid().optional().describe('Target employee (record_absence).'),
        employee_name: z.string().optional().describe('Fuzzy employee name to resolve (record_absence).'),
        absence_id: z.string().uuid().optional().describe('Target absence (approve_absence/reject_absence) — get it from list_pending.'),
        absence_type: z.enum(ABSENCE_TYPES as unknown as [string, ...string[]]).optional(),
        start_date: z.string().optional().describe('YYYY-MM-DD (record_absence).'),
        end_date: z.string().optional().describe('YYYY-MM-DD (record_absence).'),
        note: z.string().optional(),
        from_date: z.string().optional().describe('YYYY-MM-DD window start (who_is_on_leave; default this week).'),
        to_date: z.string().optional().describe('YYYY-MM-DD window end (who_is_on_leave; default this week).'),
        name: z.string().optional().describe('Employee full name (add_employee).'),
        email: z.string().optional(),
        position: z.string().optional().describe('Job title (add_employee).'),
        department: z.string().optional(),
        employment_type: z.enum(EMPLOYMENT_TYPES).optional(),
      }),
    },
  );
};
