/**
 * Regression guards for the edge-function audit (#363).
 *
 * Every case here is a defect that was live, produced no error, and could not be seen by
 * typecheck, RLS or any integrity probe — the recurring shape in this codebase. They are
 * grouped by what makes each one invisible, because that is what decides whether a source scan
 * is the right guard or a poor substitute for one.
 *
 * WHY SOURCE SCANS. Four of these (EE-2, EE-5, EE-10, EE-13) are "a correct value that is never
 * computed" or "the wrong one of two helpers". Nothing throws, so a behavioural test would need
 * to assert on a number nobody produces. The thing that actually regressed in each case was a
 * line of code, and a line of code is what this checks.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const AI_CLIENT = 'supabase/functions/_shared/ai-client.ts';
const AI_LOGGER = 'supabase/functions/_shared/ai-logger.ts';
const AUTH = 'supabase/functions/_shared/auth.ts';
const CONFIG = 'supabase/functions/_shared/config.ts';
const CREDIT_UTILS = 'supabase/functions/_shared/credit-utils.ts';
const RUNNER = 'supabase/functions/background-agent-runner/index.ts';
const RECOVERY = 'supabase/functions/auto-recovery-cron/index.ts';
const CRAWLER = 'supabase/functions/crawl-user-website/index.ts';
const XML = 'supabase/functions/xml-import-orchestrator/index.ts';
const CATALOG_EXTRACT = 'supabase/functions/catalog-extract-from-pdfs/index.ts';

/**
 * Strip comments before any "must NOT contain" assertion.
 *
 * Three of these guards failed on their first run by matching the very comments that explain
 * the fix — the code says `readCappedText(...)` while the comment above it quotes the
 * `await res.text()` it replaced. A negative source scan that its own documentation can trip is
 * worse than no scan: it fails when the code is right, so the fix is to delete the comment,
 * and the guard has then taught you to remove the explanation.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Body of a top-level `export async function NAME(` / `async function NAME(` up to the next one. */
function functionBody(src: string, name: string): string {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]`);
  const m = re.exec(src);
  if (!m) return '';
  const rest = src.slice(m.index);
  const next = /\n(?:export\s+)?(?:async\s+)?function\s/.exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
}

describe('#363 EE-2 — image and video spend reaches ai_usage_logs', () => {
  const src = read(AI_CLIENT);

  // Every one of these called a paid provider and wrote no billing row at all, so the cost
  // dashboard and every per-workspace view under-reported by the whole value of image and
  // video generation. A missing row is indistinguishable from an unused feature.
  const PER_UNIT_PRODUCERS = [
    'generateImageWithGemini',
    'generateMultiImageWithGemini',
    'generateVideoWithVeo',
    'generateVideoWithVeoRaw',
    'generateVideoWithKling',
    'generateImageWithGrok',
    'editImageWithGrok',
  ];

  it.each(PER_UNIT_PRODUCERS)('%s records a per-unit usage row', (fn) => {
    const body = functionBody(src, fn);
    expect(body, `${fn} not found in ai-client.ts`).not.toBe('');
    // `logVeo` / `logGrok` are thin local wrappers around _logUnitCall in the same function.
    expect(
      /_logUnitCall|logVeo\(|logGrok\(/.test(body),
      `${fn} calls a paid provider without writing an ai_usage_logs row — that spend is invisible to every cost view`,
    ).toBe(true);
  });

  it('never guesses a price for a model with no verified rate', () => {
    const logger = read(AI_LOGGER);
    // `veo-2` carries pricing_key = NULL in generation_models on purpose. Resolution must
    // return null and the caller must log a null cost, not substitute a name-similar row.
    expect(logger).toContain('resolveUnitPrice');
    const body = functionBody(logger, 'resolveUnitPrice');
    expect(body).toContain('pricing[pk]');
    // A null pricing_key short-circuits rather than falling through to a direct key lookup.
    expect(body).toMatch(/return pk \? \(pricing\[pk\] \?\? null\) : null/);
  });

  it('logs a null cost rather than a zero when the model is unpriced', () => {
    const body = functionBody(src, '_logUnitCall');
    expect(body).toContain('rawCost = price ? price.perUnit * billableUnits : null');
    // A 0 would claim the call was free; null is a gap ops.silent_zero can surface.
    expect(stripComments(body)).not.toMatch(/rawCost\s*=\s*price\s*\?[^:]*:\s*0\b/);
  });
});

describe('#363 EE-4 — no unguarded fetch of a URL this runtime did not choose', () => {
  it('ai-client inlines image URLs through the shared guard', () => {
    const body = functionBody(read(AI_CLIENT), 'generateMultiImageWithGemini');
    expect(body).toContain('fetchImageGuarded(img)');
    // The bare `fetch(img)` this replaced followed redirects and read an unbounded body.
    expect(stripComments(body)).not.toMatch(/await fetch\(img\)/);
  });

  it('the ruleset carries a rule for the class, scoped to downloads', () => {
    const ruleset = read('.github/semgrep-security.yml');
    expect(ruleset).toContain('no-unguarded-download-of-user-url');
    // Taint mode: source is the fetch, sink is the byte read. A rule on "fetch a variable"
    // matched 253 sites here and would have been annotated into silence.
    expect(ruleset).toContain('mode: taint');
  });
});

describe('#363 EE-5/EE-6/EE-8 — the shared core has no weaker second path', () => {
  it('getClientIP delegates to the trusted-hop helper', () => {
    const src = read(CONFIG);
    expect(src).toContain('getTrustedClientIp(req)');
    // The leftmost x-forwarded-for hop is caller-controlled; keying a quota on it means one
    // header rotation per request buys a fresh bucket (invariant 10).
    expect(stripComments(src)).not.toMatch(/x-forwarded-for'\s*\)[\s\S]{0,120}?split\(','\)\[0\]/);
  });

  it('the duplicate AuthUtils.checkAuthentication path is gone', () => {
    const src = read(CONFIG);
    expect(stripComments(src)).not.toMatch(/static\s+async\s+checkAuthentication\s*\(/);
  });

  it('allowAnon fails closed when the anon key is unset', () => {
    const src = read(AUTH);
    // `?? adminClient` turned a missing env var into full service-role authority for an
    // anonymous caller — a misconfiguration resolving to the most privileged outcome.
    expect(stripComments(src)).not.toContain('rlsBoundClient(null) ?? adminClient');
    expect(src).toContain('SUPABASE_ANON_KEY is not configured');
  });

  it('allowedRoles still filters on active membership', () => {
    const src = read(AUTH);
    const call = /workspace_members'\)[\s\S]{0,240}?\.limit\(1\)/.exec(src)?.[0] ?? '';
    expect(call, 'the allowedRoles membership lookup was not found').not.toBe('');
    // Without this a removed admin whose row survives keeps passing every gate (#362).
    expect(call).toContain(".eq('status', 'active')");
  });
});

describe('#363 EE-7 — an agent turn cannot be refunded twice', () => {
  it('the refund names the debit it reverses', () => {
    const body = functionBody(read(CREDIT_UTILS), 'refundAgentChatTurn');
    expect(body).toContain('debitTransactionId');
    expect(body).toContain('refunds_transaction_id');
  });

  it('a duplicate refund is treated as success, not as a failure to retry', () => {
    const body = functionBody(read(CREDIT_UTILS), 'refundAgentChatTurn');
    expect(body).toMatch(/23505|duplicate key/);
  });

  it('the caller latches so it does not even attempt a second refund', () => {
    const src = read('supabase/functions/agent-chat/index.ts');
    expect(src).toContain('partnerTurnRefunded');
    expect(src).toContain('partnerTurnDebitTxnId');
  });
});

describe('#363 EE-9 — a run_id is bound to the agent that was named', () => {
  const src = read(RUNNER);

  it('rejects a run belonging to another agent or workspace', () => {
    // agent_id and run_id were trusted as an unrelated pair: the membership check validated
    // the caller against agent_id's workspace, then ANY run was loaded by id. That is a
    // cross-tenant read, a cross-tenant write, and a message posted into another tenant's chat.
    expect(src).toContain('runRecord.agent_id !== agent_id');
    expect(src).toMatch(/runRecord\.workspace_id \?\? null\) !== \(agentConfig\.workspace_id \?\? null\)/);
  });

  it('returns 404 on mismatch so run ids cannot be probed', () => {
    const i = src.indexOf('runRecord.agent_id !== agent_id');
    expect(i).toBeGreaterThan(-1);
    const after = src.slice(i, i + 700);
    expect(after).toContain('status: 404');
    expect(stripComments(after)).not.toContain('status: 403');
  });

  it('carries the acting user into the run context', () => {
    expect(src).toContain('actingUserId');
    // dispatch_background_task has always recorded dispatched_by; nothing read it.
    expect(src).toContain('dispatched_by');
  });

  it('bills the dispatching user, not whoever created the agent', () => {
    const agent = read('supabase/functions/_shared/agents/kai-task-agent.ts');
    expect(agent).toContain('actingUserId ?? agentConfig.created_by');
  });
});

describe('#363 EE-10/EE-12 — XML recovery judges liveness by heartbeat', () => {
  const body = functionBody(read(RECOVERY), 'detectStuckXmlJobs');

  it('filters on last_heartbeat, not on updated_at alone', () => {
    // Nothing ever writes background_jobs.updated_at for an XML import — the sync trigger
    // maintains last_heartbeat and leaves updated_at at insert time — so the old filter
    // flagged every import still running at 30 minutes, restarted it from progress 0 three
    // times, then recorded it failed.
    expect(body).toContain("lt('last_heartbeat'");
    expect(body).toContain("is('last_heartbeat', null)");
  });

  it('honours current_slow_operation like the PDF path does', () => {
    expect(body).toContain('current_slow_operation');
    expect(body).toContain('expected_max_seconds');
  });

  it('still claims with a compare-and-swap', () => {
    // EE-11 asserted claims lacked a CAS; they did not. Pin it so that stays true.
    const claim = functionBody(read(RECOVERY), 'recoverXmlJob');
    expect(claim).toContain(".eq('status', 'processing')");
  });
});

describe('#363 EE-13/14/18/19 — the crawler', () => {
  const src = read(CRAWLER);

  it('validates sitemap-derived URLs before spending a Firecrawl call on them', () => {
    const body = functionBody(src, 'firecrawlScrape');
    expect(body).toContain('assertSafeUrl(url)');
  });

  it('caps the response body while reading it', () => {
    expect(src).toContain('MAX_SITEMAP_BYTES');
    expect(src).toContain('readCappedText');
    // `await res.text()` has already lost by the time you could check the length.
    expect(stripComments(functionBody(src, 'fetchText'))).not.toContain('await res.text()');
  });

  it('validates a robots.txt-declared sitemap before returning it for storage', () => {
    const body = functionBody(src, 'discoverSitemapUrl');
    expect(body).toContain('assertSafeUrl');
  });

  it('stores the discovered sitemap only after it yields URLs', () => {
    // Store-then-validate left an unvalidated, attacker-chosen URL in user_websites for any
    // later consumer that does not re-check it.
    const body = functionBody(src, 'crawlOneWebsite');
    const store = body.indexOf("update({ sitemap_url: sitemapUrl })");
    const collect = body.indexOf('collectSitemapUrls');
    expect(store).toBeGreaterThan(-1);
    expect(collect).toBeGreaterThan(-1);
    expect(store, 'sitemap_url is persisted before it has been validated/used').toBeGreaterThan(collect);
  });

  it('does not report a crawl whose writes all failed as successful', () => {
    const body = functionBody(src, 'crawlOneWebsite');
    expect(body).toContain('writeFailures');
    expect(body).toContain('allWritesFailed');
    expect(stripComments(body)).not.toMatch(/return \{ ok: true, pages_indexed: indexed, pages_discovered: urls\.length \};/);
  });
});

describe('#363 EE-15/EE-16 — the XML import path', () => {
  const src = read(XML);

  it('refuses a DOCTYPE before parsing', () => {
    // fast-xml-parser 4.5.0 takes processEntities as a bare boolean and has none of the
    // expansion limits later majors added, and expansion happens after the size cap — so a
    // 25 MB document that passes MAX_XML_BYTES can still expand to gigabytes.
    expect(src).toContain('DOCTYPE_RE');
    const body = functionBody(src, 'parseXmlDoc');
    expect(body).toContain('DOCTYPE_RE.test(xmlString)');
    // Rejecting the DOCTYPE rather than disabling entities keeps &amp; decoding intact.
    expect(stripComments(src)).not.toContain('processEntities: false');
  });

  it('the field classifier uses a forced tool, not a salvage parser', () => {
    expect(src).toContain('FIELD_MAPPING_TOOL');
    expect(src).toContain("tool_choice: { type: 'tool'");
    // The regex this replaces took the first `{` to the last `}` and hoped (invariant 9).
    expect(stripComments(src)).not.toContain('content.match(/\\{[\\s\\S]*\\}/)');
  });

  it('clamps a confidence the model returns out of range', () => {
    const body = functionBody(src, 'suggestFieldMappings');
    expect(body).toContain('Math.min(1, Math.max(0, rawConfidence))');
  });
});

describe('#363 EE-17 — catalog extraction is bounded before it buffers', () => {
  const src = read(CATALOG_EXTRACT);

  it('caps the number of PDFs per request', () => {
    expect(src).toContain('MAX_PDFS_PER_REQUEST');
  });

  it('caps per-file and total bytes', () => {
    expect(src).toContain('MAX_PDF_BYTES');
    expect(src).toContain('MAX_TOTAL_PDF_BYTES');
  });

  it('checks size before materialising the bytes', () => {
    const sizeCheck = src.indexOf('blobSize > MAX_PDF_BYTES');
    const buffer = src.indexOf('await (blob as Blob).arrayBuffer()');
    expect(sizeCheck).toBeGreaterThan(-1);
    expect(buffer).toBeGreaterThan(-1);
    expect(sizeCheck, 'the PDF is buffered before its size is checked').toBeLessThan(buffer);
  });
});

describe('#363 — the guarded files still exist where the guards point', () => {
  it.each([AI_CLIENT, AI_LOGGER, AUTH, CONFIG, CREDIT_UTILS, RUNNER, RECOVERY, CRAWLER, XML, CATALOG_EXTRACT])(
    '%s',
    (p) => expect(existsSync(join(root, p)), `${p} moved — this test's assertions are now vacuous`).toBe(true),
  );
});
