import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from '../helpers/stripComments';
import {
  bookAmount,
  bookLines,
  buildBookPrintHtml,
  buildBookXlsx,
} from '../../src/modules/finance/utils/incomeExpenseBookExport';
import type { IncomeExpenseBook } from '../../src/modules/finance/services/incomeExpenseBookService';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel: string) => blankComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const figures = (total: number, net: number, vat: number, cols: Record<string, number>) =>
  ({ total, net, vat, withheld: 0, cols });

const BOOK: IncomeExpenseBook = {
  from: '2026-01-01',
  to: '2026-01-31',
  business: { name: 'MATERIALS BANK ΕΕ', vat: '802349569', tax_office: null },
  income: {
    columns: [{ key: 'c1_1', label: 'Sales of goods', label_el: 'Πωλήσεις εμπορευμάτων' }],
    months: [{
      month: '2026-01-01',
      rows: [{
        mark: '400012999999999', issue_date: '2026-01-31', doc_type: '1.1', number: 'TΠ 6',
        party: 'A & B <script>alert(1)</script>', party_vat: '123456789', classified_by: 'aade_e3',
        ...figures(15357.4, 12385, 2972.4, { c1_1: 12385 }),
      }],
      totals: { ...figures(15357.4, 12385, 2972.4, { c1_1: 12385 }), docs: 1 },
      carried: figures(15357.4, 12385, 2972.4, { c1_1: 12385 }),
      aade_check: { status: 'matches', aade_net: 12385, book_net: 12385, difference: 0 },
    }],
    totals: { ...figures(15357.4, 12385, 2972.4, { c1_1: 12385 }), docs: 1, unclassified_docs: 0 },
  },
  expense: {
    columns: [{ key: 'c2_5', label: 'Expenses, VAT not deductible', label_el: 'Δαπάνες χωρίς δικ. έκπτωσης ΦΠΑ' }],
    months: [{
      month: '2026-01-01',
      rows: [{
        mark: '400012157663149', issue_date: '2026-01-03', doc_type: '1.1', number: 'ΘΠΤΠ 287',
        party: 'OLYMPIC', party_vat: null, classified_by: 'aade_e3',
        ...figures(420.31, 420.31, 0, { c2_5: 420.31 }),
      }],
      totals: { ...figures(420.31, 420.31, 0, { c2_5: 420.31 }), docs: 1 },
      carried: figures(420.31, 420.31, 0, { c2_5: 420.31 }),
      aade_check: { status: 'not_fetched' },
    }],
    totals: { ...figures(999.99, 888.88, 0, { c2_5: 777.77 }), docs: 1, unclassified_docs: 0 },
  },
  sources: {
    issued_documents: { count: 1, fetched_at: '2026-10-20T08:00:00Z' },
    classifications: { count: 2, fetched_at: '2026-10-20T08:00:00Z' },
  },
};

describe('income/expense book exports', () => {
  it('formats amounts the way the accountant prints them', () => {
    expect(bookAmount(12385)).toBe('12.385,00');
    expect(bookAmount(-310)).toBe('-310,00');
    expect(bookAmount(0, true)).toBe('');
    expect(bookAmount(null)).toBe('');
  });

  it('escapes a party name in the printable page', () => {
    const html = buildBookPrintHtml(BOOK, ['income', 'expense']);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('A &amp; B &lt;script&gt;');
  });

  it('writes a real .xlsx: a zip whose sheets escape a party name and hold numbers as numbers', () => {
    const bytes = buildBookXlsx(BOOK, ['income', 'expense']);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(7);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('[Content_Types].xml');
    expect(text).not.toContain('<script>');
    expect(text).toContain('A &amp; B &lt;script&gt;');
    expect(text).toContain('<v>12385</v>');
  });

  it('prints the period total the RPC derived, never a re-sum of the rows', () => {
    const html = buildBookPrintHtml(BOOK, ['expense']);
    expect(html).toContain('999,99');
    expect(html).toContain('777,77');
    const text = new TextDecoder().decode(buildBookXlsx(BOOK, ['expense']));
    expect(text).toContain('<v>888.88</v>');
  });

  it('screen, PDF and Excel walk one line sequence: brought forward only before a month with rows', () => {
    const side = {
      ...BOOK.expense,
      months: [BOOK.expense.months[0], { ...BOOK.expense.months[0], month: '2026-02-01', rows: [] },
        { ...BOOK.expense.months[0], month: '2026-03-01' }],
    };
    expect(bookLines(side).map((l) => l.kind)).toEqual(['doc', 'month', 'month', 'carry', 'doc', 'month', 'grand']);
    expect(code('src/modules/finance/components/IncomeExpenseBook.tsx')).toMatch(/bookLines\(side\)/);
  });

  it('never writes markup into a live document', () => {
    const src = code('src/modules/finance/utils/incomeExpenseBookExport.ts');
    expect(src).not.toMatch(/document\.write/);
    expect(src).toMatch(/URL\.createObjectURL/);
  });
});

describe('where the book figures come from', () => {
  it('the screen reads one RPC and sums nothing itself', () => {
    expect(code('src/modules/finance/services/incomeExpenseBookService.ts')).toContain("'get_income_expense_book'");
    const view = code('src/modules/finance/components/IncomeExpenseBook.tsx');
    expect(view).not.toMatch(/\.reduce\(/);
  });

  it('the refresh stores issued documents and the accountant\'s E3 classifications, window-replaced', () => {
    const fn = code('supabase/functions/finance-mydata-book/index.ts');
    expect(fn).toContain("'RequestE3Info'");
    expect(fn).toContain("'mydata_book_replace_documents'");
    expect(fn).toMatch(/p_e3: e3\.ok \? .* : null/);
  });
});
