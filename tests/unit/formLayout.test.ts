import { describe, expect, it } from 'vitest';

import { strippedSource, sourceIndex, posix } from '../helpers/sourceIndex';

const INDEX = sourceIndex({ roots: ['src'], filter: (p) => p.endsWith('.tsx') });

const LABEL_TAG = /<Label\b(?:[^>"{]|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*>/g;
const FIELD = /<(?:Label|FormField)\b/g;
const LARGE_FORM = 8;
const PLACEHOLDER_WORD = /placeholder=(?:"(?:optional|required)"|\{[^}]*['"`](?:optional|required)['"`][^}]*\})/i;

const UNSECTIONED: Record<string, { dialogs: number; reason: string }> = {
  'src/components/business/crm/PipelineBoard.tsx': { dialogs: 1, reason: 'another session had it open mid-edit on 2026-10-17' },
  'src/components/business/crm/WarrantiesTab.tsx': { dialogs: 1, reason: 'the asset DETAIL dialog is a record view: tables, each with a short inline add-row' },
  'src/components/features/ai/JobSitesFormModal.tsx': { dialogs: 1, reason: 'two tabs in one dialog, each under 8 fields' },
  'src/components/features/sheets/SheetWizardModal.tsx': { dialogs: 1, reason: 'a step wizard; each step is under 8 fields and is its own titled screen' },
  'src/modules/email-marketing/components/CreateMarketingCampaignModal.tsx': { dialogs: 1, reason: 'three tabs in one dialog, each under 8 fields' },
  'src/modules/finance/components/OrdersPanel.tsx': { dialogs: 1, reason: 'the order DETAIL dialog is a record view with inline toolbar editors, not an entry form' },
};

function largeUnsectionedBlocks(src: string): number {
  let n = 0;
  for (const tag of ['DialogContent', 'SheetContent']) {
    const block = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'g');
    for (const m of src.matchAll(block)) {
      if ((m[0].match(FIELD) ?? []).length >= LARGE_FORM && !m[0].includes('<FormSection')) n += 1;
    }
  }
  return n;
}

describe('form layout', () => {
  it('every footer primitive wraps instead of overflowing', () => {
    for (const f of ['dialog', 'alert-dialog', 'sheet']) {
      const src = strippedSource(`src/components/core/ui/${f}.tsx`);
      const footer = src.match(/Footer = \([\s\S]*?className=\{cn\(\s*'([^']+)'/)?.[1] ?? '';
      expect(footer, f).toContain('sm:flex-wrap');
      expect(footer, f).toContain('gap-2');
      expect(footer, f).not.toMatch(/space-x-/);
    }
  });

  it('a field label is never sized off the type scale (10px / 11px)', () => {
    const bad: string[] = [];
    for (const [file, src] of INDEX.stripped()) {
      for (const m of src.matchAll(LABEL_TAG)) {
        if (/\btext-\[1[01]px\]/.test(m[0])) bad.push(`${posix(file)}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('"Optional" / "Required" is said in the label, never as placeholder text', () => {
    const bad = INDEX.stripped().filter(([, src]) => PLACEHOLDER_WORD.test(src)).map(([file]) => posix(file));
    expect(bad).toEqual([]);
  });

  it('a FormField marks the OPTIONAL fields; it never carries a required asterisk', () => {
    const bad = INDEX.stripped()
      .filter(([, src]) => src.includes("from '@/components/core/ui/form-layout'"))
      .filter(([, src]) => /<FormField\b[^>]*?label=(?:"[^"]*\*"|\{<>[^}]*\*)/.test(src))
      .map(([file]) => posix(file));
    expect(bad).toEqual([]);
  });

  it(`a dialog with ${LARGE_FORM}+ fields groups them into FormSections`, () => {
    const bad: string[] = [];
    for (const [file, src] of INDEX.stripped()) {
      const n = largeUnsectionedBlocks(src);
      const allowed = UNSECTIONED[posix(file)]?.dialogs ?? 0;
      if (n > allowed) bad.push(`${posix(file)}: ${n} unsectioned (allowed ${allowed})`);
    }
    expect(bad).toEqual([]);
  });

  it('the unsectioned allowlist only shrinks — a count that fell is lowered, a cleared entry removed', () => {
    const stale = Object.entries(UNSECTIONED)
      .filter(([p, { dialogs }]) => largeUnsectionedBlocks(strippedSource(p)) < dialogs)
      .map(([p]) => p);
    expect(stale).toEqual([]);
  });
});
