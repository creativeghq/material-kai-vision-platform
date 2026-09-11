/**
 * Prune old Vercel deployments to stay under the storage allowance.
 *
 * DELETING A DEPLOYMENT CAN BREAK THE LIVE SITE: static assets are shared between deployments,
 * so removing the one a long-stable chunk was attributed to orphans a file the CURRENT
 * deployment still serves. Hence dry-run unless --apply, and probe the live site afterwards.
 *
 * @example node scripts/prune-vercel-deployments.mjs --apply --keep 20 --min-age-days 7
 * @requires VERCEL_TOKEN — VERCEL_ORG_ID / VERCEL_PROJECT_ID override the defaults below.
 */

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_ORG_ID || 'team_cADhbwvOJOXChJo4pgX3rJex';
const PROJECT = process.env.VERCEL_PROJECT_ID || 'prj_S9oB7HTi4Ef761hrMuHK84xkeniU';
const API = 'https://api.vercel.com';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes('--apply');
const KEEP_NEWEST = Number(arg('keep', 20));
const MIN_AGE_DAYS = Number(arg('min-age-days', 7));
const MAX_DELETES = Number(arg('limit', 200));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body };
}

/** Every deployment, newest first. `/v6/deployments` returns `uid`, not `id`. */
async function allDeployments() {
  const out = [];
  let until = null;
  for (;;) {
    let path = `/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&limit=100`;
    if (until) path += `&until=${until}`;
    const { status, body } = await call('GET', path);
    if (status !== 200) throw new Error(`list failed: HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
    const page = body.deployments || [];
    if (!page.length) break;
    out.push(...page);
    const oldest = page[page.length - 1];
    if (!oldest || page.length < 100) break;
    until = oldest.created - 1;
  }
  return out;
}

async function main() {
  if (!TOKEN) {
    console.error('VERCEL_TOKEN is not set — refusing to run.');
    process.exit(2);
  }

  const { status, body: proj } = await call('GET', `/v9/projects/${PROJECT}?teamId=${TEAM}`);
  if (status !== 200) throw new Error(`project lookup failed: HTTP ${status}`);
  const liveId = ((proj.targets || {}).production || {}).id || null;
  if (!liveId) throw new Error('could not identify the live production deployment — refusing to delete anything');
  console.log(`live production deployment: ${liveId}`);

  const deps = await allDeployments();
  deps.sort((a, b) => b.created - a.created);
  const id = (d) => d.uid || d.id;
  console.log(`deployments found: ${deps.length}`);

  const cutoff = Date.now() - MIN_AGE_DAYS * 86400000;
  const keptNewest = new Set(deps.slice(0, KEEP_NEWEST).map(id));

  const spared = [];
  const doomed = [];
  for (const d of deps) {
    // Three independent reasons to spare, checked in this order so the live deployment is
    // untouchable even if it somehow falls outside the newest window.
    if (id(d) === liveId) spared.push([d, 'LIVE production']);
    else if (keptNewest.has(id(d))) spared.push([d, `newest ${KEEP_NEWEST}`]);
    else if (d.created > cutoff) spared.push([d, `younger than ${MIN_AGE_DAYS}d`]);
    else doomed.push(d);
  }

  console.log(`spared: ${spared.length}  ·  eligible for deletion: ${doomed.length}`);
  if (doomed.length > MAX_DELETES) {
    console.log(`capping this run at ${MAX_DELETES} (pass --limit to raise it)`);
  }
  const batch = doomed.slice(0, MAX_DELETES);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to delete the above.');
    for (const d of batch.slice(0, 10)) {
      console.log(`  would delete ${id(d)}  ${new Date(d.created).toISOString().slice(0, 10)}  ${d.state}`);
    }
    if (batch.length > 10) console.log(`  …and ${batch.length - 10} more`);
    return { deleted: 0, eligible: doomed.length };
  }

  let deleted = 0;
  const failed = [];
  for (const d of batch) {
    const r = await call('DELETE', `/v13/deployments/${id(d)}?teamId=${TEAM}`);
    if (r.status >= 200 && r.status < 300) deleted++;
    else failed.push(`${id(d)} HTTP ${r.status}`);
    await sleep(250);
  }
  console.log(`\ndeleted ${deleted} of ${batch.length}`);
  if (failed.length) {
    console.log(`failed ${failed.length}:`);
    for (const f of failed.slice(0, 10)) console.log(`  ${f}`);
  }
  return { deleted, eligible: doomed.length };
}

main()
  .then((r) => {
    // The janitor reports what it actually cleared, not that it ran. A prune that deleted
    // nothing while hundreds were eligible is the silent-zero shape and must be visible.
    console.log(`\nRESULT eligible=${r.eligible} deleted=${r.deleted} applied=${APPLY}`);
    console.log('Deleted deployments stay restorable for 30 days.');
    if (APPLY && r.deleted > 0) {
      console.log('\nNOW VERIFY THE LIVE SITE: npm run probe:live');
      console.log('A prune can orphan an asset the live deployment still serves.');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(`prune failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
