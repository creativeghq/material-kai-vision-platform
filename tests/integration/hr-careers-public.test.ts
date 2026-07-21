import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, SUPABASE_URL, type TestUser } from './_harness';

// Public careers API (`hr-careers`) — anonymous, so this calls it with NO Authorization header,
// exactly as a logged-out visitor's browser does.
//
// Exists because of a shipped regression: consolidating the `meta` and `get-job` selects onto one
// shared column list silently dropped `description`/`requirements` from the detail response. The
// API still returned 200 with a plausible-looking payload, so an eyeball check of the JSON passed
// — the public page just rendered its "Full details coming soon" empty state on every role. A
// contract assertion on the FIELDS, not the status code, is what catches that class of bug.
const suite = hasCreds ? describe : describe.skip;

const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

suite('hr-careers · public careers page', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser;
  let wsA = '', wsSlug = '', openJob = '', openSlug = '';

  // Anonymous call — only the publishable/anon key, never a user JWT.
  // `apply` is Turnstile-gated and a test cannot mint a challenge token, so no assertion here
  // reaches the INSERT. The function deliberately runs its cheap guards (job live, throttle,
  // résumé type/size) BEFORE the bot check so they remain observable to a caller like this one.
  async function careers(body: Record<string, unknown>) {
    const key = ANON_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hr-careers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) as any };
  }

  const seedPosting = async (over: Record<string, unknown>) => {
    const { data, error } = await svc.from('hr_job_postings').insert({
      workspace_id: wsA, title: `E2E Role ${rid}`,
      description: 'DESC_MARKER body copy.', requirements: 'REQ_MARKER bullet list.',
      employment_type: 'full_time', location: 'Athens', location_type: 'remote', remote: true, level: 'P4',
      salary_min: 50000, salary_max: 70000, currency: 'EUR',
      ...over,
    }).select('id, slug').single();
    if (error) throw new Error(`seed posting: ${error.message}`);
    return data;
  };

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'hrcar', rid);
    wsA = await createWorkspace(svc, 'wsHR', rid, A.id);
    await addMember(svc, wsA, A.id, 'owner');
    const { data: ws } = await svc.from('workspaces').select('slug').eq('id', wsA).single();
    wsSlug = ws!.slug;
    const j = await seedPosting({ status: 'open', published_at: new Date().toISOString() });
    openJob = j.id; openSlug = j.slug!;
  });

  afterAll(async () => {
    await svc.from('hr_job_postings').delete().eq('workspace_id', wsA).then(() => {}, () => {});
    await svc.from('hr_kiosk_attempts').delete().eq('workspace_id', wsA).then(() => {}, () => {});
    await teardown(svc, { wsIds: [wsA], userIds: [A.id] });
  });

  it('assigns every posting a URL-safe slug (the shareable per-job link)', () => {
    expect(openSlug).toMatch(/^[a-z0-9-]+$/);
  });

  it('get-job returns the BODY COPY, not just the card fields', async () => {
    const { status, body } = await careers({ action: 'get-job', slug: wsSlug, job_slug: openSlug });
    expect(status).toBe(200);
    // The regression: these two were absent while every other field was present.
    expect(body.job.description, 'description missing → page renders its empty state').toContain('DESC_MARKER');
    expect(body.job.requirements, 'requirements missing → page renders its empty state').toContain('REQ_MARKER');
    // apply_config is always fully defaulted so the form never has to guess.
    expect(body.job.apply_config).toMatchObject({
      require_resume: expect.any(Boolean), ask_phone: expect.any(Boolean),
      ask_location: expect.any(Boolean), ask_links: expect.any(Boolean), ask_cover_letter: expect.any(Boolean),
    });
  });

  it('resolves a job by uuid too (legacy links keep working)', async () => {
    const { body } = await careers({ action: 'get-job', slug: wsSlug, job_id: openJob });
    expect(body.job?.id).toBe(openJob);
  });

  it('meta lists open roles with the fields the board renders', async () => {
    const { body } = await careers({ action: 'meta', slug: wsSlug });
    const row = body.jobs.find((j: any) => j.id === openJob);
    expect(row, 'open posting missing from the board').toBeTruthy();
    expect(row.slug).toBe(openSlug);
    expect(row.compensation).toBeInstanceOf(Array);
  });

  it('hides draft postings from the public board', async () => {
    const draft = await seedPosting({ status: 'draft' });
    const { body } = await careers({ action: 'meta', slug: wsSlug });
    expect(body.jobs.map((j: any) => j.id)).not.toContain(draft.id);
    const one = await careers({ action: 'get-job', slug: wsSlug, job_slug: draft.slug });
    expect(one.status).toBe(404);
  });

  it('treats a past closes_at as closed even while status is still open', async () => {
    const expired = await seedPosting({
      status: 'open', published_at: new Date().toISOString(),
      closes_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const { body } = await careers({ action: 'meta', slug: wsSlug });
    expect(body.jobs.map((j: any) => j.id)).not.toContain(expired.id);
    expect((await careers({ action: 'get-job', slug: wsSlug, job_slug: expired.slug })).status).toBe(404);
    // …and it must not silently accept applications either.
    const applied = await careers({ action: 'apply', slug: wsSlug, job_slug: expired.slug, name: 'Late Applicant' });
    expect(applied.status).toBe(404);
  });

  it('never resolves a job slug under another workspace (tenancy)', async () => {
    const { status } = await careers({ action: 'get-job', slug: 'test-alpha', job_slug: openSlug });
    expect(status).toBe(404);
  });

  it('rejects a non-PDF résumé regardless of the filename', async () => {
    const notPdf = Buffer.from('hello world').toString('base64');
    const { body } = await careers({
      action: 'apply', slug: wsSlug, job_slug: openSlug, name: 'E2E Applicant',
      email: `e2e-appl-${rid}@materialshub.gr`, resume_base64: notPdf, resume_filename: 'cv.pdf',
    });
    expect(body.error, 'résumé type check must run BEFORE the bot gate').toMatch(/PDF/i);
  });

  it('enforces Turnstile — and only AFTER the résumé and job checks pass', async () => {
    // A well-formed application with a valid PDF gets all the way to the Turnstile check, which
    // proves every guard before it accepted the payload. The storage-prefix behaviour this used
    // to assert was verified against prod before Turnstile was switched on; it cannot be
    // exercised from CI without a real challenge token.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
    const { body } = await careers({
      action: 'apply', slug: wsSlug, job_slug: openSlug, name: 'E2E Applicant',
      email: `e2e-appl2-${rid}@materialshub.gr`, resume_base64: pdf, resume_filename: 'cv.pdf',
    });
    // Reaching the gate proves every guard before it accepted the payload; matching /bot check/
    // proves the gate is enforced rather than fail-open.
    expect(body.error, 'tokenless anonymous apply was accepted — Turnstile is fail-open again')
      .toMatch(/bot check/i);
  });
});
