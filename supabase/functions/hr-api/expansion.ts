// deno-lint-ignore-file no-explicit-any
// #252 HR expansion — org, recruitment/ATS (+ AI job descriptions), onboarding, documents,
// payroll (+ Finance link via planned_payments), analytics. Dispatched from index.ts AFTER the
// caller is bound to the workspace + entitlement + hr.view is confirmed. Writes require hr.manage.
import { corsHeaders } from '../_shared/cors.ts';
import { HttpError } from '../_shared/api-logger.ts';

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
const DOC_TYPES = ['contract', 'id', 'certificate', 'payslip', 'review', 'other'];
const HR_DOC_BUCKET = 'pdf-documents';

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
async function anthropicTool(prompt: string, tool: any): Promise<any> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new HttpError(400, 'AI is not configured (ANTHROPIC_API_KEY missing)');
  const model = Deno.env.get('HR_JOB_AI_MODEL') || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 1500,
      tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new HttpError(502, `AI request failed (${res.status})`);
  const data = await res.json();
  const block = (data.content || []).find((b: any) => b.type === 'tool_use');
  if (!block?.input) throw new HttpError(502, 'AI returned no structured result');
  return block.input;
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
      const out = await anthropicTool(
        `Write a compelling, inclusive job description. Be concrete and avoid clichés. Use British/International English.\n\n${ctxBits}`,
        tool,
      );
      return json({ generated: out });
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
          candidate:hr_candidates!hr_applications_candidate_id_fkey ( id, name, email, phone, headline ),
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
      return json({ application: data }, 201);
    }
    case 'update-application': {
      requireManage();
      const id = String(body?.application_id ?? '');
      if (!id) return json({ error: 'application_id is required' }, 400);
      const fields = pick(body, ['stage', 'rating', 'notes']);
      if (fields.stage && !APP_STAGES.includes(String(fields.stage))) return json({ error: 'invalid stage' }, 400);
      const { data, error } = await supabase.from('hr_applications').update(fields).eq('id', id).eq('workspace_id', workspaceId).select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!data) return json({ error: 'not found' }, 404);
      return json({ application: data });
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
      // Auto-populate items from active employees using their monthly_salary.
      const { data: emps } = await supabase.from('hr_employees')
        .select('id, monthly_salary, salary_currency').eq('workspace_id', workspaceId).eq('status', 'active');
      const items = (emps ?? []).map((e: any) => {
        const gross = Number(e.monthly_salary ?? 0);
        return { workspace_id: workspaceId, run_id: run.id, employee_id: e.id, gross, deductions: 0, net: gross, currency: e.salary_currency ?? run.currency };
      });
      if (items.length) await supabase.from('hr_payroll_items').insert(items);
      const totalGross = items.reduce((s: number, i: any) => s + i.gross, 0);
      await supabase.from('hr_payroll_runs').update({ total_gross: totalGross, total_net: totalGross }).eq('id', run.id);
      return json({ run: { ...run, total_gross: totalGross, total_net: totalGross }, items: items.length }, 201);
    }
    case 'get-payroll-run': {
      const id = String(body?.run_id ?? '');
      if (!id) return json({ error: 'run_id is required' }, 400);
      const { data: run } = await supabase.from('hr_payroll_runs').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!run) return json({ error: 'not found' }, 404);
      const { data: items } = await supabase.from('hr_payroll_items')
        .select('*, employee:hr_employees!hr_payroll_items_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
        .eq('run_id', id).order('id');
      return json({ run, items: items ?? [] });
    }
    case 'update-payroll-item': {
      requireManage();
      const id = String(body?.item_id ?? '');
      if (!id) return json({ error: 'item_id is required' }, 400);
      const gross = Number(body?.gross ?? 0), deductions = Number(body?.deductions ?? 0);
      if (!Number.isFinite(gross) || !Number.isFinite(deductions) || gross < 0 || deductions < 0) return json({ error: 'gross/deductions must be non-negative numbers' }, 400);
      const net = Math.max(0, gross - deductions);
      const { data: item, error } = await supabase.from('hr_payroll_items')
        .update({ gross, deductions, net, note: body?.note ?? null }).eq('id', id).eq('workspace_id', workspaceId).select('run_id').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!item) return json({ error: 'not found' }, 404);
      // Recompute run totals.
      const { data: all } = await supabase.from('hr_payroll_items').select('gross, net').eq('run_id', item.run_id);
      const tg = (all ?? []).reduce((s: number, i: any) => s + Number(i.gross), 0);
      const tn = (all ?? []).reduce((s: number, i: any) => s + Number(i.net), 0);
      await supabase.from('hr_payroll_runs').update({ total_gross: tg, total_net: tn }).eq('id', item.run_id);
      return json({ ok: true, total_gross: tg, total_net: tn });
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
      // Create a planned outgoing payment in Finance for the net payroll.
      const scheduled = `${run.period}-28`;
      const { data: pp, error } = await supabase.from('planned_payments').insert({
        workspace_id: workspaceId, direction: 'out', amount: Number(run.total_net), currency: run.currency,
        scheduled_for: scheduled, category: 'salary', title: `Payroll ${run.period}`,
        notes: `HR payroll run ${run.period} (${run.total_net} ${run.currency} net)`, created_by: userId,
      }).select('id').single();
      if (error) throw new HttpError(400, `Finance posting failed: ${error.message}`);
      await supabase.from('hr_payroll_runs').update({ posted_finance_ref: { planned_payment_id: pp.id, posted_at: new Date().toISOString() } }).eq('id', id);
      return json({ ok: true, planned_payment_id: pp.id });
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

    default:
      return null; // not an expansion action
  }
}
