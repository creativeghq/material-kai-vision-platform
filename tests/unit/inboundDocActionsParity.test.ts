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
 * every other action works, and the one thing standing between a value-only document and the
 * whole downstream chain (warehouse receive, product extraction, catalog, the markup ladder) is
 * unreachable from that screen.
 *
 * That is exactly what happened. Finance → Expenses passed it; the CRM company card never did;
 * and when the Expenses-by-Supplier modal was built by extracting the CRM card's table, it
 * inherited the gap. Two thirds of this workspace's received documents (1,161 of 1,769) carry
 * value-only lines, so on those two surfaces the majority of documents could never be completed.
 * Found by a person opening the modal and asking where the option had gone.
 *
 * `onOpenPayments` is the same shape one notch quieter: the entry renders but sits permanently
 * disabled, so the balance behind the bronze Gross column — a settled document still shows its
 * whole amount there — was unreachable from every surface that forgot it.
 *
 * WHAT IS ENFORCED
 * ----------------
 * Every `<InboundDocActionsMenu …>` in `src/` passes every handler that gates an entry. This is a
 * source-text check on purpose: the props are optional in TypeScript (they must be — the menu is
 * built to degrade), so the type system cannot see the omission, and a render test would need
 * every host wired up to prove a NEGATIVE about a dropdown that is closed.
 *
 * If a new surface genuinely cannot host one of these dialogs, the honest fix is to give it the
 * dialog, not to drop the prop. There is deliberately no exemption list: the last two times this
 * shape appeared the "surface cannot host a dialog" comment was true when written and false six
 * months later, and nothing went back to check.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const MENU = join(SRC, 'modules', 'finance', 'components', 'InboundDocActionsMenu.tsx');

/**
 * Handlers whose ABSENCE removes or disables an entry. Kept here rather than derived, so adding a
 * gated entry to the menu is a deliberate two-line change: the entry, and this list.
 */
const GATING_PROPS = ['onAddLineDetail', 'onOpenPayments', 'onCreateOrder'] as const;

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

/** Each `<InboundDocActionsMenu … />` element body, per file. */
function callSites(): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  for (const file of walk(SRC)) {
    if (file === MENU) continue;
    const src = blankComments(readFileSync(file, 'utf8'));
    let from = 0;
    for (;;) {
      const at = src.indexOf('<InboundDocActionsMenu', from);
      if (at === -1) break;
      // Props run to the element's self-closing `/>`; every use of this menu is self-closing.
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
    // If this stops being true the test above is measuring nothing, so it is asserted rather
    // than assumed — a guard that silently stops guarding is worse than no guard.
    const menu = blankComments(readFileSync(MENU, 'utf8'));
    expect(menu).toMatch(/!!onAddLineDetail/);
    expect(menu).toMatch(/disabled=\{!onOpenPayments/);
  });

  it('every surface rendering the menu is a call site we found', () => {
    const sites = callSites();
    // Two today: the Expenses inbox table and the shared supplier document table (which the CRM
    // company card and the Expenses-by-Supplier modal both render).
    expect(sites.length).toBeGreaterThanOrEqual(2);
  });

  it.each(GATING_PROPS)('every call site passes %s', (prop) => {
    const missing = callSites()
      .filter((s) => !s.body.includes(`${prop}=`))
      .map((s) => s.file);
    expect(
      missing,
      `${prop} gates a menu entry. Omitting it does not disable the entry — it deletes it, `
      + `silently, on these surfaces:\n  ${missing.join('\n  ')}\n`
      + 'Pass the handler and host the dialog it opens.',
    ).toEqual([]);
  });
});
