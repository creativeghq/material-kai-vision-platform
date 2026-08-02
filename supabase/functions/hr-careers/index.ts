// deno-lint-ignore-file no-explicit-any
// PUBLIC careers page API (anonymous). Lists a workspace's OPEN job postings by public
// slug and accepts applications. No session; resolves the workspace from `slug` (mirrors
// finance-storefront). Apply is Turnstile-gated when TURNSTILE_SECRET_KEY is configured
// (fail-open when not, so it works out of the box). Writes only hr_candidates + hr_applications
// (+ the applicant's résumé into this workspace's own hr/ storage prefix).
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { emitApplicantStage } from '../_shared/hr/applicant-events.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Board (GET) responses are public + pollable, so let aggregators/CDNs cache them briefly. */
function jsonCached(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}

async function verifyTurnstile(secret: string | null, token: string, ip: string): Promise<boolean> {
  // The secret is resolved by the CALLER via resolveSecret (env-first, then platform_secrets).
  // Deno.env.get alone is not enough: bootstrapForFunction() copies platform_secrets into env
  // with Deno.env.set, which this runtime denies (the bootstrap swallows the throw), so an
  // admin-saved key never reaches env and this check silently failed OPEN.
  if (!secret) return true; // genuinely not configured → fail-open (careers form still works)
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
const HR_DOC_BUCKET = 'pdf-documents';         // same private bucket the admin ATS signs from
const RESUME_MAX_BYTES = 8_000_000;            // 8 MB — public callers, keep it tight

/** Per-posting application-form config. Anything the admin didn't set falls back to "ask for it". */
const APPLY_DEFAULTS = {
  require_resume: true, ask_phone: true, ask_location: true, ask_links: true, ask_cover_letter: true,
} as const;
const applyConfig = (raw: any) => ({ ...APPLY_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) });

// The board only needs card-level fields; the detail page additionally needs the body copy.
// Keep these two SEPARATE — folding them into one list either bloats every board response with
// full descriptions, or (as happened once) silently drops the body from the detail page.
const JOB_SUMMARY_COLS =
  'id, slug, title, location, location_type, remote, employment_type, level, salary_min, salary_max, currency, ' +
  'compensation, compensation_note, apply_config, published_at, closes_at, status, ' +
  'department:hr_departments!hr_job_postings_department_id_fkey ( name )';
const JOB_DETAIL_COLS = `${JOB_SUMMARY_COLS}, description, requirements`;

/** Flatten the department join + drop nothing else — these columns are all public by design. */
const shapeJob = (j: any) => ({ ...j, department: j?.department?.name ?? null });

/** A posting is publicly visible only while it is open AND not past its close date. */
const isLive = (j: any) => !!j && j.status === 'open' && (!j.closes_at || new Date(j.closes_at).getTime() > Date.now());

Deno.serve(withApiLogging('hr-careers', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  // ── PUBLIC JOB-BOARD API (GET) ─────────────────────────────────────────────
  // Integration-shaped sibling of the POST `meta` / `get-job` actions, modelled on
  // Greenhouse (/v1/boards/{board}/jobs), Lever and Ashby: a plain GET a human can
  // curl and an aggregator / no-code tool can poll. The POST+action envelope those
  // actions use is unusable for those consumers, which is the whole reason this exists.
  //   GET ?slug=<company>             → { company, count, jobs: [...] }
  //   GET ?slug=<company>&job=<slug>  → { company, job: {...} }  (adds description/requirements)
  // Deliberately jobs-only: no turnstile_site_key and no apply_config — those are UI
  // concerns for our own careers page, noise (and needless surface) for an integrator.
  // Each job carries `absolute_url` so a consumer can link straight to the posting and
  // `updated_at` so it can poll incrementally. Same visibility rule as the page: isLive().
  if (req.method === 'GET') {
    const reqUrl = new URL(req.url);
    const boardSlug = String(reqUrl.searchParams.get('slug') ?? '').trim();
    const boardJobSlug = String(reqUrl.searchParams.get('job') ?? '').trim();
    if (!boardSlug) return json({ error: 'slug is required' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: bws } = await sb
      .from('workspaces').select('id, name, slug, description, settings').eq('slug', boardSlug).maybeSingle();
    if (!bws) return json({ error: 'not found' }, 404);

    const bs = (bws as any).settings ?? {};
    const boardCompany = {
      name: bws.name,
      slug: bws.slug,
      website: bs.website ?? null,
      logo_url: bs.logo_url ?? bs.company_logo_url ?? null,
    };
    const appUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
    const forBoard = (j: any) => {
      const { apply_config: _uiOnly, ...rest } = shapeJob(j);
      return { ...rest, absolute_url: `${appUrl}/careers/${bws.slug}/${j.slug}` };
    };

    if (boardJobSlug) {
      const { data: one } = await sb
        .from('hr_job_postings').select(`${JOB_DETAIL_COLS}, updated_at`)
        .eq('workspace_id', bws.id).eq('slug', boardJobSlug).maybeSingle();
      if (!isLive(one)) return json({ error: 'This position is no longer open.' }, 404);
      return jsonCached({ company: boardCompany, job: forBoard(one) });
    }

    const { data: boardJobs } = await sb
      .from('hr_job_postings').select(`${JOB_SUMMARY_COLS}, updated_at`)
      .eq('workspace_id', bws.id).eq('status', 'open').order('published_at', { ascending: false });
    const live = (boardJobs ?? []).filter(isLive).map(forBoard);
    return jsonCached({ company: boardCompany, count: live.length, jobs: live });
  }

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

  const { data: ws } = await supabase.from('workspaces').select('id, name, slug, description, settings').eq('slug', slug).maybeSingle();
  if (!ws) return json({ error: 'not found' }, 404);

  const siteKeyRes = await resolveSecret(supabase, 'TURNSTILE_SITE_KEY').catch(() => ({ value: null }));
  const turnstileSiteKey = (siteKeyRes as any)?.value || null;
  const settings = (ws as any).settings ?? {};

  // Branding comes from finance_settings — the SAME source the public quote, statement and
  // catalog pages use (see catalog-access → resolveOwnerBranding). The original version read
  // `workspaces.settings.logo_url`, which NOTHING in the app writes, so every careers page
  // rendered the generic fallback icon. Tenants already set this in Finance → Settings.
  const { data: fs } = await supabase
    .from('finance_settings')
    .select('business_name, business_logo_path, business_website')
    .eq('workspace_id', ws.id).maybeSingle();
  const logoUrl = fs?.business_logo_path
    ? supabase.storage.from('generation-images').getPublicUrl(fs.business_logo_path).data.publicUrl
    : (settings.logo_url ?? settings.company_logo_url ?? null);

  const company = {
    name: fs?.business_name || ws.name,
    tagline: settings.careers_tagline ?? ws.description ?? null,
    logo_url: logoUrl,
    website: fs?.business_website ?? settings.website ?? null,
  };

  if (action === 'meta') {
    const { data: jobs } = await supabase
      .from('hr_job_postings').select(JOB_SUMMARY_COLS)
      .eq('workspace_id', ws.id).eq('status', 'open').order('published_at', { ascending: false });
    return json({
      ok: true, company: ws.name, company_profile: company, turnstile_site_key: turnstileSiteKey,
      jobs: (jobs ?? []).filter(isLive).map(shapeJob),
    });
  }

  if (action === 'get-job') {
    // Prefer the human-readable slug (shareable URL); `job_id` stays supported for old links.
    const jobSlug = String(body?.job_slug ?? '').trim();
    const jobId = String(body?.job_id ?? '').trim();
    if (!jobSlug && !jobId) return json({ error: 'job_slug or job_id is required' }, 400);
    let q = supabase.from('hr_job_postings').select(JOB_DETAIL_COLS).eq('workspace_id', ws.id);
    q = jobSlug ? q.eq('slug', jobSlug) : q.eq('id', jobId);
    const { data: job } = await q.maybeSingle();
    if (!isLive(job)) return json({ error: 'This position is no longer open.' }, 404);
    return json({
      ok: true, company: ws.name, company_profile: company, turnstile_site_key: turnstileSiteKey,
      job: { ...shapeJob(job), apply_config: applyConfig((job as any).apply_config) },
    });
  }

  if (action === 'apply') {
    const jobSlug = String(body?.job_slug ?? '').trim();
    const jobId = String(body?.job_id ?? '').trim();
    // Cap every field so a public caller can't store arbitrarily large rows (spam / storage abuse).
    const name = String(body?.name ?? '').trim().slice(0, 200);
    const email = String(body?.email ?? '').trim().slice(0, 200);
    if ((!jobId && !jobSlug) || !name) return json({ error: 'Name is required.' }, 400);
    // Bot check (only enforced when configured).
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

    // Job must be live + in this workspace (never trust a body-supplied workspace).
    let jq = supabase.from('hr_job_postings').select('id, status, closes_at, apply_config').eq('workspace_id', ws.id);
    jq = jobSlug ? jq.eq('slug', jobSlug) : jq.eq('id', jobId);
    const { data: job } = await jq.maybeSingle();
    if (!isLive(job)) return json({ error: 'This position is no longer open.' }, 404);
    const cfg = applyConfig((job as any).apply_config);

    // Résumé (optional per posting). Decoded + sniffed here so we never store a mislabelled blob.
    const resumeB64 = String(body?.resume_base64 ?? '');
    let resumeBytes: Uint8Array | null = null;
    if (resumeB64) {
      try { resumeBytes = Uint8Array.from(atob(resumeB64), (ch) => ch.charCodeAt(0)); }
      catch { return json({ error: 'Could not read that file — please re-upload.' }, 400); }
      if (resumeBytes.length > RESUME_MAX_BYTES) return json({ error: 'Résumé is too large (max 8MB).' }, 400);
      const isPdf = resumeBytes.length > 4 && resumeBytes[0] === 0x25 && resumeBytes[1] === 0x50 && resumeBytes[2] === 0x44 && resumeBytes[3] === 0x46;
      if (!isPdf) return json({ error: 'Please upload your résumé as a PDF.' }, 400);
    }
    if (cfg.require_resume && !resumeBytes) return json({ error: 'A résumé (PDF) is required for this role.' }, 400);

    // Bot check LAST, right before anything is written. The checks above (job live, per-IP
    // throttle, résumé type/size) are cheap and side-effect-free, so a malformed or flooding
    // request never burns a Turnstile verification — and they stay observable to an automated
    // caller that cannot mint a challenge token.
    const secretRes = await resolveSecret(supabase, 'TURNSTILE_SECRET_KEY').catch(() => ({ value: null }));
    if (!(await verifyTurnstile((secretRes as any)?.value || null, String(body?.turnstile_token ?? ''), clientIp(req)))) {
      return json({ error: 'Bot check failed — please retry.' }, 400);
    }

    // Reuse an existing candidate (same email in this workspace) else create one.
    const profile = {
      phone: String(body?.phone ?? '').trim().slice(0, 50) || null,
      headline: String(body?.headline ?? '').trim().slice(0, 300) || null,
      location: String(body?.location ?? '').trim().slice(0, 200) || null,
      links: String(body?.links ?? '').trim().slice(0, 1000) || null,
    };
    let candidateId = '';
    if (email) {
      const { data: existing } = await supabase.from('hr_candidates').select('id').eq('workspace_id', ws.id).eq('email', email).maybeSingle();
      if (existing) {
        candidateId = existing.id;
        // Refresh the profile from this (newer) application, but never blank out what we already had.
        const patch = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null));
        if (Object.keys(patch).length) await supabase.from('hr_candidates').update(patch).eq('id', candidateId).eq('workspace_id', ws.id);
      }
    }
    if (!candidateId) {
      const { data: c, error: cErr } = await supabase.from('hr_candidates').insert({
        workspace_id: ws.id, name, email: email || null, source: 'careers_page', ...profile,
      }).select('id').single();
      if (cErr) return json({ error: 'Could not submit application.' }, 400);
      candidateId = c.id;
    }

    // Store the résumé under this workspace's own hr/ prefix so the admin CV viewer
    // (`assertHrObjectPath`) can sign it, and no other tenant's path is reachable.
    if (resumeBytes) {
      const safe = String(body?.resume_filename ?? 'resume.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `hr/${ws.id}/candidates/${candidateId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(HR_DOC_BUCKET)
        .upload(path, resumeBytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) return json({ error: 'Could not upload your résumé — please try again.' }, 400);
      await supabase.from('hr_candidates').update({ resume_bucket: HR_DOC_BUCKET, resume_path: path })
        .eq('id', candidateId).eq('workspace_id', ws.id);
    }

    const { data: appRow, error: aErr } = await supabase.from('hr_applications').insert({
      workspace_id: ws.id, job_posting_id: (job as any).id, candidate_id: candidateId, stage: 'applied',
      notes: String(body?.cover_letter ?? '').trim().slice(0, 5000) || null,
    }).select('id').single();
    if (aErr) {
      if ((aErr as any).code === '23505') return json({ ok: true, already: true, message: "You've already applied to this role." });
      return json({ error: 'Could not submit application.' }, 400);
    }
    // Notify owner/admins of the new inbound application (same Flow event the admin-create path
    // emits) so a real public application isn't silently piling up in the Recruitment tab.
    if (appRow?.id) await emitApplicantStage(supabase, ws.id, appRow.id, null, 'applied');
    return json({ ok: true, message: 'Application submitted — thank you!' });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
