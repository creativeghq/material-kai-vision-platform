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
