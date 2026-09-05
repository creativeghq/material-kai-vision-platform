#!/usr/bin/env node
/**
 * Run the golden cases as ONE batch with repeats, then read the batch honestly.
 *
 *   node scripts/run-agent-eval-batch.mjs --user <uuid> --workspace <uuid> [--repeats 5]
 *        [--case seo.own_rankings]... [--model claude-sonnet-5] [--json]
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment — the service key lives
 * only on the MIVAA host, so this runs there (see docs/agent-evaluation.md for the one-liner
 * that exports them from the systemd unit).
 *
 * WHY REPEATS. One run per case has no spread, so a difference between two batches has no noise
 * floor under it and is not a result. Five is the minimum (AGENT_EVAL_MIN_REPEATS); the summary
 * flags a case below it. Each repeat is a real agent turn and costs what a turn costs — an Opus
 * turn is 30–60 credits — so `--model claude-sonnet-5` is the cheap sweep that still finds every
 * STRUCTURAL gap (a missing tool is missing on every model).
 *
 * WHAT IT PRINTS. Per case: attempts, pass rate, tool-set agreement across repeats, the failure
 * classes hit, harness failures beside agent failures. A case that produced nothing is printed
 * with zero attempts, never dropped. Read the failure column before calling anything unstable:
 * `transport` is the network, not the agent.
 */

import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);
const many = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = opt('user');
const workspaceId = opt('workspace');
const repeats = Math.max(1, Number(opt('repeats', '5')) || 5);
const model = opt('model', null);
const onlyCases = many('case');
const asJson = flag('json');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (they live on the MIVAA host).');
  process.exit(2);
}
if (!userId || !workspaceId) {
  console.error('--user <uuid> and --workspace <uuid> are required: the eval runs AS that user, in that workspace.');
  process.exit(2);
}

async function call(body, timeoutMs = 150_000) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, workspace_id: workspaceId, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`agent-eval ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const batchId = randomUUID();
const started = Date.now();

const { cases } = await call({ action: 'list' }, 30_000);
const active = (cases ?? []).filter((c) => c.is_active && (onlyCases.length === 0 || onlyCases.includes(c.key)));
if (!active.length) {
  console.error('No active cases matched.');
  process.exit(1);
}
console.error(`batch ${batchId}: ${active.length} case(s) × ${repeats} repeat(s)${model ? ` on ${model}` : ' on the production router'}`);

for (let r = 1; r <= repeats; r++) {
  for (const c of active) {
    const t0 = Date.now();
    try {
      const out = await call({
        action: 'run', case_key: c.key, batch_id: batchId, repeat_index: r,
        ...(model ? { model_override: model } : {}),
      });
      const mark = out.passed ? 'PASS' : `FAIL ${out.failure_class ?? '?'}`;
      console.error(`  [${r}/${repeats}] ${c.key.padEnd(34)} ${mark.padEnd(32)} ${Math.round((Date.now() - t0) / 1000)}s ${out.credits ?? '?'}cr`);
    } catch (err) {
      // The harness itself failed to get a verdict. There is no run row for this attempt, so
      // the summary's `cases_missing` / attempts show it — it is not silently a pass.
      console.error(`  [${r}/${repeats}] ${c.key.padEnd(34)} HARNESS ERROR ${err.message}`);
    }
  }
}

const summary = await call({ action: 'summary', batch_id: batchId }, 30_000);
if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('');
  console.log(`batch ${summary.batch_id} — ${summary.attempts_total} attempts, ${summary.passed_total} passed`
    + ` (${summary.pass_rate === null ? 'n/a' : Math.round(summary.pass_rate * 100) + '%'}),`
    + ` ${summary.agent_failures_total} agent failures, ${summary.harness_failures_total} harness failures,`
    + ` ${summary.credits_total} credits, ${Math.round((Date.now() - started) / 60000)} min`);
  if (summary.cases_missing?.length) console.log(`cases with NO run (count as failed): ${summary.cases_missing.join(', ')}`);
  console.log('');
  console.log(['case'.padEnd(34), 'att', 'pass', 'agree', 'reply', 'p50 s', 'cr', 'failure classes'].join('  '));
  for (const c of summary.cases) {
    const pct = (v) => (v === null || v === undefined ? '  n/a' : `${String(Math.round(v * 100)).padStart(3)}%`);
    const classes = Object.entries(c.failure_classes ?? {}).map(([k, n]) => `${k}×${n}`).join(' ');
    console.log([
      c.case_key.padEnd(34),
      String(c.attempts).padStart(3) + (c.enough_repeats ? ' ' : '!'),
      pct(c.pass_rate),
      pct(c.tools_agreement),
      pct(c.reply_completeness),
      String(c.latency_ms_median === null ? '-' : Math.round(c.latency_ms_median / 1000)).padStart(5),
      String(c.credits_mean ?? '-').padStart(5),
      classes || '-',
    ].join('  '));
  }
  console.log('');
  console.log('att! = fewer repeats than the minimum: no noise floor, do not compare this case across batches.');
  console.log('agree = share of repeats that called the modal tool set (stability without ground truth); read it beside pass and reply.');
}
