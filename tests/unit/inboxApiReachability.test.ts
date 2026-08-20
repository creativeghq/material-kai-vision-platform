/**
 * Guard: every action `inbox-api` implements is reachable from a screen (#342).
 *
 * `update_intake_items` and `search_intake_products` shipped with the rest of order intake,
 * complete with typed client wrappers, and had no caller. Nothing failed — the edge function
 * routed them, the wrappers typechecked, the tests passed. A reviewer looking at an intake could
 * only accept the model's whole reading or dismiss it, so one wrong line meant throwing away four
 * right ones, and the two actions that existed to fix exactly that were unreachable.
 *
 * This is the same shape `toolkitCoverage` guards on the agent side: a tool registered on an agent
 * but in no cluster is silently stripped, and a factory nothing instantiates is unreachable however
 * good the picker looks. The router is not the surface. A `case` is not a caller.
 *
 * Comments are stripped before anything is counted. `inbox-api` DISCUSSES `remove_participant` in
 * a comment about AI takeover, and a guard that accepts prose as a call site would have reported
 * this whole file green while the two intake actions sat unreachable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const EDGE = 'supabase/functions/inbox-api/index.ts';
const SERVICE = 'src/services/inboxApi.ts';
const INBOX_PAGE = 'src/pages/Inbox/InboxPage.tsx';

const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

/**
 * Actions with no caller, each with the reason it is allowed to have none. SHRINK-ONLY: an entry
 * that gains a caller must be deleted from this list, and the test below fails until it is. Do not
 * add to it to make a red build green — an action nobody can reach is the defect, not the alarm.
 */
const NO_CALLER_EXPECTED: Record<string, string> = {
  // Redundant by construction: `get_thread` already stamps `last_read_at` on the accessing
  // participant, so opening a conversation marks it read without a second round trip.
  mark_read: 'get_thread marks the thread read on open; an explicit call would be a no-op',
  // A real gap, recorded rather than hidden: participants can be added from the rail and never
  // removed. Building the affordance is its own change, not a side effect of this one.
  remove_participant: 'no remove affordance exists in the rail yet — an unbuilt surface, not a dead action',
};

function srcFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== 'node_modules') walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(p);
      }
    }
  };
  walk(join(ROOT, 'src'));
  // The thin wrapper file is not a caller of itself.
  return out.filter((p) => !p.endsWith(join('src', 'services', 'inboxApi.ts').replace(/\//g, sep)));
}

/** action → the `inboxApi` method that posts it, derived from the service rather than restated. */
function wrappersByAction(): Map<string, string> {
  const svc = read(SERVICE);
  const headers = [...svc.matchAll(/^ {2}(?:async )?([a-zA-Z_]\w*)\s*\(/gm)]
    .map((m) => ({ name: m[1], at: m.index ?? 0 }));
  const byAction = new Map<string, string>();
  // Every action literal in the file, attributed to the method it sits inside. Deliberately NOT
  // anchored on `call<…>(` — those type arguments nest (`Array<{ … | null }>`), so any regex that
  // tries to span them quietly matches nothing and reports every action unreachable.
  for (const m of svc.matchAll(/'([a-z0-9_]+)'/g)) {
    const at = m.index ?? 0;
    let owner = '';
    for (const h of headers) {
      if (h.at < at) owner = h.name; else break;
    }
    if (owner && !byAction.has(m[1])) byAction.set(m[1], owner);
  }
  return byAction;
}

describe('inbox-api — every action is reachable from a screen', () => {
  const edge = read(EDGE);
  const actions = [...new Set([...edge.matchAll(/^\s*case '([a-z0-9_]+)':/gm)].map((m) => m[1]))];
  const wrappers = wrappersByAction();
  const blob = srcFiles().map((p) => stripComments(readFileSync(p, 'utf8'))).join('\n');

  const isCalled = (action: string): boolean => {
    // Either something posts the action string directly (marketplaceService does), or the
    // wrapper method that posts it is called somewhere outside the wrapper file.
    if (new RegExp(`'${action}'`).test(blob)) return true;
    const method = wrappers.get(action);
    return !!method && new RegExp(`\\b${method}\\s*\\(`).test(blob);
  };

  it('the router implements a non-trivial number of actions', () => {
    // An inert scan reports every action reachable. This is what stops that.
    expect(actions.length, 'no `case` actions were found — the scan matched nothing').toBeGreaterThan(20);
  });

  it('no action is a dead end', () => {
    const dead = actions.filter((a) => !isCalled(a) && !(a in NO_CALLER_EXPECTED));
    expect(
      dead,
      'These inbox-api actions have no caller anywhere in src/. An action the router handles and ' +
        'no screen invokes is unreachable, and nothing about it fails — which is how ' +
        'update_intake_items and search_intake_products sat unused after shipping. Wire the ' +
        'surface, or delete the action.\n' + dead.join('\n'),
    ).toEqual([]);
  });

  it('the no-caller list only ever shrinks', () => {
    const nowCalled = Object.keys(NO_CALLER_EXPECTED).filter((a) => isCalled(a));
    expect(
      nowCalled,
      'These actions now HAVE a caller and must be removed from NO_CALLER_EXPECTED. Leaving an ' +
        'entry behind turns the list into a place exemptions accumulate.\n' + nowCalled.join('\n'),
    ).toEqual([]);

    const gone = Object.keys(NO_CALLER_EXPECTED).filter((a) => !actions.includes(a));
    expect(gone, 'NO_CALLER_EXPECTED names an action the router no longer has\n' + gone.join('\n')).toEqual([]);
  });
});

describe('order intake — the reviewer can fix a line, and a price keeps its provenance', () => {
  const page = read(INBOX_PAGE);

  it('the rail actually calls the two line-editing actions', () => {
    // Named rather than left to the generic sweep above: these two are the reason it exists, and
    // a generic assertion would go quiet the moment someone added an unrelated caller.
    expect(page, 'the intake rail no longer lets a reviewer repoint a line').toMatch(
      /inboxApi\.searchIntakeProducts\s*\(/,
    );
    expect(page, 'the intake rail no longer lets a reviewer fix, drop or add a line').toMatch(
      /inboxApi\.updateIntakeItems\s*\(/,
    );
  });

  it('a price the member did not type is never sent back', () => {
    // Sending `unit_price` is exactly what stamps `unit_price_source='manual'`, and a manual line
    // stops re-pricing when the customer is assigned — which is the one thing assigning a customer
    // is for. So echoing a resolver price back into the payload silently freezes it, and the frozen
    // number is a perfectly valid number: no typecheck and no integrity probe can see it.
    const offenders = page
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bunit_price\s*:/.test(line) && !/priceTouched/.test(line));
    expect(
      offenders.map((o) => `${o.n}: ${o.line}`),
      'A unit_price is written into an intake payload without a check that the member typed it. ' +
        'Guard it on the touched flag, or the line is silently converted to a manual price.',
    ).toEqual([]);
  });
});
