import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from '../helpers/stripComments';

/**
 * Platform defaults — the workspace owner's off switch over the OPERATOR's seeded flows.
 *
 * The seeded `system-default` flows are `is_global` with `workspace_id IS NULL`, and flow-engine
 * matches `is_global.eq.true` for EVERY workspace. They therefore run inside a tenant's workspace,
 * raising its bells and mailing its members, while being invisible on every tenant surface. The
 * measured state before this shipped: 115 flows, ALL global, ZERO workspace-owned — so the tenant
 * Automations page was structurally empty for every workspace that has ever existed, and
 * "stop emailing me on every WhatsApp reply" had no answer in the product at all.
 *
 * The fix is an OVERLAY (`workspace_flow_preferences`), never a per-workspace COPY of the defaults.
 * That choice is the thing worth guarding: copies would drift the moment the operator fixed a
 * default, and this repo has paid for that shape repeatedly.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. The RPCs live in `pg_proc`, which a repo-file test cannot
 * read — so the SQL half (admin gate, tenant_configurable filter, channel narrowing) is enforced
 * by the functions themselves and probed by hand, not here. What IS checkable from the repo is the
 * client/engine half, and each case below is a failure that would be SILENT: the switch renders and
 * does nothing, or the surface quietly stops existing again.
 */

const SECTION = 'src/modules/flows-toolkit/components/PlatformDefaultsSection.tsx';
const PAGE = 'src/modules/flows-toolkit/pages/FlowsPage.tsx';
const ENGINE = 'supabase/functions/flow-engine/index.ts';

/**
 * CODE only. Every "must not contain X" assertion below has to read past the prose, because these
 * files EXPLAIN the rule they follow — the doc comment on PlatformDefaultsSection says the words
 * `graph_definition` and `flows` while being the thing that correctly never touches either. A
 * grep-shaped guard that reads its own documentation as a violation fails on the file that is
 * right, which trains the next person to delete the guard.
 */
const readCode = (p: string) => stripComments(readFileSync(p, 'utf8'));

/**
 * The body of a top-level `async function`, by name.
 *
 * Written out because both obvious one-liners are quietly broken on these signatures:
 *   • `indexOf('async function', start)` returns **-1** for the last such declaration in the file,
 *     and `slice(start, -1)` is not "empty" — it is the whole rest of the source, so the assertion
 *     passes on text from anywhere below. That is how a guard goes green while pointing at nothing.
 *   • brace-matching from the first `{` lands inside the SIGNATURE, not the body:
 *     `handleTriggerEvent(…, body: { event_type: string … })` opens one in a parameter type, and
 *     `executeAction(…): Promise<{ output: … }>` opens one in the return type.
 * So: match the parameter parens, then take the first `{` at angle-bracket depth zero.
 */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`async function ${name}(`);
  expect(start, `could not find ${name} in the source`).toBeGreaterThan(-1);

  // 1. Step over the parameter list.
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) { i++; break; }
  }

  // 2. Skip the return-type annotation — a `{` inside `Promise<{ … }>` is not the body.
  let angle = 0;
  for (; i < src.length; i++) {
    if (src[i] === '<') angle++;
    else if (src[i] === '>') angle--;
    else if (src[i] === '{' && angle === 0) break;
  }

  // 3. Brace-match the body itself.
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

describe('platform defaults — tenant surface', () => {
  it('is actually rendered on the Automations page', () => {
    // The entire feature is one <PlatformDefaultsSection /> away from being invisible again, which
    // is exactly the state it was built to fix. A component nothing mounts is unreachable however
    // correct it is — the same shape as a tool in no toolkit cluster.
    const page = readCode(PAGE);
    expect(page).toContain('PlatformDefaultsSection');
    // Matches the element with or without props — it gained `onOpenFlow`/`refreshTick` when
    // Reuse landed, and a self-closing-only pattern would have failed on a working page.
    expect(
      /<PlatformDefaultsSection[\s>]/.test(page),
      `${PAGE} imports PlatformDefaultsSection but never renders it`,
    ).toBe(true);
  });

  it('reads the defaults through the projection RPC, never the flows table', () => {
    // CLAUDE.md: a tenant-facing read of `flows` carries an explicit `.eq('is_global', false)`,
    // because `manage_flows` can run under the service role where RLS does not apply at all — so
    // the filter IS the boundary. This surface is the one place that shows a tenant something about
    // a GLOBAL flow, and it stays legal by not reading `flows`: `get_workspace_flow_defaults`
    // returns title/description/channels/state and never `graph_definition`. Swapping it for a
    // direct select is how the whole operator automation set gets disclosed.
    const src = readCode(SECTION);
    expect(src).toContain('get_workspace_flow_defaults');
    expect(
      src.includes(".from('flows')"),
      `${SECTION} must not read the flows table directly — use get_workspace_flow_defaults`,
    ).toBe(false);
    expect(
      src.includes('graph_definition'),
      `${SECTION} must never handle graph_definition — the operator's graph is not a tenant's business`,
    ).toBe(false);
  });

  it('writes only through the admin-gated RPC', () => {
    // Direct writes are impossible by design: workspace_flow_preferences has a SELECT policy and
    // no INSERT/UPDATE/DELETE policy at all. A client reaching for .from(...).upsert() would fail
    // silently-ish at runtime rather than at review, so catch it here.
    const src = readCode(SECTION);
    expect(src).toContain('set_workspace_flow_preference');
    expect(
      src.includes(".from('workspace_flow_preferences')"),
      `${SECTION} must not write the overlay table directly — use set_workspace_flow_preference`,
    ).toBe(false);
  });

  it('offers only channels the engine can actually mute', () => {
    // The chips are a promise: "turn Email off and you stop getting email". A key the engine has no
    // case for renders a switch that saves cleanly and changes nothing — a wrong preference is a
    // valid preference, so nothing raises. The RPC drops an unknown value on write, which makes the
    // mismatch even quieter: the toggle appears to work and un-sticks on reload.
    const src = readCode(SECTION);
    const block = src.slice(src.indexOf('const CHANNELS'), src.indexOf('export function'));
    const channels = [...block.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
    expect(channels.length, 'could not parse the CHANNELS map').toBeGreaterThan(0);

    const engine = readCode(ENGINE);
    for (const c of channels) {
      expect(
        new RegExp(`case '${c}':`).test(engine),
        `channel '${c}' is offered in the UI but flow-engine has no action case for it`,
      ).toBe(true);
    }
  });
});

describe('platform defaults — Reuse is a fork', () => {
  it('forks through the RPC and never inserts a flow from the client', () => {
    // The fork has to happen in ONE transaction: create the copy AND disable the global for this
    // workspace. A client doing it in two calls leaves a window where both are live, and the owner
    // gets every notification twice — the precise thing they came to this screen to stop. It also
    // has to be admin-gated, and `enforce_tenant_flow_allowlist` has to see the insert.
    const src = readCode(SECTION);
    expect(src).toContain('fork_workspace_flow_default');
    expect(
      src.includes(".from('flows')"),
      `${SECTION} must not insert a forked flow client-side — use fork_workspace_flow_default`,
    ).toBe(false);
  });

  it('offers Reuse only where the server says forkable', () => {
    // `forkable` is derived server-side from the same vocabulary functions the fork RPC and the
    // table trigger read. Deciding it in the client instead means a second, hand-kept list of
    // "editable triggers" — and the moment it drifts the button is offered on a row where the
    // INSERT can only raise 42501. Offered-but-impossible is the bug this whole file is about.
    const src = readCode(SECTION);
    expect(
      /row\.forkable/.test(src),
      'the Reuse button must be gated on the server-derived `forkable` flag',
    ).toBe(true);
    for (const banned of ['inbox.message_received', 'quote_approved', 'appointment_booked']) {
      expect(
        src.includes(`'${banned}'`),
        `${SECTION} must not hard-code which triggers are forkable ('${banned}') — read forkable`,
      ).toBe(false);
    }
  });

  it('warns that a fork starts costing credits', () => {
    // A platform default is an operator flow and runs FREE. The copy is an ordinary workspace
    // automation, so flow-engine debits the workspace pool per run. On inbox messages that is a
    // real bill, and it must be agreed to BEFORE the fork rather than discovered on the invoice.
    const src = readCode(SECTION);
    const fn = src.slice(src.indexOf('const reuse'), src.indexOf('const filtered'));
    expect(
      /credits/i.test(fn),
      'the Reuse confirmation must say the copy is billed per run',
    ).toBe(true);
  });
});

describe('platform defaults — engine', () => {
  it('applies the mute inside executeAction, not at a call site', () => {
    // executeAction is the ONE point every action passes through. There are two callers — the BFS
    // walk and the loop-node body, which fans an action out per item — so a check placed at either
    // call site alone lets the other through. A looped send_email that ignores the mute is worse
    // than no mute at all: the owner switched it off and got MORE mail than a normal run.
    // Sliced to the PREAMBLE — declaration up to the `switch (actionType)` that dispatches — rather
    // than brace-matched: executeAction's body is full of `{{template}}` placeholders inside string
    // literals, and a brace counter that cannot tell code from text gives up on it. The preamble is
    // also the stricter claim: the mute has to be decided before the dispatch, not somewhere in it.
    const engine = readCode(ENGINE);
    const start = engine.indexOf('async function executeAction(');
    expect(start, 'could not find executeAction in flow-engine').toBeGreaterThan(-1);
    const dispatch = engine.indexOf('switch (actionType)', start);
    expect(dispatch, 'executeAction no longer dispatches on actionType').toBeGreaterThan(start);
    const preamble = engine.slice(start, dispatch);

    expect(
      /scope\?\.mutedActions\?\.has\(actionType\)/.test(preamble),
      'the muted-channel check must live inside executeAction, before the action runs',
    ).toBe(true);
    // Before resolveAllTemplates and the test-mode short-circuit: a muted channel should cost nothing.
    expect(preamble.indexOf('mutedActions')).toBeLessThan(preamble.indexOf('resolveAllTemplates'));
  });

  it('drops a disabled default and passes mutes down, keyed on the EVENT workspace', () => {
    // A global flow's own `workspace_id` is NULL — the tenant context lives on the EVENT. Resolving
    // the overlay against the flow's scope instead would match nothing and the mute would silently
    // never apply, which looks exactly like a working feature until someone checks their inbox.
    const body = functionBody(readCode(ENGINE), 'handleTriggerEvent');
    expect(body).toContain("from('workspace_flow_preferences')");
    expect(
      /\.eq\('workspace_id', workspaceId\)/.test(body),
      'the overlay must be read for the workspace the EVENT belongs to',
    ).toBe(true);
    expect(
      body.includes('mutedByFlow.get('),
      'resolved mutes must be threaded into handleExecuteFlow, not just computed',
    ).toBe(true);
  });

  it('leaves a tenant\'s own flows out of the overlay', () => {
    // The overlay exists because a tenant cannot pause an operator flow. A tenant's OWN flow is
    // already theirs to pause via toggle_simple_flow, so applying preferences to it would give one
    // automation two independent off switches that disagree.
    const body = functionBody(readCode(ENGINE), 'handleTriggerEvent');
    expect(
      /is_global\??:?\s*boolean\s*\}\)\.is_global === true/.test(body)
      || body.includes('.is_global === true'),
      'only global flows may be filtered by workspace_flow_preferences',
    ).toBe(true);
  });
});
