// deno-lint-ignore-file no-explicit-any
// #252 — HR module API. Employees are CRM contacts (crm_contacts) tagged with the global
// "Employee" category, plus a companion hr_employees row for HR-only data. Absences live in
// hr_absences with an approval workflow.
//
// SECURITY (pen-test #250 baseline + HR PII sharp edges):
//  • authenticate() yields a SERVICE-ROLE client (RLS bypassed) → every action re-derives the
//    workspace from the caller and calls userCanAccessWorkspace() (systemic root #2, no body trust).
//  • Module gates: isModuleEnabled('hr') [global publish] + assertEntitled(ws,'hr') [402 per-workspace].
//  • RBAC server-enforced: reads require hr.view, writes/approvals require hr.manage. HR data is
//    MORE restricted than general workspace membership — plain members get neither (403).
//  • Contact writes go through an explicit allowlist (no mass-assignment / BOPLA), workspace bound.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';
import { handleExpansion, handleSelfService } from './expansion.ts';
import { handleErgani } from './ergani.ts';
import { handleAccounting } from './accounting.ts';
import { businessDaysInclusive, tagEmployee } from './hr-util.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor'];
const EMPLOYEE_STATUSES = ['active', 'on_leave', 'terminated'];
const ABSENCE_TYPES = ['vacation', 'sick', 'unpaid', 'other'];

/** Contact fields a client may write when creating/attaching an employee (mirrors crm-api's
 * CONTACT_WRITABLE_COLUMNS, HR-relevant subset). Identity/trust fields are never accepted here. */
const CONTACT_WRITABLE = [
  'name', 'email', 'phone', 'mobile', 'first_name', 'last_name',
  'position', 'department', 'date_of_birth', 'vat_number', // vat_number = VAT (required for Ergani filings)
  'address', 'city', 'state', 'postal_code', 'country', 'country_code', 'street', 'street_number',
] as const;

/** HR-employee fields a client may write. */
const EMPLOYEE_WRITABLE = [
  'employment_type', 'start_date', 'end_date', 'weekly_hours',
  'annual_leave_allowance_days', 'manager_contact_id', 'status',
  'department_id', 'monthly_salary', 'salary_currency', 'pay_basis', 'hourly_rate',
  'amka', // AMKA — social-security number, required for Ergani submissions
  'dependent_children', // drives the payroll income-tax credit
  'work_start_time', 'work_end_time', 'work_days', // working-time window (lateness + kiosk expected)
] as const;

function pick(body: any, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (body?.[c] !== undefined) out[c] = body[c];
  return out;
}

/**
 * HR access for the caller in this workspace. Mirrors the frontend persona model: owner/admin of a
 * business node (→ dealer/architect persona) hold hr.view + hr.manage; plain members (→ staff) hold
 * neither — HR salary/absence data is owner/admin-only. Global operators (admin/super_admin) get all.
 */
async function resolveHrAccess(
  supabase: any, userId: string, workspaceId: string,
): Promise<{ canView: boolean; canManage: boolean }> {
  // Both lookups are independent — run concurrently (the global-role short-circuit is applied on the
  // resolved results, so a global admin just wastes one cheap membership read rather than a round-trip).
  const [{ data: prof }, { data: mem }] = await Promise.all([
    supabase.from('user_profiles').select('roles!user_profiles_role_id_fkey(name)').eq('user_id', userId).maybeSingle(),
    supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  const globalRole = (prof as any)?.roles?.name;
  if (globalRole && ['admin', 'super_admin'].includes(globalRole)) return { canView: true, canManage: true };
  const role = (mem as any)?.role;
  if (role === 'owner' || role === 'admin') return { canView: true, canManage: true };
  return { canView: false, canManage: false };
}


const EMPLOYEE_SELECT = `
  *,
  contact:crm_contacts!hr_employees_crm_contact_id_fkey (
    id, name, first_name, last_name, email, phone, mobile, position, department, date_of_birth, vat_number
  ),
  manager:crm_contacts!hr_employees_manager_contact_id_fkey ( id, name )
`;

/** Attach the absence-summary rollup (total_absence_days etc.) to a list of employee rows. */
async function withSummaries(supabase: any, workspaceId: string, employees: any[]): Promise<any[]> {
  if (!employees.length) return employees;
  const { data: sums } = await supabase
    .from('vw_hr_employee_absence_summary')
    .select('*')
    .eq('workspace_id', workspaceId);
  const byId = new Map((sums ?? []).map((s: any) => [s.employee_id, s]));
  return employees.map((e) => {
    const s: any = byId.get(e.id) ?? {};
    return {
      ...e,
      total_absence_days: Number(s.total_absence_days ?? 0),
      days_by_type: s.days_by_type ?? {},
      on_leave_today: !!s.on_leave_today,
      remaining_leave_days: s.remaining_leave_days ?? e.annual_leave_allowance_days ?? 0,
    };
  });
}

Deno.serve(withApiLogging('hr-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const action = String(body?.action ?? '').trim();
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!action) return json({ error: 'action is required' }, 400);
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);

  // Gates 1–2 are mutually independent DB checks — fire them concurrently, but EVALUATE in strict
  // priority order (access 404 → module 404 → entitlement 402) so responses/enumeration-safety are
  // identical to the sequential version. All three helpers resolve (never throw), so no unhandled
  // rejection when we short-circuit before awaiting a later one.
  const accessP = userCanAccessWorkspace(supabase, userId, workspaceId);
  const moduleP = isModuleEnabled(supabase, 'hr');
  const entP = assertEntitled(supabase, workspaceId, 'hr');

  // 1) Bind caller ↔ workspace (service-role client bypasses RLS — this is the real tenancy gate).
  if (!(await accessP)) {
    // 404 (not 403) to avoid workspace-id enumeration.
    return json({ error: 'not found' }, 404);
  }
  // 2) Module gates: global publish switch + per-workspace entitlement (402 upsell).
  if (!(await moduleP)) throw new HttpError(404, 'HR module is not available');
  const ent = await entP;
  if (!ent.ok) return ent.response;

  // 2.5) Employee SELF-SERVICE (prefix 'self-'). An invited employee (workspace role 'employee')
  // has neither hr.view nor hr.manage, so this path must precede the admin RBAC gate. Access is
  // granted purely by having a linked hr_employees row (user_id = caller); every self- handler is
  // hard-scoped to that one employee, so an employee can never read another person's data.
  if (action.startsWith('self-')) {
    const { data: me } = await supabase
      .from('hr_employees').select('id').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (!me) return json({ error: 'You do not have an employee record in this workspace.' }, 403);
    const res = await handleSelfService(action, { supabase, workspaceId, userId, employeeId: me.id, body });
    return res ?? json({ error: `Unknown action: ${action}` }, 400);
  }

  // 3) Admin RBAC (owner/admin only) for everything else.
  const access = await resolveHrAccess(supabase, userId, workspaceId);
  if (!access.canView) return json({ error: 'You do not have access to HR in this workspace.' }, 403);
  const requireManage = () => {
    if (!access.canManage) throw new HttpError(403, 'You need HR manage permission for this action.');
  };

  try {
    switch (action) {
      // ── Employees ────────────────────────────────────────────────────────
      case 'list-employees': {
        const { data, error } = await supabase
          .from('hr_employees')
          .select(EMPLOYEE_SELECT)
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: true });
        if (error) throw new HttpError(400, error.message);
        return json({ employees: await withSummaries(supabase, workspaceId, data ?? []) });
      }

      case 'create-employee': {
        requireManage();
        const empFields = pick(body, EMPLOYEE_WRITABLE);
        if (empFields.employment_type && !EMPLOYMENT_TYPES.includes(String(empFields.employment_type)))
          return json({ error: 'invalid employment_type' }, 400);
        if (empFields.status && !EMPLOYEE_STATUSES.includes(String(empFields.status)))
          return json({ error: 'invalid status' }, 400);

        // Resolve the underlying crm_contact: attach an existing (in-workspace) one, or create new.
        let contactId = body?.crm_contact_id ? String(body.crm_contact_id) : '';
        if (contactId) {
          const { data: c } = await supabase
            .from('crm_contacts').select('id').eq('id', contactId).eq('workspace_id', workspaceId).maybeSingle();
          if (!c) return json({ error: 'crm_contact_id not found in this workspace' }, 404);
        } else {
          const contactFields = pick(body?.contact ?? {}, CONTACT_WRITABLE);
          if (!contactFields.name) return json({ error: 'contact.name is required' }, 400);
          const { data: created, error: cErr } = await supabase
            .from('crm_contacts')
            .insert({ ...contactFields, workspace_id: workspaceId, created_by: userId })
            .select('id').single();
          if (cErr) throw new HttpError(400, cErr.message);
          contactId = created.id;
        }

        // Manager (if given) must belong to this workspace.
        if (empFields.manager_contact_id) {
          const { data: mgr } = await supabase
            .from('crm_contacts').select('id').eq('id', String(empFields.manager_contact_id))
            .eq('workspace_id', workspaceId).maybeSingle();
          if (!mgr) return json({ error: 'manager_contact_id not found in this workspace' }, 404);
        }

        const { data: emp, error: eErr } = await supabase
          .from('hr_employees')
          .insert({ ...empFields, workspace_id: workspaceId, crm_contact_id: contactId })
          .select(EMPLOYEE_SELECT).single();
        if (eErr) {
          // Unique (workspace_id, crm_contact_id) → this contact is already an employee.
          if ((eErr as any).code === '23505') return json({ error: 'This contact is already an employee.' }, 409);
          throw new HttpError(400, eErr.message);
        }
        await tagEmployee(supabase, contactId, userId);
        const [withSum] = await withSummaries(supabase, workspaceId, [emp]);
        return json({ employee: withSum }, 201);
      }

      case 'update-employee': {
        requireManage();
        const id = String(body?.employee_id ?? '');
        if (!id) return json({ error: 'employee_id is required' }, 400);
        const empFields = pick(body, EMPLOYEE_WRITABLE);
        if (empFields.employment_type && !EMPLOYMENT_TYPES.includes(String(empFields.employment_type)))
          return json({ error: 'invalid employment_type' }, 400);
        if (empFields.status && !EMPLOYEE_STATUSES.includes(String(empFields.status)))
          return json({ error: 'invalid status' }, 400);
        if (empFields.manager_contact_id) {
          const { data: mgr } = await supabase
            .from('crm_contacts').select('id').eq('id', String(empFields.manager_contact_id))
            .eq('workspace_id', workspaceId).maybeSingle();
          if (!mgr) return json({ error: 'manager_contact_id not found in this workspace' }, 404);
        }

        // Optional: update the linked contact's HR-relevant fields too.
        if (body?.contact && typeof body.contact === 'object') {
          const { data: emp } = await supabase
            .from('hr_employees').select('crm_contact_id').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
          if (emp?.crm_contact_id) {
            const contactFields = pick(body.contact, CONTACT_WRITABLE);
            if (Object.keys(contactFields).length) {
              await supabase.from('crm_contacts').update(contactFields)
                .eq('id', emp.crm_contact_id).eq('workspace_id', workspaceId);
            }
          }
        }

        const { data, error } = await supabase
          .from('hr_employees').update(empFields)
          .eq('id', id).eq('workspace_id', workspaceId)
          .select(EMPLOYEE_SELECT).maybeSingle();
        if (error) throw new HttpError(400, error.message);
        if (!data) return json({ error: 'not found' }, 404);
        const [withSum] = await withSummaries(supabase, workspaceId, [data]);
        return json({ employee: withSum });
      }

      // ── Absences ─────────────────────────────────────────────────────────
      case 'list-absences': {
        let q = supabase
          .from('hr_absences')
          .select('*, employee:hr_employees!hr_absences_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
          .eq('workspace_id', workspaceId)
          .order('start_date', { ascending: false });
        if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
        if (body?.status) q = q.eq('status', String(body.status));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return json({ absences: data ?? [] });
      }

      case 'record-absence': {
        requireManage();
        const employeeId = String(body?.employee_id ?? '');
        const startDate = String(body?.start_date ?? '');
        const endDate = String(body?.end_date ?? '');
        const absenceType = String(body?.absence_type ?? 'other');
        if (!employeeId || !startDate || !endDate) return json({ error: 'employee_id, start_date and end_date are required' }, 400);
        if (!ABSENCE_TYPES.includes(absenceType)) return json({ error: 'invalid absence_type' }, 400);
        if (endDate < startDate) return json({ error: 'end_date must be on or after start_date' }, 400);

        // Employee must belong to this workspace.
        const { data: emp } = await supabase
          .from('hr_employees').select('id').eq('id', employeeId).eq('workspace_id', workspaceId).maybeSingle();
        if (!emp) return json({ error: 'employee not found in this workspace' }, 404);

        // working_days is server-computed (weekends excluded) unless an explicit override is passed.
        // Validate the override so a non-numeric/negative value can't silently corrupt the totals
        // the summary view derives (total_absence_days / remaining_leave_days).
        let workingDays: number;
        if (body?.working_days !== undefined && body?.working_days !== null) {
          workingDays = Number(body.working_days);
          if (!Number.isFinite(workingDays) || workingDays < 0) {
            return json({ error: 'working_days must be a non-negative number' }, 400);
          }
        } else {
          workingDays = businessDaysInclusive(startDate, endDate);
        }

        const { data, error } = await supabase
          .from('hr_absences')
          .insert({
            workspace_id: workspaceId,
            employee_id: employeeId,
            absence_type: absenceType,
            start_date: startDate,
            end_date: endDate,
            working_days: workingDays,
            status: 'pending',
            note: body?.note ? String(body.note) : null,
          })
          .select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ absence: data }, 201);
      }

      case 'approve-absence':
      case 'reject-absence': {
        requireManage();
        const id = String(body?.absence_id ?? '');
        if (!id) return json({ error: 'absence_id is required' }, 400);
        const newStatus = action === 'approve-absence' ? 'approved' : 'rejected';
        const { data, error } = await supabase
          .from('hr_absences')
          .update({ status: newStatus, approved_by: userId })
          .eq('id', id).eq('workspace_id', workspaceId)
          .select('*').maybeSingle();
        if (error) throw new HttpError(400, error.message);
        if (!data) return json({ error: 'not found' }, 404);
        return json({ absence: data });
      }

      // ── Overview ─────────────────────────────────────────────────────────
      default: {
        // Ergani II (ΠΣ Ergani) submissions — work card, leaves, E3, schedules, audit.
        const erganiHandled = await handleErgani(action, { supabase, workspaceId, userId, body, access });
        if (erganiHandled) return erganiHandled;
        // Accounting documents (credit-metered Claude OCR + reconciliation).
        const acctHandled = await handleAccounting(action, { supabase, workspaceId, userId, body, access });
        if (acctHandled) return acctHandled;
        // Expanded areas (org, recruitment/ATS, onboarding, documents, payroll, analytics).
        const handled = await handleExpansion(action, { supabase, workspaceId, userId, body, access });
        if (handled) return handled;
        return json({ error: `Unknown action: ${action}` }, 400);
      }
    }
  } catch (e) {
    if (e instanceof HttpError) throw e; // handled by withApiLogging (correct status, no false Sentry)
    console.error('[hr-api] unexpected error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
}));
