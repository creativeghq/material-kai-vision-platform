/** Estimate holds both ways to measure; Changes is the one variation register, change orders included (#549). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => stripComments(readFileSync(resolve(process.cwd(), p), 'utf8'));
const TABS = 'src/modules/projects/components/tabs';
const ESTIMATE = read(`${TABS}/EstimateTab.tsx`);
const CHANGES = read(`${TABS}/ChangesTab.tsx`);
const PLAN = read(`${TABS}/PlanTab.tsx`);
const QUOTES = read(`${TABS}/QuotesTab.tsx`);
const REGISTER = read('src/modules/projects/components/VariationsCard.tsx');
const ENGINE = read('supabase/functions/project-plan-engine/index.ts');

const changeOrderCase = () => {
  const start = ENGINE.indexOf("case 'create-change-order'");
  const end = ENGINE.indexOf('default:', start);
  expect(start).toBeGreaterThan(-1);
  return ENGINE.slice(start, end);
};

describe('Estimate', () => {
  it('offers drawings beside dimensions only when takeoff is available', () => {
    expect(ESTIMATE).toContain('<HubSegmented');
    expect(ESTIMATE).toContain('if (!showTakeoff) return plan;');
    expect(ESTIMATE).toContain('<TakeoffTab');
    expect(ESTIMATE).toContain('<PlanTab');
  });

  it('a ?revision= link opens on the drawings', () => {
    expect(ESTIMATE).toMatch(/sp\.get\('revision'\) \? 'drawings' : 'dimensions'/);
  });

  it('the plan toolbar keeps three actions in view and files the rest under More', () => {
    expect(PLAN).not.toContain('isOwner');
    expect(PLAN).toContain('<DropdownMenu');
    for (const item of ['Save version', 'Version history', 'Save as blueprint', 'Generate material list']) {
      const at = PLAN.indexOf(item);
      expect(at, item).toBeGreaterThan(PLAN.indexOf('<DropdownMenuContent'));
    }
  });

  it('the material-list toast names where the lines landed', () => {
    expect(PLAN).not.toContain('Finance / purchase items');
    expect(PLAN).toContain('Purchases → Made to order');
    expect(PLAN).toContain("projectSectionPath(projectId, 'purchases')");
  });
});

describe('Changes', () => {
  it('mounts the register, and Quotes no longer does', () => {
    expect(CHANGES).toContain('<VariationsCard');
    expect(QUOTES).not.toContain('VariationsCard');
    expect(QUOTES).not.toContain('SelectionsPanel');
    expect(QUOTES).not.toContain('isWorkspaceManager');
  });

  it('the register has no dead change callback', () => {
    expect(REGISTER).not.toContain('onChanged');
  });

  it('a change order is withdrawn, never deleted', () => {
    expect(REGISTER).toMatch(/v\.quote_id \? \([\s\S]{0,700}'withdrawn'/);
  });
});

describe('a plan change order is recorded as a variation', () => {
  it('records through the idempotent RPC after the quote lines, on both paths', () => {
    const body = changeOrderCase();
    const calls = body.split('recordChangeOrderVariation(').length - 1;
    expect(calls).toBe(2);
    const rebuild = body.indexOf('writeQuoteItems(supabase, prevQuote.id');
    expect(body.indexOf('recordChangeOrderVariation(', rebuild)).toBeGreaterThan(rebuild);
    const fresh = body.indexOf('writeQuoteItems(supabase, quote.id');
    expect(body.indexOf('recordChangeOrderVariation(', fresh)).toBeGreaterThan(fresh);
    expect(ENGINE).toContain("supabase.rpc('record_plan_change_order_variation'");
  });

  it('refuses to rebuild a quote whose change order was already decided, BEFORE touching its lines', () => {
    const body = changeOrderCase();
    const check = body.indexOf(".not('status', 'in', '(draft,submitted)')");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(body.indexOf('writeQuoteItems(supabase, prevQuote.id'));
  });

  it('the plan tab points the operator at the register', () => {
    expect(PLAN).toContain("projectSectionPath(projectId, 'changes')");
  });
});
