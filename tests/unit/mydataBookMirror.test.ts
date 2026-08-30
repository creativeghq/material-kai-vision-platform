/**
 * The myDATA book mirror has exactly two ways to break, and both are silent.
 *
 * 1. SOMEONE SIMPLIFIES THE COLLECTOR. `RequestMyIncome` / `RequestMyExpenses` look like
 *    they return the whole book — they are literally the book endpoints — so dropping the
 *    third call reads as a cleanup. It is not: a `<bookInfo>` row is keyed on
 *    `counterVatNumber`, so every counterparty-less family is absent from it. Measured
 *    against this platform's own book for 01/01–30/08/2026, the book feed alone reports
 *    EUR 42,658.42 of income where AADE's page says EUR 54,329.85 — short by 21%, because
 *    two February 11.1 receipts and their 11.4 credit note are invisible to it. Nothing
 *    errors. The short number is a valid number, and it is a valid number in a TAX book.
 *
 * 2. SOMEONE MERGES IT INTO PLATFORM FINANCE. The mirror's entire value is that it was
 *    derived from AADE's data rather than ours, so it can DISAGREE with us. Join it into
 *    `invoices`/`supplier_bills`/`inbound_documents`, or let a platform report read it,
 *    and the disagreement becomes impossible to observe — you would be confirming our
 *    arithmetic against itself and calling it a reconciliation.
 *
 * Neither shows up in a typecheck, an integrity probe, or a lint: the first produces a
 * plausible total, the second produces a suspiciously perfect one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..', '..');
const COLLECTOR = join(root, 'supabase', 'functions', 'finance-mydata-book', 'index.ts');
const collector = readFileSync(COLLECTOR, 'utf8');

describe('myDATA book mirror — the collector reads the WHOLE book', () => {
  it('calls all three endpoints, not just the two book ones', () => {
    for (const endpoint of ['RequestMyIncome', 'RequestMyExpenses', 'RequestTransmittedDocs']) {
      expect(
        collector.includes(endpoint),
        `finance-mydata-book no longer calls ${endpoint}. All three are required: the first two ` +
          'are AADE\'s book but omit every family with no counterparty VAT, and the third is where ' +
          'the 11.x/13.x half is read from. Dropping it under-reports income by ~21% silently.',
      ).toBe(true);
    }
  });

  it('supplements the book feed with the 11.x (income) and 13.x (expense) families', () => {
    expect(
      /family\s*!==\s*'11'\s*&&\s*family\s*!==\s*'13'/.test(collector),
      'The 11.x/13.x supplement is gone from finance-mydata-book. 11.x is the retail we ISSUED ' +
        '(income) and 13.x the retail we self-report (expense); AADE\'s aggregate book counts ' +
        'both and RequestMyIncome/RequestMyExpenses return neither.',
    ).toBe(true);
  });

  /**
   * The doc feeds report credit notes POSITIVE while the book feed signs its own, so the
   * supplement has to negate. Getting the SET wrong is the nasty version: 11.5 is a retail
   * sale "on behalf of third parties" and 13.30 is "as recorded by the entity itself" —
   * both sit next to the credit codes and both are ADDITIONS. Treating either as a credit
   * silently halves any month it appears in.
   */
  it('negates exactly the two credit subtypes, and not their innocent neighbours', () => {
    const set = /CREDIT_SUBTYPES\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(collector)?.[1] ?? '';
    const members = [...set.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(
      members,
      'CREDIT_SUBTYPES must be exactly 11.4 (Retail Sales Credit Note) and 13.31 (retail expense ' +
        'credit). 11.5 and 13.30 are SALES/PURCHASES despite the adjacent codes — negating one ' +
        'halves the month it lands in, and the total stays a perfectly valid number.',
    ).toEqual(['11.4', '13.31']);
  });

  /**
   * AADE answers a rate limit with a body that parses fine and contains zero rows. Counting
   * it is how "we asked too often" becomes "you had no income in March" — the exact silent
   * zero this whole surface exists to make impossible. The status check must therefore come
   * BEFORE the parse, not after it; a check after the fact is not a check.
   */
  it('rejects a 429 before parsing rows out of it', () => {
    const rateLimit = collector.indexOf('res.status === 429');
    const parse = collector.indexOf('pickAllTagBlocks(body, rootTag)');
    expect(rateLimit, 'the 429 guard is gone from finance-mydata-book').toBeGreaterThan(-1);
    expect(parse, 'the row parse is gone from finance-mydata-book').toBeGreaterThan(-1);
    expect(
      rateLimit < parse,
      'A 429 must be returned as a failure BEFORE its body is parsed for rows. Parsed first, a ' +
        'rate limit yields zero rows and stores an empty month as fact.',
    ).toBe(true);
  });

  it('leaves the stored figures untouched when a refresh fails', () => {
    // On the failure path only sync_state is written. The moment mydata_book_months appears
    // in that branch, a failed refresh starts zeroing months that were previously correct.
    const failure = collector.slice(collector.indexOf('if (!result.ok) {'), collector.indexOf('// Write a row for EVERY month'));
    expect(
      failure.includes('mydata_book_months'),
      'The failed-refresh branch now writes mydata_book_months. It must write ONLY ' +
        'mydata_book_sync_state, so the last figures AADE actually gave us stay on screen and ' +
        'merely become stale — a zeroed month is indistinguishable from a real empty one.',
    ).toBe(false);
  });
});

describe('myDATA book mirror — stays unmerged from platform finance', () => {
  /** Every .ts/.tsx under src/ and supabase/functions/, excluding the mirror's own files. */
  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, acc);
      else if (/\.tsx?$/.test(name)) acc.push(full);
    }
    return acc;
  }

  const OWN_FILES = [
    join('supabase', 'functions', 'finance-mydata-book', 'index.ts'),
    join('src', 'modules', 'finance', 'services', 'mydataBookService.ts'),
    join('src', 'modules', 'finance', 'tabs', 'MydataBookTab.tsx'),
  ];

  const others = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'supabase', 'functions'))]
    .filter((f) => !OWN_FILES.some((own) => relative(root, f) === own));

  it('no platform code reads the mirror tables or its RPC', () => {
    const offenders = others.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /mydata_book_months|mydata_book_sync_state|get_mydata_book_aggregate/.test(text);
    }).map((f) => relative(root, f));

    expect(
      offenders,
      'These files reach into the myDATA book mirror:\n  ' + offenders.join('\n  ') +
        '\nThe mirror is AADE\'s answer, kept deliberately separate from ours so the two can be ' +
        'compared. A platform figure that reads it — or falls back to it — can no longer disagree ' +
        'with it, which removes the only thing it is for. Read it beside our numbers, never into them.',
    ).toEqual([]);
  });

  it('the collector never writes a platform finance table', () => {
    for (const table of ['invoices', 'supplier_bills', 'inbound_documents', 'credit_notes', 'order_items']) {
      expect(
        collector.includes(`from('${table}')`),
        `finance-mydata-book touches ${table}. It is a read-only mirror of AADE and must write ` +
          'nothing but mydata_book_months / mydata_book_sync_state.',
      ).toBe(false);
    }
  });
});
