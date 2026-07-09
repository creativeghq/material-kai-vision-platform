// deno-lint-ignore-file no-explicit-any
// #252 HR expansion — org, recruitment/ATS (+ AI job descriptions), onboarding, documents,
// payroll (+ Finance link via planned_payments), analytics. Dispatched from index.ts AFTER the
// caller is bound to the workspace + entitlement + hr.view is confirmed. Writes require hr.manage.
import { corsHeaders } from '../_shared/cors.ts';
import { HttpError } from '../_shared/api-logger.ts';
import { fileWorkcardPunch } from '../_shared/ergani/workcard.ts';
import { sha256hex } from '../_shared/hash.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { generatePayslips } from './payslip.ts';
import { callClaudeTool, meterHrAi, creditBalance } from './ai-meter.ts';

// Conservative pre-check ceilings ONLY — the ACTUAL charge is usage-based (see ./ai-meter.ts).
const JOBDESC_MAX_CREDITS = 12;
const SCREEN_MAX_CREDITS = 20;

export interface Ctx {
  supabase: any;
  workspaceId: string;
  userId: string;
  body: any;
  access: { canView: boolean; canManage: boolean };
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function pick(body: any, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (body?.[c] !== undefined) out[c] = body[c];
  return out;
}
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor'];
const POSTING_STATUS = ['draft', 'open', 'closed'];
const APP_STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const ABSENCE_TYPES = ['vacation', 'sick', 'unpaid', 'other'];
const DOC_TYPES = ['contract', 'id', 'certificate', 'payslip', 'review', 'other'];
const HR_DOC_BUCKET = 'pdf-documents';

/** Working (Mon–Fri) days in a 'YYYY-MM' month. */
function businessDaysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return 0;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= last; d++) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Working (Mon–Fri) days between two ISO dates inclusive. */
function businessDaysInclusive(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T00:00:00Z'), e = new Date(endISO + 'T00:00:00Z');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  let n = 0;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

// ── Payroll rules engine (configurable per workspace; Greek 2026 defaults) ──────────────
// tax_credit_per_child holds the ADD-ON over the base credit: base 777 (0 kids) → 900/1120/1340/1580/1780.
const GREEK_PAYROLL_DEFAULTS = {
  country_code: 'GR', currency: 'EUR', salaries_per_year: 14,
  employee_contribution_rate: 0.1387, employer_contribution_rate: 0.2179,
  contribution_monthly_ceiling: 7761.94,
  income_tax_brackets: [
    { up_to: 10000, rate: 0.09 }, { up_to: 20000, rate: 0.20 }, { up_to: 30000, rate: 0.26 },
    { up_to: 40000, rate: 0.34 }, { up_to: 60000, rate: 0.39 }, { up_to: null, rate: 0.44 },
  ],
  tax_credit_base: 777,
  tax_credit_per_child: { '1': 123, '2': 343, '3': 563, '4': 803, '5': 1003 },
  tax_credit_taper_per_1000: 20, tax_credit_taper_floor: 12000,
};

async function getPayrollSettings(supabase: any, workspaceId: string): Promise<any> {
  const { data } = await supabase.from('hr_payroll_settings').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (data) {
    if (!Array.isArray(data.income_tax_brackets) || data.income_tax_brackets.length === 0) data.income_tax_brackets = GREEK_PAYROLL_DEFAULTS.income_tax_brackets;
    return data;
  }
  return { workspace_id: workspaceId, ...GREEK_PAYROLL_DEFAULTS, updated_at: null, is_default: true };
}

function progressiveTax(annual: number, brackets: any[]): number {
  let tax = 0, prev = 0;
  for (const b of brackets) {
    const cap = b.up_to == null ? Infinity : Number(b.up_to);
    if (annual > prev) { tax += (Math.min(annual, cap) - prev) * Number(b.rate); prev = cap; if (annual <= cap) break; }
    else break;
  }
  return tax;
}

interface PayrollBreakdown { employee_contributions: number; income_tax: number; employer_contributions: number; net: number; employer_cost: number; deductions: number; }
/** gross → statutory breakdown. country_code='none' ⇒ zeros (manual deductions preserved by caller). */
function computePayroll(grossIn: number, children: number, s: any): PayrollBreakdown {
  const gross = Number(grossIn) || 0;
  if (s.country_code === 'none') return { employee_contributions: 0, income_tax: 0, employer_contributions: 0, net: round2(gross), employer_cost: round2(gross), deductions: 0 };
  const spy = Number(s.salaries_per_year) || 12;
  const ceil = s.contribution_monthly_ceiling != null ? Number(s.contribution_monthly_ceiling) : Infinity;
  const capBase = Math.min(gross, ceil);
  const eeEfka = round2(capBase * Number(s.employee_contribution_rate || 0));
  const erEfka = round2(capBase * Number(s.employer_contribution_rate || 0));
  const taxable = Math.max(0, gross - eeEfka);
  const annualTaxable = taxable * spy;
  const grossTax = progressiveTax(annualTaxable, s.income_tax_brackets || []);
  const perChild = s.tax_credit_per_child || {};
  const childKeys = Object.keys(perChild).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  const maxKey = childKeys.length ? childKeys[childKeys.length - 1] : 0;
  const childAdd = children > 0 ? Number(perChild[String(Math.min(children, maxKey))] ?? 0) : 0;
  let credit = Number(s.tax_credit_base || 0) + childAdd;
  const floor = Number(s.tax_credit_taper_floor || 0);
  if (floor > 0 && annualTaxable > floor) credit = Math.max(0, credit - Number(s.tax_credit_taper_per_1000 || 0) * ((annualTaxable - floor) / 1000));
  const incomeTax = round2(Math.max(0, grossTax - credit) / spy);
  return {
    employee_contributions: eeEfka, income_tax: incomeTax, employer_contributions: erEfka,
    net: round2(gross - eeEfka - incomeTax), employer_cost: round2(gross + erEfka), deductions: round2(eeEfka + incomeTax),
  };
}

/** Last calendar day of the month AFTER a 'YYYY-MM' period (statutory remittance due date, GR convention). */
function nextMonthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m + 1, 0)); // day 0 of month m+2 = last day of m+1 (1-based m)
  return d.toISOString().slice(0, 10);
}

const DEFAULT_ONBOARDING = [
  'Sign employment contract', 'Collect ID & tax documents', 'Set up email & system accounts',
  'Assign equipment (laptop, access card)', 'Team & workplace introduction', 'Benefits & payroll enrollment',
];

/** Tag a contact as Employee (idempotent) — mirrors index.ts. */
async function tagEmployee(supabase: any, contactId: string, userId: string) {
  const { data: cat } = await supabase.from('crm_categories').select('id').eq('slug', 'employee').maybeSingle();
  if (!cat?.id) return;
  const { data: ex } = await supabase.from('crm_category_members').select('id')
    .eq('category_id', cat.id).eq('crm_contact_id', contactId).maybeSingle();
  if (ex) return;
  await supabase.from('crm_category_members').insert({
    category_id: cat.id, member_kind: 'crm_contact', crm_contact_id: contactId, source: 'manual', added_by: userId,
  });
}

/** Anthropic tool-use call → returns the tool input object. Used for AI job descriptions. */
// Thin wrapper — Claude with a forced tool, returning structured input + token usage for metering.
function anthropicTool(prompt: string, tool: any) {
  return callClaudeTool([{ type: 'text', text: prompt }], tool, 1500);
}

/** Emit the recruitment Flows trigger (best-effort) so admins can automate interviews / updates. */
async function emitApplicantStage(supabase: any, workspaceId: string, applicationId: string, fromStage: string | null, toStage: string) {
  try {
    const { data: a } = await supabase.from('hr_applications')
      .select('candidate:hr_candidates!hr_applications_candidate_id_fkey ( id, name, email ), posting:hr_job_postings!hr_applications_job_posting_id_fkey ( id, title )')
      .eq('id', applicationId).maybeSingle();
    const cand = (a as any)?.candidate, post = (a as any)?.posting;
    await emitFlowEvent('hr.applicant_stage_changed', {
      workspace_id: workspaceId, application_id: applicationId, from_stage: fromStage, to_stage: toStage,
      candidate_id: cand?.id ?? null, candidate_name: cand?.name ?? null, candidate_email: cand?.email ?? null,
      job_posting_id: post?.id ?? null, job_title: post?.title ?? null,
      title: `Applicant: ${cand?.name ?? 'candidate'} → ${toStage}`,
      body: `${cand?.name ?? 'A candidate'} moved to "${toStage}"${post?.title ? ` for ${post.title}` : ''}.`,
      action_url: '/hr?tab=recruitment', type: 'hr.applicant_stage_changed',
    });
  } catch { /* flow emit is best-effort — never block the stage change */ }
}

/** Base64-encode bytes in chunks (avoids call-stack overflow on large CVs). */
function base64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  return btoa(bin);
}

/**
 * Handle an expansion action. Returns a Response, or null if `action` isn't one of ours
 * (so index.ts can fall through to its own default 400).
 */
export async function handleExpansion(action: string, ctx: Ctx): Promise<Response | null> {
  const { supabase, workspaceId, userId, body, access } = ctx;
  const requireManage = () => { if (!access.canManage) throw new HttpError(403, 'You need HR manage permission for this action.'); };

  switch (action) {
    // ─────────────────────────── ORG / DEPARTMENTS ───────────────────────────
    case 'list-departments': {
      const { data: depts, error } = await supabase
        .from('hr_departments')
        .select('*, head:crm_contacts!hr_departments_head_contact_id_fkey ( id, name )')
        .eq('workspace_id', workspaceId).order('name');
      if (error) throw new HttpError(400, error.message);
      const { data: emps } = await supabase.from('hr_employees')
        .select('department_id').eq('workspace_id', workspaceId);
      const counts = new Map<string, number>();
      for (const e of (emps ?? [])) if (e.department_id) counts.set(e.department_id, (counts.get(e.department_id) ?? 0) + 1);
      return json({ departments: (depts ?? []).map((d: any) => ({ ...d, employee_count: counts.get(d.id) ?? 0 })) });
    }
    case 'create-department': {
      requireManage();
      const fields = pick(body, ['name', 'description', 'head_contact_id']);
      if (!fields.name) return json({ error: 'name is required' }, 400);
      const { data, error } = await supabase.from('hr_departments')
        .insert({ ...fields, workspace_id: workspaceId }).select('*').single();
      if (error) { if ((error as any).code === '23505') return json({ error: 'A department with that name already exists.' }, 409); throw new HttpError(400, error.message); }
      return json({ department: data }, 201);
    }
    case 'update-department': {
      requireManage();
      const id = String(body?.department_id ?? '');
      if (!id) return json({ error: 'department_id is required' }, 400);
      const { data, error } = await supabase.from('hr_departments')
        .update(pick(body, ['name', 'description', 'head_contact_id'])).eq('id', id).eq('workspace_id', workspaceId)
        .select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!data) return json({ error: 'not found' }, 404);
      return json({ department: data });
    }
    case 'delete-department': {
      requireManage();
      const id = String(body?.department_id ?? '');
      if (!id) return json({ error: 'department_id is required' }, 400);
      const { error } = await supabase.from('hr_departments').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    // ─────────────────────────── RECRUITMENT / ATS ───────────────────────────
    case 'list-job-postings': {
      const { data: posts, error } = await supabase
        .from('hr_job_postings')
        .select('*, department:hr_departments!hr_job_postings_department_id_fkey ( id, name )')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (error) throw new HttpError(400, error.message);
      const { data: apps } = await supabase.from('hr_applications')
        .select('job_posting_id, stage').eq('workspace_id', workspaceId);
      const byJob = new Map<string, { total: number; active: number }>();
      for (const a of (apps ?? [])) {
        const cur = byJob.get(a.job_posting_id) ?? { total: 0, active: 0 };
        cur.total++; if (!['hired', 'rejected'].includes(a.stage)) cur.active++;
        byJob.set(a.job_posting_id, cur);
      }
      return json({ postings: (posts ?? []).map((p: any) => ({ ...p, applicant_count: byJob.get(p.id)?.total ?? 0, active_applicants: byJob.get(p.id)?.active ?? 0 })) });
    }
    case 'create-job-posting': {
      requireManage();
      const fields = pick(body, ['title', 'department_id', 'employment_type', 'location', 'remote', 'description', 'requirements', 'salary_min', 'salary_max', 'currency', 'status']);
      if (!fields.title) return json({ error: 'title is required' }, 400);
      if (fields.employment_type && !EMPLOYMENT_TYPES.includes(String(fields.employment_type))) return json({ error: 'invalid employment_type' }, 400);
      if (fields.status && !POSTING_STATUS.includes(String(fields.status))) return json({ error: 'invalid status' }, 400);
      if (fields.status === 'open') (fields as any).published_at = new Date().toISOString();
      const { data, error } = await supabase.from('hr_job_postings')
        .insert({ ...fields, workspace_id: workspaceId, created_by: userId }).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ posting: data }, 201);
    }
    case 'update-job-posting': {
      requireManage();
      const id = String(body?.job_posting_id ?? '');
      if (!id) return json({ error: 'job_posting_id is required' }, 400);
      const fields = pick(body, ['title', 'department_id', 'employment_type', 'location', 'remote', 'description', 'requirements', 'salary_min', 'salary_max', 'currency', 'status']);
      if (fields.employment_type && !EMPLOYMENT_TYPES.includes(String(fields.employment_type))) return json({ error: 'invalid employment_type' }, 400);
      if (fields.status && !POSTING_STATUS.includes(String(fields.status))) return json({ error: 'invalid status' }, 400);
      if (fields.status === 'open') (fields as any).published_at = new Date().toISOString();
      const { data, error } = await supabase.from('hr_job_postings').update(fields).eq('id', id).eq('workspace_id', workspaceId).select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!data) return json({ error: 'not found' }, 404);
      return json({ posting: data });
    }
    case 'delete-job-posting': {
      requireManage();
      const id = String(body?.job_posting_id ?? '');
      if (!id) return json({ error: 'job_posting_id is required' }, 400);
      const { error } = await supabase.from('hr_job_postings').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }
    case 'generate-job-description': {
      requireManage();
      const title = String(body?.title ?? '').trim();
      if (!title) return json({ error: 'title is required' }, 400);
      const ctxBits = [
        `Job title: ${title}`,
        body?.seniority ? `Seniority: ${body.seniority}` : '',
        body?.department ? `Department: ${body.department}` : '',
        body?.employment_type ? `Employment type: ${body.employment_type}` : '',
        body?.location ? `Location: ${body.location}` : '',
        body?.keywords ? `Keywords / must-haves: ${body.keywords}` : '',
        body?.company ? `Company: ${body.company}` : '',
      ].filter(Boolean).join('\n');
      const tool = {
        name: 'job_description',
        description: 'A structured job description for a hiring posting.',
        input_schema: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Markdown job description: a short intro, "About the role", and "Responsibilities" as bullet points.' },
            requirements: { type: 'string', description: 'Markdown "Requirements" and "Nice to have" as bullet points.' },
            suggested_salary_min: { type: 'number', description: 'Suggested annual salary floor in the local currency (rough, optional).' },
            suggested_salary_max: { type: 'number', description: 'Suggested annual salary ceiling (rough, optional).' },
          },
          required: ['description', 'requirements'],
        },
      };
      if (await creditBalance(supabase, userId) < JOBDESC_MAX_CREDITS) return json({ error: `Not enough credits (need up to ${JOBDESC_MAX_CREDITS}).`, code: 'insufficient_credits' }, 402);
      const res = await anthropicTool(
        `Write a compelling, inclusive job description. Be concrete and avoid clichés. Use British/International English.\n\n${ctxBits}`,
        tool,
      );
      const creditsUsed = await meterHrAi(supabase, {
        userId, workspaceId, operationType: 'hr_generate_job_description', model: res.model, usage: res.usage,
        description: `HR job description (${title})`, metadata: { title },
      });
      return json({ generated: res.input, credits_used: creditsUsed });
    }

    case 'list-candidates': {
      const { data, error } = await supabase.from('hr_candidates').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (error) throw new HttpError(400, error.message);
      return json({ candidates: data ?? [] });
    }
    case 'create-candidate': {
      requireManage();
      const fields = pick(body, ['name', 'email', 'phone', 'headline', 'source', 'resume_bucket', 'resume_path']);
      if (!fields.name) return json({ error: 'name is required' }, 400);
      const { data, error } = await supabase.from('hr_candidates').insert({ ...fields, workspace_id: workspaceId }).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ candidate: data }, 201);
    }

    case 'list-applications': {
      let q = supabase.from('hr_applications')
        .select(`*,
          candidate:hr_candidates!hr_applications_candidate_id_fkey ( id, name, email, phone, headline, resume_path ),
          posting:hr_job_postings!hr_applications_job_posting_id_fkey ( id, title )`)
        .eq('workspace_id', workspaceId).order('applied_at', { ascending: false });
      if (body?.job_posting_id) q = q.eq('job_posting_id', String(body.job_posting_id));
      if (body?.stage) q = q.eq('stage', String(body.stage));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ applications: data ?? [] });
    }
    case 'create-application': {
      requireManage();
      const jobId = String(body?.job_posting_id ?? '');
      if (!jobId) return json({ error: 'job_posting_id is required' }, 400);
      const { data: job } = await supabase.from('hr_job_postings').select('id').eq('id', jobId).eq('workspace_id', workspaceId).maybeSingle();
      if (!job) return json({ error: 'job posting not found in this workspace' }, 404);
      // Attach existing candidate, or create one inline.
      let candidateId = body?.candidate_id ? String(body.candidate_id) : '';
      if (candidateId) {
        const { data: c } = await supabase.from('hr_candidates').select('id').eq('id', candidateId).eq('workspace_id', workspaceId).maybeSingle();
        if (!c) return json({ error: 'candidate not found in this workspace' }, 404);
      } else {
        const cf = pick(body?.candidate ?? {}, ['name', 'email', 'phone', 'headline', 'source']);
        if (!cf.name) return json({ error: 'candidate.name is required' }, 400);
        const { data: created, error: cErr } = await supabase.from('hr_candidates').insert({ ...cf, workspace_id: workspaceId }).select('id').single();
        if (cErr) throw new HttpError(400, cErr.message);
        candidateId = created.id;
      }
      const { data, error } = await supabase.from('hr_applications')
        .insert({ workspace_id: workspaceId, job_posting_id: jobId, candidate_id: candidateId, stage: 'applied', notes: body?.notes ?? null })
        .select('*').single();
      if (error) { if ((error as any).code === '23505') return json({ error: 'This candidate already applied to this job.' }, 409); throw new HttpError(400, error.message); }
      await emitApplicantStage(supabase, workspaceId, data.id, null, 'applied');
      return json({ application: data }, 201);
    }
    case 'update-application': {
      requireManage();
      const id = String(body?.application_id ?? '');
      if (!id) return json({ error: 'application_id is required' }, 400);
      const fields = pick(body, ['stage', 'rating', 'notes']);
      if (fields.stage && !APP_STAGES.includes(String(fields.stage))) return json({ error: 'invalid stage' }, 400);
      const { data: prev } = await supabase.from('hr_applications').select('stage').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      const { data, error } = await supabase.from('hr_applications').update(fields).eq('id', id).eq('workspace_id', workspaceId).select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!data) return json({ error: 'not found' }, 404);
      if (fields.stage && prev && prev.stage !== fields.stage) await emitApplicantStage(supabase, workspaceId, id, prev.stage, String(fields.stage));
      return json({ application: data });
    }
    // Candidate CV: uploaded THROUGH the function (service role) — the pdf-documents bucket only
    // allows an authenticated user to write under their own uid/ prefix, so a direct client upload
    // to hr/{workspace}/… is refused. Client sends the PDF as base64.
    case 'upload-application-cv': {
      requireManage();
      const cid = String(body?.candidate_id ?? '');
      const b64 = String(body?.content_base64 ?? '');
      if (!cid || !b64) return json({ error: 'candidate_id and content_base64 are required' }, 400);
      const { data: c } = await supabase.from('hr_candidates').select('id').eq('id', cid).eq('workspace_id', workspaceId).maybeSingle();
      if (!c) return json({ error: 'candidate not found' }, 404);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); } catch { return json({ error: 'invalid file data' }, 400); }
      if (bytes.length > 10_000_000) return json({ error: 'CV too large (max 10MB)' }, 400);
      const safe = String(body?.filename ?? 'cv.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `hr/${workspaceId}/candidates/${cid}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(HR_DOC_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new HttpError(400, upErr.message);
      await supabase.from('hr_candidates').update({ resume_bucket: HR_DOC_BUCKET, resume_path: path }).eq('id', cid).eq('workspace_id', workspaceId);
      return json({ ok: true });
    }
    case 'application-cv-url': {
      const cid = String(body?.candidate_id ?? '');
      const { data: c } = await supabase.from('hr_candidates').select('resume_bucket, resume_path').eq('id', cid).eq('workspace_id', workspaceId).maybeSingle();
      if (!c?.resume_path) return json({ error: 'no CV on file' }, 404);
      const { data: signed, error } = await supabase.storage.from(c.resume_bucket || HR_DOC_BUCKET).createSignedUrl(c.resume_path, 300);
      if (error) throw new HttpError(400, error.message);
      return json({ url: signed?.signedUrl });
    }
    // AI CV screening — Claude reads the CV (PDF) against the job and returns a 0–100 fit score.
    case 'screen-application': {
      requireManage();
      const id = String(body?.application_id ?? '');
      if (!id) return json({ error: 'application_id is required' }, 400);
      const { data: app } = await supabase.from('hr_applications')
        .select('candidate:hr_candidates!hr_applications_candidate_id_fkey ( name, headline, resume_bucket, resume_path ), posting:hr_job_postings!hr_applications_job_posting_id_fkey ( title, description, requirements )')
        .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!app) return json({ error: 'application not found' }, 404);
      const cand = (app as any).candidate, post = (app as any).posting;
      if (!cand?.resume_path) return json({ error: 'Upload the candidate’s CV first.' }, 400);
      if (await creditBalance(supabase, userId) < SCREEN_MAX_CREDITS) return json({ error: `Not enough credits (need up to ${SCREEN_MAX_CREDITS}).`, code: 'insufficient_credits' }, 402);
      const { data: blob } = await supabase.storage.from(cand.resume_bucket || HR_DOC_BUCKET).download(cand.resume_path);
      if (!blob) return json({ error: 'Could not read the CV.' }, 400);
      const b64 = base64FromBytes(new Uint8Array(await (blob as Blob).arrayBuffer()));
      const tool = {
        name: 'cv_assessment',
        description: 'Assess a candidate CV against a specific job.',
        input_schema: {
          type: 'object',
          properties: {
            score: { type: 'integer', minimum: 0, maximum: 100, description: 'Overall fit 0–100 for THIS role.' },
            summary: { type: 'string', description: '2–4 sentences: fit verdict, key strengths, and gaps vs the requirements.' },
          },
          required: ['score', 'summary'],
        },
      };
      const prompt = `You are a hiring assistant. Rate how well this CV fits the role below and be specific about matches and gaps. Do not invent experience.\n\nROLE: ${post?.title ?? ''}\n\nDESCRIPTION:\n${post?.description ?? ''}\n\nREQUIREMENTS:\n${post?.requirements ?? ''}`;
      const res = await callClaudeTool([
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt },
      ], tool, 800);
      const creditsUsed = await meterHrAi(supabase, {
        userId, workspaceId, operationType: 'hr_screen_application', model: res.model, usage: res.usage,
        description: `HR CV screening (${cand?.name ?? 'candidate'})`, metadata: { application_id: id },
      });
      const score = Math.max(0, Math.min(100, Math.round(Number(res.input?.score ?? 0))));
      const summary = String(res.input?.summary ?? '').slice(0, 2000);
      const { data: upd, error } = await supabase.from('hr_applications')
        .update({ ai_score: score, ai_summary: summary, ai_rated_at: new Date().toISOString() })
        .eq('id', id).eq('workspace_id', workspaceId).select('id, ai_score, ai_summary, ai_rated_at').single();
      if (error) throw new HttpError(400, error.message);
      return json({ application: upd, credits_used: creditsUsed });
    }
    case 'hire-application': {
      requireManage();
      const id = String(body?.application_id ?? '');
      if (!id) return json({ error: 'application_id is required' }, 400);
      const { data: app } = await supabase.from('hr_applications')
        .select('*, candidate:hr_candidates!hr_applications_candidate_id_fkey ( name, email, phone )')
        .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!app) return json({ error: 'application not found' }, 404);
      if (app.hired_employee_id) return json({ error: 'This application is already hired.' }, 409);
      // 1) contact
      const { data: contact, error: cErr } = await supabase.from('crm_contacts')
        .insert({ name: app.candidate?.name ?? 'New hire', email: app.candidate?.email ?? null, phone: app.candidate?.phone ?? null, workspace_id: workspaceId, created_by: userId })
        .select('id').single();
      if (cErr) throw new HttpError(400, cErr.message);
      // 2) employee
      const { data: emp, error: eErr } = await supabase.from('hr_employees')
        .insert({ workspace_id: workspaceId, crm_contact_id: contact.id, status: 'active', start_date: (body?.start_date ?? new Date().toISOString().slice(0, 10)), department_id: body?.department_id ?? null })
        .select('id').single();
      if (eErr) throw new HttpError(400, eErr.message);
      await tagEmployee(supabase, contact.id, userId);
      // 3) close application
      await supabase.from('hr_applications').update({ stage: 'hired', hired_employee_id: emp.id }).eq('id', id).eq('workspace_id', workspaceId);
      // 4) seed onboarding checklist
      const tasks = DEFAULT_ONBOARDING.map((title, i) => ({ workspace_id: workspaceId, employee_id: emp.id, title, sort_order: i, status: 'pending' }));
      await supabase.from('hr_onboarding_tasks').insert(tasks);
      return json({ employee_id: emp.id, onboarding_seeded: tasks.length }, 201);
    }

    // ─────────────────────────── ONBOARDING ───────────────────────────
    case 'list-onboarding': {
      let q = supabase.from('hr_onboarding_tasks')
        .select('*, employee:hr_employees!hr_onboarding_tasks_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
        .eq('workspace_id', workspaceId).order('sort_order');
      if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
      if (body?.pending_only) q = q.eq('status', 'pending');
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ tasks: data ?? [] });
    }
    case 'add-onboarding-task': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      if (!employeeId || !body?.title) return json({ error: 'employee_id and title are required' }, 400);
      const { data: emp } = await supabase.from('hr_employees').select('id').eq('id', employeeId).eq('workspace_id', workspaceId).maybeSingle();
      if (!emp) return json({ error: 'employee not found in this workspace' }, 404);
      const { data, error } = await supabase.from('hr_onboarding_tasks')
        .insert({ workspace_id: workspaceId, employee_id: employeeId, ...pick(body, ['title', 'description', 'due_date', 'assignee_contact_id', 'sort_order']) })
        .select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ task: data }, 201);
    }
    case 'toggle-onboarding-task': {
      requireManage();
      const id = String(body?.task_id ?? '');
      if (!id) return json({ error: 'task_id is required' }, 400);
      const { data: t } = await supabase.from('hr_onboarding_tasks').select('status').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!t) return json({ error: 'not found' }, 404);
      const next = t.status === 'done' ? 'pending' : 'done';
      const { data, error } = await supabase.from('hr_onboarding_tasks')
        .update({ status: next, completed_at: next === 'done' ? new Date().toISOString() : null })
        .eq('id', id).eq('workspace_id', workspaceId).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ task: data });
    }
    case 'delete-onboarding-task': {
      requireManage();
      const id = String(body?.task_id ?? '');
      if (!id) return json({ error: 'task_id is required' }, 400);
      const { error } = await supabase.from('hr_onboarding_tasks').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    // ─────────────────────────── DOCUMENTS ───────────────────────────
    case 'list-documents': {
      let q = supabase.from('hr_documents')
        .select('*, employee:hr_employees!hr_documents_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (body?.employee_id) q = q.eq('employee_id', String(body.employee_id));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ documents: data ?? [] });
    }
    case 'document-upload-path': {
      // Return the private storage path the client should upload to (client uploads directly, then
      // calls record-document). Keeps large bytes off the edge function.
      requireManage();
      const employeeId = body?.employee_id ? String(body.employee_id) : 'general';
      const safe = String(body?.filename ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `hr/${workspaceId}/${employeeId}/${Date.now()}-${safe}`;
      return json({ bucket: HR_DOC_BUCKET, path });
    }
    case 'record-document': {
      requireManage();
      const fields = pick(body, ['employee_id', 'name', 'doc_type', 'storage_bucket', 'storage_object_path', 'size_bytes']);
      if (!fields.name || !fields.storage_object_path) return json({ error: 'name and storage_object_path are required' }, 400);
      if (fields.doc_type && !DOC_TYPES.includes(String(fields.doc_type))) return json({ error: 'invalid doc_type' }, 400);
      if (fields.employee_id) {
        const { data: emp } = await supabase.from('hr_employees').select('id').eq('id', String(fields.employee_id)).eq('workspace_id', workspaceId).maybeSingle();
        if (!emp) return json({ error: 'employee not found in this workspace' }, 404);
      }
      const { data, error } = await supabase.from('hr_documents')
        .insert({ ...fields, storage_bucket: fields.storage_bucket || HR_DOC_BUCKET, workspace_id: workspaceId, uploaded_by: userId }).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ document: data }, 201);
    }
    // Upload a document THROUGH the function (service role) — pdf-documents refuses client writes
    // outside the caller's own uid/ prefix, so send the file as base64 and we store + record it.
    case 'upload-document': {
      requireManage();
      const b64 = String(body?.content_base64 ?? '');
      const name = String(body?.name ?? '').trim();
      const docType = String(body?.doc_type ?? 'other');
      if (!b64 || !name) return json({ error: 'name and content_base64 are required' }, 400);
      if (!DOC_TYPES.includes(docType)) return json({ error: 'invalid doc_type' }, 400);
      const employeeId = body?.employee_id ? String(body.employee_id) : null;
      if (employeeId) {
        const { data: emp } = await supabase.from('hr_employees').select('id').eq('id', employeeId).eq('workspace_id', workspaceId).maybeSingle();
        if (!emp) return json({ error: 'employee not found in this workspace' }, 404);
      }
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); } catch { return json({ error: 'invalid file data' }, 400); }
      if (bytes.length > 20_000_000) return json({ error: 'file too large (max 20MB)' }, 400);
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `hr/${workspaceId}/${employeeId ?? 'general'}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(HR_DOC_BUCKET).upload(path, bytes, { contentType: String(body?.content_type ?? 'application/octet-stream'), upsert: true });
      if (upErr) throw new HttpError(400, upErr.message);
      const { data, error } = await supabase.from('hr_documents')
        .insert({ workspace_id: workspaceId, employee_id: employeeId, name, doc_type: docType, storage_bucket: HR_DOC_BUCKET, storage_object_path: path, size_bytes: bytes.length, uploaded_by: userId })
        .select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ document: data }, 201);
    }
    case 'sign-document': {
      const id = String(body?.document_id ?? '');
      if (!id) return json({ error: 'document_id is required' }, 400);
      const { data: doc } = await supabase.from('hr_documents').select('storage_bucket, storage_object_path').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!doc) return json({ error: 'not found' }, 404);
      const { data: signed, error } = await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_object_path, 300);
      if (error) throw new HttpError(400, error.message);
      return json({ url: signed?.signedUrl });
    }
    case 'delete-document': {
      requireManage();
      const id = String(body?.document_id ?? '');
      if (!id) return json({ error: 'document_id is required' }, 400);
      const { data: doc } = await supabase.from('hr_documents').select('storage_bucket, storage_object_path').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!doc) return json({ error: 'not found' }, 404);
      await supabase.storage.from(doc.storage_bucket).remove([doc.storage_object_path]); // best-effort
      const { error } = await supabase.from('hr_documents').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    // ─────────────────────────── PAYROLL ───────────────────────────
    case 'list-payroll-runs': {
      const { data, error } = await supabase.from('hr_payroll_runs').select('*').eq('workspace_id', workspaceId).order('period', { ascending: false });
      if (error) throw new HttpError(400, error.message);
      return json({ runs: data ?? [] });
    }
    case 'create-payroll-run': {
      requireManage();
      const period = String(body?.period ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(period)) return json({ error: 'period must be YYYY-MM' }, 400);
      const { data: run, error } = await supabase.from('hr_payroll_runs')
        .insert({ workspace_id: workspaceId, period, status: 'draft', currency: body?.currency ?? 'EUR', created_by: userId }).select('*').single();
      if (error) { if ((error as any).code === '23505') return json({ error: `A payroll run for ${period} already exists.` }, 409); throw new HttpError(400, error.message); }
      // Auto-populate items from active employees. Gross depends on pay basis:
      //  • monthly → the fixed monthly_salary
      //  • hourly  → hourly_rate × hours/day × working days in the run month
      //             (hours/day derived from weekly_hours ÷ 5, default 8)
      const workingDays = businessDaysInMonth(period);
      const settings = await getPayrollSettings(supabase, workspaceId);
      const { data: emps } = await supabase.from('hr_employees')
        .select('id, monthly_salary, salary_currency, pay_basis, hourly_rate, weekly_hours, dependent_children')
        .eq('workspace_id', workspaceId).eq('status', 'active');
      const items = (emps ?? []).map((e: any) => {
        const basis = e.pay_basis === 'hourly' ? 'hourly' : 'monthly';
        let gross = 0, rate = 0;
        let hoursPerDay: number | null = null;
        if (basis === 'hourly') {
          hoursPerDay = e.weekly_hours ? round2(Number(e.weekly_hours) / 5) : 8;
          rate = Number(e.hourly_rate ?? 0);
          gross = round2(rate * hoursPerDay * workingDays);
        } else {
          rate = Number(e.monthly_salary ?? 0);
          gross = rate;
        }
        const b = computePayroll(gross, Number(e.dependent_children ?? 0), settings);
        return {
          workspace_id: workspaceId, run_id: run.id, employee_id: e.id, gross,
          deductions: b.deductions, net: b.net, employee_contributions: b.employee_contributions,
          income_tax: b.income_tax, employer_contributions: b.employer_contributions, employer_cost: b.employer_cost,
          currency: e.salary_currency ?? run.currency, basis, days_worked: workingDays, hours_per_day: hoursPerDay, rate,
        };
      });
      if (items.length) await supabase.from('hr_payroll_items').insert(items);
      const totalGross = round2(items.reduce((s: number, i: any) => s + i.gross, 0));
      const totalNet = round2(items.reduce((s: number, i: any) => s + i.net, 0));
      await supabase.from('hr_payroll_runs').update({ total_gross: totalGross, total_net: totalNet }).eq('id', run.id);
      return json({ run: { ...run, total_gross: totalGross, total_net: totalNet }, items: items.length }, 201);
    }
    case 'get-payroll-run': {
      const id = String(body?.run_id ?? '');
      if (!id) return json({ error: 'run_id is required' }, 400);
      const { data: run } = await supabase.from('hr_payroll_runs').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!run) return json({ error: 'not found' }, 404);
      const { data: items } = await supabase.from('hr_payroll_items')
        .select('*, employee:hr_employees!hr_payroll_items_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
        .eq('run_id', id).order('id');
      const sum = (k: string) => round2((items ?? []).reduce((s: number, i: any) => s + Number(i[k] ?? 0), 0));
      const summary = {
        total_gross: sum('gross'), total_net: sum('net'), total_income_tax: sum('income_tax'),
        total_employee_contributions: sum('employee_contributions'), total_employer_contributions: sum('employer_contributions'),
        total_employer_cost: sum('employer_cost'),
      };
      return json({ run, items: items ?? [], summary });
    }
    case 'update-payroll-item': {
      requireManage();
      const id = String(body?.item_id ?? '');
      if (!id) return json({ error: 'item_id is required' }, 400);
      const gross = Number(body?.gross ?? 0);
      if (!Number.isFinite(gross) || gross < 0) return json({ error: 'gross must be a non-negative number' }, 400);
      // Recompute the statutory breakdown from the rules on the new gross (rules-driven). A manual
      // `deductions` override wins only when auto-rules are off (country_code='none').
      const { data: cur } = await supabase.from('hr_payroll_items')
        .select('run_id, employee:hr_employees!hr_payroll_items_employee_id_fkey ( dependent_children )')
        .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!cur) return json({ error: 'not found' }, 404);
      const settings = await getPayrollSettings(supabase, workspaceId);
      let patch: any;
      if (settings.country_code === 'none' && body?.deductions !== undefined) {
        const ded = Number(body.deductions);
        if (!Number.isFinite(ded) || ded < 0) return json({ error: 'deductions must be a non-negative number' }, 400);
        patch = { gross, deductions: ded, net: round2(Math.max(0, gross - ded)), employee_contributions: 0, income_tax: 0, employer_contributions: 0, employer_cost: round2(gross), note: body?.note ?? null };
      } else {
        const b = computePayroll(gross, Number((cur as any).employee?.dependent_children ?? 0), settings);
        patch = { gross, deductions: b.deductions, net: b.net, employee_contributions: b.employee_contributions, income_tax: b.income_tax, employer_contributions: b.employer_contributions, employer_cost: b.employer_cost, note: body?.note ?? null };
      }
      const { error } = await supabase.from('hr_payroll_items').update(patch).eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      const { data: all } = await supabase.from('hr_payroll_items').select('gross, net').eq('run_id', (cur as any).run_id);
      const tg = round2((all ?? []).reduce((s: number, i: any) => s + Number(i.gross), 0));
      const tn = round2((all ?? []).reduce((s: number, i: any) => s + Number(i.net), 0));
      await supabase.from('hr_payroll_runs').update({ total_gross: tg, total_net: tn }).eq('id', (cur as any).run_id);
      return json({ ok: true, total_gross: tg, total_net: tn });
    }
    case 'generate-payslips': {
      requireManage();
      const rid = String(body?.run_id ?? '');
      if (!rid) return json({ error: 'run_id is required' }, 400);
      return await generatePayslips(supabase, workspaceId, userId, rid);
    }
    case 'get-payroll-settings': {
      const s = await getPayrollSettings(supabase, workspaceId);
      return json({ settings: s });
    }
    case 'update-payroll-settings': {
      requireManage();
      const fields = pick(body, ['country_code', 'currency', 'salaries_per_year', 'employee_contribution_rate', 'employer_contribution_rate', 'contribution_monthly_ceiling', 'income_tax_brackets', 'tax_credit_base', 'tax_credit_per_child', 'tax_credit_taper_per_1000', 'tax_credit_taper_floor']);
      const { data, error } = await supabase.from('hr_payroll_settings')
        .upsert({ workspace_id: workspaceId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' })
        .select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ settings: data });
    }
    case 'set-payroll-status': {
      requireManage();
      const id = String(body?.run_id ?? '');
      const status = String(body?.status ?? '');
      if (!id || !['approved', 'paid', 'draft'].includes(status)) return json({ error: 'run_id and a valid status are required' }, 400);
      const patch: any = { status };
      if (status === 'approved') patch.approved_at = new Date().toISOString();
      if (status === 'paid') patch.paid_at = new Date().toISOString();
      const { data, error } = await supabase.from('hr_payroll_runs').update(patch).eq('id', id).eq('workspace_id', workspaceId).select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!data) return json({ error: 'not found' }, 404);
      return json({ run: data });
    }
    case 'post-payroll-to-finance': {
      requireManage();
      const id = String(body?.run_id ?? '');
      if (!id) return json({ error: 'run_id is required' }, 400);
      const { data: run } = await supabase.from('hr_payroll_runs').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!run) return json({ error: 'not found' }, 404);
      if (run.posted_finance_ref) return json({ error: 'This run is already posted to Finance.' }, 409);
      const { data: items } = await supabase.from('hr_payroll_items')
        .select('net, income_tax, employee_contributions, employer_contributions, employee:hr_employees!hr_payroll_items_employee_id_fkey ( crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name ) )')
        .eq('run_id', id);
      const rows = items ?? [];
      const cur = run.currency;
      const payday = `${run.period}-28`;
      const statutoryDue = nextMonthEnd(run.period);
      const sum = (k: string) => round2(rows.reduce((s: number, i: any) => s + Number(i[k] ?? 0), 0));
      const totalTax = sum('income_tax');
      const eeEfka = sum('employee_contributions');
      const erEfka = sum('employer_contributions');
      const totalEfka = round2(eeEfka + erEfka);

      // 1) Net wages — one scheduled payment PER EMPLOYEE (counterparty = the employee's contact).
      const netPaymentIds: string[] = [];
      for (const it of rows) {
        const net = Number(it.net ?? 0);
        if (net <= 0) continue;
        const nm = (it as any).employee?.contact?.name || 'Employee';
        const { data: np, error } = await supabase.from('planned_payments').insert({
          workspace_id: workspaceId, direction: 'out', amount: net, currency: cur, scheduled_for: payday,
          category: 'salary', title: `Net pay — ${nm} — ${run.period}`,
          counterparty_contact_id: (it as any).employee?.crm_contact_id ?? null,
          notes: `Payroll ${run.period} net wages`, created_by: userId,
        }).select('id').single();
        if (error) throw new HttpError(400, `Finance posting failed (net): ${error.message}`);
        netPaymentIds.push(np.id);
      }
      // 2) Income tax (ΦΜΥ) → tax authority.
      let incomeTaxPaymentId: string | null = null;
      if (totalTax > 0) {
        const { data: tp, error } = await supabase.from('planned_payments').insert({
          workspace_id: workspaceId, direction: 'out', amount: totalTax, currency: cur, scheduled_for: statutoryDue,
          category: 'tax', title: `Payroll income tax (ΦΜΥ) — ${run.period}`,
          notes: `Employee income tax withheld for payroll ${run.period}, remitted to the tax authority`, created_by: userId,
        }).select('id').single();
        if (error) throw new HttpError(400, `Finance posting failed (tax): ${error.message}`);
        incomeTaxPaymentId = tp.id;
      }
      // 3) EFKA → one remittance, employer/employee split recorded so the employer's own cost is visible.
      let efkaPaymentId: string | null = null;
      if (totalEfka > 0) {
        const { data: ep, error } = await supabase.from('planned_payments').insert({
          workspace_id: workspaceId, direction: 'out', amount: totalEfka, currency: cur, scheduled_for: statutoryDue,
          category: 'social_security', title: `Payroll EFKA — ${run.period}`,
          notes: `EFKA contributions for payroll ${run.period}: employer ${erEfka} ${cur} + employee (withheld) ${eeEfka} ${cur}`,
          created_by: userId,
        }).select('id').single();
        if (error) throw new HttpError(400, `Finance posting failed (EFKA): ${error.message}`);
        efkaPaymentId = ep.id;
      }

      const ref = {
        posted_at: new Date().toISOString(),
        net_payment_ids: netPaymentIds, income_tax_payment_id: incomeTaxPaymentId, efka_payment_id: efkaPaymentId,
        totals: { net: round2(run.total_net), income_tax: totalTax, employee_efka: eeEfka, employer_efka: erEfka },
      };
      await supabase.from('hr_payroll_runs').update({ posted_finance_ref: ref }).eq('id', id);
      return json({ ok: true, posted: ref });
    }

    // ─────────────────────────── ANALYTICS ───────────────────────────
    // ─────────────────────────── EMPLOYEE PORTAL INVITE ───────────────────────────
    case 'invite-employee': {
      requireManage();
      const id = String(body?.employee_id ?? '');
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!id || !email) return json({ error: 'employee_id and email are required' }, 400);
      const { data: emp } = await supabase.from('hr_employees').select('id, crm_contact_id, user_id').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!emp) return json({ error: 'employee not found' }, 404);
      if (emp.user_id) return json({ error: 'This employee already has portal access.' }, 409);

      const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';
      let newUserId = '';
      let invited = false;
      const { data: inv, error: invErr } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/my-hr` });
      if (inv?.user?.id) { newUserId = inv.user.id; invited = true; }
      else {
        // Likely already registered — find the existing auth user and link them instead.
        const { data: list } = await supabase.auth.admin.listUsers();
        const found = (list?.users ?? []).find((u: any) => String(u.email ?? '').toLowerCase() === email);
        if (found) newUserId = found.id;
        else return json({ error: invErr?.message || 'Could not invite this email.' }, 400);
      }

      // Membership: add 'employee' ONLY if they aren't already a member (never demote an existing
      // owner/admin/sales member — their role stays, and the linked record still enables self-service).
      const { data: mem } = await supabase.from('workspace_members').select('id, role').eq('workspace_id', workspaceId).eq('user_id', newUserId).maybeSingle();
      let roleNote: string | null = null;
      if (!mem) await supabase.from('workspace_members').insert({ workspace_id: workspaceId, user_id: newUserId, role: 'employee', status: 'active' });
      else if (mem.role !== 'employee') roleNote = `Existing ${mem.role} member linked; their role was left unchanged.`;

      await supabase.from('hr_employees').update({ user_id: newUserId }).eq('id', id).eq('workspace_id', workspaceId);
      if (emp.crm_contact_id) await supabase.from('crm_contacts').update({ user_id: newUserId, linked_at: new Date().toISOString(), linked_by: userId }).eq('id', emp.crm_contact_id).eq('workspace_id', workspaceId);
      return json({ ok: true, invited, role_note: roleNote });
    }

    // ─────────────────────────── ANALYTICS ───────────────────────────
    case 'analytics': {
      const [{ data: emps }, { data: summaries }, { data: depts }, { data: apps }, { data: posts }, { data: onb }, { data: lastRun }] = await Promise.all([
        supabase.from('hr_employees').select('id, status, department_id').eq('workspace_id', workspaceId),
        supabase.from('vw_hr_employee_absence_summary').select('total_absence_days, days_by_type, on_leave_today').eq('workspace_id', workspaceId),
        supabase.from('hr_departments').select('id, name').eq('workspace_id', workspaceId),
        supabase.from('hr_applications').select('stage').eq('workspace_id', workspaceId),
        supabase.from('hr_job_postings').select('status').eq('workspace_id', workspaceId),
        supabase.from('hr_onboarding_tasks').select('status').eq('workspace_id', workspaceId),
        supabase.from('hr_payroll_runs').select('period, total_net, currency, status').eq('workspace_id', workspaceId).order('period', { ascending: false }).limit(1),
      ]);
      const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
      const headByDept: Record<string, number> = {};
      for (const e of (emps ?? [])) { const n = e.department_id ? (deptName.get(e.department_id) as string) : 'Unassigned'; headByDept[n] = (headByDept[n] ?? 0) + 1; }
      const absenceByType: Record<string, number> = {};
      let totalAbsence = 0, onLeave = 0;
      for (const s of (summaries ?? [])) { totalAbsence += Number(s.total_absence_days ?? 0); if (s.on_leave_today) onLeave++; for (const [k, v] of Object.entries((s.days_by_type ?? {}) as Record<string, number>)) absenceByType[k] = (absenceByType[k] ?? 0) + Number(v ?? 0); }
      const funnel: Record<string, number> = {};
      for (const a of (apps ?? [])) funnel[a.stage] = (funnel[a.stage] ?? 0) + 1;
      return json({
        analytics: {
          headcount: (emps ?? []).length,
          active: (emps ?? []).filter((e: any) => e.status === 'active').length,
          on_leave_today: onLeave,
          total_absence_days: totalAbsence,
          absence_by_type: absenceByType,
          headcount_by_department: headByDept,
          departments: (depts ?? []).length,
          open_positions: (posts ?? []).filter((p: any) => p.status === 'open').length,
          recruitment_funnel: funnel,
          onboarding_pending: (onb ?? []).filter((t: any) => t.status === 'pending').length,
          last_payroll: (lastRun ?? [])[0] ?? null,
        },
      });
    }

    // ── Attendance: admin clock, PIN, today's board, settings ─────────────────
    case 'clock-employee': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      const punchType = String(body?.punch_type ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      if (!['arrival', 'departure'].includes(punchType)) return json({ error: "punch_type must be 'arrival' or 'departure'" }, 400);
      const r = await fileWorkcardPunch(supabase, workspaceId, userId, {
        employeeId, punchType: punchType as 'arrival' | 'departure',
        comments: body?.comments ? String(body.comments) : undefined, source: 'admin',
      }, { requireErgani: false });
      return json({ ok: true, punch: r.punch, filed: r.filed, reason: r.reason ?? null, is_late: r.isLate ?? null, protocol: r.result?.protocol ?? null });
    }
    case 'set-employee-pin': {
      requireManage();
      const employeeId = String(body?.employee_id ?? '');
      const pin = String(body?.pin ?? '');
      if (!employeeId) return json({ error: 'employee_id is required' }, 400);
      let hash: string | null = null;
      if (pin) {
        if (!/^\d{4,8}$/.test(pin)) return json({ error: 'PIN must be 4–8 digits' }, 400);
        hash = await sha256hex(`${workspaceId}:${pin}`);
      }
      const { error } = await supabase.from('hr_employees').update({ clock_pin_hash: hash }).eq('id', employeeId).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true, pin_set: !!hash });
    }
    case 'attendance-today': {
      const { data: settings } = await supabase.from('hr_settings').select('timezone').eq('workspace_id', workspaceId).maybeSingle();
      const tz = settings?.timezone || 'Europe/Athens';
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const isodow = ((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
      const { data: emps } = await supabase.from('hr_employees')
        .select('id, work_start_time, work_end_time, work_days, status, clock_pin_hash, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( name )')
        .eq('workspace_id', workspaceId);
      const { data: punches } = await supabase.from('hr_time_punches')
        .select('employee_id, punch_type, punched_at, is_late, status, ergani_protocol')
        .eq('workspace_id', workspaceId).eq('reference_date', today).order('punched_at', { ascending: false });
      const latest = new Map<string, any>();
      for (const p of (punches ?? [])) if (!latest.has(p.employee_id)) latest.set(p.employee_id, p);
      const rows = (emps ?? []).map((e: any) => {
        const last = latest.get(e.id) ?? null;
        return {
          employee_id: e.id, name: e.contact?.name ?? '', status: e.status,
          work_today: Array.isArray(e.work_days) ? e.work_days.includes(isodow) : true,
          work_start_time: e.work_start_time, work_end_time: e.work_end_time,
          has_pin: !!e.clock_pin_hash,
          clocked_in: last?.punch_type === 'arrival',
          last_punch_type: last?.punch_type ?? null, last_at: last?.punched_at ?? null,
          last_is_late: last?.is_late ?? null, last_status: last?.status ?? null,
        };
      });
      return json({ date: today, attendance: rows });
    }
    case 'list-notify-candidates': {
      // Workspace members that can be picked as extra late-alert recipients (bell + email).
      const { data: mems } = await supabase.from('workspace_members')
        .select('user_id, role').eq('workspace_id', workspaceId).eq('status', 'active');
      const ids = (mems ?? []).map((m: any) => m.user_id).filter(Boolean);
      const roleByUid = new Map((mems ?? []).map((m: any) => [m.user_id, m.role]));
      let profs: any[] = [];
      if (ids.length) {
        const { data } = await supabase.from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
        profs = data ?? [];
      }
      const candidates = profs.map((p: any) => ({ user_id: p.user_id, name: p.full_name || p.email || 'User', email: p.email ?? null, role: roleByUid.get(p.user_id) ?? null }));
      return json({ candidates });
    }
    case 'get-hr-settings': {
      const { data } = await supabase.from('hr_settings').select('*').eq('workspace_id', workspaceId).maybeSingle();
      return json({ settings: data ?? { workspace_id: workspaceId, timezone: 'Europe/Athens', kiosk_enabled: false, kiosk_require_pin: false, late_alert_enabled: true, late_grace_minutes: 15, notify_owner: true, notify_finance: true, notify_user_ids: [], notify_emails: [], is_default: true } });
    }
    case 'save-hr-settings': {
      requireManage();
      const s = pick(body, ['timezone', 'kiosk_enabled', 'kiosk_require_pin', 'late_alert_enabled', 'late_grace_minutes', 'notify_owner', 'notify_finance', 'notify_user_ids', 'notify_emails']);
      const { data, error } = await supabase.from('hr_settings')
        .upsert({ workspace_id: workspaceId, ...s, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' })
        .select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ settings: data });
    }

    default:
      return null; // not an expansion action
  }
}

/**
 * Employee SELF-SERVICE (prefix 'self-'). The caller is an invited employee (workspace role
 * 'employee') with NO hr.view/hr.manage. Every query is hard-scoped to their OWN employee record
 * (employeeId, already resolved from hr_employees.user_id = caller in index.ts) — so an employee
 * can only ever see/act on their own profile, onboarding, time off and documents, never anyone
 * else's (e.g. a sales rep's) data.
 */
export interface SelfCtx { supabase: any; workspaceId: string; userId: string; employeeId: string; body: any; }
export async function handleSelfService(action: string, ctx: SelfCtx): Promise<Response | null> {
  const { supabase, workspaceId, employeeId, body } = ctx;
  switch (action) {
    case 'self-profile': {
      const { data } = await supabase.from('hr_employees')
        .select('id, employment_type, start_date, weekly_hours, annual_leave_allowance_days, status, department_id, pay_basis, monthly_salary, hourly_rate, salary_currency, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name, email, phone, mobile, position, department, date_of_birth ), department:hr_departments!hr_employees_department_id_fkey ( id, name )')
        .eq('id', employeeId).maybeSingle();
      const { data: sum } = await supabase.from('vw_hr_employee_absence_summary').select('total_absence_days, days_by_type, remaining_leave_days, annual_leave_allowance_days').eq('employee_id', employeeId).maybeSingle();
      return json({ profile: { ...(data ?? {}), summary: sum ?? null } });
    }
    case 'self-onboarding': {
      const { data } = await supabase.from('hr_onboarding_tasks').select('id, title, description, due_date, status, completed_at, sort_order').eq('workspace_id', workspaceId).eq('employee_id', employeeId).order('sort_order');
      return json({ tasks: data ?? [] });
    }
    case 'self-toggle-onboarding': {
      const id = String(body?.task_id ?? '');
      const { data: t } = await supabase.from('hr_onboarding_tasks').select('status').eq('id', id).eq('employee_id', employeeId).maybeSingle();
      if (!t) return json({ error: 'not found' }, 404);
      const next = t.status === 'done' ? 'pending' : 'done';
      const { data } = await supabase.from('hr_onboarding_tasks').update({ status: next, completed_at: next === 'done' ? new Date().toISOString() : null }).eq('id', id).eq('employee_id', employeeId).select('id, title, status, completed_at, sort_order').single();
      return json({ task: data });
    }
    case 'self-timeoff': {
      const { data } = await supabase.from('hr_absences').select('id, absence_type, start_date, end_date, working_days, status, note, created_at').eq('workspace_id', workspaceId).eq('employee_id', employeeId).order('start_date', { ascending: false });
      return json({ absences: data ?? [] });
    }
    case 'self-request-timeoff': {
      const startDate = String(body?.start_date ?? ''), endDate = String(body?.end_date ?? ''), type = String(body?.absence_type ?? 'other');
      if (!startDate || !endDate) return json({ error: 'start_date and end_date are required' }, 400);
      if (!ABSENCE_TYPES.includes(type)) return json({ error: 'invalid absence_type' }, 400);
      if (endDate < startDate) return json({ error: 'end_date must be on or after start_date' }, 400);
      const { data, error } = await supabase.from('hr_absences').insert({
        workspace_id: workspaceId, employee_id: employeeId, absence_type: type, start_date: startDate, end_date: endDate,
        working_days: businessDaysInclusive(startDate, endDate), status: 'pending', note: body?.note ? String(body.note) : null,
      }).select('id, absence_type, start_date, end_date, working_days, status').single();
      if (error) throw new HttpError(400, error.message);
      return json({ absence: data }, 201);
    }
    case 'self-documents': {
      const { data } = await supabase.from('hr_documents').select('id, name, doc_type, size_bytes, created_at').eq('workspace_id', workspaceId).eq('employee_id', employeeId).order('created_at', { ascending: false });
      return json({ documents: data ?? [] });
    }
    // Employee self clock-in/out → Work Card (WRKCardSE), scoped hard to the caller's OWN record.
    // Records the punch locally and files it to Εργάνη when the workspace has credentials configured.
    case 'self-clock': {
      const punchType = String(body?.punch_type ?? '');
      if (!['arrival', 'departure'].includes(punchType)) return json({ error: "punch_type must be 'arrival' or 'departure'" }, 400);
      const r = await fileWorkcardPunch(supabase, workspaceId, ctx.userId, {
        employeeId, punchType: punchType as 'arrival' | 'departure',
        comments: body?.comments ? String(body.comments) : undefined, source: 'self',
      }, { requireErgani: false });
      return json({ ok: true, punch: r.punch, filed: r.filed, reason: r.reason ?? null, protocol: r.result?.protocol ?? null, is_late: r.isLate ?? null });
    }
    case 'self-punches': {
      const days = Math.min(Math.max(Number(body?.days ?? 14), 1), 90);
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase.from('hr_time_punches')
        .select('id, punch_type, reference_date, punched_at, status, ergani_protocol')
        .eq('workspace_id', workspaceId).eq('employee_id', employeeId)
        .gte('reference_date', since).order('punched_at', { ascending: false });
      return json({ punches: data ?? [] });
    }
    case 'self-sign-document': {
      const id = String(body?.document_id ?? '');
      const { data: doc } = await supabase.from('hr_documents').select('storage_bucket, storage_object_path').eq('id', id).eq('employee_id', employeeId).maybeSingle();
      if (!doc) return json({ error: 'not found' }, 404);
      const { data: signed, error } = await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_object_path, 300);
      if (error) throw new HttpError(400, error.message);
      return json({ url: signed?.signedUrl });
    }
    default:
      return null;
  }
}
