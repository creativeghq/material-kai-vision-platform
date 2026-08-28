import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * A pair of flows triggering each other is bounded (#357 AE-3).
 *
 * `flow-engine` caps ONE flow at 120 runs/minute, which stops a flow that re-triggers itself. It
 * does nothing about the shape the audit describes: flow A fires on `event_a` and emits
 * `event_b`, flow B does the reverse, each stays far under its own cap, and the pair runs
 * indefinitely sending mail.
 *
 * The in-graph `visited` set cannot see it either — that prevents cycles WITHIN one execution,
 * and this chain leaves the process at every hop (action → row write → DB trigger → event → next
 * flow). The only thing every hop shares is the workspace the events are happening in.
 */

const ROOT = join(__dirname, '..', '..');
const src = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/flow-engine/index.ts'), 'utf8').replace(/\r\n/g, '\n'),
);

describe('#357 AE-3 — the chain has a bound, not just each flow', () => {
  it('there is a workspace-level cap alongside the per-flow one', () => {
    expect(src).toContain('MAX_FLOW_RUNS_PER_MINUTE = 120');
    expect(src).toMatch(/MAX_WORKSPACE_FLOW_RUNS_PER_MINUTE = \d+/);
  });

  it('the workspace cap counts ALL flows, not one', () => {
    // Filtering by flow_id here would just re-implement the per-flow cap under a new name.
    // Sliced from the workspace guard specifically — starting at the constant would sweep in
    // the per-flow cap above it, and the negative assertion would then be reading the wrong
    // block entirely.
    const start = src.indexOf('if (effectiveWorkspaceId) {');
    expect(start, 'the workspace guard is gone').toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('const runStartTime'));
    expect(block).toContain("eq('workspace_id', effectiveWorkspaceId)");
    expect(block).not.toContain("eq('flow_id', flow_id)");
  });

  it('the cap sits above the observed peak by a wide margin', () => {
    // Measured across 8,246 real runs: busiest workspace-minute 22, busiest single-flow minute
    // 15. A bound set near the peak turns a legitimate burst into an outage; one set near a
    // runaway never fires in time. This pins the number so a future edit is deliberate.
    const m = src.match(/MAX_WORKSPACE_FLOW_RUNS_PER_MINUTE = (\d+)/);
    const cap = Number(m?.[1]);
    expect(cap).toBeGreaterThanOrEqual(100);
    expect(cap).toBeLessThanOrEqual(500);
  });
});

describe('#357 AE-3 — the workspace is the EVENT\'s, not the flow\'s', () => {
  it('effectiveWorkspaceId falls back to the trigger data', () => {
    // A GLOBAL flow has `workspace_id IS NULL` and executes inside every tenant, so grouping by
    // the flow's own workspace would put every operator-flow run in one null bucket and never
    // match a tenant at all. Same trap CLAUDE.md records for the flow mute logic.
    expect(src).toMatch(/const effectiveWorkspaceId =/);
    const decl = src.slice(src.indexOf('const effectiveWorkspaceId ='), src.indexOf('const effectiveWorkspaceId =') + 300);
    expect(decl).toContain('flow.workspace_id');
    expect(decl).toContain('trigger_data');
  });

  it('the run records it, or there is nothing to count', () => {
    const insert = src.slice(src.indexOf("from('flow_runs')\n    .insert({"), src.indexOf('if (runError)'));
    expect(insert).toContain('workspace_id: effectiveWorkspaceId');
  });

  it('a run with no workspace is not blocked', () => {
    // A manual admin run and a test run carry no tenant context — and they are the two things an
    // operator reaches for while diagnosing a loop. Refusing them would remove the tool.
    const block = src.slice(src.lastIndexOf('MAX_WORKSPACE_FLOW_RUNS_PER_MINUTE'), src.indexOf('const runStartTime'));
    expect(src).toMatch(/if \(effectiveWorkspaceId\) \{/);
    expect(block.length).toBeGreaterThan(0);
  });

  it('the whole backstop is skipped on a test run', () => {
    const block = src.slice(src.indexOf('const effectiveWorkspaceId ='), src.indexOf('const runStartTime'));
    expect(block).toMatch(/if \(!isTestRun\)/);
  });
});
