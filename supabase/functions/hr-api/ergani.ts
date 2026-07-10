// deno-lint-ignore-file no-explicit-any
// #252 — Ergani II (Ergani) integration actions for the HR module. Dispatched from index.ts
// after the caller is bound to the workspace + entitlement + hr.view. Every submission requires
// hr.manage. All calls run under the workspace's OWN Ergani credentials (workspace_ergani_credentials).
//
// Coverage vs the API guide (§6):
//  • Work Card (WRKCardSE) — fully modelled (the guide documents its exact JSON schema).
//  • Backbone — submissions list, live document schema, cancel, PDF download, employer info (EX_BASE_01),
//    audit log — all documented and implemented.
//  • Leaves / E3 / schedules — the guide does NOT include their JSON field schemas (they ship in
//    Ergani's HELP_FILES_SAMPLES.zip). We expose `ergani-document-schema` to fetch Ergani's OWN live
//    template for a code, plus `ergani-submit` to POST an operator-reviewed payload for that code, and
//    a turnkey leave path that maps an hr_absences row onto the common Documents envelope. We never
//    fabricate field names — the type-specific detail comes from Ergani's schema or the caller.
import { corsHeaders } from '../_shared/cors.ts';
import { HttpError } from '../_shared/api-logger.ts';
import {
  resolveErganiCredentials, listSubmissions, getDocumentSchema, submitDocument,
  cancelDocument, getSubmittedPdf, executeService, ErganiApiError, type ErganiCredentials,
} from '../_shared/ergani/client.ts';
import { fileWorkcardPunch } from '../_shared/ergani/workcard.ts';

export interface ErganiCtx {
  supabase: any;
  workspaceId: string;
  userId: string;
  body: any;
  access: { canView: boolean; canManage: boolean };
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    return data?.id ?? null;
  } catch (_e) { return null; }
}
const audit = (ctx: ErganiCtx, row: AuditRow) => recordAudit(ctx.supabase, ctx.workspaceId, ctx.userId, row);

/** Load an employee (+ contact identity) scoped to the workspace, or throw 404. */
async function loadEmployee(ctx: ErganiCtx, employeeId: string): Promise<{ id: string; amka: string | null; afm: string | null; name: string }> {
  const { data } = await ctx.supabase
    .from('hr_employees')
    .select('id, amka, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name, first_name, last_name, vat_number )')
    .eq('id', employeeId).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'employee not found in this workspace');
  return {
    id: data.id,
    amka: data.amka ?? null,
    afm: data.contact?.vat_number ?? null,
    name: data.contact?.name ?? '',
  };
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
 * Fill an Ergani document TEMPLATE (fetched live from Documents/{code} GET) using its OWN key names.
 * The template returns leaf placeholders (e.g. {"f_afm":"f_afm", ...}); we replace only the keys whose
 * names match documented Ergani conventions and leave every other placeholder untouched for the caller
 * to complete. This is deliberately conservative — we never invent structure, only substitute values
 * into fields Ergani itself declared. Ambiguous keys surface as an Ergani 400 (stored in the audit).
 */
function fillErganiTemplate(node: any, v: {
  employerAfm: string; branchAa: string; comments: string; afm: string; lastName: string; firstName: string;
  leaveCode: string; startDate: string; endDate: string;
}): any {
  if (Array.isArray(node)) return node.map((n) => fillErganiTemplate(n, v));
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const [k, val] of Object.entries(node)) {
      if (val !== null && typeof val === 'object') { out[k] = fillErganiTemplate(val, v); continue; }
      const key = k.toLowerCase();
      if (key === 'f_afm_ergodoti') out[k] = v.employerAfm;
      else if (key === 'f_aa') out[k] = v.branchAa;
      else if (key === 'f_comments') out[k] = v.comments;
      else if (key === 'f_afm') out[k] = v.afm;
      else if (key === 'f_eponymo') out[k] = v.lastName;
      else if (key === 'f_onoma') out[k] = v.firstName;
      else if (/adeia|leave/.test(key) && /typ|code|kind|eidos/.test(key)) out[k] = v.leaveCode;
      else if (/(apo|from|start|reference|enarks)/.test(key) && /date|hmer|imer|imnia|hn/.test(key)) out[k] = v.startDate;
      else if (/(eos|to|end|lixi|liks)/.test(key) && /date|hmer|imer|imnia|hn/.test(key)) out[k] = v.endDate;
      else if (/date|hmer|imer|imnia/.test(key)) out[k] = v.startDate;
      else out[k] = val; // unknown placeholder → caller completes / Ergani validates
    }
    return out;
  }
  return node;
}

/** Map an ErganiApiError → HttpError with a useful status (400 business error, 502 upstream). */
function toHttp(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof ErganiApiError) return new HttpError(e.status >= 400 && e.status < 500 ? 400 : 502, e.message);
  return new HttpError(502, (e as Error)?.message || 'Ergani request failed');
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
    case 'ergani-status': {
      const { data } = await supabase
        .from('workspace_ergani_credentials')
        .select('username, employer_afm, branch_aa, usertype, environment, enabled, password')
        .eq('workspace_id', workspaceId).maybeSingle();
      if (!data) return json({ configured: false });
      return json({
        configured: !!(data.username && data.password && data.enabled),
        username: data.username ?? null,
        employer_afm: data.employer_afm ?? null,
        branch_aa: data.branch_aa ?? '0',
        usertype: data.usertype ?? '02',
        environment: data.environment ?? 'trial',
        enabled: data.enabled ?? true,
        has_password: !!(data.password && String(data.password).trim()),
      });
    }

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

    // ── Work Card start/stop — WRKCardSE (§6.2.1) ─────────────────────────────
    // Fully modelled from the guide. f_type: 0 arrival (προσέλευση), 1 departure (αποχώρηση).
    case 'ergani-submit-workcard': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      const punchType = String(body?.punch_type ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      if (!['arrival', 'departure'].includes(punchType)) return json({ error: "punch_type must be 'arrival' or 'departure'" }, 400);
      const r = await fileWorkcardPunch(supabase, workspaceId, ctx.userId, {
        employeeId, punchType: punchType as 'arrival' | 'departure',
        at: body?.at ? String(body.at) : undefined,
        comments: body?.comments ? String(body.comments) : undefined,
        lateReason: body?.late_reason ? String(body.late_reason) : undefined,
        source: 'admin',
      }, { requireErgani: true });
      return json({ ok: true, result: r.result, punch: r.punch });
    }

    // ── Leave declaration mapped from an hr_absences row ──────────────────────
    // The leave document's field schema is NOT in the API guide (it ships in Ergani's samples zip),
    // so we do NOT hand-author it. Instead we fetch Ergani's OWN live template for the leave code
    // (Documents/{code} GET) and substitute values only into fields whose key names are documented
    // Ergani conventions (see fillErganiTemplate). A caller may pass a fully-built `document` to
    // override. Any schema mismatch surfaces as an Ergani 400 stored verbatim in the audit.
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
      if (!emp.afm) return json({ error: 'Employee has no VAT number (set the contact VAT number first).' }, 400);
      const creds = await client(ctx);
      if (!creds.employerAfm) return json({ error: 'employer_afm is not set in your Ergani credentials.' }, 400);
      const code = await resolveCode(creds, workspaceId, 'leave');

      const [lastName, ...rest] = emp.name.split(' ');
      let payload = body?.document;
      if (payload === undefined || payload === null) {
        // Fetch Ergani's own template and fill recognized fields by their real key names.
        let template: any;
        try { template = await getDocumentSchema(creds, workspaceId, code); }
        catch (e) { throw toHttp(e); }
        payload = fillErganiTemplate(template, {
          employerAfm: creds.employerAfm, branchAa: creds.branchAa, comments: abs.note ? String(abs.note) : '',
          afm: emp.afm, lastName: lastName || emp.name, firstName: rest.join(' '),
          leaveCode, startDate: abs.start_date, endDate: abs.end_date,
        });
      }

      try {
        const res = await submitDocument(creds, workspaceId, code, payload);
        await supabase.from('hr_absences').update({ ergani_leave_code: leaveCode }).eq('id', absenceId).eq('workspace_id', workspaceId);
        await audit(ctx, {
          submission_type: code, entity_type: 'absence', entity_id: absenceId, employee_id: abs.employee_id,
          environment: creds.environment, status: 'submitted', protocol: res.protocol, ergani_id: res.id,
          submit_date: res.submitDate, request: payload, response: res,
        });
        return json({ ok: true, result: res });
      } catch (e) {
        const he = toHttp(e);
        await audit(ctx, { submission_type: code, entity_type: 'absence', entity_id: absenceId, employee_id: abs.employee_id, environment: creds.environment, status: 'failed', request: payload, error: he.message });
        throw he;
      }
    }

    // ── Persist a work-time schedule (WTOWeek/WTODaily) and optionally submit it ─
    case 'ergani-save-schedule': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      const scheduleType = String(body?.schedule_type ?? '');
      const effectiveFrom = String(body?.effective_from ?? '');
      if (!employeeId || !['weekly', 'daily'].includes(scheduleType) || !effectiveFrom)
        return json({ error: 'employee_id, schedule_type (weekly|daily) and effective_from are required' }, 400);
      await loadEmployee(ctx, employeeId); // workspace-scope check
      const { data, error } = await supabase.from('hr_work_schedules').insert({
        workspace_id: workspaceId, employee_id: employeeId, schedule_type: scheduleType,
        effective_from: effectiveFrom, effective_to: body?.effective_to ?? null,
        details: body?.details ?? [], created_by: ctx.userId,
      }).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ schedule: data }, 201);
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
      try {
        const res = await submitDocument(creds, workspaceId, code, document);
        // If tied to a persisted schedule row, flip it to submitted.
        if (body?.schedule_id) {
          await supabase.from('hr_work_schedules').update({ status: 'submitted' }).eq('id', String(body.schedule_id)).eq('workspace_id', workspaceId);
        }
        await audit(ctx, {
          submission_type: code, entity_type: body?.entity_type ?? null, entity_id: body?.entity_id ?? null,
          employee_id: body?.employee_id ?? null, environment: creds.environment, status: 'submitted',
          protocol: res.protocol, ergani_id: res.id, submit_date: res.submitDate, request: document, response: res,
        });
        return json({ ok: true, result: res });
      } catch (e) {
        const he = toHttp(e);
        await audit(ctx, { submission_type: code, entity_type: body?.entity_type ?? null, entity_id: body?.entity_id ?? null, employee_id: body?.employee_id ?? null, environment: creds.environment, status: 'failed', request: document, error: he.message });
        throw he;
      }
    }

    // ── Cancel a submitted declaration (§6.1.7 — leaves) ──────────────────────
    case 'ergani-cancel': {
      requireManage();
      const typeOfDocument = String(body?.type_of_document ?? '').trim();
      const protocol = String(body?.protocol ?? '').trim();
      const submittedDate = String(body?.submitted_date ?? '').trim(); // yyyymmdd
      if (!typeOfDocument || !protocol || !submittedDate)
        return json({ error: 'type_of_document, protocol and submitted_date (yyyymmdd) are required' }, 400);
      const creds = await client(ctx);
      try {
        const res = await cancelDocument(creds, workspaceId, { typeOfDocument, protocol, submittedDate });
        // Mark the matching audit row cancelled.
        await supabase.from('hr_ergani_submissions')
          .update({ status: 'cancelled' })
          .eq('workspace_id', workspaceId).eq('protocol', protocol);
        await audit(ctx, { submission_type: typeOfDocument, environment: creds.environment, status: 'cancelled', protocol, response: res });
        return json({ ok: true, ...res });
      } catch (e) { throw toHttp(e); }
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
        await supabase.from('hr_ergani_submissions').update({
          status: 'submitted', protocol: res.protocol, ergani_id: res.id, submit_date: res.submitDate,
          response: res, error: null, environment: creds.environment,
        }).eq('id', id).eq('workspace_id', workspaceId);
        return json({ ok: true, result: res });
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
