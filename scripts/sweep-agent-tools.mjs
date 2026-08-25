#!/usr/bin/env node
/**
 * Sweep every agent tool once, to find the ones that are broken before a user does.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-25 a single real request exposed five separate tool defects, every one of them
 * silent: a scraper whose analysis pass had thrown on every call it had ever received while still
 * reporting `success: true`; two tools refused by an unpriced credit key; a background agent whose
 * declared `web_search` had no factory behind it; a `material_search` doing GET against a
 * POST-only endpoint. None of them failed loudly, none was visible to a test, and 143 of the
 * platform's 176 tools had never been called even once — so there was no reason to think the
 * remaining ones were healthier. They were simply unobserved.
 *
 * This calls each tool once through `mode: 'direct_tool'`, which runs the tool with NO model turn.
 * That is the whole trick: it costs no Opus tokens, so exercising the entire surface is cheap.
 *
 * SAFETY — the sweep must never damage anything, so it FAILS CLOSED
 * ----------------------------------------------------------------
 * A tool is only called when it can be positively shown to be read-only:
 *   • a tool whose name matches a mutating verb is SKIPPED;
 *   • a dispatcher with an `action` enum is called with a READ action, or skipped when it has
 *     none (`manage_crm` only offers create_contact / log_activity, so it is skipped);
 *   • a tool that spends real money upstream is skipped unless --paid is passed;
 *   • anything that cannot be classified is skipped, not guessed at.
 * `confirm` is never set true — it is the human-in-the-loop approval gate, not a parameter.
 *
 * USAGE
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... SWEEP_USER_ID=... SWEEP_WORKSPACE_ID=... \
 *     node scripts/sweep-agent-tools.mjs [--paid] [--only=name,name] [--limit=N]
 *
 * Reads the committed manifest, so it always covers exactly what `npm run tools:manifest`
 * knows about.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.SWEEP_USER_ID;
const WORKSPACE_ID = process.env.SWEEP_WORKSPACE_ID;

const args = process.argv.slice(2);
const INCLUDE_PAID = args.includes('--paid');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').replace('--only=', '')
  .split(',').map((s) => s.trim()).filter(Boolean);
// `?? Infinity` on a parsed number, never `|| Infinity` — `--limit=0` is a legitimate request
// (classify everything, call nothing) and 0 is falsy, so `||` turned the dry run into a full sweep.
const rawLimit = (args.find((a) => a.startsWith('--limit=')) || '').replace('--limit=', '');
const LIMIT = rawLimit === '' ? Infinity : Number(rawLimit);
/** Classify and report without calling anything. */
const DRY_RUN = args.includes('--dry-run');

if (!SUPABASE_URL || !KEY || !USER_ID || !WORKSPACE_ID) {
  console.error('Missing env: SUPABASE_URL, SERVICE_ROLE_KEY, SWEEP_USER_ID, SWEEP_WORKSPACE_ID');
  process.exit(2);
}

// ── Manifest ─────────────────────────────────────────────────────────────────
/**
 * The manifest is our own generated TypeScript. Slice out the array literal and evaluate it —
 * there is no untrusted input here, and it keeps the sweep reading the SAME file the coverage
 * test enforces rather than a second description of the tool surface.
 */
function loadManifest() {
  const src = readFileSync(join(ROOT, 'src/components/features/ai/toolManifest.generated.ts'), 'utf8');
  const start = src.indexOf('export const TOOL_MANIFEST');
  // `= [`, not the first `[` — the first one is the `[]` in `: ToolManifestEntry[] =`, which
  // parses perfectly and yields an empty manifest, i.e. a sweep that reports everything healthy
  // by covering nothing.
  const open = src.indexOf('[', src.indexOf('=', start));
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval(src.slice(open, end + 1));
}

// ── Classification ───────────────────────────────────────────────────────────

/**
 * A tool whose NAME starts with one of these changes state or starts paid work. Never called.
 *
 * `record`, `submit`, `log`, `file`, `book` and `start` are here because reviewing the generated
 * plan before running it caught `record_expense` and `submit_trip_card` queued for execution —
 * both of which write a real row — and `seo_site_crawl_start`, which begins a billed crawl. The
 * list is deliberately over-broad: a read tool wrongly skipped costs nothing but coverage, while
 * a write tool wrongly called leaves junk in the customer's data.
 */
const MUTATING_NAME = /^(create|add|save|send|delete|remove|update|set|publish|issue|pay|approve|assign|cancel|archive|link|import|convert|fork|redeem|apply|adjust|attach|upload|schedule|enable|disable|resolve|raise|source|translate|extract|generate|manage|track|review|record|submit|log|post|file|book|order|reserve|debit|charge|refund|invite|start|run|trigger|dispatch|sync|reset|clear|purge)_/;

/** Verbs that make an `action` value a READ. */
const READ_ACTION = /^(list|get|search|find|view|show|summary|overview|preview|status|check|read|detail|history|count|report)/;

/**
 * Tools that spend real money upstream on every call. Skipped unless --paid.
 * Keyed on what the call COSTS, not on what it is named.
 */
const PAID = new Set([
  'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment', 'contact_discovery',
  'email_validate', 'scrape_materials_from_url', 'suggest_extraction_fields', 'web_search',
  'web_fetch', 'analyze_inspiration_url', 'price_lookup', 'seo_dataforseo_call',
  'research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis',
  'dispatch_background_task', 'check_llm_visibility',
]);

/** Never called even with --paid: irreversible, or creates a real artefact / spend. */
const NEVER = new Set([
  'dispatch_background_task', 'generate_video', 'generate_3d', 'generate_gemini',
  'generate_vr_world', 'virtual_staging', 'apply_lighting_preset', 'generate_presentation_sheet',
]);

/** Plausible values by parameter name, so a required arg is realistic rather than 'test'. */
const HINTS = {
  query: 'tile', q: 'tile', search: 'tile', keyword: 'porcelain tile', topic: 'porcelain tile',
  url: 'https://example.com/', domain: 'example.com', website: 'https://example.com/',
  email: 'info@example.com', country: 'GR', country_code: 'GR', language: 'en', locale: 'en',
  name: 'Sweep Probe', company_name: 'Sweep Probe Ltd', limit: 1, top_k: 1, count: 1, page: 1,
  workspace_id: () => WORKSPACE_ID, user_id: () => USER_ID,
};

function valueFor(p) {
  if (p.type === 'enum' && p.enum?.length) {
    const read = p.enum.find((v) => READ_ACTION.test(v));
    return read ?? p.enum[0];
  }
  const hint = HINTS[p.name];
  if (hint !== undefined) return typeof hint === 'function' ? hint() : hint;
  switch (p.type) {
    case 'number': return 1;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return 'tile';
  }
}

function classify(t) {
  if (NEVER.has(t.name)) return { run: false, why: 'never — irreversible or creates a real artefact' };

  const action = t.params.find((p) => p.name === 'action' && p.type === 'enum' && p.enum?.length);
  if (action) {
    const read = action.enum.find((v) => READ_ACTION.test(v));
    if (!read) return { run: false, why: `dispatcher with no read action (${action.enum.join('|')})` };
    if (PAID.has(t.name) && !INCLUDE_PAID) return { run: false, why: 'paid — pass --paid' };
    return { run: true, action: read };
  }

  if (MUTATING_NAME.test(t.name)) return { run: false, why: 'mutating verb in name' };
  // …and as a SUFFIX. `seo_site_crawl_start` begins a billed crawl and sailed past the anchored
  // check above, because the verb is at the end of the name rather than the front.
  if (/_(start|create|send|submit|record|delete|remove|reset|run|trigger|publish|import|export)$/.test(t.name)) {
    return { run: false, why: 'mutating verb at end of name' };
  }
  if (PAID.has(t.name) && !INCLUDE_PAID) return { run: false, why: 'paid — pass --paid' };
  return { run: true };
}

function buildArgs(t, cls) {
  const input = {};
  for (const p of t.params) {
    if (p.name === 'confirm') continue;              // the human-in-the-loop gate. Never set.
    if (p.name === 'action' && cls.action) { input.action = cls.action; continue; }
    if (p.optional) continue;                         // minimal valid call
    input[p.name] = valueFor(p);
  }
  return input;
}

// ── Result triage ────────────────────────────────────────────────────────────

/** Failures that mean the tool is MISCONFIGURED, not that the data is absent. */
const CONFIG_ERROR = [
  /unknown service/i, /not configured/i, /permission denied/i, /does not exist/i,
  /\b(4\d\d|5\d\d)\b/, /invalid api key/i, /unauthor/i, /forbidden/i, /is not supported/i,
  /no such function/i, /schema/i, /required/i,
];

function triage(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  if (status !== 200) return { verdict: 'HTTP_ERROR', detail: `HTTP ${status}` };

  let payload = body;
  if (payload?.success === false || payload?.error) {
    const msg = String(payload.error ?? payload.message ?? 'unknown');
    const config = CONFIG_ERROR.some((re) => re.test(msg));
    return { verdict: config ? 'CONFIG_ERROR' : 'TOOL_ERROR', detail: msg.slice(0, 220) };
  }
  // Distinguish "ran clean and found nothing" from a real result — the empty ones are the data
  // floor, not a defect, and lumping them together is how a broken tool hides among them.
  if (/"(results|items|rows|products|records|matches)":\s*\[\]/.test(text) || payload?.count === 0) {
    return { verdict: 'EMPTY', detail: 'ran, returned nothing' };
  }
  return { verdict: 'OK', detail: `${text.length} chars` };
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function callTool(name, input) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'sweep' }],
      agentId: 'kai',
      user_id: USER_ID,
      workspace_id: WORKSPACE_ID,
      mode: 'direct_tool',
      direct_tool: { name, input },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  // The response is an SSE stream; the tool payload is the last JSON object carrying `success`.
  let payload = null;
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      const o = JSON.parse(s);
      const inner = o.result ?? o.data ?? o;
      if (inner && (inner.success !== undefined || inner.error !== undefined)) payload = inner;
    } catch { /* not every line is a whole JSON object */ }
  }
  return { status: res.status, body: payload ?? text.slice(0, 400) };
}

const manifest = loadManifest();
const targets = manifest.filter((t) => (ONLY.length ? ONLY.includes(t.name) : true));

const results = [];
const skipped = [];
let n = 0;

for (const t of targets) {
  const cls = classify(t);
  if (!cls.run) { skipped.push({ name: t.name, file: t.file, why: cls.why }); continue; }
  if (n >= LIMIT) { skipped.push({ name: t.name, file: t.file, why: 'over --limit' }); continue; }
  n++;

  const input = buildArgs(t, cls);
  if (DRY_RUN) { results.push({ name: t.name, file: t.file, input, verdict: 'DRY', detail: 'not called' }); continue; }
  process.stdout.write(`[${n}] ${t.name} … `);
  try {
    const { status, body } = await callTool(t.name, input);
    const { verdict, detail } = triage(status, body);
    results.push({ name: t.name, file: t.file, input, verdict, detail });
    console.log(verdict + (verdict === 'OK' || verdict === 'EMPTY' ? '' : ` — ${detail}`));
  } catch (err) {
    results.push({ name: t.name, file: t.file, input, verdict: 'THREW', detail: String(err).slice(0, 220) });
    console.log('THREW — ' + String(err).slice(0, 120));
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const byVerdict = {};
for (const r of results) (byVerdict[r.verdict] ??= []).push(r);

const order = ['THREW', 'HTTP_ERROR', 'CONFIG_ERROR', 'TOOL_ERROR', 'EMPTY', 'OK'];
console.log('\n─── SWEEP SUMMARY ───');
console.log(`called ${results.length}, skipped ${skipped.length}, of ${manifest.length} tools in the manifest`);
for (const v of order) if (byVerdict[v]) console.log(`  ${v.padEnd(12)} ${byVerdict[v].length}`);

console.log('\n─── NEEDS ATTENTION ───');
const bad = order.slice(0, 4).flatMap((v) => byVerdict[v] ?? []);
if (!bad.length) console.log('  none');
for (const r of bad) console.log(`  ${r.verdict.padEnd(12)} ${r.name}  (${r.file})\n      ${r.detail}`);

const out = join(ROOT, 'sweep-report.json');
writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), results, skipped }, null, 2));
console.log(`\nfull report → ${out}`);

// Non-zero when something is actually broken, so this can gate CI later.
process.exit(bad.length ? 1 : 0);
