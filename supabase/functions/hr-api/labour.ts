// The HR value-sets come from the generated mirror of `src/modules/hr/hrVocabulary.ts`
// (#391). They were declared inline here and in nine other files; the DB CHECK
// constraints are the enforcer and the source equals them exactly. Do not re-declare —
// `npm run vocab:mirror` regenerates the mirror and vocabularyMirrors.test.ts fails the
// build on drift.
export { SEPARATION_TYPES } from '../_shared/hrVocabulary.generated.ts';
// Also imported: a re-export does not bind the name locally.
import { SEPARATION_TYPES, isSeparationType } from '../_shared/hrVocabulary.generated.ts';
import type { SeparationType } from '../_shared/hrVocabulary.generated.ts';
// deno-lint-ignore-file no-explicit-any
// Labour records that back the Ergani Ε-documents: separations (Ε5/Ε6/Ε7), overtime (Ε8) and
// work schedules (Ε4). Plain CRUD only — the filing itself lives in ergani.ts, so a workspace with
// no Ergani credentials still gets a usable internal register of departures, overtime and rosters.
//
// Dispatched from index.ts AFTER the caller is bound to the workspace + entitlement + hr.view.
// Every write requires hr.manage, every query is workspace-scoped, and every payload is built from
// an explicit column allowlist (invariant 8 — never spread a request body into a DB write).
import { jsonResponse as json } from '../_shared/http.ts';
import { HttpError } from '../_shared/api-logger.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import type { Ctx } from './expansion.ts';

const SEPARATION_WRITABLE = [
  'separation_type', 'effective_date', 'notice_date', 'reason', 'severance_amount', 'note',
] as const;
const OVERTIME_WRITABLE = [
  'work_date', 'start_time', 'end_time', 'reason', 'note',
] as const;
const SCHEDULE_WRITABLE = [
  'name', 'schedule_type', 'effective_from', 'effective_to', 'details',
] as const;

const SCHEDULE_TYPES = ['weekly', 'daily'];
/** A shift row inside hr_work_schedules.details. Rebuilt key-by-key — the column is jsonb, so
 *  whatever a client sends would otherwise be stored verbatim and later fed to Ergani. */
const SHIFT_DAYS = [0, 1, 2, 3, 4, 5, 6];

function pick(body: any, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (body?.[c] !== undefined) out[c] = body[c];
  return out;
}

const EMPLOYEE_JOIN = `
  employee:hr_employees!inner (
    id,
    contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name, vat_number )
  )
`;

/** Confirm an employee id belongs to this workspace before it is written as an FK. */
async function assertEmployee(ctx: Ctx, employeeId: string): Promise<void> {
  const { data } = await ctx.supabase
    .from('hr_employees').select('id').eq('id', employeeId).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'employee not found in this workspace');
}

/** 'HH:MM' / 'HH:MM:SS' or throw. */
function assertTime(value: unknown, field: string): string {
  const s = String(value ?? '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)) throw new HttpError(400, `${field} must be HH:MM`);
  return s.length === 5 ? `${s}:00` : s;
}

/** 'YYYY-MM-DD' or throw. */
function assertDate(value: unknown, field: string): string {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `${field} must be YYYY-MM-DD`);
  return s;
}

/**
 * Normalise a schedule's shift list. `details` is jsonb that ends up inside a government filing,
 * so it is rebuilt field-by-field rather than stored as sent: day 0–6, HH:MM times, an optional
 * break, and a free-text note capped in length.
 */
function normalizeShifts(raw: unknown): any[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, 'details must be an array of shifts');
  if (raw.length > 62) throw new HttpError(400, 'too many shifts (max 62)');
  return raw.map((s: any, i: number) => {
    const day = Number(s?.day);
    if (!SHIFT_DAYS.includes(day)) throw new HttpError(400, `shift ${i + 1}: day must be 0 (Sunday) – 6 (Saturday)`);
    const off = !!s?.off;
    const shift: Record<string, unknown> = { day, off };
    if (!off) {
      shift.start = assertTime(s?.start, `shift ${i + 1} start`).slice(0, 5);
      shift.end = assertTime(s?.end, `shift ${i + 1} end`).slice(0, 5);
      if (s?.break_start || s?.break_end) {
        shift.break_start = assertTime(s?.break_start, `shift ${i + 1} break start`).slice(0, 5);
        shift.break_end = assertTime(s?.break_end, `shift ${i + 1} break end`).slice(0, 5);
      }
    }
    if (s?.date !== undefined && s?.date !== null && s?.date !== '') shift.date = assertDate(s.date, `shift ${i + 1} date`);
    if (s?.note) shift.note = String(s.note).slice(0, 200);
    return shift;
  });
}

/** Display name for a Flows payload. Best-effort — a missing name must never fail the write. */
function displayName(row: any): string {
  return row?.employee?.contact?.name || 'Employee';
}

/** voluntary → Ε5, termination → Ε6, expiry → Ε7. Carried on the event so a flow can branch on it. */
// Keyed by the vocabulary, not by `string` (#391): a new separation type then fails to
    // compile here instead of silently producing an undefined Ergani document code.
    const SEPARATION_CODES: Record<SeparationType, string> = { voluntary: 'E5', termination: 'E6', expiry: 'E7' };

/** A submitted filing is the government's copy — editing or deleting our record would desync it. */
function assertDraft(row: any, what: string): void {
  if (row?.status === 'submitted') {
    throw new HttpError(409, `This ${what} has been filed to Ergani and can no longer be changed. Cancel it in Ergani first.`);
  }
}

export async function handleLabour(action: string, ctx: Ctx): Promise<Response | null> {
  const { supabase, workspaceId, userId, body, access } = ctx;
  const requireManage = () => {
    if (!access.canManage) throw new HttpError(403, 'You need HR manage permission for this action.');
  };

  switch (action) {
    // ── Separations — Ε5 (voluntary) / Ε6 (termination) / Ε7 (fixed-term expiry) ──
    case 'list-separations': {
      let q = supabase
        .from('hr_separations').select(`*, ${EMPLOYEE_JOIN}`)
        .eq('workspace_id', workspaceId).order('effective_date', { ascending: false }).limit(500);
      if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ separations: data ?? [] });
    }

    case 'create-separation': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      await assertEmployee(ctx, employeeId);
      const payload = pick(body, SEPARATION_WRITABLE);
      if (!isSeparationType(String(payload.separation_type))) {
        return json({ error: `separation_type must be one of ${SEPARATION_TYPES.join(', ')}` }, 400);
      }
      payload.effective_date = assertDate(payload.effective_date, 'effective_date');
      if (payload.notice_date) payload.notice_date = assertDate(payload.notice_date, 'notice_date');
      const { data, error } = await supabase.from('hr_separations').insert({
        ...payload, workspace_id: workspaceId, employee_id: employeeId, created_by: userId,
      }).select(`*, ${EMPLOYEE_JOIN}`).single();
      if (error) throw new HttpError(400, error.message);

      // Flows — a departure is a lifecycle event payroll/finance need to see. Best-effort:
      // never block the write on notification delivery.
      try {
        const name = displayName(data);
        // Narrowed through the guard rather than indexed with a bare string: the map is
        // keyed by the vocabulary now, so an unknown value is answered here instead of
        // yielding `undefined` and an empty Ergani code.
        const sepType = String(data.separation_type);
        const code = isSeparationType(sepType) ? SEPARATION_CODES[sepType] : '';
        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'hr.departure_recorded',
          (recipientUserId) => ({
            user_id: recipientUserId, workspace_id: workspaceId, type: 'hr.departure_recorded',
            employee_id: employeeId, employee_name: name,
            separation_id: data.id, separation_type: data.separation_type, ergani_code: code,
            effective_date: data.effective_date, reason: data.reason ?? '',
            title: `Departure recorded: ${name}`,
            body: `${name} leaves on ${data.effective_date}. File the ${code || 'Ergani'} declaration when ready.`,
            action_url: '/hr?tab=separations',
          }), { excludeUserId: userId });
      } catch { /* best-effort */ }
      return json({ separation: data });
    }

    case 'update-separation': {
      requireManage();
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id is required' }, 400);
      const { data: existing } = await supabase
        .from('hr_separations').select('id, status').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!existing) return json({ error: 'separation not found' }, 404);
      assertDraft(existing, 'separation');
      const payload = pick(body, SEPARATION_WRITABLE);
      if (payload.separation_type !== undefined && !SEPARATION_TYPES.includes(String(payload.separation_type) as any)) {
        return json({ error: `separation_type must be one of ${SEPARATION_TYPES.join(', ')}` }, 400);
      }
      if (payload.effective_date !== undefined) payload.effective_date = assertDate(payload.effective_date, 'effective_date');
      if (payload.notice_date) payload.notice_date = assertDate(payload.notice_date, 'notice_date');
      const { data, error } = await supabase.from('hr_separations').update(payload)
        .eq('id', id).eq('workspace_id', workspaceId).select(`*, ${EMPLOYEE_JOIN}`).single();
      if (error) throw new HttpError(400, error.message);
      return json({ separation: data });
    }

    case 'delete-separation': {
      requireManage();
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id is required' }, 400);
      const { data: existing } = await supabase
        .from('hr_separations').select('id, status').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!existing) return json({ error: 'separation not found' }, 404);
      assertDraft(existing, 'separation');
      const { error } = await supabase.from('hr_separations').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    // ── Overtime — Ε8 ──────────────────────────────────────────────────────────
    // `hours` is a generated column; it is never accepted from the body and never written here.
    case 'list-overtime': {
      let q = supabase
        .from('hr_overtime').select(`*, ${EMPLOYEE_JOIN}`)
        .eq('workspace_id', workspaceId).order('work_date', { ascending: false }).limit(500);
      if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
      if (body?.from) q = q.gte('work_date', assertDate(body.from, 'from'));
      if (body?.to) q = q.lte('work_date', assertDate(body.to, 'to'));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ overtime: data ?? [] });
    }

    case 'create-overtime': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      await assertEmployee(ctx, employeeId);
      const payload = pick(body, OVERTIME_WRITABLE);
      payload.work_date = assertDate(payload.work_date, 'work_date');
      payload.start_time = assertTime(payload.start_time, 'start_time');
      payload.end_time = assertTime(payload.end_time, 'end_time');
      if (String(payload.end_time) <= String(payload.start_time)) {
        return json({ error: 'end_time must be after start_time (Ergani files overtime within one work date)' }, 400);
      }
      if (!String(payload.reason ?? '').trim()) return json({ error: 'reason is required — Ergani rejects an overtime declaration without a justification' }, 400);
      const { data, error } = await supabase.from('hr_overtime').insert({
        ...payload, workspace_id: workspaceId, employee_id: employeeId, created_by: userId,
      }).select(`*, ${EMPLOYEE_JOIN}`).single();
      if (error) throw new HttpError(400, error.message);

      // Flows — overtime is a cost and a statutory filing obligation. Best-effort.
      try {
        const name = displayName(data);
        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'hr.overtime_recorded',
          (recipientUserId) => ({
            user_id: recipientUserId, workspace_id: workspaceId, type: 'hr.overtime_recorded',
            employee_id: employeeId, employee_name: name,
            overtime_id: data.id, work_date: data.work_date, hours: data.hours,
            overtime_reason: data.reason ?? '',
            title: `Overtime logged: ${name}`,
            body: `${data.hours}h on ${data.work_date} — ${data.reason}. File it to Ergani as an Ε8.`,
            action_url: '/hr?tab=overtime',
          }), { excludeUserId: userId });
      } catch { /* best-effort */ }
      return json({ overtime: data });
    }

    case 'update-overtime': {
      requireManage();
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id is required' }, 400);
      const { data: existing } = await supabase
        .from('hr_overtime').select('id, status, start_time, end_time').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!existing) return json({ error: 'overtime entry not found' }, 404);
      assertDraft(existing, 'overtime entry');
      const payload = pick(body, OVERTIME_WRITABLE);
      if (payload.work_date !== undefined) payload.work_date = assertDate(payload.work_date, 'work_date');
      if (payload.start_time !== undefined) payload.start_time = assertTime(payload.start_time, 'start_time');
      if (payload.end_time !== undefined) payload.end_time = assertTime(payload.end_time, 'end_time');
      const start = String(payload.start_time ?? existing.start_time);
      const end = String(payload.end_time ?? existing.end_time);
      if (end <= start) return json({ error: 'end_time must be after start_time' }, 400);
      if (payload.reason !== undefined && !String(payload.reason).trim()) return json({ error: 'reason cannot be empty' }, 400);
      const { data, error } = await supabase.from('hr_overtime').update(payload)
        .eq('id', id).eq('workspace_id', workspaceId).select(`*, ${EMPLOYEE_JOIN}`).single();
      if (error) throw new HttpError(400, error.message);
      return json({ overtime: data });
    }

    case 'delete-overtime': {
      requireManage();
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id is required' }, 400);
      const { data: existing } = await supabase
        .from('hr_overtime').select('id, status').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!existing) return json({ error: 'overtime entry not found' }, 404);
      assertDraft(existing, 'overtime entry');
      const { error } = await supabase.from('hr_overtime').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    // ── Work schedules — Ε4 (WTOWeek / WTODaily) ───────────────────────────────
    case 'list-schedules': {
      let q = supabase
        .from('hr_work_schedules').select(`*, ${EMPLOYEE_JOIN}`)
        .eq('workspace_id', workspaceId).order('effective_from', { ascending: false }).limit(500);
      if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ schedules: data ?? [] });
    }

    case 'create-schedule': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      await assertEmployee(ctx, employeeId);
      const payload = pick(body, SCHEDULE_WRITABLE);
      if (!SCHEDULE_TYPES.includes(String(payload.schedule_type))) {
        return json({ error: "schedule_type must be 'weekly' or 'daily'" }, 400);
      }
      payload.effective_from = assertDate(payload.effective_from, 'effective_from');
      if (payload.effective_to) payload.effective_to = assertDate(payload.effective_to, 'effective_to');
      payload.details = normalizeShifts(payload.details);
      if (!(payload.details as any[]).length) return json({ error: 'add at least one shift' }, 400);
      const { data, error } = await supabase.from('hr_work_schedules').insert({
        ...payload, workspace_id: workspaceId, employee_id: employeeId, created_by: userId,
      }).select(`*, ${EMPLOYEE_JOIN}`).single();
      if (error) throw new HttpError(400, error.message);
      return json({ schedule: data });
    }

    case 'update-schedule': {
      requireManage();
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id is required' }, 400);
      const { data: existing } = await supabase
        .from('hr_work_schedules').select('id, status').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!existing) return json({ error: 'schedule not found' }, 404);
      assertDraft(existing, 'schedule');
      const payload = pick(body, SCHEDULE_WRITABLE);
      if (payload.schedule_type !== undefined && !SCHEDULE_TYPES.includes(String(payload.schedule_type))) {
        return json({ error: "schedule_type must be 'weekly' or 'daily'" }, 400);
      }
      if (payload.effective_from !== undefined) payload.effective_from = assertDate(payload.effective_from, 'effective_from');
      if (payload.effective_to) payload.effective_to = assertDate(payload.effective_to, 'effective_to');
      if (payload.details !== undefined) payload.details = normalizeShifts(payload.details);
      payload.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('hr_work_schedules').update(payload)
        .eq('id', id).eq('workspace_id', workspaceId).select(`*, ${EMPLOYEE_JOIN}`).single();
      if (error) throw new HttpError(400, error.message);
      return json({ schedule: data });
    }

    case 'delete-schedule': {
      requireManage();
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id is required' }, 400);
      const { data: existing } = await supabase
        .from('hr_work_schedules').select('id, status').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!existing) return json({ error: 'schedule not found' }, 404);
      assertDraft(existing, 'schedule');
      const { error } = await supabase.from('hr_work_schedules').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    default:
      return null;
  }
}
