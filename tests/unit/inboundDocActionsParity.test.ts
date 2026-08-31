/**
 * A received document offers the SAME actions wherever it is shown.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `InboundDocActionsMenu` gates several of its entries on the HANDLER being supplied:
 *
 *     const canAddDetail = needsDetail && … && !!onAddLineDetail && …;
 *     {canAddDetail && <DropdownMenuItem onClick={onAddLineDetail}>Add line detail</…>}
 *
 * So a surface that renders the menu without passing `onAddLineDetail` does not get a disabled
 * entry, or an error, or a type failure — the entry is simply NOT THERE. The menu looks complete,
 * every other action works, and nothing anywhere reports it.
 *
 * That is what happened. Two tables render inbound documents — the Expenses inbox and the shared
 * supplier document table (CRM company card + the Expenses-by-Supplier modal) — and each spelled
 * the menu's props out for itself. One passed `onAddLineDetail`, the other never had, so "say what
 * was actually on this document" was unreachable from two of the three surfaces. Two thirds of
 * this workspace's received documents (1,161 of 1,769) carry value-only lines, and until one is
 * completed, warehouse receive, product extraction, the catalog and the markup ladder all skip it.
 * Found by a person opening the modal and asking where the option had gone.
 *
 * WHAT IS ENFORCED, AND WHY IT CHANGED SHAPE
 * ------------------------------------------
 * The first version of this test checked that EVERY call site passed every gating prop. That was
 * the right check while there were two call sites. The fix went further and deleted the second
 * one: `useInboundDocActions` now owns the state, the wiring and the dialogs, and each table
 * renders `actions.renderActions(doc)` plus `actions.dialogs`. So the invariant is stronger and
 * simpler — the menu is CONSTRUCTED IN ONE PLACE, and that place passes everything.
 *
 * Both halves are asserted, because either one alone is defeatable: "one call site" without the
 * prop check permits the single site to drop a handler, and the prop check without "one call site"
 * permits a new table to hand-roll its own menu again.
 *
 * Source-text on purpose. The props are optional in TypeScript and must stay that way — the menu
 * is built to degrade — so the type system cannot see the omission, and a render test would need
 * every host wired up to prove a NEGATIVE about a dropdown that is closed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const FINANCE = join(SRC, 'modules', 'finance', 'components');
const MENU = join(FINANCE, 'InboundDocActionsMenu.tsx');
/** The one place allowed to construct the menu. */
const HOOK = join(FINANCE, 'useInboundDocActions.tsx');

/**
 * Handlers whose ABSENCE removes or disables an entry. Listed rather than derived, so adding a
 * gated entry to the menu is a deliberate two-line change: the entry, and this list.
 */
const GATING_PROPS = ['onAddLineDetail', 'onOpenPayments', 'onCreateOrder', 'onReceiveStock'] as const;

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

/** Every `<InboundDocActionsMenu … />` element in `src/`, outside the menu's own file. */
function callSites(): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  for (const file of walk(SRC)) {
    if (file === MENU) continue;
    const src = blankComments(readFileSync(file, 'utf8'));
    let from = 0;
    for (;;) {
      const at = src.indexOf('<InboundDocActionsMenu', from);
      if (at === -1) break;
      const end = src.indexOf('/>', at);
      if (end === -1) break;
      out.push({ file: rel(file), body: src.slice(at, end) });
      from = end + 2;
    }
  }
  return out;
}

describe('a received document offers the same actions wherever it is shown', () => {
  it('the menu still gates entries on the handler being passed', () => {
    // If this stops being true the rest of the file is measuring nothing, so it is asserted
    // rather than assumed — a guard that silently stops guarding is worse than no guard.
    const menu = blankComments(readFileSync(MENU, 'utf8'));
    expect(menu).toMatch(/!!onAddLineDetail/);
    expect(menu).toMatch(/disabled=\{!onOpenPayments/);
  });

  it('the menu is constructed in exactly one place', () => {
    const files = [...new Set(callSites().map((s) => s.file))];
    expect(
      files,
      'Every surface must go through useInboundDocActions().renderActions(doc). A table that '
      + 'builds the menu itself has to restate every handler, and the ones it forgets do not '
      + 'render disabled — they vanish. That is the bug this whole file exists for.',
    ).toEqual([rel(HOOK)]);
  });

  it.each(GATING_PROPS)('the one construction site passes %s', (prop) => {
    const missing = callSites()
      .filter((s) => !s.body.includes(`${prop}=`))
      .map((s) => s.file);
    expect(
      missing,
      `${prop} gates a menu entry. Omitting it does not disable the entry — it deletes it, `
      + `silently, on every surface at once now that there is one wiring site:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('both tables render the shared actions and the shared dialogs', () => {
    // The hook is only worth anything if the tables actually use it — an unused hook and a
    // hand-rolled menu look identical from the hook's side.
    for (const f of [
      join(FINANCE, 'SupplierInboundDocs.tsx'),
      join(SRC, 'modules', 'finance', 'pages', 'DocumentsPage.tsx'),
    ]) {
      const src = blankComments(readFileSync(f, 'utf8'));
      expect(src, `${rel(f)} should call useInboundDocActions`).toMatch(/useInboundDocActions\(/);
      expect(src, `${rel(f)} should render the shared row actions`).toMatch(/renderActions\(/);
      expect(src, `${rel(f)} should mount the shared dialogs`).toMatch(/\.dialogs\}/);
    }
  });
});
