#!/usr/bin/env node
/**
 * Production smoke tests — "are the critical flows actually alive, right now".
 *
 * Runs against the LIVE deployed system (not mocks). Used two ways:
 *   1. Post-deploy gate  — run right after a deploy; a FAIL fails the deploy run.
 *   2. Synthetic monitor — run on a schedule (every ~10 min); a FAIL pages you.
 *
 * Each check hits a real endpoint / RPC and asserts 2xx + the expected shape.
 * A check whose required secret is missing is SKIPPED (not failed), so the
 * harness still provides value before every secret is wired.
 *
 * Exit code: 0 if no check FAILED, 1 if any FAILED (skips don't fail the run).
 *
 * Config via env (public URLs default in; secrets/keys passed by the workflow):
 *   MIVAA_BASE_URL       (default https://v1api.materialshub.gr)
 *   SUPABASE_URL         (default https://bgbavxtjlbvgplozizxu.supabase.co)
 *   SUPABASE_ANON_KEY    (public anon key — required for the DB checks)
 *   MIVAA_CRON_SECRET    (optional — enables the cron-refresh check)
 */

const MIVAA = (process.env.MIVAA_BASE_URL || 'https://v1api.materialshub.gr').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co').replace(/\/$/, '');
// Service-role preferred for DB checks: catalog products are RLS-restricted (anon sees 0
// rows), and the point is to validate the RPC logic, not RLS. CI is a trusted context.
const DB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
// The ANON key, never the service-role one. `DB_KEY` prefers service-role, which INVERTS any
// check whose subject is "anon must be refused" — service_role is refused by nothing, so such a
// check fails forever and reports a grant regression that does not exist. That is what happened
// to db.rpc.get_related_products.anon-denied: it went red on every run for days while the DB was
// correct the whole time (has_function_privilege('anon', …) = false). No fallback here on
// purpose — without a real anon key the check SKIPs rather than testing the wrong principal.
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const CRON = process.env.MIVAA_CRON_SECRET || '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 35000);

const results = [];

async function http(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { res, text, json };
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRIES = Number(process.env.SMOKE_RETRIES || 3);     // attempts per check
const BACKOFF_MS = Number(process.env.SMOKE_BACKOFF_MS || 5000);

/**
 * Register a check. `fn` must throw on failure. SKIPs if a required env is missing.
 * Each check is retried up to RETRIES times with backoff so a transient blip — a deploy
 * restart, a cold start, a momentary network hiccup — doesn't page you. Only a SUSTAINED
 * failure (still failing after all attempts) is reported as FAIL.
 */
// Thrown from inside a check fn to record a SKIP (not a FAIL) — e.g. the data
// needed to exercise the check doesn't exist yet (empty catalog). A skip never
// fails the run and is not retried.
class SkipCheck extends Error {}
function skipIf(cond, msg) { if (cond) throw new SkipCheck(msg); }

async function check(name, requiredEnv, fn) {
  const missing = requiredEnv.filter((k) => !process.env[k] && !DEFAULTED[k]);
  if (missing.length) {
    results.push({ name, status: 'SKIP', detail: `missing ${missing.join(', ')}` });
    return;
  }
  const started = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const detail = await fn();
      const note = attempt > 1 ? `${detail || ''} (after ${attempt} attempts)` : (detail || '');
      results.push({ name, status: 'PASS', detail: note, ms: Date.now() - started });
      return;
    } catch (err) {
      if (err instanceof SkipCheck) {
        results.push({ name, status: 'SKIP', detail: err.message, ms: Date.now() - started });
        return;
      }
      lastErr = err;
      if (attempt < RETRIES) await sleep(BACKOFF_MS);
    }
  }
  results.push({ name, status: 'FAIL', detail: `${String(lastErr?.message || lastErr)} (${RETRIES} attempts)`, ms: Date.now() - started });
}

// Track which "env" keys we satisfied with a built-in default so check() doesn't SKIP them.
const DEFAULTED = { MIVAA_BASE_URL: true, SUPABASE_URL: true, DB_KEY: !!DB_KEY, ANON_KEY: !!ANON_KEY };

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Checks ────────────────────────────────────────────────────────────────

// 1. MIVAA is up.
await check('mivaa.health', ['MIVAA_BASE_URL'], async () => {
  const { res } = await http(`${MIVAA}/health`);
  assert(res.ok, `GET /health → ${res.status}`);
  return `${res.status}`;
});

// 2. Embedding contract (Voyage 1024D) — the pipeline + kb-embedding depend on this.
await check('mivaa.embeddings.clip-text', ['MIVAA_BASE_URL'], async () => {
  const { res, json } = await http(`${MIVAA}/api/embeddings/clip-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'ceramic floor tile matte beige', model: 'voyage-4', input_type: 'document', dimensions: 1024 }),
  });
  assert(res.ok, `POST /api/embeddings/clip-text → ${res.status}`);
  assert(json?.success === true, `success !== true (${JSON.stringify(json)?.slice(0, 120)})`);
  assert(Array.isArray(json?.embedding) && json.embedding.length === 1024, `embedding not 1024D (got ${json?.embedding?.length})`);
  return '1024D ok';
});

// 3 + 4. Product relationships. `get_related_products` is the ONLY read path for
//   related products (issue #267) and it is workspace-asserted, so anon must be
//   refused — that refusal IS the check. The dropped-column class of regression that
//   the old find_similar_products / find_complementary_products calls guarded here is
//   now covered for every function by the plpgsql lint gate below.
let sampleProductId = null;
await check('db.products.sample', ['DB_KEY'], async () => {
  const { res, json } = await http(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` },
  });
  assert(res.ok, `GET products → ${res.status}`);
  // An empty catalog (fresh/reset workspace) means there's nothing to sample — that's
  // a data state, not a regression, so SKIP rather than FAIL the deploy gate.
  skipIf(Array.isArray(json) && json.length === 0, 'products table empty — no row to sample');
  assert(Array.isArray(json) && json.length === 1 && json[0].id, 'no product row returned');
  sampleProductId = json[0].id;
  return sampleProductId;
});

/**
 * The deals pipeline ships its PostgREST selects as runtime STRINGS — embed hints like
 * `contact:crm_contacts!crm_deals_contact_id_fkey`. A renamed constraint or a dropped column makes
 * every one of them a 400 at request time while `tsc` stays green, and a board that errored reads
 * exactly like a board with no deals. That is the silent-zero shape, so it gets a probe.
 *
 * ANON is the right principal and a 401 is the PASS. PostgREST parses the select, resolves the
 * embeds and PLANS the query before RLS runs; anon then trips on `is_workspace_member`, which it
 * has no EXECUTE grant for. So:
 *    401  → the select parsed, the columns exist, the embeds resolved   (what we assert)
 *    400  → a column or a relationship is gone                          (the regression)
 * The control below proves the distinction is real by sending a knowingly-bad embed and requiring
 * a 400 — without it, a harness that accepted everything would look like a pass.
 */
const DEALS_SELECTS = [
  ['crm_deals', 'id, workspace_id, deal_type_id, title, stage, status, value, currency, probability, ' +
    'expected_close_date, lost_reason, notes, contact_id, company_id, property_id, project_id, ' +
    'owner_user_id, created_at, updated_at, ' +
    'contact:crm_contacts!crm_deals_contact_id_fkey ( id, name ), ' +
    'company:crm_companies ( id, name ), ' +
    'property:properties ( id, title, reference_code, town ), ' +
    'tasks:crm_deal_tasks ( id, done )'],
  ['crm_deals', 'id, workspace_id, deal_type_id, title, stage, status, value, currency, ' +
    'expected_close_date, property_id, contact_id, company_id, updated_at, type:crm_deal_types ( label )'],
  ['crm_deals', 'id, stage, status, value, title, property:properties ( title ), ' +
    'contact:crm_contacts!crm_deals_contact_id_fkey ( name )'],
  ['crm_deal_types', 'id, workspace_id, key, label, subject_kind, sort, is_active'],
  ['crm_deal_stages', 'id, deal_type_id, key, label, sort, is_won, is_lost'],
  ['crm_deal_tasks', 'id, deal_id, title, done, due_date, created_at'],
  ['crm_contacts', 'id, lifecycle_stage, lead_status, lead_source'],
];

await check('db.deals.selects-resolve', ['ANON_KEY'], async () => {
  const hdr = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

  // Control first: a relationship that does not exist MUST be rejected at parse time.
  const control = await http(
    `${SUPABASE_URL}/rest/v1/crm_deals?select=${encodeURIComponent('id, nope:crm_contacts!crm_deals_no_such_fkey ( id )')}&limit=1`,
    { headers: hdr },
  );
  assert(control.res.status === 400, `control: a bogus embed returned ${control.res.status}, not 400 — this check proves nothing`);

  for (const [table, select] of DEALS_SELECTS) {
    const { res, json, text } = await http(
      `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`,
      { headers: hdr },
    );
    // 200 (grants widened) is fine; 401 is the expected anon outcome. 400 is the regression.
    assert(
      res.status !== 400,
      `${table}: select no longer resolves → ${json?.message || text?.slice(0, 160)}`,
    );
  }
  return `${DEALS_SELECTS.length} deal selects resolve`;
});

await check('db.rpc.get_related_products.anon-denied', ['ANON_KEY'], async () => {
  const { res, json } = await http(`${SUPABASE_URL}/rest/v1/rpc/get_related_products`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_product_id: sampleProductId ?? '00000000-0000-0000-0000-000000000000',
      p_limit: 3,
    }),
  });
  // Anon holds no EXECUTE grant, so PostgREST must refuse. A 2xx here means the
  // grant was widened and one workspace's edges are readable by the public key.
  assert(!res.ok, `anon executed get_related_products → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
  return `refused with ${res.status}`;
});

// 4b. plpgsql contract lint — fails if ANY function has an error-level issue (broken
//   column/table ref, type mismatch). This is the class that 500'd recommendations and
//   silently broke quote→invoice. The baseline is ZERO (all live fns fixed,
//   dead-legacy dropped), so this is now a strict gate: any new breakage fails.
const KNOWN_BROKEN_FUNCTIONS = new Set([]);
await check('db.plpgsql-lint', ['DB_KEY'], async () => {
  const { res, json } = await http(`${SUPABASE_URL}/rest/v1/rpc/lint_plpgsql_errors`, {
    method: 'POST',
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(res.ok, `rpc lint_plpgsql_errors → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
  assert(Array.isArray(json), 'lint did not return an array');
  const fresh = [];
  for (const row of json) {
    const base = String(row.fn || '').split('(')[0];
    if (!KNOWN_BROKEN_FUNCTIONS.has(base)) fresh.push(`${base}: ${row.message}`);
  }
  assert(fresh.length === 0, `NEW broken function(s): ${fresh.join(' | ')}`);
  return `${json.length} known-broken (no new regressions)`;
});

// 5. The price-monitoring cron path — the exact endpoint that 500'd on the .or_ dep drift.
await check('mivaa.price-cron-refresh', ['MIVAA_CRON_SECRET'], async () => {
  const { res, json } = await http(`${MIVAA}/api/v1/price-monitoring/tracked-queries/cron-refresh?limit=1`, {
    method: 'POST',
    headers: { 'x-cron-secret': CRON },
  });
  assert(res.ok, `cron-refresh → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
  assert(json?.success === true, `success !== true (${JSON.stringify(json)?.slice(0, 120)})`);
  return 'ok';
});

// 6. Blueprint public estimator — the anonymous /tools/project-plan path.
//   We hit the `starters` action (NOT `estimate`): starters needs no Turnstile token and
//   burns no quota, yet it still exercises the deployed edge fn + the service-role read of
//   `blueprints` + `blueprint_items` + the shared blueprint/formula module import. If the fn
//   isn't deployed, the tables are missing, or the import breaks, this FAILS.
await check('edge.public-project-plan.starters', ['SUPABASE_URL'], async () => {
  const headers = { 'Content-Type': 'application/json' };
  if (DB_KEY) { headers.apikey = DB_KEY; headers.Authorization = `Bearer ${DB_KEY}`; }
  const { res, json } = await http(`${SUPABASE_URL}/functions/v1/public-project-plan`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'starters' }),
  });
  assert(res.ok, `POST public-project-plan → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
  assert(Array.isArray(json?.starters), `starters not an array (${JSON.stringify(json)?.slice(0, 120)})`);
  return `${json.starters.length} starters`;
});

// 7. Data-integrity framework — is the reconciliation backbone actually wired? We read the
//   `data_integrity_checks` registry (REST, no side effects). The cron path of the runner fn
//   runs the FULL battery + auto-heal, so it's deliberately NOT hit from a 15-min monitor;
//   the run_data_integrity_checks RPC itself is compile-covered by db.plpgsql-lint above.
//   A missing table (migration not applied) FAILS; an empty registry SKIPs (nothing wired yet).
await check('db.data-integrity.registry', ['DB_KEY'], async () => {
  const { res, json } = await http(`${SUPABASE_URL}/rest/v1/data_integrity_checks?select=key&is_enabled=eq.true&limit=1`, {
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` },
  });
  assert(res.ok, `GET data_integrity_checks → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
  assert(Array.isArray(json), 'data_integrity_checks did not return an array');
  skipIf(json.length === 0, 'no enabled integrity checks registered yet');
  return 'framework wired';
});

// 8. Business-expenses agent tool — is the schema the
//   `list_recent_expenses` / `record_expense` tools depend on actually live? We read
//   supplier_bills with the EXACT column list the list tool selects, including the
//   GENERATED `amount_due` column the expense/Payables flow reads. A missing/renamed
//   column → PostgREST 400 (caught even on an empty table); a missing table (migration
//   not applied) → 404. Zero side effects. An empty table SKIPs (data state, not a bug).
await check('db.expense-tool.schema', ['DB_KEY'], async () => {
  const cols = 'id,supplier_bill_number,total,amount_due,currency,status,issued_at,category_id,notes';
  const { res, json } = await http(
    `${SUPABASE_URL}/rest/v1/supplier_bills?select=${cols}&order=issued_at.desc.nullslast&limit=1`,
    { headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` } },
  );
  assert(res.ok, `GET supplier_bills → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
  assert(Array.isArray(json), 'supplier_bills did not return an array');
  skipIf(json.length === 0, 'no supplier_bills rows yet — columns validated, nothing to sample');
  const row = json[0];
  assert('amount_due' in row && 'total' in row, 'expense columns missing from returned row');
  return 'expense-tool schema live';
});

// ── Report ──────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log('\n  Production smoke tests');
console.log('  ' + '─'.repeat(64));
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚪';
  console.log(`  ${icon} ${pad(r.status, 4)} ${pad(r.name, 32)} ${r.ms != null ? pad(r.ms + 'ms', 7) : pad('', 7)} ${r.detail || ''}`);
}
console.log('  ' + '─'.repeat(64));

const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');
console.log(`  ${passed.length} passed · ${failed.length} failed · ${skipped.length} skipped\n`);

if (failed.length) {
  console.error(`SMOKE FAILED: ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
