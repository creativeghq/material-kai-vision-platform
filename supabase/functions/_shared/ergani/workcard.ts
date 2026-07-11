// Shared Work Card punch logic — records an arrival/departure punch and (when the workspace has
// Ergani configured) files it as WRKCardSE. Extracted to _shared so BOTH the authenticated hr-api
// (admin action + employee self-service) and the PUBLIC hr-kiosk function use one implementation.
//
// The punch row is ALWAYS written (works as internal attendance even before Ergani is set up):
//   - Ergani configured + employee has VAT → filed, punch.status='submitted' + protocol.
//   - otherwise → punch.status='pending', filed=false, `reason` explains why.
// opts.requireErgani (admin explicitly clicked "file") makes a missing config / VAT / Ergani error
// throw instead of degrading to a local-only punch.

import { HttpError } from '../api-logger.ts';
import { resolveErganiCredentials, submitDocument, ErganiApiError } from './client.ts';

export type PunchSource = 'self' | 'kiosk' | 'admin' | 'api';
export interface WorkcardArgs {
  employeeId: string;
  punchType: 'arrival' | 'departure';
  at?: string;           // ISO instant; defaults to now
  comments?: string;
  lateReason?: string;
  source?: PunchSource;  // provenance, default 'self'
}
export interface WorkcardResult {
  punch: any; filed: boolean; result?: { id: string; protocol: string; submitDate: string };
  reason?: string; isLate?: boolean;
}

/** Wall-clock minutes since midnight for an instant, in a given IANA timezone. */
function minutesInTz(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}
/** Local calendar date (YYYY-MM-DD) for an instant, in a given IANA timezone. */
function dateInTz(d: Date, tz: string): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** 'HH:MM[:SS]' → minutes since midnight, or null. */
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function toHttp(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof ErganiApiError) return new HttpError(e.status >= 400 && e.status < 500 ? 400 : 502, e.message);
  return new HttpError(502, (e as Error)?.message || 'Ergani request failed');
}

async function auditWorkcard(supabase: any, workspaceId: string, userId: string | null, row: {
  entity_id?: string | null; employee_id: string; environment: string;
  status: 'submitted' | 'failed'; protocol?: string | null; ergani_id?: string | null;
  submit_date?: string | null; request?: unknown; response?: unknown; error?: string | null;
}): Promise<void> {
  try {
    await supabase.from('hr_ergani_submissions').insert({
      workspace_id: workspaceId, submission_type: 'WRKCardSE', entity_type: 'punch',
      entity_id: row.entity_id ?? null, employee_id: row.employee_id, environment: row.environment,
      status: row.status, protocol: row.protocol ?? null, ergani_id: row.ergani_id ?? null,
      submit_date: row.submit_date ?? null, request: row.request ?? null, response: row.response ?? null,
      error: row.error ?? null, created_by: userId,
    });
  } catch (_e) { /* audit must never mask the real result */ }
}

export async function fileWorkcardPunch(
  supabase: any, workspaceId: string, userId: string | null, args: WorkcardArgs, opts: { requireErgani: boolean },
): Promise<WorkcardResult> {
  const { data: e } = await supabase
    .from('hr_employees')
    .select('id, work_start_time, work_days, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name, vat_number )')
    .eq('id', args.employeeId).eq('workspace_id', workspaceId).maybeSingle();
  if (!e) throw new HttpError(404, 'employee not found in this workspace');
  const afm: string | null = e.contact?.vat_number ?? null;
  const name: string = e.contact?.name ?? '';

  const { data: settings } = await supabase
    .from('hr_settings').select('timezone, late_grace_minutes').eq('workspace_id', workspaceId).maybeSingle();
  const tz: string = settings?.timezone || 'Europe/Athens';
  const grace: number = settings?.late_grace_minutes ?? 15;

  const eventAt = args.at ? new Date(String(args.at)) : new Date();
  const referenceDate = dateInTz(eventAt, tz);

  // Debounce: ignore an identical punch type for the same employee within 60s (double-taps / spam).
  const { data: recent } = await supabase.from('hr_time_punches')
    .select('id, punch_type, punched_at, status, is_late')
    .eq('workspace_id', workspaceId).eq('employee_id', args.employeeId)
    .order('punched_at', { ascending: false }).limit(1).maybeSingle();
  if (recent && recent.punch_type === args.punchType && (eventAt.getTime() - new Date(recent.punched_at).getTime()) < 60_000) {
    return { punch: recent, filed: false, reason: 'debounced', isLate: recent.is_late ?? undefined };
  }

  // Lateness (arrival only): actual wall-clock vs expected start + grace.
  let isLate: boolean | null = null;
  if (args.punchType === 'arrival') {
    const expected = timeToMinutes(e.work_start_time ?? null);
    if (expected != null) isLate = minutesInTz(eventAt, tz) > expected + grace;
  }

  const creds = await resolveErganiCredentials(supabase, workspaceId);
  if (opts.requireErgani) {
    if (!creds) throw new HttpError(400, 'ergani_not_configured: add your Ergani credentials in Profile → Keys first.');
    if (!creds.employerAfm) throw new HttpError(400, 'employer_afm is not set in your Ergani credentials.');
    if (!afm) throw new HttpError(400, 'Employee has no VAT number (set the contact VAT number first).');
  }

  const insertPunch = async (status: string, protocol?: string | null) => {
    const { data } = await supabase.from('hr_time_punches').insert({
      workspace_id: workspaceId, employee_id: args.employeeId, punch_type: args.punchType,
      reference_date: referenceDate, punched_at: eventAt.toISOString(),
      late_reason: args.lateReason ?? null, status, ergani_protocol: protocol ?? null,
      source: args.source ?? 'self', is_late: isLate, created_by: userId,
    }).select('*').single();
    return data;
  };

  const canFile = !!(creds && creds.employerAfm && afm);
  if (!canFile) {
    const punch = await insertPunch('pending');
    const reason = !creds ? 'ergani_not_configured' : !creds.employerAfm ? 'missing_employer_afm' : 'missing_employee_afm';
    return { punch, filed: false, reason, isLate: isLate ?? undefined };
  }

  const [lastName, ...rest] = name.split(' ');
  const payload = {
    Cards: { Card: [{
      f_afm_ergodoti: creds!.employerAfm, f_aa: creds!.branchAa, f_comments: args.comments ?? '',
      Details: { CardDetails: [{
        f_afm: afm, f_eponymo: lastName || name, f_onoma: rest.join(' '),
        f_type: args.punchType === 'arrival' ? '0' : '1',
        f_reference_date: referenceDate, f_date: eventAt.toISOString(),
        f_aitiologia: args.lateReason ?? null,
      }] },
    }] },
  };
  try {
    const res = await submitDocument(creds!, workspaceId, 'WRKCardSE', payload);
    const punch = await insertPunch('submitted', res.protocol);
    await auditWorkcard(supabase, workspaceId, userId, {
      entity_id: punch?.id ?? null, employee_id: args.employeeId, environment: creds!.environment,
      status: 'submitted', protocol: res.protocol, ergani_id: res.id, submit_date: res.submitDate, request: payload, response: res,
    });
    return { punch, filed: true, result: res, isLate: isLate ?? undefined };
  } catch (err) {
    const he = toHttp(err);
    const punch = await insertPunch('failed');
    await auditWorkcard(supabase, workspaceId, userId, {
      entity_id: punch?.id ?? null, employee_id: args.employeeId, environment: creds!.environment,
      status: 'failed', request: payload, error: he.message,
    });
    if (opts.requireErgani) throw he;
    return { punch, filed: false, reason: he.message, isLate: isLate ?? undefined };
  }
}
