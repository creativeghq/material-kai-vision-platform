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

/**
 * The resolution moved into `resolveCompanyInWorkspace`, shared by every tool in this file. It
 * was inline here and inline again in enrich_company_from_aade, and the copies had DRIFTED: this
 * one searched the folded and transliterated name columns and that one searched only `name`, so a
 * Greek counterparty was reachable by its Latin trade name from one tool and not the other. The
 * obligations below are unchanged; they are asserted where the code now lives.
 */
const RESOLVER = (() => {
  const i = CODE.indexOf('async function resolveCompanyInWorkspace');
  expect(i, 'resolveCompanyInWorkspace is gone from crm-tools.ts').toBeGreaterThan(-1);
  return CODE.slice(i, CODE.indexOf('export const createCrmKadSearchTool', i));
})();

describe('tenancy', () => {
  it('resolves the company inside the workspace before calling the RPC', () => {
    // The client is service-role and assert_workspace_member deliberately lets that through, so
    // this resolve IS the ownership check (invariant 1), not a convenience.
    const resolve = TOOL.indexOf('resolveCompanyInWorkspace(');
    const rpc = TOOL.indexOf("rpc('get_customer_health'");
    expect(resolve, 'the company is no longer resolved before the RPC').toBeGreaterThan(-1);
    expect(resolve, 'the resolve must happen BEFORE the RPC call').toBeLessThan(rpc);
    expect(RESOLVER, 'the shared resolver is not workspace-scoped')
      .toContain(".eq('workspace_id', workspaceId)");
  });

  it('asks the module gate', () => {
    const gate = TOOL.indexOf("moduleGate(workspaceId, 'crm')");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(TOOL.indexOf("rpc('get_customer_health'"));
  });

  it('refuses an ambiguous name instead of picking one', () => {
    expect(RESOLVER).toMatch(/found\.length > 1/);
    expect(RESOLVER).toMatch(/candidates:/);
    // …and the caller must actually stop on it, rather than reading `.company` off a refusal.
    expect(TOOL).toMatch(/if \(!resolved\.company\)/);
    expect(TOOL).toMatch(/candidates: resolved\.candidates/);
  });

  it('a Greek counterparty is reachable by its Latin trade name', () => {
    // Half the names in this CRM are Greek and the operator types Latin. `name_fold` and
    // `name_xscript` are what make "New Plan" find "Μ ΚΑΝΑΤΣΙΟΠΟΥΛΟΣ NEW PLAN …".
    expect(RESOLVER).toContain('name_fold.ilike');
    expect(RESOLVER).toContain('name_xscript.ilike');
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
