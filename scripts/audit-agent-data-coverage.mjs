/**
 * Which of the platform's derived reads can the agent actually see?
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-09-05 the agent answered "which keywords does materialshub.gr rank for" from a
 * third-party index while `get_website_rank_summary` (129 keywords, checked 35 minutes earlier)
 * and `get_gsc_summary` (Search Console, synced that morning) sat in the database with no tool in
 * front of them. Running this the same afternoon found the shape everywhere: the Websites
 * dashboard alone derived 16 verdicts in SQL and the agent could reach 4. A derived read with no
 * tool is data the platform paid to compute and the agent cannot use — so it guesses, or reaches
 * for a paid upstream that knows less.
 *
 * HOW IT WORKS
 * ------------
 *   exposed  = every `rpc('name')` in supabase/functions/_shared/tools/*.ts   (scanned from source)
 *   inventory = public.agent_data_coverage(exposed)                             (pg_proc, classified)
 *   gap       = inventory rows with kind = 'derived_read' and exposed = false
 *
 * The committed baseline (.github/agent-data-coverage-baseline.json) records the exposed set and
 * every known gap WITH A REASON — "todo: …" is a recorded intention, "unreviewed" is not a reason.
 * tests/unit/agentDataCoverage.test.ts holds the baseline to the source (an RPC a tool now reads
 * must leave the gap list; a reason must exist), and this script holds it to the DATABASE (a new
 * derived read with no tool exits 1 until someone decides).
 *
 * NOTE: deliberately no `#!` shebang — the test imports `scanExposedRpcs` through Vite.
 *
 * USAGE
 *   node scripts/audit-agent-data-coverage.mjs                    report; exit 1 on undecided gaps
 *   node scripts/audit-agent-data-coverage.mjs --write-baseline   rewrite the baseline (keeps reasons)
 *   node scripts/audit-agent-data-coverage.mjs --sql              print the SELECT for the SQL editor
 * Env (not needed for --sql): SUPABASE_URL, SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY.
 * The service-role key lives only on the MIVAA host; run there, or use --sql and paste.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'supabase/functions/_shared/tools');
export const BASELINE_FILE = join(ROOT, '.github/agent-data-coverage-baseline.json');

/**
 * Every RPC name an agent tool reads. Matches `.rpc('x')` and the bare `rpc('x')` helper the
 * multi-report tools use — both are one regex on purpose, so a helper rename cannot hide a read.
 */
export function scanExposedRpcs(dir = TOOLS_DIR) {
  const names = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/\brpc\(\s*'([a-z0-9_]+)'/g)) names.add(m[1]);
  }
  return [...names].sort();
}

export function readBaseline() {
  if (!existsSync(BASELINE_FILE)) return { exposed: [], known_gaps: [] };
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
}

function sqlFor(exposed) {
  const list = exposed.map((n) => `'${n}'`).join(', ');
  return `select rpc_name, scope_arg, result_type\n  from public.agent_data_coverage(array[${list}])\n where kind = 'derived_read' and not exposed\n order by rpc_name;`;
}

async function fetchInventory(exposed) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SERVICE_ROLE_KEY, or pass --sql to get a statement for the SQL editor.');
    process.exit(2);
  }
  const resp = await fetch(`${url}/rest/v1/rpc/agent_data_coverage`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_exposed: exposed }),
  });
  if (!resp.ok) {
    console.error(`agent_data_coverage failed: HTTP ${resp.status} ${(await resp.text()).slice(0, 400)}`);
    process.exit(2);
  }
  return await resp.json();
}

async function main() {
  const args = process.argv.slice(2);
  const exposed = scanExposedRpcs();

  if (args.includes('--sql')) {
    console.log(sqlFor(exposed));
    return;
  }

  const rows = await fetchInventory(exposed);
  const baseline = readBaseline();
  const known = new Map((baseline.known_gaps ?? []).map((g) => [g.rpc, g]));
  // One entry per NAME: an overloaded RPC (search_orders has two signatures) is one decision.
  const derived = [];
  const seenNames = new Set();
  for (const r of rows) {
    if (r.kind !== 'derived_read' || seenNames.has(r.rpc_name)) continue;
    seenNames.add(r.rpc_name);
    derived.push(r);
  }
  const gaps = derived.filter((r) => !r.exposed);
  const newGaps = gaps.filter((g) => !known.has(g.rpc_name));
  const closed = (baseline.known_gaps ?? []).filter((g) => exposed.includes(g.rpc));
  const undecided = gaps.filter((g) => /^unreviewed/i.test(known.get(g.rpc_name)?.reason ?? 'unreviewed'));

  if (args.includes('--write-baseline')) {
    const out = {
      _comment:
        'Derived reads (public RPCs the platform computes in SQL) vs the ones an agent tool reads. ' +
        '`exposed` is scanned from supabase/functions/_shared/tools by scripts/audit-agent-data-coverage.mjs; ' +
        '`known_gaps` must each carry a reason — "todo: …" records an intention, "unreviewed" fails the script. ' +
        'Regenerate with: node scripts/audit-agent-data-coverage.mjs --write-baseline',
      generated_at: new Date().toISOString(),
      exposed,
      known_gaps: gaps
        .map((g) => ({
          rpc: g.rpc_name,
          scope_arg: g.scope_arg,
          reason: known.get(g.rpc_name)?.reason ?? 'unreviewed — decide: a tool, or a reason it needs none',
        }))
        .sort((a, b) => a.rpc.localeCompare(b.rpc)),
    };
    writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
    console.log(`✎ wrote ${BASELINE_FILE}: ${exposed.length} exposed, ${gaps.length} known gaps (${newGaps.length} new, ${closed.length} closed)`);
    return;
  }

  console.log(
    `Derived reads: ${derived.length} · exposed to the agent: ${derived.length - gaps.length} · ` +
    `gaps: ${gaps.length} (${newGaps.length} not in the baseline, ${undecided.length} undecided)`,
  );
  for (const g of newGaps) console.log(`  NEW     ${g.rpc_name} (${g.scope_arg || 'no args'})`);
  for (const g of undecided) if (known.has(g.rpc_name)) console.log(`  DECIDE  ${g.rpc_name} — ${known.get(g.rpc_name).reason}`);
  for (const g of closed) console.log(`  CLOSED  ${g.rpc} — a tool reads it now; remove it from the baseline`);
  if (newGaps.length || closed.length || undecided.length) {
    console.log('\nDecide each one (a tool, or a reason it needs none), then --write-baseline.');
    process.exit(1);
  }
  console.log('OK — every derived read is exposed or has a recorded reason.');
}

if (process.argv[1] && /audit-agent-data-coverage\.mjs$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
