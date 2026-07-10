// deno-lint-ignore-file no-explicit-any
// #252 — PUBLIC careers page API (anonymous). Lists a workspace's OPEN job postings by public
// slug and accepts applications. No session; resolves the workspace from `slug` (mirrors
// finance-storefront). Apply is Turnstile-gated when TURNSTILE_SECRET_KEY is configured
// (fail-open when not, so it works out of the box). Writes only hr_candidates + hr_applications.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecret } from '../_shared/secrets.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // not configured → fail-open (careers form still works)
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const out = await r.json().catch(() => ({ success: false }));
  return !!out.success;
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || '0.0.0.0';
}

const CAREERS_MAX_PER_WINDOW = 8;              // applications per IP per window
const CAREERS_WINDOW_MS = 10 * 60_000;

Deno.serve(withApiLogging('hr-careers', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await bootstrapForFunction(); // pull TURNSTILE_* from platform_secrets into env if unset

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const action = String(body?.action ?? '').trim();
  const slug = String(body?.slug ?? '').trim();
  if (!action || !slug) return json({ error: 'action and slug are required' }, 400);

  const { data: ws } = await supabase.from('workspaces').select('id, name, slug').eq('slug', slug).maybeSingle();
  if (!ws) return json({ error: 'not found' }, 404);

  const siteKeyRes = await resolveSecret(supabase, 'TURNSTILE_SITE_KEY').catch(() => ({ value: null }));
  const turnstileSiteKey = (siteKeyRes as any)?.value || null;

  if (action === 'meta') {
    const { data: jobs } = await supabase
      .from('hr_job_postings')
      .select('id, title, location, remote, employment_type, salary_min, salary_max, currency, published_at, department:hr_departments!hr_job_postings_department_id_fkey ( name )')
      .eq('workspace_id', ws.id).eq('status', 'open').order('published_at', { ascending: false });
    return json({
      ok: true, company: ws.name, turnstile_site_key: turnstileSiteKey,
      jobs: (jobs ?? []).map((j: any) => ({ ...j, department: j.department?.name ?? null })),
    });
  }

  if (action === 'get-job') {
    const jobId = String(body?.job_id ?? '');
    const { data: job } = await supabase
      .from('hr_job_postings')
      .select('id, title, location, remote, employment_type, description, requirements, salary_min, salary_max, currency, published_at, status, department:hr_departments!hr_job_postings_department_id_fkey ( name )')
      .eq('id', jobId).eq('workspace_id', ws.id).maybeSingle();
    if (!job || job.status !== 'open') return json({ error: 'This position is no longer open.' }, 404);
    return json({ ok: true, company: ws.name, turnstile_site_key: turnstileSiteKey, job: { ...job, department: (job as any).department?.name ?? null } });
  }

  if (action === 'apply') {
    const jobId = String(body?.job_id ?? '');
    // Cap every field so a public caller can't store arbitrarily large rows (spam / storage abuse).
    const name = String(body?.name ?? '').trim().slice(0, 200);
    const email = String(body?.email ?? '').trim().slice(0, 200);
    if (!jobId || !name) return json({ error: 'Name is required.' }, 400);
    // Bot check (only enforced when configured).
    if (Deno.env.get('TURNSTILE_SECRET_KEY') && !(await verifyTurnstile(String(body?.turnstile_token ?? ''), clientIp(req)))) {
      return json({ error: 'Bot check failed — please retry.' }, 400);
    }
    // Per-IP throttle (works even when Turnstile isn't configured): cap applications per IP per window.
    const ip = clientIp(req);
    const rlSince = new Date(Date.now() - CAREERS_WINDOW_MS).toISOString();
    const { count: recent } = await supabase.from('hr_kiosk_attempts')
      .select('*', { count: 'exact', head: true }).eq('ip', ip).eq('outcome', 'careers_apply').gte('created_at', rlSince);
    if ((recent ?? 0) >= CAREERS_MAX_PER_WINDOW) {
      await supabase.from('hr_kiosk_attempts').insert({ workspace_id: ws.id, ip, outcome: 'careers_rl' });
      return json({ error: 'Too many applications from this network. Please try again later.' }, 429);
    }
    await supabase.from('hr_kiosk_attempts').insert({ workspace_id: ws.id, ip, outcome: 'careers_apply' });
    // Job must be open + in this workspace.
    const { data: job } = await supabase.from('hr_job_postings').select('id, status').eq('id', jobId).eq('workspace_id', ws.id).maybeSingle();
    if (!job || job.status !== 'open') return json({ error: 'This position is no longer open.' }, 404);

    // Reuse an existing candidate (same email in this workspace) else create one.
    let candidateId = '';
    if (email) {
      const { data: existing } = await supabase.from('hr_candidates').select('id').eq('workspace_id', ws.id).eq('email', email).maybeSingle();
      if (existing) candidateId = existing.id;
    }
    if (!candidateId) {
      const { data: c, error: cErr } = await supabase.from('hr_candidates').insert({
        workspace_id: ws.id, name, email: email || null,
        phone: String(body?.phone ?? '').trim().slice(0, 50) || null, headline: String(body?.headline ?? '').trim().slice(0, 300) || null, source: 'careers_page',
      }).select('id').single();
      if (cErr) return json({ error: 'Could not submit application.' }, 400);
      candidateId = c.id;
    }
    const { error: aErr } = await supabase.from('hr_applications').insert({
      workspace_id: ws.id, job_posting_id: jobId, candidate_id: candidateId, stage: 'applied',
      notes: String(body?.cover_letter ?? '').trim().slice(0, 5000) || null,
    });
    if (aErr) {
      if ((aErr as any).code === '23505') return json({ ok: true, already: true, message: "You've already applied to this role." });
      return json({ error: 'Could not submit application.' }, 400);
    }
    return json({ ok: true, message: 'Application submitted — thank you!' });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
