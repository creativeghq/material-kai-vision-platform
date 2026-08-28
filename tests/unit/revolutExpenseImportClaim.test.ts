/**
 * An imported expense is CLAIMED before the reimbursable line is created (#359 CM-14), a 200
 * carrying a failure is a failure (#359 CM-23), a numbering save leaves the templates alone
 * (#359 CM-24), and one click is one payout link (#359 CM-20).
 *
 * CM-14 is the shape this codebase keeps meeting: mark-after-the-work rather than claim-before-it.
 * The import read a `seen` set at the start of the run, then created a `trip_expense_items` row,
 * uploaded the receipt, and only THEN wrote the ledger row that marks the expense done. A crash,
 * a timeout or a second overlapping run in that window imports the same Revolut expense again as
 * a SECOND reimbursable line — the employee is paid twice. The unique constraint on
 * `(workspace_id, revolut_expense_id)` was there the whole time; it just was not reached until
 * after the side effects.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const importer = read('supabase/functions/_shared/revolut/expenses-import.ts');
const client = read('src/modules/banking-revolut/services/revolutConfigService.ts');
const invoicing = read('src/modules/payments/components/InvoicingPanel.tsx');
const moneyOut = read('src/modules/banking-revolut/components/MoneyOutCard.tsx');

describe('#359 CM-14 — the claim precedes the work', () => {
  it('the ledger row is inserted before the expense line', () => {
    const claim = importer.indexOf("import_status: 'importing'");
    const item = importer.indexOf("from('trip_expense_items')");
    expect(claim).toBeGreaterThan(-1);
    expect(item).toBeGreaterThan(-1);
    expect(claim < item, 'the reimbursable line is created before the expense is claimed').toBe(true);
  });

  it('losing the race is a skip, not an error', () => {
    // Another run has it, or it is already imported. Reporting that as a failure would train
    // people to ignore the error list.
    expect(importer).toMatch(/if \(!\/duplicate\|unique\/i\.test\(claimErr\.message/);
    expect(importer).toMatch(/continue;/);
  });

  it('the settle is an UPDATE of the claim, not a second insert', () => {
    // A second insert would hit the unique constraint every time — the claim IS the row.
    expect(importer).toMatch(/from\('revolut_expenses'\)\.update\(\{[\s\S]{0,200}import_status: 'imported'/);
  });

  it('a failure releases the claim so the next run can retry', () => {
    // Leaving it claimed means an expense that can never be imported because a marker says it
    // already was — the silent-zero shape, one row at a time.
    expect(importer).toMatch(/\.delete\(\)[\s\S]{0,200}\.is\('item_id', null\)/);
  });

  it('a stuck claim with a line is healed to imported, not retried', () => {
    // The line WAS created and only the settle failed. Retrying would create a second one.
    expect(importer).toMatch(/if \(r\.item_id\) \{[\s\S]{0,250}import_status: 'imported'/);
  });

  it('the pre-read set is described as a hint, and the claim as the decision', () => {
    const raw = readFileSync(join(ROOT, 'supabase/functions/_shared/revolut/expenses-import.ts'), 'utf8');
    expect(raw).toMatch(/HINT, not a claim/);
  });
});

describe('#359 CM-23 — an application failure inside a 200', () => {
  it('the client wrapper throws on ok:false and success:false', () => {
    // `revolut-api` answers 200 with `{ ok: false, error }` when the HTTP call worked and the
    // operation did not. `functions.invoke` reports no error for those, so every caller showed a
    // success toast over a failed sync.
    expect(client).toMatch(/body\.ok === false \|\| body\.success === false/);
    expect(client).toMatch(/throw new Error\(body\.error \|\| /);
  });

  it('it still surfaces the server message on a real non-2xx', () => {
    expect(client).toMatch(/ctx\.json\(\)/);
  });
});

describe('#359 CM-24 — a numbering save leaves the templates alone', () => {
  it('the write names its columns instead of spreading the form state', () => {
    // `...fields` carried the template paths, which `load()` never read — so they sat at their
    // DEFAULTS value of null and saving the numbering wiped the uploaded cover and footer.
    expect(invoicing).toMatch(/invoice_number_prefix: fields\.invoice_number_prefix/);
    expect(invoicing, 'the form state is spread into the write again')
      .not.toMatch(/upsert\(\{ workspace_id: workspaceId, \.\.\.fields \}/);
  });

  it('the template paths are read, so the buttons show the real state', () => {
    expect(invoicing).toMatch(/invoice_template_cover_path, invoice_template_footer_path/);
  });
});

describe('#359 CM-20 — one click is one payout link', () => {
  it('it latches synchronously', () => {
    expect(moneyOut).toMatch(/const creatingLink = React\.useRef\(false\)/);
    expect(moneyOut).toMatch(/if \(creatingLink\.current\) return;/);
    expect(moneyOut).toMatch(/creatingLink\.current = false;/);
  });

  it('it confirms first, like every other money-out path on the screen', () => {
    // A payout link moves money to whoever opens it — no IBAN, no name check on the claim.
    expect(moneyOut).toMatch(/window\.confirm\(/);
    expect(moneyOut).toMatch(/Anyone who opens the link can claim it/);
  });

  it('the confirmation precedes the latch, so declining does not strand the button', () => {
    const fn = moneyOut.slice(moneyOut.indexOf('const makeLink = async'), moneyOut.indexOf('if (!connected)'));
    const confirm = fn.indexOf('window.confirm(');
    const latch = fn.indexOf('creatingLink.current = true');
    expect(confirm).toBeGreaterThan(-1);
    expect(latch).toBeGreaterThan(-1);
    expect(confirm < latch).toBe(true);
  });
});
