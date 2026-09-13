/**
 * A customer's health is DERIVED — `get_customer_health` returns the signals and their verdicts,
 * and the tool only orders and formats them.
 *
 * The platform derives beautifully per RECORD and derived nothing per RELATIONSHIP, so "what is
 * happening with this customer" took six reads and no synthesis. The risk in closing that is the
 * money-derivation shape: a second opinion about the same fact, computed in TypeScript, that no
 * integrity check can see because a wrong verdict is a valid string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const SRC = readFileSync(join(ROOT, 'supabase/functions/_shared/tools/crm-tools.ts'), 'utf8');
const CODE = stripComments(SRC);

const TOOL = (() => {
  const i = CODE.indexOf('createCustomerHealthTool');
  expect(i, 'createCustomerHealthTool is gone from crm-tools.ts').toBeGreaterThan(-1);
  return CODE.slice(i);
})();

describe('the verdict comes from SQL', () => {
  it('calls the one derivation', () => {
    expect(TOOL).toMatch(/rpc\('get_customer_health'/);
  });

  it('never decides a severity or a status of its own', () => {
    // Reading `s.severity` to ORDER rows is formatting. Writing one is a second derivation.
    expect(TOOL, 'the tool assigns a severity — that belongs in get_customer_health')
      .not.toMatch(/severity\s*[:=]\s*['"`]/);
    expect(TOOL, 'the tool assigns a status — that belongs in get_customer_health')
      .not.toMatch(/status\s*[:=]\s*['"`](ok|no_data|collector_failed|not_collected)['"`]/);
  });

  it('does not recompute a trend from value and previous', () => {
    // `now < prev * 0.5` is the SQL's call. Restating it here is how a tile and a report start
    // disagreeing about whether a customer is slipping.
    expect(TOOL).not.toMatch(/\bprevious\s*\*/);
    expect(TOOL).not.toMatch(/value\s*[<>]\s*[\w.]*previous/);
  });

  it('passes every signal through, so a stated absence survives to the reader', () => {
    // Filtering to the bad ones would make "nothing billed yet" indistinguishable from a customer
    // who owes nothing — the silent-zero shape, one layer up.
    expect(TOOL).toMatch(/signals: signals\.map/);
    expect(TOOL).toMatch(/status: s\.status/);
    expect(TOOL).toMatch(/detail: s\.detail/);
  });
});

describe('tenancy', () => {
  it('resolves the company inside the workspace before calling the RPC', () => {
    // The client is service-role and assert_workspace_member deliberately lets that through, so
    // this resolve IS the ownership check (invariant 1), not a convenience.
    const resolve = TOOL.indexOf(".eq('workspace_id', workspaceId)");
    const rpc = TOOL.indexOf("rpc('get_customer_health'");
    expect(resolve, 'the company read is not workspace-scoped').toBeGreaterThan(-1);
    expect(resolve, 'the workspace scope must be applied BEFORE the RPC call').toBeLessThan(rpc);
  });

  it('asks the module gate', () => {
    const gate = TOOL.indexOf("moduleGate(workspaceId, 'crm')");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(TOOL.indexOf("rpc('get_customer_health'"));
  });

  it('refuses an ambiguous name instead of picking one', () => {
    expect(TOOL).toMatch(/matches\.length > 1/);
    expect(TOOL).toMatch(/candidates:/);
  });
});

describe('the result reaches the screen', () => {
  it('emits a chunk that AgentHub renders', () => {
    expect(TOOL).toMatch(/type: 'crm_customer_health'/);
    const hub = readFileSync(join(ROOT, 'src/components/features/ai/AgentHub.tsx'), 'utf8');
    expect(hub, 'crm_customer_health is emitted but absent from AGENT_RESULT_TITLES, so it is dropped')
      .toMatch(/crm_customer_health:\s*'/);
  });
});
