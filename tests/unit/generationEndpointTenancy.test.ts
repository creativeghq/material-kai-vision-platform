/**
 * Guard: the paid generation endpoints bind the tenant, validate the URL, and never
 * report a failure as a success. (Audit #364 — EX-1, EX-7, EX-12, EX-13, EX-14.)
 *
 * Every one of these defects produced a HTTP 200 and a plausible-looking row, which is why none
 * of them was visible to a typecheck, an integrity probe or a health signal:
 *
 *   EX-1   `workspace_id` came from the request BODY and then decided which credit pool was
 *          debited, which workspace owned the `generation_3d` / `generation_videos` / `vr_worlds`
 *          row, and which admins could read the `ai_usage_logs` row through its
 *          `is_workspace_admin(workspace_id)` policy. `debit_credits` falls back to the personal
 *          wallet for a non-member, so this was never credit theft — the ROWS still landed in a
 *          stranger's tenant, on their cost dashboard and in their generation history.
 *
 *   EX-7   the same body-supplied image URL was handed to Replicate / Veo / Kling — which fetch
 *          it from THEIR network — before anything validated it, and the provider's output URL
 *          was then downloaded with a bare `fetch()`: no guard, redirects followed, no size cap.
 *
 *   EX-12  a Replicate prediction that `succeeded` with no usable output returned
 *          `success: true, status: 'completed', video_url: null`, kept the credits, and wrote an
 *          `ai_usage_logs` row for a video that does not exist.
 *
 *   EX-13  the VR completion write was a bare `await` whose error was discarded, while the
 *          response was rebuilt from local variables — so a failed write told the caller the
 *          world was ready and left the row on `generating` forever.
 *
 *   EX-14  two of the five generators ended their `ai_usage_logs` insert with
 *          `.then(() => {}, () => {})`, discarding both failure modes. That is the
 *          `stamp_job_refresh_cost` shape: spend charged to a tenant, reported against nobody.
 *
 * Static, over source text — a runtime test would need a live Supabase, a funded Replicate
 * account and a DNS resolver willing to lie. So this pins the SHAPE at each call site, which is
 * what actually regressed: `generate_video`'s own earlier fix stopped at the push site, and this
 * is the same lesson.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const FUNCS = join(ROOT, 'supabase', 'functions');

/** Source with comments stripped, so prose describing the old bug is not read as code. */
function codeOnly(src: string): string {
  return sharedStripComments(src);
}
const read = (rel: string) => codeOnly(readFileSync(join(FUNCS, rel), 'utf8'));

/**
 * Every edge function that accepts a `workspace_id` in its body AND spends credits.
 *
 * Adding a generator means adding it here. The list is the point: EX-1 was reported against
 * `generate-interior-gemini` in an earlier sweep and closed nowhere, while four siblings had the
 * identical shape and three others had already been fixed.
 */
const PAID_GENERATORS = [
  'generate-interior-gemini/index.ts',
  'generate-vr-world/index.ts',
  'generate-interior-video-v2/index.ts',
  'generate-region-edit/index.ts',
  'generate-virtual-staging/index.ts',
  'generate-social-video/index.ts',
  'generate-social-image/index.ts',
  'generate-social-content/index.ts',
];

describe('EX-1 — a body-supplied workspace_id is verified before it is trusted', () => {
  it.each(PAID_GENERATORS)('%s checks membership', (rel) => {
    const src = read(rel);
    expect(src, `${rel} debits and writes against body.workspace_id without proving membership`)
      .toContain('userCanAccessWorkspace');
  });

  it.each(PAID_GENERATORS)('%s answers 404, not 403, on a mismatch', (rel) => {
    const src = read(rel);
    // A distinguishable "not yours" turns the endpoint into a workspace-id oracle: 403 confirms
    // the id exists, 404 says nothing. Invariant 1 is explicit about this.
    const guard = src.slice(src.indexOf('userCanAccessWorkspace'));
    expect(guard, `${rel} distinguishes "exists but not yours" from "not found"`)
      .toMatch(/\b404\b/);
  });

  it('every paid generator that reads body.workspace_id is in the list above', () => {
    // The list is hand-kept, so this is the part that catches a NEW generator: any function
    // whose source both debits credits and reads a workspace id off the body must appear here.
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const missed: string[] = [];
    for (const entry of readdirSync(FUNCS)) {
      if (!entry.startsWith('generate-')) continue;
      const idx = join(FUNCS, entry, 'index.ts');
      if (!existsSync(idx) || !statSync(idx).isFile()) continue;
      const rel = `${entry}/index.ts`;
      if (PAID_GENERATORS.includes(rel)) continue;
      const src = codeOnly(readFileSync(idx, 'utf8'));
      const debits = /debit_credits|debitExternalServiceCredits/.test(src);
      const bodyWorkspace = /workspace_id\s*\??\s*:\s*string|body\.workspace_id|workspace_id,/.test(src);
      if (debits && bodyWorkspace) missed.push(rel);
    }
    expect(
      missed,
      'a new paid generator takes a body workspace_id and is not covered by this guard — ' +
        'add it to PAID_GENERATORS (and give it a userCanAccessWorkspace check):\n  ' + missed.join('\n  '),
    ).toEqual([]);
  });
});

describe('EX-7 — an image URL is validated before a provider is asked to fetch it', () => {
  // These three pass a body-supplied URL to Replicate / Veo / Kling. The provider's fetch is
  // ours by proxy: validating only where WE download something leaves the provider hop open.
  const HANDS_URL_TO_A_PROVIDER = [
    'generate-interior-gemini/index.ts',   // reference_image_url -> callFluxDepthPro
    'generate-interior-video-v2/index.ts', // source_image_url -> Replicate / Veo / Kling
    'generate-virtual-staging/index.ts',   // source_image_url -> Replicate
    'generate-social-video/index.ts',      // source_image_url -> Replicate
  ];

  it.each(HANDS_URL_TO_A_PROVIDER)('%s runs the URL through the shared SSRF guard', (rel) => {
    const src = read(rel);
    expect(src, `${rel} sends a user-supplied URL to a provider without assertSafeUrl`)
      .toContain('assertSafeUrl');
  });

  // The provider's OUTPUT is a URL too, and every one of these downloaded it raw.
  const DOWNLOADS_PROVIDER_OUTPUT: Array<[string, string]> = [
    ['generate-interior-video-v2/index.ts', 'fetchBinaryGuarded'],
    ['generate-social-video/index.ts', 'fetchBinaryGuarded'],
    ['generate-social-image/index.ts', 'fetchImageGuarded'],
  ];

  it.each(DOWNLOADS_PROVIDER_OUTPUT)('%s downloads the output through %s', (rel, fn) => {
    const src = read(rel);
    expect(src, `${rel} hand-rolls the provider-output download again`).toContain(fn);
    expect(src, `${rel} reads an unbounded body straight off a raw fetch`)
      .not.toMatch(/await\s+(?:\w+)?res(?:ponse)?\.arrayBuffer\(\)/);
  });
});

describe('EX-12/EX-13 — a failed write is never reported as a finished job', () => {
  it('generate-social-video refuses to return success with no video', () => {
    const src = read('generate-social-video/index.ts');
    // The success branch must bail when storeVideo yielded nothing, BEFORE it logs usage and
    // tells the caller `status: 'completed'`.
    const succeeded = src.slice(src.indexOf("pollResult.status === 'succeeded'"));
    const bail = succeeded.indexOf('if (!videoUrl)');
    const completed = succeeded.indexOf("status: 'completed'");
    expect(bail, 'a succeeded prediction with no usable output falls through as a success again')
      .toBeGreaterThan(-1);
    expect(bail, 'the empty-output check moved after the success response').toBeLessThan(completed);
    expect(succeeded.slice(bail, completed), 'the credits are no longer refunded when no video arrived')
      .toContain('refundCredits');
  });

  it('generate-vr-world checks the completion write before claiming success', () => {
    const src = read('generate-vr-world/index.ts');
    const complete = src.slice(src.indexOf("status: 'completed',"));
    expect(complete, 'the terminal vr_worlds write discards its error again')
      .toMatch(/completeError|error:\s*complete\w*Err/);
  });
});

describe('EX-14 — an ai_usage_logs failure is reported, never swallowed', () => {
  const BILLED = [
    'generate-interior-gemini/index.ts',
    'generate-vr-world/index.ts',
    'generate-interior-video-v2/index.ts',
    'generate-social-video/index.ts',
    'generate-region-edit/index.ts',
    'generate-virtual-staging/index.ts',
  ];

  it.each(BILLED)('%s reports a failed usage write', (rel) => {
    const src = read(rel);
    const insert = src.indexOf("from('ai_usage_logs')");
    expect(insert, `${rel} no longer writes an ai_usage_logs row at all`).toBeGreaterThan(-1);

    // Asserted POSITIVELY — the insert's own result must be bound and inspected. Testing for the
    // absence of `.then(() => {}, () => {})` instead reads whatever swallow happens to sit
    // further down the file (every one of these has a legitimately fire-and-forget
    // `refund_credits`), which is a guard that fails on the wrong call.
    // The window opens BEFORE the insert: the error is bound by destructuring on the left of
    // `await supabase.from('ai_usage_logs')`, not after it.
    const stmt = src.slice(Math.max(0, insert - 300), insert + 2500);
    expect(stmt, `${rel} discards the usage-log write result — spend charged, reported against nobody`)
      .toMatch(/\berror:\s*usageErr\b/);
    expect(stmt, `${rel} binds the error and then does nothing with it`)
      .toMatch(/if\s*\(\s*usageErr\s*\)\s*throw\s+usageErr/);
    expect(src, `${rel} does not surface a failed billing write anywhere`)
      .toContain('captureException');
  });
});
