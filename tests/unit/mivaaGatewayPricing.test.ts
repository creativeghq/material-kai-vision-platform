/**
 * mivaa-gateway ↔ pricing parity guard.
 *
 * `getMivaaActionCost` returns null for two different facts: "free on purpose" and "nobody ever
 * classified this". The gateway then forwards the call with no debit either way, so an action
 * added to ACTION_MAP and to nothing else bills zero and is indistinguishable from one that is
 * free by decision. That is the silent-zero shape from CLAUDE.md rule 2: a plausible zero, no
 * error, no failed check, nothing to notice.
 *
 * It had happened 29 times out of 116 — among them `rag_chat` (a Claude completion) and
 * `search_knowledge_base` (the same 7-vector fusion search that costs 0.5 credits under two other
 * action names). Neither is metered on the MIVAA side either: rag_routes.py contains no
 * meter_operation call at all, so those turns were free end to end.
 *
 * Being free is fine. Being UNCLASSIFIED is not — the whole point is that the decision is written
 * down next to the reason for it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const GATEWAY = join(ROOT, 'supabase/functions/mivaa-gateway/index.ts');
const PRICING = join(ROOT, 'supabase/functions/_shared/mivaa-pricing.ts');

/** Action names from the gateway's ACTION_MAP — `'name': { path: …, method: … }`. */
function actionMap(): Set<string> {
  const src = readFileSync(GATEWAY, 'utf8');
  return new Set([...src.matchAll(/^\s*'([a-z0-9_]+)':\s*\{\s*path:/gm)].map((m) => m[1]));
}

/**
 * The two lists, read as source text rather than imported — this file is Deno, and the point is to
 * check what a reader of the file sees, not what a bundler resolves.
 */
function lists(): { priced: Set<string>; free: Set<string> } {
  const src = readFileSync(PRICING, 'utf8');
  const pStart = src.indexOf('export const MIVAA_ACTION_PRICING');
  const fStart = src.indexOf('export const FREE_ACTIONS');
  const fEnd = src.indexOf(']);', fStart);
  expect(pStart, 'MIVAA_ACTION_PRICING not found').toBeGreaterThan(-1);
  expect(fStart, 'FREE_ACTIONS not found').toBeGreaterThan(-1);
  expect(fEnd, 'FREE_ACTIONS is not closed').toBeGreaterThan(fStart);
  return {
    priced: new Set([...src.slice(pStart, fStart).matchAll(/'([a-z0-9_]+)':\s*\{\s*creditCost:/g)].map((m) => m[1])),
    free: new Set([...src.slice(fStart, fEnd).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])),
  };
}

describe('mivaa-gateway credit classification', () => {
  it('reads a non-empty ACTION_MAP (guards against a regex that matches nothing)', () => {
    expect(actionMap().size).toBeGreaterThan(100);
  });

  it('every gateway action is either priced or explicitly free', () => {
    const map = actionMap();
    const { priced, free } = lists();
    const unclassified = [...map].filter((a) => !priced.has(a) && !free.has(a));
    expect(
      unclassified,
      'These actions bill zero because nobody classified them, which reads exactly like a decision '
      + 'to make them free. Add each to FREE_ACTIONS under the group comment that says WHY, or give '
      + 'it a MIVAA_ACTION_PRICING entry:\n  ' + unclassified.join('\n  '),
    ).toEqual([]);
  });

  it('no action is in both lists — FREE_ACTIONS wins, so a priced twin would never be charged', () => {
    const map = actionMap();
    const { priced, free } = lists();
    // getMivaaActionCost checks FREE_ACTIONS first and returns null, so a price sitting beside a
    // free entry is dead text that reads as a live charge.
    const both = [...map].filter((a) => priced.has(a) && free.has(a));
    expect(both, `priced AND free: ${both.join(', ')}`).toEqual([]);
  });

  it('neither list names an action the gateway cannot route', () => {
    const map = actionMap();
    const { priced, free } = lists();
    // `rag_process`, `rag_submit_job` and `rag_reprocess_images` sat in FREE_ACTIONS with no
    // ACTION_MAP entry — three exemptions for endpoints that do not exist, which is how a list
    // stops describing the thing it is supposed to describe.
    const ghosts = [...new Set([...priced, ...free])].filter((a) => !map.has(a));
    expect(ghosts, `listed but not routable: ${ghosts.join(', ')}`).toEqual([]);
  });
});
