/**
 * An empty surface must offer the way out of being empty.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `ContractsSection` rendered `<p>No contracts yet.</p>` — and eight lines above it, in the same
 * component, sat `canCreate` and `openCreate` powering a "New contract" button in the card
 * header. So the one screen state where the user most needs the create action showed them a
 * sentence and nothing else, while the button they needed was there the whole time, in scope,
 * unused. That shape repeated 116 times across 74 files.
 *
 * It is invisible to every other check. The text is correct, the component renders, the types are
 * fine, and the screen only looks wrong to somebody who has no data — which is never the person
 * writing the code, and rarely the person reviewing it. It is only ever seen by a new workspace on
 * its first day, which is the worst possible audience for it.
 *
 * WHAT IS FLAGGED, AND WHY IT IS NARROW
 * -------------------------------------
 * Only the intersection of three things:
 *   1. an empty-state SENTENCE ("No X yet", "Nothing here", "There are no X"),
 *   2. inside a branch that is clearly a LIST-EMPTY test (`length === 0` and friends),
 *   3. in a file that already HAS a create affordance — a button reading New/Add/Create/Import/
 *      Upload/Connect/Enable/Invite/Generate.
 *
 * (3) is what keeps this honest. Plenty of empty states have no action and should not have one:
 * "No AI usage logs found" on a telemetry panel, `<CommandEmpty>` inside a combobox, a derived
 * read-only rollup. Flagging those would produce the kind of guard that gets suppressed, and a
 * suppressed guard protects nothing. If a file has no create button, this test says nothing about
 * it.
 *
 * RATCHET, NOT A WALL
 * -------------------
 * 42 files still carry the shape. Failing the build on all of them today would mean either a
 * 42-file commit nobody can review or a disabled test, so the baseline records them and the count
 * may only go DOWN. A new one fails immediately; fixing an old one is a small PR that also edits
 * the baseline downward.
 *
 * To regenerate the baseline after fixing some:
 *
 *     WRITE_EMPTY_STATE_BASELINE=1 npx vitest run tests/unit/emptyStates.test.ts
 *
 * That is deliberately not the path of least resistance. Regenerating is the correct move after
 * you REMOVE offenders and the wrong move in every other case, so it should cost a moment's
 * thought rather than a flag someone reaches for to make a red test green.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, '.github', 'empty-state-baseline.json');

/** "There is nothing in this list" said in prose. */
const EMPTY_TEXT =
  /(No [A-Za-z][A-Za-z ]{2,40}(?:yet|found|match(?:es|ing|ed)?|available|configured|selected|added|created|to show)\b)|(Nothing (?:here|yet|to show|found|attached|scheduled))|(There (?:are|is) no [a-z ]{2,40})/;

/** The branch is a list-emptiness test rather than, say, a tooltip. */
const LIST_EMPTY = /length\s*===\s*0|length\s*<\s*1|!\w+\.length|\.length\s*\?|isEmpty/;

/** Something in the vicinity that the user can actually press. */
const HAS_ACTION = /<Button|<HubEmptyState|onClick=|<Link\b/;

/** A create-shaped affordance anywhere in the file — see (3) in the header. */
const CREATE_LABEL = /(?:New|Add|Create|Import|Upload|Connect|Enable|Invite|Generate)\s+[A-Za-z]/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join('/');

/** Files whose empty branch offers the user nothing, despite the file having a create action. */
export function findOffenders(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of walk(SRC)) {
    // Comments blanked, offsets preserved: a doc comment explaining an empty state must not
    // count as one, and the line numbers still have to point at real lines.
    const src = blankComments(readFileSync(file, 'utf8'));
    if (!src.includes('<Button')) continue;

    const buttons = [...src.matchAll(/<Button[\s\S]{0,400}?<\/Button>/g)].map((m) => m[0]);
    const hasCreate = buttons.some((b) => CREATE_LABEL.test(b.replace(/<[^>]+>/g, ' ')));
    if (!hasCreate) continue;

    const lines = src.split('\n');
    let hits = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!EMPTY_TEXT.test(lines[i])) continue;
      // A window either side: far enough to see the conditional and any nearby button, near
      // enough not to pick up an unrelated control elsewhere in the render.
      //
      // This window is why the check has FALSE NEGATIVES and no false positives, which is the
      // right way round. A create button that happens to sit within six lines of the message —
      // in the card header immediately above it, say — suppresses the finding even though the
      // empty branch itself still offers nothing. Widening the window fixes those and starts
      // convicting files where the only nearby button is a row action or a dialog footer, and a
      // guard that cries wolf gets switched off. Under-reporting is recoverable; being ignored
      // is not.
      const win = lines.slice(Math.max(0, i - 6), Math.min(lines.length, i + 7)).join('\n');
      if (LIST_EMPTY.test(win) && !HAS_ACTION.test(win)) hits++;
    }
    if (hits > 0) out[rel(file)] = hits;
  }
  return out;
}

type Baseline = { total: number; files: Record<string, number> };

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
}

// Escape hatch for the maintainer, not for CI: regenerating has to be an explicit act.
if (process.env.WRITE_EMPTY_STATE_BASELINE === '1') {
  const files = findOffenders();
  const total = Object.values(files).reduce((a, b) => a + b, 0);
  writeFileSync(BASELINE, JSON.stringify({ total, files }, null, 2) + '\n');
}

describe('empty states offer the action that fills them', () => {
  const offenders = findOffenders();

  it('the offer renders at the standard button size, whatever the caller passed', () => {
    // Billing's "Go to quotes" sat at size="sm" (32px, 12px text) on the same project page as a
    // Quotes tab whose hand-rolled empty state used the standard 36px button, so the two read as
    // different sizes of the same thing. A hundred call sites had copied `size="sm"` from the doc
    // example, so the size is set ONCE, in the component's action slot, rather than per caller.
    const src = readFileSync(join(ROOT, 'src/components/core/hub/HubEmptyState.tsx'), 'utf8');
    for (const cls of ['[&_button]:h-9', '[&_button]:text-sm', '[&_a]:h-9']) {
      expect(src, `HubEmptyState no longer normalises its action slot (${cls})`).toContain(cls);
    }
  });

  it('the baseline exists', () => {
    expect(
      existsSync(BASELINE),
      'missing .github/empty-state-baseline.json — regenerate with WRITE_EMPTY_STATE_BASELINE=1',
    ).toBe(true);
  });

  it('no NEW surface renders an actionless empty state', () => {
    const base = readBaseline();
    const added = Object.keys(offenders)
      .filter((f) => !(f in base.files))
      .map((f) => `${f}  (${offenders[f]} site${offenders[f] === 1 ? '' : 's'})`);

    expect(
      added,
      'These files show a "nothing here" message with no way out of it, while the same file ' +
        'already has a create button. Render <HubEmptyState> instead and pass the action:\n\n' +
        '  <HubEmptyState\n' +
        '    icon={Foo}\n' +
        '    title="No widgets yet"\n' +
        '    description="One sentence on what a widget is for."\n' +
        '    action={<Button onClick={openCreate}><Plus /> New widget</Button>}\n' +
        '  />\n\n' +
        'If the list is empty because of FILTERS, use variant="filtered" and offer "Clear ' +
        'filters" — never the create button. Offering "New contact" to somebody with 4,000 ' +
        'contacts and a stage filter set is how duplicates get made.\n\n' +
        added.join('\n'),
    ).toEqual([]);
  });

  it('an existing surface never grows more actionless empty states', () => {
    const base = readBaseline();
    const grown = Object.entries(offenders)
      .filter(([f, n]) => f in base.files && n > base.files[f])
      .map(([f, n]) => `${f}: ${base.files[f]} → ${n}`);

    expect(grown, 'These files added actionless empty states:\n' + grown.join('\n')).toEqual([]);
  });

  it('the baseline is only ever ratcheted down', () => {
    const base = readBaseline();
    const total = Object.values(offenders).reduce((a, b) => a + b, 0);
    expect(
      total,
      `The recorded baseline is ${base.total} sites but the tree now has ${total}. If you FIXED ` +
        'some, lower the numbers in .github/empty-state-baseline.json (or regenerate with ' +
        'WRITE_EMPTY_STATE_BASELINE=1). If it went up, the two tests above will say where.',
    ).toBeLessThanOrEqual(base.total);
  });

  it('baseline entries that are already fixed have been removed from it', () => {
    const base = readBaseline();
    const stale = Object.keys(base.files).filter((f) => !(f in offenders));
    expect(
      stale,
      'These files no longer carry an actionless empty state — drop them from the baseline so it ' +
        'keeps describing reality:\n' + stale.join('\n'),
    ).toEqual([]);
  });
});

describe('HubEmptyState keeps the distinction the guard depends on', () => {
  const src = readFileSync(join(SRC, 'components', 'core', 'hub', 'HubEmptyState.tsx'), 'utf8');

  it('still has both an empty and a filtered variant', () => {
    expect(
      src.includes("'empty' | 'filtered'") || src.includes("variant?: 'empty' | 'filtered'"),
      'The two variants are the whole point: "you have none of these" offers the create action, ' +
        '"your filters excluded all 4,000 of these" offers to clear the filters. Collapsing them ' +
        'into one is how a filtered-empty list ends up inviting the user to make a duplicate.',
    ).toBe(true);
  });
});
