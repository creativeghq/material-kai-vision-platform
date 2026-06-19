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

/** Register a check. `fn` must throw on failure. Pass required=false to allow SKIP. */
async function check(name, requiredEnv, fn) {
  const missing = requiredEnv.filter((k) => !process.env[k] && !DEFAULTED[k]);
  if (missing.length) {
    results.push({ name, status: 'SKIP', detail: `missing ${missing.join(', ')}` });
    return;
  }
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', detail: detail || '', ms: Date.now() - started });
  } catch (err) {
    results.push({ name, status: 'FAIL', detail: String(err?.message || err), ms: Date.now() - started });
  }
}

// Track which "env" keys we satisfied with a built-in default so check() doesn't SKIP them.
const DEFAULTED = { MIVAA_BASE_URL: true, SUPABASE_URL: true, DB_KEY: !!DB_KEY };

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

// 3 + 4. Recommendation RPCs — guards the dropped-column class of regression.
//   We fetch a real product id (anon), then call each RPC. If an RPC references a
//   non-existent column again, Postgres errors and the check FAILS.
let sampleProductId = null;
await check('db.products.sample', ['DB_KEY'], async () => {
  const { res, json } = await http(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` },
  });
  assert(res.ok, `GET products → ${res.status}`);
  assert(Array.isArray(json) && json.length === 1 && json[0].id, 'no product row returned');
  sampleProductId = json[0].id;
  return sampleProductId;
});

for (const rpc of ['find_similar_products', 'find_complementary_products']) {
  await check(`db.rpc.${rpc}`, ['DB_KEY'], async () => {
    assert(sampleProductId, 'no sample product id (db.products.sample failed)');
    const { res, json } = await http(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_product_id: sampleProductId, match_count: 3 }),
    });
    assert(res.ok, `rpc ${rpc} → ${res.status} ${(JSON.stringify(json) || '').slice(0, 140)}`);
    assert(Array.isArray(json), `rpc ${rpc} did not return an array`);
    return `${json.length} rows`;
  });
}

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
