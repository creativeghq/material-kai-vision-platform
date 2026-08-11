// Employee HR SELF-SERVICE agent toolkit. The sibling of hr-tools.ts, but for the `hr.self`
// persona: an invited employee who has NEITHER hr.view NOR hr.manage and therefore cannot call
// `manage_hr` at all (hr-api 403s them). This tool lets that employee ask about THEIR OWN record
// from chat — "how much leave do I have left?", "request 3 days off next week", "my documents".
// DESIGN: a thin natural-language front-end over hr-api's existing `self-*` actions. It calls
// hr-api over HTTP with the CALLER'S JWT, so hr-api authenticates AS the user and runs its own
// self-service gate (hr-api/index.ts §2.5): it looks up the hr_employees row where
// `user_id = caller` and hard-scopes every self- handler to that ONE employee id.
// SECURITY — this is the whole point of the tool, do not weaken it:
//  • There is NO employee_id/employee_name parameter, by design. The target employee is resolved
//    SERVER-SIDE from the caller's JWT inside hr-api; the model cannot address another person.
//    (Compare manage_hr, which takes employee_id/name — that one is admin-gated for exactly that
//    reason.) Never add a subject parameter here; it would turn a self-service tool into a
//    colleague-PII read (BOLA) for a persona that has no HR permissions at all.
//  • Only `self-*` actions are reachable — the action string is built from a closed enum here and
//    hr-api routes `self-` prefixed actions through handleSelfService before the admin RBAC gate.
//  • Requires a real user JWT; without one hr-api cannot identify the caller, so we fail closed
//    rather than falling back to a service-role client.
//  • workspaceId comes from agent-chat's server-resolved value, never from model tool args.
// deno-lint-ignore-file no-explicit-any

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'hr';
const ABSENCE_TYPES = ['vacation', 'sick', 'unpaid', 'other'] as const;

import { serviceClient as svcClient } from '../supabase-client.ts';
/** Call an hr-api `self-*` action AS the user, so hr-api's self-service scoping applies. */
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

export const createManageMyHrTool = (
  _userId: string,
  workspaceId: string | undefined,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  async function moduleReady(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
      if (!jwt) return { ok: false, error: 'My HR requires an authenticated user session.' };
      const svc = svcClient();
      const { data: mod } = await svc.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
      if (!mod?.enabled) return { ok: false, error: 'The HR module is not enabled on this platform.' };
      const { data: entitled } = await svc.rpc('is_workspace_entitled', {
        p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG,
      });
      if (entitled !== true) {
        return { ok: false, error: 'This workspace has not activated the HR module.' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `HR availability check failed: ${(e as Error).message}` };
    }
  }

  return tool(
    async ({ action, absence_type, start_date, end_date, note, days }: any) => {
      const ready = await moduleReady();
      if (!ready.ok) return JSON.stringify({ success: false, error: ready.error });
      const ws = workspaceId!;

      switch (action) {
        case 'my_profile': {
          const r = await callHrApi(jwt!, ws, 'self-profile');
          if (!r.ok) return JSON.stringify({ success: false, error: r.error });
          const p = r.data?.profile ?? {};
          // Emit a CURATED, flat payload — never the raw hr-api row. The raw profile carries
          // pay_basis / monthly_salary / hourly_rate / department_id, and the generic result card
          // renders whatever it's given: dumping salary into a chat card is bad UX (and awkward on
          // a shared screen). Flat keys also render far better than a nested object.
          onChunk?.({
            type: 'my_hr_profile',
            position: p?.contact?.position ?? null,
            department: p?.department?.name ?? null,
            employment_type: p?.employment_type ?? null,
            start_date: p?.start_date ?? null,
            weekly_hours: p?.weekly_hours ?? null,
            status: p?.status ?? null,
            leave_allowance_days: p?.summary?.annual_leave_allowance_days ?? p?.annual_leave_allowance_days ?? null,
            leave_remaining_days: p?.summary?.remaining_leave_days ?? null,
            leave_taken_days: p?.summary?.total_absence_days ?? null,
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            profile: {
              position: p?.contact?.position ?? null,
              department: p?.department?.name ?? null,
              employment_type: p?.employment_type ?? null,
              start_date: p?.start_date ?? null,
              weekly_hours: p?.weekly_hours ?? null,
              status: p?.status ?? null,
            },
            leave: {
              allowance_days: p?.summary?.annual_leave_allowance_days ?? p?.annual_leave_allowance_days ?? null,
              remaining_days: p?.summary?.remaining_leave_days ?? null,
              taken_days: p?.summary?.total_absence_days ?? null,
              by_type: p?.summary?.days_by_type ?? null,
            },
          });
        }

        case 'my_timeoff': {
          const r = await callHrApi(jwt!, ws, 'self-timeoff');
          if (!r.ok) return JSON.stringify({ success: false, error: r.error });
          const absences: any[] = r.data?.absences ?? [];
          onChunk?.({
            type: 'my_hr_timeoff',
            total: absences.length,
            absences: absences.slice(0, 25).map((a) => ({
              type: a.absence_type, from: a.start_date, to: a.end_date,
              working_days: a.working_days, status: a.status, note: a.note ?? null,
            })),
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            count: absences.length,
            absences: absences.slice(0, 25).map((a) => ({
              type: a.absence_type, from: a.start_date, to: a.end_date,
              working_days: a.working_days, status: a.status, note: a.note ?? null,
            })),
          });
        }

        case 'request_timeoff': {
          if (!start_date || !end_date) {
            return JSON.stringify({ success: false, error: 'Give me the first and last day of the leave (YYYY-MM-DD).' });
          }
          const type = ABSENCE_TYPES.includes(absence_type) ? absence_type : 'vacation';
          const r = await callHrApi(jwt!, ws, 'self-request-timeoff', {
            absence_type: type, start_date, end_date, ...(note ? { note } : {}),
          });
          if (!r.ok) return JSON.stringify({ success: false, error: r.error });
          const a = r.data?.absence ?? {};
          onChunk?.({
            type: 'my_hr_timeoff_requested',
            type_requested: a.absence_type, from: a.start_date, to: a.end_date,
            working_days: a.working_days, status: a.status,
            note: 'Pending — still needs HR approval.',
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            submitted: { type: a.absence_type, from: a.start_date, to: a.end_date, working_days: a.working_days, status: a.status },
            note: 'Submitted as PENDING — it still needs HR approval.',
          });
        }

        case 'my_documents': {
          const r = await callHrApi(jwt!, ws, 'self-documents');
          if (!r.ok) return JSON.stringify({ success: false, error: r.error });
          const documents: any[] = r.data?.documents ?? [];
          onChunk?.({
            type: 'my_hr_documents',
            total: documents.length,
            documents: documents.slice(0, 25).map((d) => ({ name: d.name, doc_type: d.doc_type, added: d.created_at })),
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            count: documents.length,
            documents: documents.slice(0, 25).map((d) => ({ id: d.id, name: d.name, doc_type: d.doc_type, created_at: d.created_at })),
            note: 'Open My HR → Documents to download or sign one.',
          });
        }

        case 'my_punches': {
          const r = await callHrApi(jwt!, ws, 'self-punches', { days: days ?? 14 });
          if (!r.ok) return JSON.stringify({ success: false, error: r.error });
          const punches: any[] = r.data?.punches ?? [];
          onChunk?.({
            type: 'my_hr_punches',
            clocked_in: r.data?.clocked_in ?? false,
            total: punches.length,
            punches: punches.slice(0, 30).map((x) => ({ type: x.punch_type, at: x.punched_at, date: x.reference_date, status: x.status })),
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            clocked_in: r.data?.clocked_in ?? false,
            count: punches.length,
            punches: punches.slice(0, 30).map((p) => ({ type: p.punch_type, at: p.punched_at, date: p.reference_date, status: p.status })),
          });
        }

        default:
          return JSON.stringify({ success: false, error: `unknown action: ${action}` });
      }
    },
    {
      name: 'manage_my_hr',
      description: [
        'YOUR OWN HR record (employee self-service). Use this whenever the user asks about THEIR OWN',
        'employment, leave balance, time off, HR documents or clock-ins — "how many vacation days do I',
        'have left?", "request 3 days off from Monday", "show my absences", "my documents".',
        '',
        'Actions:',
        '  my_profile      → your role, department, contract and leave balance (allowance / taken / remaining)',
        '  my_timeoff      → your absence history and the status of each request',
        '  request_timeoff → submit a leave request (goes in as PENDING approval). Needs start_date + end_date.',
        '  my_documents    → your HR documents (names only; open My HR to download/sign)',
        '  my_punches      → your recent clock-in/out punches and whether you are currently clocked in',
        '',
        'This tool ONLY ever returns the CALLING user\'s own record — it cannot look up a colleague.',
        'For team-wide HR questions (who is on leave, headcount, recording someone else\'s absence) use',
        'manage_hr instead, which requires HR permissions.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['my_profile', 'my_timeoff', 'request_timeoff', 'my_documents', 'my_punches']),
        absence_type: z.enum(ABSENCE_TYPES as unknown as [string, ...string[]]).optional().describe('request_timeoff: defaults to vacation.'),
        start_date: z.string().optional().describe('request_timeoff: first day, YYYY-MM-DD.'),
        end_date: z.string().optional().describe('request_timeoff: last day (inclusive), YYYY-MM-DD.'),
        note: z.string().optional().describe('request_timeoff: optional reason shown to HR.'),
        days: z.number().int().min(1).max(90).optional().describe('my_punches: look-back window (default 14).'),
      }),
    },
  );
};
