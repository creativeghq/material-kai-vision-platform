import { describe, expect, it } from 'vitest';

import { readSource, sourceIndex, posix } from '../helpers/sourceIndex';

const INDEX = sourceIndex({ roots: ['src'], filter: (p) => p.endsWith('.tsx') });

const LABEL_TAG = /<Label\b(?:[^>"{]|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*>/g;
const FIELD = /<(?:Label|FormField)\b/g;
const LARGE_FORM = 8;

const UNSECTIONED: Record<string, string> = {
  'src/components/business/crm/PipelineBoard.tsx': 'another session had it open mid-edit on 2026-10-17',
  'src/components/business/crm/WarrantiesTab.tsx': 'the asset DETAIL dialog is a record view: tables, each with a short inline add-row',
  'src/components/features/ai/JobSitesFormModal.tsx': 'two tabs in one dialog, each under 8 fields',
  'src/components/features/sheets/SheetWizardModal.tsx': 'a step wizard; each step is under 8 fields and is its own titled screen',
  'src/modules/email-marketing/components/CreateMarketingCampaignModal.tsx': 'three tabs in one dialog, each under 8 fields',
  'src/modules/finance/components/OrdersPanel.tsx': 'the order DETAIL dialog is a record view with inline toolbar editors, not an entry form',
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
      const src = readSource(`src/components/core/ui/${f}.tsx`);
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
    const bad = INDEX.stripped()
      .filter(([, src]) => /placeholder=(?:"(?:optional|required)"|\{['"`](?:optional|required)['"`]\})/i.test(src))
      .map(([file]) => posix(file));
    expect(bad).toEqual([]);
  });

  it(`a dialog with ${LARGE_FORM}+ fields groups them into FormSections`, () => {
    const bad = INDEX.stripped()
      .filter(([file, src]) => !(posix(file) in UNSECTIONED) && largeUnsectionedBlocks(src) > 0)
      .map(([file]) => posix(file));
    expect(bad).toEqual([]);
  });

  it('the unsectioned allowlist only shrinks — an entry that now complies is removed', () => {
    const stale = Object.keys(UNSECTIONED).filter((p) => largeUnsectionedBlocks(readSource(p)) === 0);
    expect(stale).toEqual([]);
  });
});
