/**
 * Property Management and Investments are PAID ADD-ONS on top of Real Estate, and the gate that
 * makes that true is `PM_ACTIONS` / `INVEST_ACTIONS` in `real-estate-api`. The page-side gates
 * (`isModuleAvailable`, `<ModuleTabGate>`, the workbench's `pmEnabled`/`investEnabled` tab
 * conditions) are UX; `_shared/entitlement.ts` states the doctrine in its own header — *module
 * entitlement enforcement at the API boundary is the real security line*.
 *
 * MEASURED 2026-08-30: seven actions reached an add-on's tables with no add-on check.
 *
 *   • `update-tenancy-lifecycle` and `rotate-tenant-portal-token` — both called by the Lettings
 *     tab itself, so the very screen the add-on unlocks had two writes outside the gate. The
 *     second mints the tenant's portal credential.
 *   • `list-inspections` / `upsert-inspection` — the tenancy inspection pair.
 *   • `delete-tenancy`, `delete-maintenance`, `delete-investment` — the whole delete surface. A
 *     workspace that had never bought Property Management could not read a tenancy and could
 *     delete one.
 *
 * Nothing looked wrong the entire time, because the tab was hidden: you have to call the function
 * directly to see it, and it is reachable directly.
 *
 * The rule is DERIVED, not a second copy of the list. Membership follows the TABLE the handler
 * touches, so a new action is covered the day it is written rather than the day someone remembers
 * to add it here — which is the failure this is replacing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'supabase/functions/real-estate-api/index.ts'),
  'utf8',
);

/** Tables an add-on owns. Touch one and the action belongs to that add-on's gate. */
const OWNED: Array<{ slug: string; setName: string; tables: string[] }> = [
  {
    slug: 'real-estate-management',
    setName: 'PM_ACTIONS',
    tables: [
      'property_tenancies',
      'property_rent_charges',
      'property_maintenance',
      'property_tenancy_inspections',
    ],
  },
  {
    slug: 'real-estate-investments',
    setName: 'INVEST_ACTIONS',
    tables: ['property_investments'],
  },
];

/** The literal `new Set([...])` the handler gates on. */
function gateSet(name: string): Set<string> {
  const at = SRC.indexOf(`const ${name} = new Set(`);
  expect(at, `${name} is gone from real-estate-api — the add-on gate has no list`).toBeGreaterThan(-1);
  const end = SRC.indexOf(');', at);
  return new Set([...SRC.slice(at, end).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
}

interface Handler { actions: string[]; body: string }

/**
 * One entry per handler. Consecutive bare `case 'x':` labels fall through to a shared body, so
 * they are collapsed into a single handler carrying every action that reaches it — that shared
 * delete block is where three of the seven holes were.
 */
function handlers(): Handler[] {
  const labels = [...SRC.matchAll(/^ {6}case '([a-z0-9-]+)':/gm)];
  expect(labels.length, 'no case labels parsed — this guard is pointed at nothing').toBeGreaterThan(50);
  const blocks = labels.map((l, i) => ({
    action: l[1],
    body: SRC.slice(l.index!, i + 1 < labels.length ? labels[i + 1].index! : SRC.length),
  }));
  const out: Handler[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const run = [blocks[i].action];
    let j = i;
    while (/^case '[a-z0-9-]+':$/.test(blocks[j].body.trim())) { j++; run.push(blocks[j].action); }
    out.push({ actions: run, body: blocks[j].body });
    i = j;
  }
  return out;
}

/**
 * The tables one action reaches. A fall-through block that dispatches through an
 * `action → { table }` map is read per action, because those six deletes touch six different
 * tables from one body and attributing all six to each would be nonsense in both directions.
 */
function tablesByAction(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { actions, body } of handlers()) {
    const mapped = new Map(
      [...body.matchAll(/'([a-z0-9-]+)':\s*\{\s*table:\s*'([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]),
    );
    const all = [...body.matchAll(/\.from\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
    for (const a of actions) {
      out.set(a, new Set(mapped.has(a) ? [mapped.get(a)!] : all));
    }
  }
  return out;
}

describe('real-estate add-on gates are enforced where the query runs', () => {
  it('reads both sides', () => {
    const byAction = tablesByAction();
    expect(byAction.size, 'no actions parsed').toBeGreaterThan(80);
    // Every add-on table must actually be touched by something, or the rule below is vacuous.
    const touched = new Set([...byAction.values()].flatMap((s) => [...s]));
    for (const { tables } of OWNED) {
      for (const t of tables) {
        expect(touched.has(t), `${t} is no longer read by any handler — is the rule still live?`).toBe(true);
      }
    }
    // And the gate has to still be applied, not merely declared.
    for (const { setName, slug } of OWNED) {
      expect(SRC).toContain(`${setName}.has(action)`);
      expect(SRC).toContain(`'${slug}'`);
    }
  });

  it('every action that touches an add-on table is in that add-on gate', () => {
    const byAction = tablesByAction();
    const offenders: string[] = [];
    for (const { slug, setName, tables } of OWNED) {
      const gate = gateSet(setName);
      for (const [action, used] of byAction) {
        const owned = [...used].filter((t) => tables.includes(t));
        if (owned.length && !gate.has(action)) {
          offenders.push(`${action} reads ${owned.join(', ')} but is not in ${setName} (${slug})`);
        }
      }
    }
    expect(
      offenders,
      'These reach a paid add-on\'s tables without asking whether the workspace owns it. The tab '
      + 'is hidden, which is exactly why this looks fine from the app — real-estate-api is '
      + `reachable directly:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('every action IN a gate actually belongs to it', () => {
    // The other direction: a stale entry 402s a base-module action for a workspace that has paid
    // for Real Estate and nothing else, which reads as the module being broken.
    const byAction = tablesByAction();
    const offenders: string[] = [];
    for (const { setName, tables } of OWNED) {
      for (const action of gateSet(setName)) {
        const used = byAction.get(action);
        if (!used) { offenders.push(`${setName} lists '${action}', which is not a case in the switch`); continue; }
        if (![...used].some((t) => tables.includes(t))) {
          offenders.push(`${setName} lists '${action}', which touches none of ${tables.join(', ')}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
