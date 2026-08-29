// deno-lint-ignore-file no-explicit-any
// Ergani II (Ergani) integration actions for the HR module. Dispatched from index.ts
// after the caller is bound to the workspace + entitlement + hr.view. Every submission requires
// hr.manage. All calls run under the workspace's OWN Ergani credentials (workspace_ergani_credentials).
// Coverage vs the API guide (§6):
//  • Work Card (WRKCardSE) — fully modelled (the guide documents its exact JSON schema).
//  • Backbone — submissions list, live document schema, cancel, PDF download, employer info (EX_BASE_01),
//    audit log — all documented and implemented.
//  • Leaves / Ε3 / Ε4 / Ε5 / Ε6 / Ε7 / Ε8 — the guide does NOT include their JSON field schemas
//    (they ship in Ergani's HELP_FILES_SAMPLES.zip and vary per employer). We never fabricate field
//    names: each of these fetches the employer's OWN live template (Documents/{code} GET) and fills
//    only the fields whose key names match documented Ergani conventions (_shared/ergani/document.ts).
//    Every one supports `preview: true`, which returns the built document plus the list of keys we
//    could NOT fill, so the operator reviews and completes it before anything reaches the Ministry.
//    A caller MAY pass `document` back on submit to complete those keys — but only those: the
//    document is always rebuilt server-side from the loaded employee/absence/separation, and the
//    supplied one is overlaid ONLY onto keys we could not fill (#354 HR-1). Identity, salary and
//    dates come from the database, so what is filed and what the audit row says cannot diverge.
import { corsHeaders } from '../_shared/cors.ts';
import { assertSameWorkspace } from '../_shared/same-workspace.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { HttpError } from '../_shared/api-logger.ts';
import {
  resolveErganiCredentials, listSubmissions, getDocumentSchema, submitDocument,
  getSubmittedPdf, executeService, cancelDocument, ErganiApiError, type ErganiCredentials,
} from '../_shared/ergani/client.ts';
import { fileWorkcardPunch, toHttp } from '../_shared/ergani/workcard.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { buildErganiDocument, mergeUnfilledKeys, splitName, toErganiTime, type ErganiValues } from '../_shared/ergani/document.ts';

export interface ErganiCtx {
  supabase: any;
  workspaceId: string;
  userId: string;
  body: any;
  access: { canView: boolean; canManage: boolean };
}


/** Resolve the workspace's Ergani credentials or fail with a clear "not configured". */
async function client(ctx: ErganiCtx): Promise<ErganiCredentials> {
  const creds = await resolveErganiCredentials(ctx.supabase, ctx.workspaceId);
  if (!creds) throw new HttpError(400, 'ergani_not_configured: add your Ergani credentials in Profile → Keys first.');
  return creds;
}

interface AuditRow {
  submission_type: string; entity_type?: string | null; entity_id?: string | null; employee_id?: string | null;
  environment: string; status: 'submitted' | 'failed' | 'cancelled';
  protocol?: string | null; ergani_id?: string | null; submit_date?: string | null;
  request?: unknown; response?: unknown; error?: string | null;
}

/** Write one row to the submission audit log. Never throws (audit must not mask the real result). */
async function recordAudit(supabase: any, workspaceId: string, userId: string, row: AuditRow): Promise<string | null> {
  try {
    const { data } = await supabase.from('hr_ergani_submissions').insert({
      workspace_id: workspaceId,
      submission_type: row.submission_type,
      entity_type: row.entity_type ?? null,
      entity_id: row.entity_id ?? null,
      employee_id: row.employee_id ?? null,
      environment: row.environment,
      status: row.status,
      protocol: row.protocol ?? null,
      ergani_id: row.ergani_id ?? null,
      submit_date: row.submit_date ?? null,
      request: row.request ?? null,
      response: row.response ?? null,
      error: row.error ?? null,
      created_by: userId,
    }).select('id').single();

    // Flows — a REJECTED statutory filing. Until this existed the failure only ever landed in
    // this table, so nobody was told an Ε3/Ε4/Ε8 never reached the ministry. Scoped to the
    // documents an operator files deliberately: work-card punches audit through workcard.ts and
    // fail transiently by the dozen, so notifying on those would be noise, not signal.
    if (row.status === 'failed') {
      try {
        let name = '';
        if (row.employee_id) {
          const { data: emp } = await supabase
            .from('hr_employees')
            .select('contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name )')
            .eq('id', row.employee_id).eq('workspace_id', workspaceId).maybeSingle();
          name = (emp as any)?.contact?.name ?? '';
        }
        const who = name ? ` for ${name}` : '';
        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'hr.ergani_filing_failed',
          (recipientUserId) => ({
            user_id: recipientUserId, workspace_id: workspaceId, type: 'hr.ergani_filing_failed',
            submission_type: row.submission_type, entity_type: row.entity_type ?? '',
            entity_id: row.entity_id ?? '', employee_id: row.employee_id ?? '', employee_name: name,
            environment: row.environment, error: row.error ?? '',
            title: `Ergani rejected ${row.submission_type}${who}`,
            body: `${row.error ?? 'The submission was rejected.'} Nothing was filed — fix it and re-submit from the Ergani tab.`,
            action_url: '/hr?tab=ergani',
          }));
      } catch { /* best-effort — the audit row is the record of truth, not the notification */ }
    }
    return data?.id ?? null;
  } catch (_e) { return null; }
}
const audit = (ctx: ErganiCtx, row: AuditRow) => recordAudit(ctx.supabase, ctx.workspaceId, ctx.userId, row);

/**
 * Refuse a second filing of the same document for the same record (#354 HR-2 / HR-3).
 *
 * Three of the six filing paths had no duplicate guard at all — hire, leave and the generic
 * submit — while separation, overtime and schedule checked their own `status === 'submitted'`
 * column. That column is the weaker check anyway: it is written AFTER the ministry accepts the
 * filing, and that write can fail, leaving a document filed under protocol P123 and a local row
 * still reading `draft` for the next operator to file again.
 *
 * `hr_ergani_submissions` is written as part of the success path, so it is what the guard reads.
 * A cancelled submission does not block — that is what `ergani-cancel` is for.
 */
async function assertNotAlreadyFiled(
  ctx: ErganiCtx, code: string, entityType: string, entityId: string | null,
): Promise<void> {
  if (!entityId) return;
  const { data } = await ctx.supabase
    .from('hr_ergani_submissions')
    .select('protocol, submit_date')
    .eq('workspace_id', ctx.workspaceId)
    .eq('submission_type', code)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'submitted')
    .limit(1)
    .maybeSingle();
  if (data) {
    throw new HttpError(
      409,
      `already_filed: this ${entityType} was filed to Ergani as ${code}` +
      `${data.protocol ? ` under protocol ${data.protocol}` : ''}` +
      `${data.submit_date ? ` on ${data.submit_date}` : ''}. ` +
      'Cancel that submission before filing it again.',
    );
  }
}

/**
 * A local write that follows a SUCCESSFUL ministry filing (#354 HR-2).
 *
 * These were all unchecked. The filing cannot be undone, so a failure here must not be reported as
 * a failure — the operator would re-file. It must not be reported as a plain success either, which
 * is what happened: `{ ok: true }` while the row stayed `draft`. So the failure is recorded on the
 * audit row (which already holds the protocol) and returned to the caller as `local_write_failed`.
 * The duplicate guard reads that same audit row, so the stale local status cannot cause a second
 * filing either way.
 */
async function stampAfterFiling(
  ctx: ErganiCtx, auditId: string | null, what: string,
  write: () => PromiseLike<{ error: unknown }>,
): Promise<string | null> {
  let message: string | null = null;
  try {
    const { error } = await write();
    if (error) message = (error as any)?.message ?? String(error);
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  if (!message) return null;
  const note = `filed_but_not_recorded: ${what}: ${message}`;
  console.error('[ergani]', note, { workspace: ctx.workspaceId, audit: auditId });
  if (auditId) {
    try {
      // The failure is NOT invisible: console.error above has already recorded it, and `note` is
      // returned so the caller dresses the response as a partial success. This update is the THIRD
      // place the same fact is written; if it is the one that fails, the other two still say the
      // document was filed but not recorded.
      // nosemgrep: no-swallowed-write
      await ctx.supabase.from('hr_ergani_submissions')
        .update({ error: note }).eq('id', auditId).eq('workspace_id', ctx.workspaceId);
    } catch { /* the console line and the response are the remaining record */ }
  }
  return note;
}

/** The shape every filing route returns, so a partial success is never dressed as a clean one. */
function filedResponse(
  out: { result: { id: string; protocol: string; submitDate: string }; auditId: string | null },
  localErrors: (string | null)[],
  extra: Record<string, unknown> = {},
): Response {
  const problems = localErrors.filter(Boolean) as string[];
  if (!problems.length && out.auditId) return json({ ok: true, result: out.result, ...extra });
  return json({
    ok: true,
    result: out.result,
    ...extra,
    local_write_failed: true,
    warning: (out.auditId ? [] : ['The submission audit row could not be written.'])
      .concat(problems)
      .concat([`The filing DID reach Ergani${out.result.protocol ? ` (protocol ${out.result.protocol})` : ''} — do not file it again.`])
      .join(' '),
  });
}

interface LoadedEmployee {
  id: string; amka: string | null; afm: string | null; name: string;
  firstName: string; lastName: string; birthDate: string | null; specialty: string | null;
  startDate: string | null; employmentType: string | null;
  weeklyHours: number | null; monthlySalary: number | null;
  /** Per-employee exact template-key overrides (Ergani codes we cannot derive). */
  overrides: Record<string, unknown>;
}

/** Load an employee (+ contact identity) scoped to the workspace, or throw 404. */
async function loadEmployee(ctx: ErganiCtx, employeeId: string): Promise<LoadedEmployee> {
  const { data } = await ctx.supabase
    .from('hr_employees')
    .select(`id, amka, start_date, employment_type, weekly_hours, monthly_salary, ergani_e3,
      contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name, first_name, last_name, vat_number, date_of_birth, position )`)
    .eq('id', employeeId).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'employee not found in this workspace');
  const name = data.contact?.name ?? '';
  const [splitLast, splitFirst] = splitName(name);
  const e3 = data.ergani_e3;
  return {
    id: data.id,
    amka: data.amka ?? null,
    afm: data.contact?.vat_number ?? null,
    name,
    // Prefer the structured contact fields; fall back to splitting the display name, which is what
    // the work-card path does.
    lastName: data.contact?.last_name || splitLast,
    firstName: data.contact?.first_name || splitFirst,
    birthDate: data.contact?.date_of_birth ?? null,
    specialty: data.contact?.position ?? null,
    startDate: data.start_date ?? null,
    employmentType: data.employment_type ?? null,
    weeklyHours: data.weekly_hours == null ? null : Number(data.weekly_hours),
    monthlySalary: data.monthly_salary == null ? null : Number(data.monthly_salary),
    overrides: e3 && typeof e3 === 'object' && !Array.isArray(e3) ? e3 as Record<string, unknown> : {},
  };
}

/** The person-identity slots every Ε-document shares. */
function personValues(emp: LoadedEmployee): ErganiValues {
  return {
    afm: emp.afm, amka: emp.amka, lastName: emp.lastName, firstName: emp.firstName,
    birthDate: emp.birthDate, overrides: emp.overrides,
  };
}

/** Every filing needs a VAT on both sides — fail with the specific missing one. */
function assertIdentity(creds: ErganiCredentials, emp: LoadedEmployee): void {
  if (!creds.employerAfm) throw new HttpError(400, 'employer_afm is not set in your Ergani credentials.');
  if (!emp.afm) throw new HttpError(400, `${emp.name || 'This employee'} has no VAT number (set the contact VAT number first).`);
}

/** Resolve the active submission code for a logical kind from Ergani's Lookup/Submissions. */
async function resolveCode(creds: ErganiCredentials, ws: string, kind: string): Promise<string> {
  const known: Record<string, string> = {
    workcard: 'WRKCardSE', schedule_weekly: 'WTOWeek', schedule_daily: 'WTODaily', e3: 'E3', change: 'WKChgWK',
  };
  if (known[kind]) return known[kind];
  // Leaves: the code isn't fixed in the guide — resolve it by description from the live list.
  const subs = await listSubmissions(creds, ws);
  if (kind === 'leave') {
    const hit = subs.find((s) => /άδει/i.test(s.description) || /leave/i.test(s.description));
    if (hit) return hit.code;
    throw new HttpError(400, 'Could not find an active Leave submission type for this employer in Ergani.');
  }
  throw new HttpError(400, `Unknown submission kind: ${kind}`);
}

/**
 * One filing: build the document from Ergani's live template, then either return it for operator
 * review (`preview: true`) or POST it and audit the outcome.
 *
 * The preview step is not a nicety. We can only fill template fields whose key names match
 * documented Ergani conventions; the rest come back in `unfilled` for a human to complete.
 * Submitting a partially-recognised government document unseen is the failure mode it avoids.
 * A caller may also pass a fully-built `document`, which bypasses the builder entirely.
 */
interface FilingSpec {
  code: string;
  header: ErganiValues;
  rows: ErganiValues[];
  entityType: string;
  entityId: string | null;
  employeeId: string | null;
}
type FilingOutcome =
  | { kind: 'preview'; response: Response }
  | {
      kind: 'submitted';
      result: { id: string; protocol: string; submitDate: string };
      document: unknown;
      /** null = the filing happened and the audit row did NOT — see `fileDocument`. */
      auditId: string | null;
    };

async function fileDocument(ctx: ErganiCtx, creds: ErganiCredentials, spec: FilingSpec): Promise<FilingOutcome> {
  const preview = ctx.body?.preview === true;

  /**
   * ALWAYS built from `spec` (#354 HR-1).
   *
   * `spec` is loaded from this workspace's own rows; a caller-supplied `document` used to replace
   * it wholesale, so the ΑΦΜ, ΑΜΚΑ and salary that reached the Ministry came from the request body
   * while `hr_ergani_submissions` recorded the employee named by `employee_id`. The completion
   * workflow is preserved — see `mergeUnfilledKeys` — but the identity and the money are the
   * database's, not the caller's.
   */
  let template: any;
  try { template = await getDocumentSchema(creds, ctx.workspaceId, spec.code); }
  catch (e) { throw toHttp(e); }
  const built = buildErganiDocument(template, spec.header, spec.rows);
  let document: unknown = built.document;
  const filled = built.filled;
  const unfilled = built.unfilled;
  let applied: string[] = [];
  let ignored: string[] = [];

  const supplied = ctx.body?.document;
  if (supplied !== undefined && supplied !== null) {
    const merged = mergeUnfilledKeys(built.document, supplied, unfilled);
    document = merged.document; applied = merged.applied; ignored = merged.ignored;
  }

  if (preview) {
    return { kind: 'preview', response: json({ preview: true, code: spec.code, document, filled, unfilled, applied, ignored }) };
  }

  try {
    const result = await submitDocument(creds, ctx.workspaceId, spec.code, document);
    // The audit row IS the record that this was filed — including for the duplicate guard, which
    // reads it rather than the local status column precisely because that column's write can fail
    // after a successful filing (#354 HR-2/HR-3). A null id means we filed and did not record it.
    const auditId = await audit(ctx, {
      submission_type: spec.code, entity_type: spec.entityType, entity_id: spec.entityId,
      employee_id: spec.employeeId, environment: creds.environment, status: 'submitted',
      protocol: result.protocol, ergani_id: result.id, submit_date: result.submitDate,
      request: document, response: result,
    });
    if (!auditId) {
      console.error('[ergani] FILED BUT NOT AUDITED', {
        workspace: ctx.workspaceId, code: spec.code, protocol: result.protocol,
        entity: `${spec.entityType}:${spec.entityId ?? ''}`,
      });
    }
    return { kind: 'submitted', result, document, auditId };
  } catch (e) {
    const he = toHttp(e);
    await audit(ctx, {
      submission_type: spec.code, entity_type: spec.entityType, entity_id: spec.entityId,
      employee_id: spec.employeeId, environment: creds.environment, status: 'failed',
      request: document, error: he.message,
    });
    throw he;
  }
}

/** Ε5 / Ε6 / Ε7 are one document each — the separation kind IS the document code. */
const SEPARATION_CODES: Record<string, string> = { voluntary: 'E5', termination: 'E6', expiry: 'E7' };

/**
 * The concrete calendar date a weekly shift falls on: the first `day` (0=Sun … 6=Sat) on or after
 * the schedule's effective_from. A weekly roster is stored as weekday + times, but every date-shaped
 * field in an Ergani template expects a real date, so we resolve it here rather than filing a 0–6 index.
 */
function shiftDate(effectiveFrom: string, day: number): string {
  const base = new Date(`${effectiveFrom}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return effectiveFrom;
  base.setUTCDate(base.getUTCDate() + ((day - base.getUTCDay() + 7) % 7));
  return base.toISOString().slice(0, 10);
}

/**
 * Handle an ergani-* action. Returns a Response, or null if the action isn't ours.
 */
export async function handleErgani(action: string, ctx: ErganiCtx): Promise<Response | null> {
  if (!action.startsWith('ergani-')) return null;
  const { supabase, workspaceId, body, access } = ctx;
  const requireManage = () => { if (!access.canManage) throw new HttpError(403, 'You need HR manage permission for this action.'); };

  switch (action) {
    // ── Config status (masked; never returns the password) ────────────────────
    // ── Live: active submission types for this employer (§6.1.4) ───────────────
    case 'ergani-submission-types': {
      const creds = await client(ctx);
      try { return json({ submission_types: await listSubmissions(creds, workspaceId) }); }
      catch (e) { throw toHttp(e); }
    }

    // ── Live: JSON schema template for a submission code (§6.1.5) ──────────────
    case 'ergani-document-schema': {
      const code = String(body?.code ?? '').trim();
      if (!code) return json({ error: 'code is required' }, 400);
      const creds = await client(ctx);
      try { return json({ code, schema: await getDocumentSchema(creds, workspaceId, code) }); }
      catch (e) { throw toHttp(e); }
    }

    // ── Live: employer registry info EX_BASE_01 (§6.1.10) ─────────────────────
    case 'ergani-employer-info': {
      const creds = await client(ctx);
      try { return json({ info: await executeService(creds, workspaceId, 'EX_BASE_01', []) }); }
      catch (e) { throw toHttp(e); }
    }

    // ── Leave declaration mapped from an hr_absences row ──────────────────────
    case 'ergani-submit-leave': {
      requireManage();
      const absenceId = String(body?.absence_id ?? '');
      if (!absenceId) return json({ error: 'absence_id is required' }, 400);
      const { data: abs } = await supabase
        .from('hr_absences').select('*').eq('id', absenceId).eq('workspace_id', workspaceId).maybeSingle();
      if (!abs) return json({ error: 'absence not found in this workspace' }, 404);

      const leaveCode = String(body?.ergani_leave_code ?? abs.ergani_leave_code ?? '').trim();
      if (!leaveCode) return json({ error: 'ergani_leave_code is required (pick the Ergani leave type).' }, 400);
      const emp = await loadEmployee(ctx, abs.employee_id);
      const creds = await client(ctx);
      assertIdentity(creds, emp);
      const code = await resolveCode(creds, workspaceId, 'leave');
      // #354 HR-3 — leave had no duplicate guard at all: it wrote back `ergani_leave_code` and
      // never a submitted state, so nothing stopped the same absence being declared twice.
      if (body?.preview !== true) await assertNotAlreadyFiled(ctx, code, 'absence', absenceId);
      const note = abs.note ? String(abs.note) : '';

      const out = await fileDocument(ctx, creds, {
        code, entityType: 'absence', entityId: absenceId, employeeId: abs.employee_id,
        header: { employerAfm: creds.employerAfm, branchAa: creds.branchAa, comments: note },
        rows: [{
          ...personValues(emp), code: leaveCode, reason: note,
          startDate: abs.start_date, endDate: abs.end_date, date: abs.start_date,
        }],
      });
      if (out.kind === 'preview') return out.response;
      const leaveStamp = await stampAfterFiling(ctx, out.auditId, 'hr_absences.ergani_leave_code', () =>
        supabase.from('hr_absences').update({ ergani_leave_code: leaveCode })
          .eq('id', absenceId).eq('workspace_id', workspaceId));
      return filedResponse(out, [leaveStamp]);
    }

    // ── Ε3 — hire announcement, prefilled from the employee record ────────────
    // The Ergani-specific codes we cannot derive (ΣΤΕΠ specialty code, contract-type code,
    // collective agreement…) come from hr_employees.ergani_e3, an exact template-key → value map
    // the operator fills once per employee off the `unfilled` list of a preview.
    case 'ergani-submit-hire': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      const emp = await loadEmployee(ctx, employeeId);
      if (!emp.startDate) return json({ error: 'Set the employee’s start date before filing the Ε3 hire announcement.' }, 400);
      const creds = await client(ctx);
      assertIdentity(creds, emp);
      // #354 HR-3 — the Ε3 hire path had no prior-submission check, so a double-click (HR-8) or a
      // retry filed two hire announcements for one employee.
      if (body?.preview !== true) await assertNotAlreadyFiled(ctx, 'E3', 'employee', employeeId);
      const comments = String(body?.comments ?? '');

      const out = await fileDocument(ctx, creds, {
        code: 'E3', entityType: 'employee', entityId: employeeId, employeeId,
        header: { employerAfm: creds.employerAfm, branchAa: creds.branchAa, comments },
        rows: [{
          ...personValues(emp), specialty: emp.specialty, contractType: emp.employmentType,
          salary: emp.monthlySalary, weeklyHours: emp.weeklyHours,
          startDate: emp.startDate, date: emp.startDate, comments,
        }],
      });
      if (out.kind === 'preview') return out.response;
      return filedResponse(out, []);
    }

    // ── Ε5 / Ε6 / Ε7 — voluntary departure / termination / fixed-term expiry ──
    case 'ergani-submit-separation': {
      requireManage();
      const separationId = String(body?.separation_id ?? '');
      if (!separationId) return json({ error: 'separation_id is required' }, 400);
      const { data: sep } = await supabase
        .from('hr_separations').select('*').eq('id', separationId).eq('workspace_id', workspaceId).maybeSingle();
      if (!sep) return json({ error: 'separation not found in this workspace' }, 404);
      if (sep.status === 'submitted') return json({ error: 'This separation has already been filed to Ergani.' }, 409);
      const code = SEPARATION_CODES[String(sep.separation_type)];
      if (!code) return json({ error: `Unknown separation type: ${sep.separation_type}` }, 400);

      const emp = await loadEmployee(ctx, sep.employee_id);
      const creds = await client(ctx);
      assertIdentity(creds, emp);
      // The row's own status is checked above; this catches the case that status write FAILED
      // after a successful filing (#354 HR-2), which leaves it reading `draft` forever.
      if (body?.preview !== true) await assertNotAlreadyFiled(ctx, code, 'separation', separationId);
      const note = sep.note ? String(sep.note) : '';

      const out = await fileDocument(ctx, creds, {
        code, entityType: 'separation', entityId: separationId, employeeId: sep.employee_id,
        header: { employerAfm: creds.employerAfm, branchAa: creds.branchAa, comments: note },
        rows: [{
          ...personValues(emp), specialty: emp.specialty, contractType: emp.employmentType,
          reason: sep.reason ?? null, amount: sep.severance_amount ?? null,
          // The employment window: it started at the hire date and ends on the separation date.
          startDate: emp.startDate, endDate: sep.effective_date, date: sep.effective_date,
          comments: note,
        }],
      });
      if (out.kind === 'preview') return out.response;

      const sepStamp = await stampAfterFiling(ctx, out.auditId, 'hr_separations.status', () =>
        supabase.from('hr_separations')
          .update({ status: 'submitted', ergani_protocol: out.result.protocol })
          .eq('id', separationId).eq('workspace_id', workspaceId));
      // The filing is the moment the departure becomes official — reflect it on the employee.
      const empStamp = await stampAfterFiling(ctx, out.auditId, 'hr_employees.status', () =>
        supabase.from('hr_employees')
          .update({ status: 'terminated', end_date: sep.effective_date })
          .eq('id', sep.employee_id).eq('workspace_id', workspaceId));
      return filedResponse(out, [sepStamp, empStamp]);
    }

    // ── Ε8 — overtime. One filing may carry several entries (Ergani batches them). ──
    case 'ergani-submit-overtime': {
      requireManage();
      const requested: string[] = Array.isArray(body?.overtime_ids)
        ? body.overtime_ids.map((v: unknown) => String(v))
        : body?.overtime_id ? [String(body.overtime_id)] : [];
      const ids: string[] = [...new Set<string>(requested)];
      if (!ids.length) return json({ error: 'overtime_id or overtime_ids is required' }, 400);
      if (ids.length > 100) return json({ error: 'file at most 100 overtime entries at a time' }, 400);

      const { data: entries } = await supabase
        .from('hr_overtime').select('*').eq('workspace_id', workspaceId).in('id', ids);
      if (!entries?.length) return json({ error: 'overtime entries not found in this workspace' }, 404);
      if (entries.length !== ids.length) return json({ error: 'one or more overtime entries were not found in this workspace' }, 404);
      const already = entries.find((e: any) => e.status === 'submitted');
      if (already) return json({ error: 'One of the selected entries has already been filed to Ergani.' }, 409);
      if (body?.preview !== true) {
        // Same reason as the separation path: a failed status write leaves `draft` behind (#354 HR-2).
        for (const id of ids) await assertNotAlreadyFiled(ctx, 'E8', 'overtime', id);
      }

      const creds = await client(ctx);
      // Distinct employees only — load each once even when an employee has several blocks.
      const employees = new Map<string, LoadedEmployee>();
      for (const id of [...new Set<string>(entries.map((e: any) => String(e.employee_id)))]) {
        const emp = await loadEmployee(ctx, id);
        assertIdentity(creds, emp);
        employees.set(id, emp);
      }

      const rows: ErganiValues[] = entries.map((e: any) => {
        const emp = employees.get(String(e.employee_id))!;
        return {
          ...personValues(emp), specialty: emp.specialty,
          date: e.work_date, startDate: e.work_date,
          startTime: toErganiTime(e.start_time), endTime: toErganiTime(e.end_time),
          hours: e.hours, reason: e.reason, comments: e.note ?? '',
        };
      });

      const out = await fileDocument(ctx, creds, {
        code: 'E8', entityType: 'overtime',
        entityId: entries.length === 1 ? String(entries[0].id) : null,
        employeeId: employees.size === 1 ? String(entries[0].employee_id) : null,
        header: { employerAfm: creds.employerAfm, branchAa: creds.branchAa, comments: String(body?.comments ?? '') },
        rows,
      });
      if (out.kind === 'preview') return out.response;

      const otStamp = await stampAfterFiling(ctx, out.auditId, 'hr_overtime.status', () =>
        supabase.from('hr_overtime')
          .update({ status: 'submitted', ergani_protocol: out.result.protocol })
          .eq('workspace_id', workspaceId).in('id', ids));
      return filedResponse(out, [otStamp], { filed: ids.length });
    }

    // ── Ε4 — work-time schedule (WTOWeek / WTODaily), or a change (WKChgWK) ───
    case 'ergani-submit-schedule': {
      requireManage();
      const scheduleId = String(body?.schedule_id ?? '');
      if (!scheduleId) return json({ error: 'schedule_id is required' }, 400);
      const { data: sched } = await supabase
        .from('hr_work_schedules').select('*').eq('id', scheduleId).eq('workspace_id', workspaceId).maybeSingle();
      if (!sched) return json({ error: 'schedule not found in this workspace' }, 404);
      if (sched.status === 'submitted') return json({ error: 'This schedule has already been filed to Ergani.' }, 409);

      // 'change' files the amendment document (WKChgWK) for a roster that already exists at Ergani.
      const kind = String(body?.kind ?? (sched.schedule_type === 'daily' ? 'schedule_daily' : 'schedule_weekly'));
      if (!['schedule_weekly', 'schedule_daily', 'change'].includes(kind)) {
        return json({ error: "kind must be 'schedule_weekly', 'schedule_daily' or 'change'" }, 400);
      }
      const emp = await loadEmployee(ctx, sched.employee_id);
      const creds = await client(ctx);
      assertIdentity(creds, emp);
      const code = await resolveCode(creds, workspaceId, kind);
      if (body?.preview !== true) await assertNotAlreadyFiled(ctx, code, 'schedule', scheduleId);

      const shifts: any[] = Array.isArray(sched.details) ? sched.details : [];
      const working = shifts.filter((s) => !s?.off);
      if (!working.length) return json({ error: 'This schedule has no working shifts to file.' }, 400);

      const rows: ErganiValues[] = working.map((s) => {
        const date = s.date ?? shiftDate(String(sched.effective_from), Number(s.day));
        return {
          ...personValues(emp), specialty: emp.specialty,
          date, startDate: date, endDate: date,
          startTime: toErganiTime(s.start), endTime: toErganiTime(s.end),
          comments: s.note ? String(s.note) : '',
        };
      });

      const out = await fileDocument(ctx, creds, {
        code, entityType: 'schedule', entityId: scheduleId, employeeId: sched.employee_id,
        header: {
          employerAfm: creds.employerAfm, branchAa: creds.branchAa,
          comments: String(body?.comments ?? sched.name ?? ''),
        },
        rows,
      });
      if (out.kind === 'preview') return out.response;

      const schedStamp = await stampAfterFiling(ctx, out.auditId, 'hr_work_schedules.status', () =>
        supabase.from('hr_work_schedules')
          .update({ status: 'submitted', ergani_protocol: out.result.protocol })
          .eq('id', scheduleId).eq('workspace_id', workspaceId));
      return filedResponse(out, [schedStamp]);
    }

    // ── Generic submit for any code (E3, WTOWeek, WTODaily, WKChgWK) ───────────
    // The caller builds `document` from `ergani-document-schema` (Ergani's own template). This
    // avoids fabricating field names for the submission types the API guide doesn't document.
    case 'ergani-submit': {
      requireManage();
      const code = String(body?.code ?? '').trim();
      const document = body?.document;
      if (!code) return json({ error: 'code is required' }, 400);
      if (document === undefined || document === null) return json({ error: 'document (payload) is required' }, 400);
      const creds = await client(ctx);
      // #356 `RE-4` generalised: `employee_id` is a body-supplied FK into hr_employees and is
      // stored on the ΕΡΓΑΝΗ submission audit row, which is later joined for display. The sibling
      // module (labour.ts) already proves the employee with `assertEmployee`; this path did not.
      // Moved BEFORE the filing (#354 HR-3): it validates the request, and validating it after the
      // ministry has the document means rejecting something already filed.
      await assertSameWorkspace(supabase, 'hr_employees', body?.employee_id, workspaceId, 'employee');
      // This route accepts an arbitrary code + document, so it is the one path where the caller
      // states what is being filed. When they name the record it belongs to, that naming is what
      // the duplicate guard reads.
      if (body?.entity_type && body?.entity_id) {
        await assertNotAlreadyFiled(ctx, code, String(body.entity_type), String(body.entity_id));
      }
      try {
        const res = await submitDocument(creds, workspaceId, code, document);
        const auditId = await audit(ctx, {
          submission_type: code, entity_type: body?.entity_type ?? null, entity_id: body?.entity_id ?? null,
          employee_id: body?.employee_id ?? null, environment: creds.environment, status: 'submitted',
          protocol: res.protocol, ergani_id: res.id, submit_date: res.submitDate, request: document, response: res,
        });
        // If tied to a persisted schedule row, flip it to submitted — checked, like every other
        // post-filing write (#354 HR-2).
        const stamp = body?.schedule_id
          ? await stampAfterFiling(ctx, auditId, 'hr_work_schedules.status', () =>
              supabase.from('hr_work_schedules')
                .update({ status: 'submitted', ergani_protocol: res.protocol })
                .eq('id', String(body.schedule_id)).eq('workspace_id', workspaceId))
          : null;
        return filedResponse({ result: res, auditId }, [stamp]);
      } catch (e) {
        const he = toHttp(e);
        await audit(ctx, { submission_type: code, entity_type: body?.entity_type ?? null, entity_id: body?.entity_id ?? null, employee_id: body?.employee_id ?? null, environment: creds.environment, status: 'failed', request: document, error: he.message });
        throw he;
      }
    }

    // ── Download the submitted PDF (Base64) (§6.1.8) ──────────────────────────
    case 'ergani-download-pdf': {
      const code = String(body?.code ?? '').trim();
      const protocol = String(body?.protocol ?? '').trim();
      const submittedDate = String(body?.submitted_date ?? '').trim(); // yyyymmdd
      if (!code || !protocol || !submittedDate) return json({ error: 'code, protocol and submitted_date (yyyymmdd) are required' }, 400);
      const creds = await client(ctx);
      try { return json({ pdf_base64: await getSubmittedPdf(creds, workspaceId, code, protocol, submittedDate) }); }
      catch (e) { throw toHttp(e); }
    }

    // ── Cancel a submitted document, and release the record it belongs to ─────
    //
    // `cancelDocument` has existed in the client since this module shipped and the header comment
    // above claimed cancel was implemented — no route ever called it. That gap became load-bearing
    // with the duplicate guard (#354 HR-3): "this record was already filed, cancel it first" is not
    // an instruction anyone could follow while cancelling was unreachable.
    //
    // Cancelling releases BOTH records that could block a re-file: the audit row (what the guard
    // reads) and the entity's own status column (what the route-level checks read). Leaving either
    // behind would mean a cancelled filing that still cannot be re-filed.
    case 'ergani-cancel': {
      requireManage();
      const id = String(body?.submission_id ?? '');
      if (!id) return json({ error: 'submission_id is required' }, 400);
      const { data: row } = await supabase
        .from('hr_ergani_submissions').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!row) return json({ error: 'submission not found' }, 404);
      if (row.status !== 'submitted') return json({ error: 'only a submitted document can be cancelled' }, 400);
      if (!row.protocol || !row.submit_date) {
        return json({ error: 'this submission has no protocol / submitted date to cancel at Ergani' }, 400);
      }
      const creds = await client(ctx);
      // Ergani wants yyyymmdd; the stored value may be a date or an ISO timestamp.
      const submittedDate = String(row.submit_date).replace(/[^0-9]/g, '').slice(0, 8);
      try {
        const res = await cancelDocument(creds, workspaceId, {
          typeOfDocument: row.submission_type, protocol: row.protocol, submittedDate,
        });
        const auditStamp = await stampAfterFiling(ctx, id, 'hr_ergani_submissions.status', () =>
          supabase.from('hr_ergani_submissions')
            .update({ status: 'cancelled' }).eq('id', id).eq('workspace_id', workspaceId));

        // Release the entity so it can be filed again. `draft` is the only pre-filing state each
        // of these tables has (their CHECK is draft | submitted | failed).
        const RELEASE: Record<string, string> = {
          separation: 'hr_separations', overtime: 'hr_overtime', schedule: 'hr_work_schedules',
        };
        const table = row.entity_type ? RELEASE[String(row.entity_type)] : undefined;
        const entityStamp = table && row.entity_id
          ? await stampAfterFiling(ctx, id, `${table}.status`, () =>
              supabase.from(table).update({ status: 'draft', ergani_protocol: null })
                .eq('id', row.entity_id).eq('workspace_id', workspaceId))
          : null;

        const problems = [auditStamp, entityStamp].filter(Boolean) as string[];
        if (!problems.length) return json({ ok: true, cancelled: true, message: res.message });
        return json({
          ok: true, cancelled: true, message: res.message, local_write_failed: true,
          warning: `${problems.join(' ')} The cancellation DID reach Ergani — do not cancel it again.`,
        });
      } catch (e) { throw toHttp(e); }
    }

    // ── Retry a failed submission using its stored request payload ────────────
    case 'ergani-retry': {
      requireManage();
      const id = String(body?.submission_id ?? '');
      if (!id) return json({ error: 'submission_id is required' }, 400);
      const { data: row } = await supabase
        .from('hr_ergani_submissions').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!row) return json({ error: 'submission not found' }, 404);
      if (row.status !== 'failed') return json({ error: 'only failed submissions can be retried' }, 400);
      if (!row.request) return json({ error: 'this submission has no stored payload to retry' }, 400);
      const creds = await client(ctx);
      try {
        const res = await submitDocument(creds, workspaceId, row.submission_type, row.request);
        // Unchecked, this was the worst instance of #354 HR-2: the row that says "failed" is the
        // ONLY record, and a retry that files successfully then leaves it saying failed — so the
        // next operator retries again, and the ministry gets a third copy.
        const retryStamp = await stampAfterFiling(ctx, id, 'hr_ergani_submissions.status', () =>
          supabase.from('hr_ergani_submissions').update({
            status: 'submitted', protocol: res.protocol, ergani_id: res.id, submit_date: res.submitDate,
            response: res, error: null, environment: creds.environment,
          }).eq('id', id).eq('workspace_id', workspaceId));
        return filedResponse({ result: res, auditId: id }, [retryStamp]);
      } catch (e) {
        const he = toHttp(e);
        await supabase.from('hr_ergani_submissions').update({ error: he.message }).eq('id', id).eq('workspace_id', workspaceId);
        throw he;
      }
    }

    // ── Audit log of our submissions ──────────────────────────────────────────
    case 'ergani-submissions-log': {
      let q = supabase
        .from('hr_ergani_submissions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(body?.limit ?? 100), 500));
      if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
      if (body?.submission_type) q = q.eq('submission_type', String(body.submission_type));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ submissions: data ?? [] });
    }

    default:
      return null;
  }
}
