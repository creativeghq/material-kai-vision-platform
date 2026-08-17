import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

/**
 * Every event a tenant can subscribe an outbound webhook to (#330) must be a real
 * `TriggerType`.
 *
 * The failure this prevents is silent and lands on the TENANT, not on us. A subscription to an
 * event string the platform never emits is accepted, stored, and listed in their dashboard —
 * and then simply never fires. From their side that is indistinguishable from a broken endpoint
 * or a broken integration, and they will debug their own server first.
 *
 * TypeScript cannot catch it: `SUBSCRIBABLE_EVENT_TYPES` lives in `supabase/functions/_shared`
 * (Deno) and the union lives in `src/services/flows/types.ts` (Vite). Edge functions cannot
 * import across that boundary — which is exactly why the list is a hand-maintained copy, and
 * exactly why it needs a guard.
 *
 * The union parser is deliberately the same shape as flowEventContract.test.ts, including the
 * comment-stripping: a section comment inside the declaration contains a semicolon, and a naive
 * parser truncates the union at roughly half its members and then happily "passes".
 */
const UNION_FILE = 'src/services/flows/types.ts';
const LIST_FILE = 'supabase/functions/_shared/webhook-events.ts';

function stripComments(src: string): string {
  return sharedStripComments(src);
}

function readTriggerUnion(): Set<string> {
  const src = stripComments(readFileSync(UNION_FILE, 'utf8'));
  const start = src.indexOf('export type TriggerType =');
  expect(start, `could not find the TriggerType declaration in ${UNION_FILE}`).toBeGreaterThan(-1);
  const end = src.indexOf(';', start);
  const body = src.slice(start, end === -1 ? undefined : end);
  const out = new Set<string>();
  for (const m of body.matchAll(/\|\s*'([^']+)'/g)) out.add(m[1]);
  return out;
}

function readSubscribable(): string[] {
  const src = stripComments(readFileSync(LIST_FILE, 'utf8'));
  const start = src.indexOf('SUBSCRIBABLE_EVENT_TYPES');
  expect(start, `could not find SUBSCRIBABLE_EVENT_TYPES in ${LIST_FILE}`).toBeGreaterThan(-1);
  const end = src.indexOf('];', start);
  const body = src.slice(start, end === -1 ? undefined : end);
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('outbound webhook event vocabulary (#330)', () => {
  const union = readTriggerUnion();
  const subscribable = readSubscribable();

  it('parsed both sides (guards against a vacuous pass)', () => {
    // Without these floors, a refactor that breaks either regex makes every assertion below
    // pass by comparing two empty sets — the same shape of bug the test exists to catch.
    expect(union.size, 'TriggerType union parsed short — the declaration format changed').toBeGreaterThan(90);
    expect(subscribable.length, 'SUBSCRIBABLE_EVENT_TYPES parsed empty — the export shape changed').toBeGreaterThan(15);
  });

  it('every subscribable event exists in the TriggerType union', () => {
    const orphans = subscribable.filter((e) => !union.has(e));
    expect(
      orphans,
      'These can be subscribed to but are not real events. The subscription would be accepted, '
      + 'listed in the tenant\'s dashboard, and never fire — which looks to them like a broken '
      + `endpoint. Fix the spelling in ${LIST_FILE}, or add the event to the union properly `
      + '(docs/flows-notification-system.md §8).\n',
    ).toEqual([]);
  });

  it('has no duplicates', () => {
    // A duplicate would double-deliver every occurrence of that event to the same endpoint.
    const seen = new Set<string>();
    const dupes = subscribable.filter((e) => seen.size === seen.add(e).size);
    expect([...new Set(dupes)], 'duplicate entries would double-deliver that event').toEqual([]);
  });

  it('excludes the operator-only and high-volume events', () => {
    // Regression pins, each for a concrete reason rather than taste:
    //  - fiscal_credits_low is about the OPERATOR's provider pool, not a tenant's business.
    //  - email_opened/clicked fire per recipient per open; subscribing turns one campaign into
    //    thousands of signed POSTs and knocks over the tenant's own server first.
    //  - role_upgrade_*/module_access_requested describe OUR operations, not theirs.
    for (const forbidden of [
      'fiscal_credits_low',
      'email_opened',
      'email_clicked',
      'module_access_requested',
      'role_upgrade_approved',
      'background_agent_failed',
      'user_login',
    ]) {
      expect(subscribable, `${forbidden} must not be tenant-subscribable`).not.toContain(forbidden);
    }
  });
});
