import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

/**
 * Every emitted flow event must exist in the `TriggerType` union (#263 item 4).
 *
 * The union is what a flow can LISTEN for. An emitter firing a string that is not in it is
 * unreachable by construction: `flow-engine` matches zero flows, returns `{triggered: 0}`, and
 * nothing anywhere reports a problem — the emit succeeded, the delivery just never existed.
 *
 * This is not hypothetical. `contracts-api` emitted **`contract_signed`** while the union carried
 * **`contract_created`** (#272): the emitter was unreachable AND the union entry unemitted, one
 * character class apart, for as long as both existed. It is fixed now; this is what stops the next
 * one, because nothing else can.
 *
 * WHY TYPESCRIPT CANNOT DO THIS:
 *   • `emitFlowEvent` / `flowEventService.emit` take a `string` — they must, since events cross
 *     the Deno/Vite boundary and edge functions cannot import `src/services/flows/types.ts`.
 *   • The icon and label maps ARE `Record<TriggerType, …>`, so tsc already guarantees those are
 *     exhaustive. Re-testing them here would add nothing. The gap is the emit side.
 *
 * Direction matters and only one direction is an error. An emitted string missing from the union
 * is a BUG (nothing can listen). A union member with no emitter is NOT — plenty are emitted from
 * SQL triggers, and `manual`/`scheduled`/`webhook` are entry points rather than events. So this
 * asserts one way and reports the other as information.
 */
const UNION_FILE = 'src/services/flows/types.ts';
const SCAN_ROOTS = ['src', 'supabase/functions'];

/** `| 'foo'` members of the TriggerType union, read from its declaration only. */
function readTriggerUnion(): Set<string> {
  // Comments stripped FIRST. The declaration is terminated by the first `;`, and one of the
  // section comments inside it reads "dotted keys; payload-only" — that semicolon truncated the
  // union at roughly half its members, so ~70 perfectly valid events were reported as orphans.
  // A parser that silently reads half its input is the same failure shape this file is about.
  const src = stripComments(readFileSync(UNION_FILE, 'utf8'));
  const start = src.indexOf('export type TriggerType =');
  expect(start, `could not find the TriggerType declaration in ${UNION_FILE}`).toBeGreaterThan(-1);
  const end = src.indexOf(';', start);
  const body = src.slice(start, end === -1 ? undefined : end);
  const out = new Set<string>();
  for (const m of body.matchAll(/\|\s*'([^']+)'/g)) out.add(m[1]);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Strip comments so prose naming an old event name doesn't register as an emit. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

interface Emit { event: string; file: string; line: number }

function collectEmits(): Emit[] {
  // Only a STRING LITERAL event name. A variable (`emitFlowEvent(evt, …)`) cannot be checked
  // statically and is skipped rather than guessed at — a guard that invents findings is worse
  // than one with a known blind spot, and this one's blind spot is narrow and deliberate.
  //
  // TWO call shapes, because the event name is not always the first argument:
  //   emitFlowEvent('x', …)                              — name first
  //   flowEventService.emit('x', …)                      — name first
  //   emitFlowEventToWorkspaceRoles(ws, roles, 'x', …)   — name THIRD
  //   flowEventService.emitToWorkspaceRoles(ws, roles, 'x', …)
  //
  // The role-fanout form was invisible here until #342. That is why `order_created` — emitted by
  // `ordersService.create` since the orders module shipped — was reported as having no in-repo
  // emitter: the guard could not see the call. A blind spot in the check that exists to find
  // blind spots is worth more than the finding it hid.
  const RE_FIRST = /(?:emitFlowEvent|flowEventService\.emit)\(\s*'([a-zA-Z0-9_.]+)'/g;
  const RE_THIRD =
    /(?:emitFlowEventToWorkspaceRoles|flowEventService\.emitToWorkspaceRoles)\(\s*[^,]+,\s*\[[^\]]*\]\s*,\s*'([a-zA-Z0-9_.]+)'/g;
  const out: Emit[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const rel = relative(process.cwd(), file).split('\\').join('/');
      // Matched against the whole file, not per line: the fanout form is routinely wrapped
      // across lines by the formatter, and a per-line scan would silently miss every one.
      for (const re of [RE_FIRST, RE_THIRD]) {
        for (const m of src.matchAll(re)) {
          const line = src.slice(0, m.index ?? 0).split('\n').length;
          out.push({ event: m[1], file: rel, line });
        }
      }
    }
  }
  return out;
}

describe('flow event contract', () => {
  const union = readTriggerUnion();
  const emits = collectEmits();

  it('finds the union and the emitters (guards against a vacuous pass)', () => {
    // Both halves must be non-trivial. If the union regex or the emit regex ever stops matching —
    // a refactor to an enum, a rename of emitFlowEvent — every assertion below would pass by
    // scanning nothing, which is the exact failure this whole test file exists to prevent.
    // Floor sits just under the real member count (103 today), not near zero. The first version
    // of this parser truncated the union to ~half and a `> 50` floor waved it straight through,
    // so ~70 valid events were reported as orphans while the sanity check said everything was
    // fine. Note 103 is the TriggerType declaration alone — `types.ts` contains other unions, so
    // grepping `| '…'` across the whole file gives 148 and is the wrong number to calibrate on.
    expect(union.size, 'TriggerType union parsed short — the declaration format changed').toBeGreaterThan(90);
    expect(emits.length, 'no emitFlowEvent/emit call sites found — the call shape changed').toBeGreaterThan(30);
  });

  it('every emitted event exists in the TriggerType union', () => {
    const orphans = emits
      .filter((e) => !union.has(e.event))
      .map((e) => `${e.file}:${e.line} emits '${e.event}' — not in TriggerType`);

    expect(
      [...new Set(orphans)],
      'These emit an event no flow can listen for. flow-engine will match zero flows and return '
      + '{triggered: 0} without error, so the feature is silently undeliverable.\nAdd the string to '
      + `the TriggerType union in ${UNION_FILE} (and follow §8 of docs/flows-notification-system.md: `
      + 'icon/label maps, a paletteItems entry, a seeded locked default flow, and a flow_area_registry '
      + 'row), or correct the emitter to the name that already exists.\n',
    ).toEqual([]);
  });

  it('reports union members with no in-repo emitter (informational, never fails)', () => {
    const emitted = new Set(emits.map((e) => e.event));
    const unemitted = [...union].filter((t) => !emitted.has(t)).sort();
    // NOT an assertion. Many are emitted from SQL triggers (`price_alert_triggered`,
    // `rfq_lines_requested`), and `manual`/`scheduled`/`webhook` are entry points, not events.
    // Failing on these would make the suite red for correct code — the surest way to get a guard
    // deleted. Printed so the count is visible when someone is looking for dead wiring.
    console.log(`[flow-contract] ${unemitted.length}/${union.size} union members have no in-repo emitter (SQL triggers + entry points expected): ${unemitted.join(', ')}`);
    expect(union.size).toBeGreaterThan(0);
  });
});

/**
 * The tenant flow vocabulary was THREE copies, and the one nobody had listed was the enforcer.
 *
 * `TENANT_TRIGGERS` / `TENANT_ACTIONS` in flow-tools.ts become the zod enum handed to the LLM —
 * what a user is OFFERED. `create_simple_flow`'s `v_allowed_*` gate the agent's create path. But
 * the REAL floor is `enforce_tenant_flow_allowlist`, a BEFORE INSERT OR UPDATE trigger on `flows`
 * that every write path crosses, and it had its own third array.
 *
 * That is not hypothetical, and this comment used to describe it in the past tense while it was
 * still live. `payment_sent` was added to the first two when the drift was "fixed"; the table
 * trigger never got it, so "notify me when a payment goes out" still passed zod, still passed the
 * RPC, and still died on a raw `42501` one layer further down. Offered, accepted, impossible —
 * exactly as before, one level below where anyone had looked.
 *
 * Fixed structurally 2026-08-24: both SQL halves now read `tenant_flow_allowed_triggers()` /
 * `tenant_flow_allowed_actions()`, so there is ONE list in the database and one mirror in
 * TypeScript. The pin below is that mirror. A unit test cannot read pg_proc, so it cannot verify
 * the database side — what it CAN do is refuse to let the TypeScript half move quietly, turning a
 * silent drift into a deliberate one.
 */
describe('tenant flow vocabulary', () => {
  const TOOL_FILE = 'supabase/functions/_shared/tools/flow-tools.ts';

  const readConst = (name: string): string[] => {
    const src = stripComments(readFileSync(TOOL_FILE, 'utf8'));
    const start = src.indexOf(`const ${name} = [`);
    expect(start, `could not find ${name} in ${TOOL_FILE}`).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf(']', start));
    return [...body.matchAll(/'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
  };

  // Must equal tenant_flow_allowed_triggers() / tenant_flow_allowed_actions(), verbatim.
  const RPC_TRIGGERS = [
    'manual', 'scheduled', 'quote_approved', 'invoice_paid', 'payment_received', 'payment_sent',
    'inbox.message_received', 'appointment_booked',
  ];
  const RPC_ACTIONS = [
    'send_email', 'send_whatsapp', 'create_notification', 'send_agent_message', 'send_campaign',
  ];

  const SYNC_HINT =
    'Changing the tenant vocabulary means changing BOTH halves in the same change: this constant ' +
    '(the TypeScript mirror) and tenant_flow_allowed_triggers() / tenant_flow_allowed_actions() ' +
    '(the ONE database list, read by create_simple_flow AND the enforce_tenant_flow_allowlist ' +
    'table trigger), applied via mcp__supabase__apply_migration. Do NOT add a fourth list.';

  it('the offered triggers are exactly the ones create_simple_flow allows', () => {
    expect([...readConst('TENANT_TRIGGERS')].sort(), SYNC_HINT).toEqual([...RPC_TRIGGERS].sort());
  });

  it('the offered actions are exactly the ones create_simple_flow allows', () => {
    expect([...readConst('TENANT_ACTIONS')].sort(), SYNC_HINT).toEqual([...RPC_ACTIONS].sort());
  });

  it('every tenant trigger is a real member of the TriggerType union', () => {
    const union = readTriggerUnion();
    for (const t of readConst('TENANT_TRIGGERS')) {
      expect(union.has(t), `'${t}' is offered to tenants but is not in the TriggerType union`).toBe(true);
    }
  });

  /**
   * The tool's admission rule, enforced: "Add a trigger only once a trusted server-side emitter
   * stamps workspace_id." A tenant flow bound to an event nothing emits is the silent-zero shape
   * — it saves, it activates, it shows up in the list, and it never once fires.
   */
  it('every tenant trigger has an emitter (or is an entry point)', () => {
    // Entry points are STARTED, not emitted, so no emitter exists or should. 'scheduled' is
    // cron-driven (flow-engine wakes it); 'manual' is what createFlowForWorkspace stamps on every
    // empty automation the tenant builder creates, which is why the table guard must keep allowing
    // it — drop it and the New automation button starts raising 42501.
    const ENTRY_POINTS = new Set(['scheduled', 'manual']);
    // collectEmits() only sees STRING-LITERAL event names, by deliberate design (see its comment).
    // 'quote_approved' is emitted through a ternary — `const eventName = accepted ? 'quote_approved'
    // : 'quote_rejected'; flowEventService.emit(eventName, { …, workspace_id })` in
    // src/modules/quotes/services/QuotesService.ts:572 — so it is real, workspace-stamped, and
    // invisible here. Exempted with its site named, not by loosening the scan into guesswork.
    const EMITTED_VIA_VARIABLE = new Set(['quote_approved']);
    const emitted = new Set(collectEmits().map((e) => e.event));
    for (const t of readConst('TENANT_TRIGGERS')) {
      if (ENTRY_POINTS.has(t) || EMITTED_VIA_VARIABLE.has(t)) continue;
      expect(
        emitted.has(t),
        `'${t}' is offered to tenants but nothing in the repo emits it — a flow bound to it can ` +
          `never fire, and nothing would ever report that.`,
      ).toBe(true);
    }
  });
});

/**
 * Global (operator) flows are visible to the OPERATOR ONLY — never to a tenant, anywhere.
 *
 * `is_global = true` rows are the platform's own automations. A platform admin edits them in one
 * place (/admin → Flows) and they apply to every workspace at once: flow-engine matches
 * `is_global.eq.true` for EVERY workspace, so all 100+ of them genuinely execute inside tenant
 * workspaces. That is what makes this boundary easy to breach by accident — the rows are live in
 * a tenant's world, they are just not the tenant's to see.
 *
 * The database enforces it (`flows_tenant_select` requires `is_global = false`; `flow_runs`
 * likewise; create/toggle/delete_simple_flow all guard it; flow-engine's on-demand run demands a
 * platform admin for a global flow). This guards the layer RLS cannot: a tenant-facing query that
 * runs under the SERVICE ROLE, where RLS does not apply at all. `manage_flows` is exactly that —
 * callerClient() falls back to service role for partner `kai_` keys and admin-secret paths — so
 * its filter is the only thing standing there, and a "redundant, RLS has it" cleanup would be a
 * silent full disclosure of the operator's automation set.
 */
describe('operator flows never reach a tenant surface', () => {
  // Surfaces a non-operator can reach. Engine internals (flow-engine, flow-scheduler-cron,
  // flow-webhook, _shared/flow-events.ts) are deliberately absent: matching global flows is their
  // job. The admin console is absent for the same reason — it is the operator's own screen.
  const TENANT_SURFACES = [
    'supabase/functions/_shared/tools/flow-tools.ts',
    ...walk('src/modules/flows-toolkit'),
  ];

  it.each(TENANT_SURFACES)('%s filters is_global on every flows read', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'));
    let from = src.indexOf(".from('flows')");
    while (from !== -1) {
      // The query chain up to its terminator — enough to hold the filters that belong to it.
      const chain = src.slice(from, from + 700);
      expect(
        /\.eq\(\s*'is_global'\s*,\s*false\s*\)/.test(chain),
        `${file} reads the flows table without an explicit .eq('is_global', false). This is a ` +
          `tenant surface, and it may run under the service role where RLS does not apply — so ` +
          `that filter is the disclosure boundary, not a duplicate of one. Operator flows are ` +
          `read and edited in /admin only.`,
      ).toBe(true);
      from = src.indexOf(".from('flows')", from + 1);
    }
  });

  it('the tenant flows page and the chat tool agree on the scope', () => {
    // Two independent tenant surfaces answering "what are my automations". If they ever disagree,
    // one of them is showing a set the other calls private.
    for (const f of ['src/modules/flows-toolkit/pages/FlowsPage.tsx',
                     'supabase/functions/_shared/tools/flow-tools.ts']) {
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(/\.eq\(\s*'is_global'\s*,\s*false\s*\)/.test(src), `${f} must scope to non-global flows`).toBe(true);
      expect(/\.eq\(\s*'workspace_id'/.test(src), `${f} must scope to one workspace`).toBe(true);
    }
  });
});
