/** Ratcheted, not forbidden: the recorded set may only shrink, so a 26th fails the build. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findModalsThatArePages, scoreSource, modalBodies } from '../../scripts/lib/modalAsPage.mjs';

const ROOT = join(__dirname, '..', '..');
const BASELINE = join(ROOT, '.github', 'modal-as-page-baseline.json');

describe('a modal is not a page', () => {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    total: number;
    files: Record<string, number>;
  };
  const found = findModalsThatArePages(ROOT);

  it('has no modal carrying tabs or a table that the baseline does not already record', () => {
    const added = Object.keys(found).filter((f) => !(f in base.files));
    expect(
      added,
      'Build it as a page — a rail entry or a tab — or move the table out. '
      + 'If it genuinely belongs in a modal, run `npm run modals:audit -- --write --force` and say why.',
    ).toEqual([]);
  });

  it('has no recorded modal that got worse', () => {
    const worse = Object.keys(found)
      .filter((f) => f in base.files && found[f] > base.files[f])
      .map((f) => `${f} (${base.files[f]} -> ${found[f]})`);
    expect(worse).toEqual([]);
  });

  it('keeps the baseline honest — a fixed one is pruned, not left recorded', () => {
    const stale = Object.keys(base.files).filter((f) => !(f in found));
    expect(
      stale,
      'these are no longer offenders: lower the baseline with `npm run modals:audit -- --write`',
    ).toEqual([]);
  });

  it('keeps the two Finance modals that became pages from coming back as dialogs', () => {
    expect(Object.keys(found)).not.toContain('src/modules/finance/components/ExpenseSegmentsDialog.tsx');
    expect(Object.keys(found)).not.toContain('src/modules/finance/components/CategoriseExpensesDialog.tsx');
    expect(base.files).not.toHaveProperty('src/modules/finance/components/ExpenseSegmentsDialog.tsx');
  });
});

describe('the detector reads what it claims to read', () => {
  it('finds a table inside a dialog body and ignores one outside it', () => {
    const inside = '<DialogContent><table><tr/></table></DialogContent>';
    const outside = '<DialogContent>fine</DialogContent><table><tr/></table>';
    expect(scoreSource(inside).tables).toBe(1);
    expect(scoreSource(outside).tables).toBe(0);
  });

  it('finds section navigation inside a dialog body', () => {
    expect(scoreSource('<DialogContent><TabsList/></DialogContent>').tabs).toBe(1);
    expect(scoreSource('<DialogContent><HubTabNav/></DialogContent>').tabs).toBe(1);
  });

  it('reads a sheet the same way a dialog is read', () => {
    expect(scoreSource('<SheetContent><TabsList/></SheetContent>').score).toBeGreaterThanOrEqual(3);
  });

  it('separates several modals in one file', () => {
    expect(modalBodies('<DialogContent>a</DialogContent><DialogContent>b</DialogContent>')).toHaveLength(2);
  });

  it('scores a plain confirm dialog at zero, so the ratchet is about pages and not about modals', () => {
    expect(scoreSource('<DialogContent><p>Delete this?</p></DialogContent>').score).toBe(0);
  });
});
