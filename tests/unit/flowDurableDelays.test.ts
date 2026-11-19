import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const engine = blankComments(readFileSync(join(process.cwd(), 'supabase/functions/flow-engine/index.ts'), 'utf8'));
const between = (from: string, to: string) => engine.slice(engine.indexOf(from), engine.indexOf(to, engine.indexOf(from)));

describe('#552 — a delay longer than one invocation parks and resumes', () => {
  const delay = between("case 'delay': {", "case 'stop': {");
  const walker = between('async function executeFlowGraph(', '\n// REQUEST HANDLERS');
  const resume = between('async function handleResumeWaits(', 'async function enqueueTenantWebhooks(');

  it('waits inline only up to the cap, and never shortens a longer delay', () => {
    expect(delay).toMatch(/ms <= MAX_INLINE_DELAY_MS/);
    expect(delay).toMatch(/branch: '__wait__'/);
    expect(delay, 'a refusal is what used to ship; a parked wait replaces it').not.toMatch(/not built yet/);
  });

  it('parks the branch in flow_run_waits and does not walk its children', () => {
    const park = walker.slice(walker.indexOf("} else if (branch === '__wait__') {"));
    expect(park).toMatch(/from\('flow_run_waits'\)\.insert\(/);
    const parkBlock = park.slice(0, park.indexOf('continue;'));
    expect(parkBlock, 'a parked branch must not enqueue the nodes after the delay').not.toMatch(/queue\.push/);
    expect(walker).toMatch(/return \{ waits \};/);
  });

  it('a test run shows the whole path instead of waiting', () => {
    expect(walker).toMatch(/branch === '__wait__' && isTestRun/);
  });

  it('a run with a parked branch is waiting, not completed', () => {
    expect(engine).toMatch(/const finalStatus = walk\.waits > 0 \? 'waiting' : 'completed'/);
  });

  it('resumes through the atomic claim, never a select-then-update', () => {
    expect(resume).toMatch(/rpc\('claim_due_flow_waits'/);
    expect(resume).not.toMatch(/from\('flow_run_waits'\)\.select\([^)]*\)[\s\S]{0,80}\.eq\('status', 'waiting'\)[\s\S]{0,40}\.lte\(/);
    expect(resume, 'the resumed walk starts at the delay’s next nodes with the saved context')
      .toMatch(/startIds: \(w\.next_node_ids/);
  });

  it('a paused flow cancels its waits instead of sending on; a draft resumes like it started', () => {
    expect(resume).toMatch(/const runnable = flow\.status === 'active' \|\| flow\.status === 'draft'/);
    expect(resume).toMatch(/status: 'cancelled'/);
  });

  it('the parked delay step is settled, never left reading waiting', () => {
    expect(resume).toMatch(/parkedStep\('skipped'\)/);
    expect(resume).toMatch(/parkedStep\('completed'\)/);
  });

  it('only the cron or a secret caller may resume', () => {
    expect(engine).toMatch(/case 'resume-waits':\s*[\s\S]{0,120}if \(!callerTrusted\)/);
  });

  it('a resumed run is not billed again', () => {
    expect(resume).not.toMatch(/debit_credits/);
  });
});
