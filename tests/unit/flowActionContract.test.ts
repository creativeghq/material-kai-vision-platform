/**
 * Every flow ACTION must actually do something.
 *
 * `flowEventContract.test.ts` guards the trigger half — an emitted event no flow can listen for.
 * The action half had no guard at all, and it fails in a worse way: flow-engine's dispatch ends in
 *
 *     default: return { output: { skipped: true, reason: `Unknown action type: ${actionType}` } };
 *
 * so an action with no executor does not throw. The flow RUNS, reports success, records a step, and
 * changes nothing. That is the silent-zero shape with a green tick on it — the admin who built the
 * automation has no way to tell it from one that worked.
 *
 * Three things must line up for an action to exist at all:
 *   1. flow-engine can execute it            (or the flow does nothing)
 *   2. the palette offers it                 (or nobody can add it to a flow)
 *   3. the node has an icon                  (or the canvas renders a blank)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const TYPES = read('src/services/flows/types.ts');
const ENGINE = read('supabase/functions/flow-engine/index.ts');
const PALETTE = read('src/components/Admin/FlowsManagement/utils/paletteItems.ts');
const NODE = read('src/components/Admin/FlowsManagement/nodes/ActionNode.tsx');

/** The ActionType union, read from the source of truth rather than restated here. */
const ACTIONS: string[] = (() => {
  const lines = TYPES.split('\n');
  const start = lines.findIndex((l) => l.startsWith('export type ActionType ='));
  expect(start, 'ActionType union should exist').toBeGreaterThan(-1);
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    const m = /^\s*\|\s*'([^']+)'/.exec(l);
    if (m) { out.push(m[1]); continue; }
    if (!l.trim() || l.trim().startsWith('//')) continue;
    break;
  }
  return out;
})();

/**
 * Shrink-only, each with its reason. An action lands here because it genuinely has no executor or
 * no palette entry BY DESIGN — never to quiet the test. Adding an entry should feel like a decision.
 */
const EXEMPT: Record<string, { engine?: string; palette?: string }> = {
  send_sms: {
    palette: 'Legacy alias kept so old flows keep running; new flows use send_whatsapp, which is '
      + 'what the palette offers. Executable, deliberately unofferable.',
  },
};

describe('the ActionType union is read, not assumed', () => {
  it('finds the actions — an empty list would vacuously pass everything below', () => {
    expect(ACTIONS.length).toBeGreaterThanOrEqual(20);
    expect(ACTIONS).toContain('send_email');
  });
});

describe('every action can actually be executed', () => {
  it('flow-engine has a case for it', () => {
    const missing = ACTIONS
      .filter((a) => !EXEMPT[a]?.engine)
      .filter((a) => !ENGINE.includes(`case '${a}':`));
    expect(
      missing,
      `These actions have no executor in flow-engine. The dispatch falls through to its default, `
      + `which returns {skipped:true} WITHOUT throwing — so the flow reports success and changes `
      + `nothing:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('every action can actually be added to a flow', () => {
  it('the palette offers it', () => {
    const missing = ACTIONS
      .filter((a) => !EXEMPT[a]?.palette)
      .filter((a) => !PALETTE.includes(`subType: '${a}'`));
    expect(
      missing,
      `These actions exist in the union and in the engine, but nobody can put one on a canvas:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the node renders an icon for it', () => {
    const missing = ACTIONS
      .filter((a) => !EXEMPT[a]?.palette)
      .filter((a) => !new RegExp(`\\b${a}:\\s*\\w+`).test(NODE));
    expect(missing, `No icon mapped — the canvas renders a blank node:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});

describe('an action that CREATES a record is held to the prefill rule', () => {
  /**
   * Money-moving and legally-numbered documents produce a PREFILL, never a finished record — the
   * same rule the template system follows. An invoice conjured behind the operator skips
   * numbering, buyer-risk and myDATA classification.
   */
  const FORBIDDEN_CREATES = ['invoices', 'orders', 'payments', 'supplier_bills', 'credit_notes'];

  it('no action inserts a fiscal or money-moving document', () => {
    // Scoped to the create_* actions: other cases legitimately touch these tables (recording a
    // payment against an invoice, for instance, is not conjuring one).
    const offenders: string[] = [];
    for (const a of ACTIONS.filter((x) => x.startsWith('create_'))) {
      const i = ENGINE.indexOf(`case '${a}':`);
      if (i < 0) continue;
      const rest = ENGINE.slice(i);
      const end = rest.indexOf("\n    case '", 1);
      const body = end > 0 ? rest.slice(0, end) : rest;
      for (const t of FORBIDDEN_CREATES) {
        if (new RegExp(`from\\('${t}'\\)[\\s\\S]{0,40}\\.insert`).test(body)) {
          offenders.push(`${a} inserts into ${t}`);
        }
      }
    }
    expect(
      offenders,
      offenders.join('\n') + '\nA flow must not conjure a fiscal document behind the operator: '
        + 'it skips numbering, buyer-risk and myDATA classification. Produce a prefill instead.',
    ).toEqual([]);
  });

  it('create_task scopes its write to the flow workspace before inserting', () => {
    const i = ENGINE.indexOf("case 'create_task':");
    expect(i, 'create_task should exist').toBeGreaterThan(-1);
    const rest = ENGINE.slice(i);
    const end = rest.indexOf("\n    case '", 1);
    const body = end > 0 ? rest.slice(0, end) : rest;
    // flow-engine runs with the service role, so RLS is not the boundary — this check is.
    expect(body, 'the project must be looked up scoped to the flow workspace').toMatch(/scope\?\.workspaceId/);
    expect(body).toMatch(/from\('projects'\)/);
    // And the lookup must come BEFORE the insert, or it is decoration.
    expect(body.indexOf("from('projects')")).toBeLessThan(body.indexOf("from('project_tasks')"));
  });
});
