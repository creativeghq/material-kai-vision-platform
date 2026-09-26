import { describe, it, expect } from 'vitest';
import { blankedSource } from '../helpers/sourceIndex';
import {
  EXPENSE_CATEGORY_CHART,
  EXPENSE_CATEGORY_KEYS,
  expenseCategoryByKey,
  expenseCategoryByName,
  fiscalCategoryForDocType,
  issuerKeyOf,
  CATEGORY_CONFIDENCE_FLOOR,
} from '../../src/modules/finance/expenseCategoryVocabulary';

const EDGE = 'supabase/functions/finance-categorize-expenses/index.ts';
const DIALOG = 'src/modules/finance/components/CategoriseExpensesDialog.tsx';
const src = (p: string) => blankedSource(p);

describe('the expense chart is a closed set', () => {
  it('has unique keys and unique names', () => {
    expect(new Set(EXPENSE_CATEGORY_KEYS).size).toBe(EXPENSE_CATEGORY_CHART.length);
    const names = EXPENSE_CATEGORY_CHART.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(EXPENSE_CATEGORY_CHART.length);
  });

  it('gives every entry a hint, because the hint is what the classifier decides on', () => {
    for (const c of EXPENSE_CATEGORY_CHART) {
      expect(c.hint.length, `${c.key} has no hint`).toBeGreaterThan(20);
    }
  });

  it('resolves a key and a name, and refuses anything else', () => {
    expect(expenseCategoryByKey('rent')?.name).toBe('Rent');
    expect(expenseCategoryByName('  RENT ')?.key).toBe('rent');
    expect(expenseCategoryByKey('transporation')).toBeNull();
    expect(expenseCategoryByKey('')).toBeNull();
    expect(expenseCategoryByName(null)).toBeNull();
  });

  it('keeps an Other bucket but does not make it the obvious landing place', () => {
    expect(expenseCategoryByKey('other_expense')).not.toBeNull();
    expect(EXPENSE_CATEGORY_CHART[EXPENSE_CATEGORY_CHART.length - 1].key).toBe('other_expense');
  });
});

describe('the fiscal code decides what the fiscal code decides, and nothing more', () => {
  it('files a 17.1 self-billed entry as payroll without asking a model', () => {
    expect(fiscalCategoryForDocType('17.1')).toBe('salaries_wages');
  });

  it('leaves every other self-billed type undecided — one issuer files 17.1 AND 17.5, and '
    + 'reading the second as payroll because the first is misfiles the larger half', () => {
    for (const t of ['17.2', '17.3', '17.4', '17.5', '17.6', '1.1', '2.1', '14.1']) {
      expect(fiscalCategoryForDocType(t), `${t} must not be auto-filed`).toBeNull();
    }
    expect(fiscalCategoryForDocType(null)).toBeNull();
  });
});

describe('the issuer key is one identity', () => {
  it('prefers the VAT number and normalises it', () => {
    expect(issuerKeyOf(' el 123456789 ', 'Whoever')).toBe('vat:EL123456789');
  });

  it('falls back to a collapsed lowercase name', () => {
    expect(issuerKeyOf('', '  KEROS   HELLAS  ΕΠΕ ')).toBe('name:keros hellas επε');
    expect(issuerKeyOf(null, null)).toBeNull();
  });

  it('gives one key for two spellings of the same name', () => {
    expect(issuerKeyOf(null, 'ACME  EE')).toBe(issuerKeyOf(null, 'acme ee'));
  });
});

describe('proposing is not applying', () => {
  const edge = src(EDGE);

  it('the suggest path writes nothing', () => {
    const suggest = edge.slice(edge.indexOf("action !== 'suggest'"));
    expect(suggest).not.toMatch(/apply_issuer_category_rules/);
    expect(suggest).not.toMatch(/\.from\(['"]inbound_documents['"]\)[\s\S]{0,200}\.update\(/);
  });

  it('narrows every rule onto the chart BEFORE the database write', () => {
    const guard = edge.indexOf('expenseCategoryByKey(String(r.category_key');
    const write = edge.indexOf("rpc('apply_issuer_category_rules'");
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(guard, 'a check after the side effect is not a check').toBeLessThan(write);
    expect(edge).toMatch(/Unknown category_key/);
  });

  it('reads tenant data through the caller, so the RPC guards are the enforcement', () => {
    expect(edge).toMatch(/auth\.supabaseAsUser/);
    const rpcCalls = edge.match(/(\w+)\.rpc\(/g) ?? [];
    expect(rpcCalls.length, 'else the loop below passes vacuously').toBeGreaterThanOrEqual(2);
    for (const call of rpcCalls) {
      expect(call, 'a tenant RPC must not run on the service-role client').toMatch(/asUser\.rpc\(/);
    }
  });

  it('constrains the model output by schema rather than parsing prose', () => {
    expect(edge).toMatch(/generateStructuredWithClaude/);
    expect(edge).toMatch(/z\.enum\(EXPENSE_CATEGORY_KEYS/);
    expect(edge).not.toMatch(/JSON\.parse/);
  });

  it('loads its prompt from the database with no fallback string', () => {
    expect(edge).toMatch(/loadPrompt\(admin, 'tool', 'expense_categorization'\)/);
    expect(edge).not.toMatch(/systemPrompt\s*[:=]\s*`/);
  });

  it('debits before the upstream call and refunds when it fails', () => {
    const reserve = edge.indexOf('reserveCredits(');
    const model = edge.indexOf('generateStructuredWithClaude(');
    expect(reserve).toBeGreaterThan(-1);
    expect(reserve).toBeLessThan(model);
    expect(edge).toMatch(/refundCredits\(/);
  });
});

describe('a supplier nobody could read stays undecided', () => {
  const edge = src(EDGE);
  const dialog = src(DIALOG);

  it('the edge reports the unverdicted rather than defaulting them', () => {
    expect(edge).toMatch(/unresolved\.push\(/);
    expect(edge, 'the gap must not be filled with the Other bucket').not.toMatch(/other_expense/);
  });

  it('the review screen shows them', () => {
    expect(dialog).toMatch(/data\.unresolved\.length > 0/);
  });

  it('a low-confidence proposal starts unchecked, so it cannot be applied by pressing Apply', () => {
    expect(dialog).toMatch(/on:\s*!p\.low_confidence/);
  });

  it('a hand-changed category is recorded as the reviewer’s decision, not the model’s', () => {
    expect(dialog).toMatch(/decided_by:\s*st\.edited \?\s*'manual'/);
  });

  it('shows the rules already in force, so a wrong one can be corrected', () => {
    expect(dialog).toMatch(/data\.decided/);
    expect(dialog, 'a decided row must be renderable and editable').toMatch(/inForce/);
  });

  it('cannot apply a row whose category is not on the chart', () => {
    expect(dialog).toMatch(/state\[r\.key\]\?\.on && state\[r\.key\]\?\.categoryKey/);
  });

  it('draws its options from the chart and never a local list', () => {
    expect(dialog).toMatch(/EXPENSE_CATEGORY_CHART\.map/);
    const literalOptions = dialog.match(/<SelectItem[^>]*value="(?!\{)[^"]+"/g) ?? [];
    expect(literalOptions).toEqual([]);
  });
});

describe('the seed importer and the classifier share one expense chart', () => {
  it('derives the seed from the chart instead of restating it (read, not executed: the '
    + 'service imports the Supabase client)', () => {
    const svc = src('src/modules/finance/services/financeCategoriesService.ts');
    expect(svc).toMatch(/\.\.\.EXPENSE_CATEGORY_CHART\.map\(/);
    const literalExpense = svc.match(/kind:\s*'expense'\s*\}/g) ?? [];
    expect(literalExpense, 'a hand-written expense category has reappeared').toEqual([]);
  });
});

describe('the confidence floor is a real threshold', () => {
  it('sits where a proposal stops being a recommendation', () => {
    expect(CATEGORY_CONFIDENCE_FLOOR).toBeGreaterThan(0);
    expect(CATEGORY_CONFIDENCE_FLOOR).toBeLessThan(1);
  });
});
