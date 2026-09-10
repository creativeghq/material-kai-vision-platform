/** An invoice can be attached to a job FROM the invoice (#378 L2). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const MENU = 'src/modules/finance/components/InvoiceActionsMenu.tsx';

describe('#378 L2 — the invoice can name its job', () => {
  it('the action exists on the invoice itself', () => {
    const menu = src(MENU);
    expect(menu).toMatch(/Attach to a job/);
    expect(menu).toMatch(/<OrderLinkPicker/);
  });

  it('it writes project_id, and can clear it', () => {
    const menu = src(MENU);
    const save = menu.slice(menu.indexOf('const saveJob'), menu.indexOf('const saveCat'));
    expect(save).toMatch(/updateInvoice\(invoiceId, \{ project_id: projectId \}/);
    // Detaching has to be possible: an invoice attached to the wrong job is worse than one
    // attached to none, because the wrong job's P&L is then confidently wrong.
    expect(save).toMatch(/jobLink\.kind === 'project' \? jobLink\.projectId : null/);
  });

  it('it opens showing what is already stored', () => {
    // An empty picker over a field that IS set reads as a field that is not set, and the operator
    // then attaches it a second time — to whichever job they happen to pick.
    const menu = src(MENU);
    const open = menu.slice(menu.indexOf('const openJob'), menu.indexOf('const saveJob'));
    expect(open).toMatch(/project_id/);
    expect(open).toMatch(/setJobLink\(projectId \?/);
  });

  it('only the project arm is offered', () => {
    // Each arm the picker offers writes a different column. `OrderLinkPicker`'s own doc says a
    // caller that turns one on MUST handle its `kind` — and this handler only handles 'project'.
    const menu = src(MENU);
    const dialog = menu.slice(menu.indexOf('<OrderLinkPicker'));
    const props = dialog.slice(0, dialog.indexOf('/>'));
    expect(props).toMatch(/allowCustomer=\{false\}/);
    expect(props).toMatch(/allowMerge=\{false\}/);
    expect(props).toMatch(/allowRaiseCustomerOrder=\{false\}/);
    // `allowCostOf`, `allowTrip` and `allowProperty` are off by default and must stay unset here.
    expect(props).not.toMatch(/allowCostOf/);
    expect(props).not.toMatch(/allowTrip/);
  });
});
