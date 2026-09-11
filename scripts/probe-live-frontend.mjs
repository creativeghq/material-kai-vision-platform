/**
 * Probe the LIVE hostname, the way a visitor reaches it — no bypass secret, every asset.
 *
 * `fe-smoke` tests the unaliased *.vercel.app candidate with VERCEL_AUTOMATION_BYPASS_SECRET,
 * and that bypass skips the firewall, so it reported green through two total outages on
 * 2026-09-11. Neither was visible from the candidate URL.
 *
 * Usage: node scripts/probe-live-frontend.mjs [origin]
 */

const ORIGIN = (process.argv[2] || process.env.PROBE_ORIGIN || 'https://app.materialshub.gr').replace(/\/$/, '');
const ATTEMPTS = 3;
const BACKOFF_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bust = (url) => url + (url.includes('?') ? '&' : '?') + 'probe=' + Date.now() + Math.random().toString(36).slice(2);

/** A challenge is a 200-shaped outage: the body is Vercel's, not ours. */
function mitigation(res) {
  return res.headers.get('x-vercel-mitigated') || '';
}

async function get(url) {
  const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'materialshub-live-probe' } });
  const body = res.status === 200 ? await res.text() : '';
  return { status: res.status, mitigated: mitigation(res), body, edge: res.headers.get('x-vercel-id') || '' };
}

const failures = [];
const note = (msg) => failures.push(msg);

async function main() {
  console.log(`probing ${ORIGIN}`);

  // 1. The document. Cache-busted, because a stale edge copy would hide a broken deploy.
  let doc = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    doc = await get(bust(ORIGIN + '/'));
    if (doc.status === 200 && !doc.mitigated) break;
    if (i < ATTEMPTS) await sleep(BACKOFF_MS);
  }
  console.log(`  document        HTTP ${doc.status}${doc.mitigated ? ` [BLOCKED: ${doc.mitigated}]` : ''} · ${doc.body.length} bytes · ${doc.edge}`);

  if (doc.mitigated) {
    note(`the edge is challenging visitors (x-vercel-mitigated: ${doc.mitigated}) — the site is unreachable, turn off Attack Challenge Mode`);
  }
  if (doc.status !== 200) {
    note(`document returned HTTP ${doc.status}`);
    return;
  }
  if (!doc.body.includes('<div id="root"')) {
    note('document has no #root element — the app cannot mount into it');
  }

  // 2. Every asset the document tells a browser to load. The entry bundle imports the vendor
  //    chunks STATICALLY, so ONE missing chunk is a blank screen, not a degraded page.
  const assets = [...new Set((doc.body.match(/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g) || []))];
  if (!assets.length) {
    note('document references no /assets/* files at all — the build output is not what shipped');
    return;
  }

  for (const asset of assets) {
    const url = `${ORIGIN}/${asset}`;
    let plain = null;
    let origin = null;
    for (let i = 1; i <= ATTEMPTS; i++) {
      // Plain URL first: that is the one the module graph requests, and a poisoned edge entry
      // only shows on it. The cache-busted fetch separates "this POP is stale" from "really gone".
      plain = await get(url);
      origin = await get(bust(url));
      if (plain.status === 200 && origin.status === 200 && !plain.mitigated) break;
      if (i < ATTEMPTS) await sleep(BACKOFF_MS);
    }
    const label = asset.replace('assets/', '');
    console.log(`  ${label.padEnd(34)} plain=${plain.status} origin=${origin.status}${plain.mitigated ? ` [BLOCKED: ${plain.mitigated}]` : ''}`);

    if (plain.mitigated) note(`${label} is being challenged at the edge (${plain.mitigated})`);
    if (plain.status !== 200 && origin.status === 200) {
      note(`${label} returns HTTP ${plain.status} on its plain URL but 200 cache-busted — a poisoned edge cache entry; rename the chunk in vite.config.ts manualChunks`);
    } else if (plain.status !== 200) {
      note(`${label} returns HTTP ${plain.status} — the document references a file that is not served`);
    } else if (origin.status !== 200) {
      note(`${label} returns HTTP ${origin.status} from origin — it is cached at the edge but gone underneath, and will break as caches expire`);
    }
  }
}

main()
  .catch((err) => note(`probe itself failed: ${err && err.message ? err.message : err}`))
  .then(() => {
    if (!failures.length) {
      console.log('\nOK — the live host serves the document and every asset it references.');
      process.exit(0);
    }
    console.error(`\n${failures.length} problem(s) with the LIVE site:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  });
