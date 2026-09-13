/**
 * Reading a bank statement, where every mistake is a silent one.
 *
 * A misread date is a valid date. A misread decimal mark is a valid number. Neither raises, and
 * both reach the reconciler as a confident figure — which is why this is a pure function with
 * real cases rather than something checked by eye against one bank's export.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCsv, sniffDelimiter, parseAmount, parseDate, parseStatement, statementRefs,
  type StatementMapping,
} from '../../supabase/functions/_shared/bank-feed/statement-parse';

describe('the file itself', () => {
  it('keeps a quoted field that contains the delimiter', () => {
    // A counterparty called `SMITH, J & SONS` shifts every later column on a naive split.
    const grid = parseCsv('a,b,c\n1,"SMITH, J & SONS",3\n');
    expect(grid[1]).toEqual(['1', 'SMITH, J & SONS', '3']);
  });

  it('unescapes a doubled quote', () => {
    const grid = parseCsv('a\n"THE ""YARD"""\n');
    expect(grid[1]).toEqual(['THE "YARD"']);
  });

  it('keeps a newline inside a quoted field', () => {
    const grid = parseCsv('a,b\n"line one\nline two",2\n');
    expect(grid).toHaveLength(2);
    expect(grid[1][0]).toBe('line one\nline two');
  });

  it('strips a BOM so the first header still matches the mapping', () => {
    const grid = parseCsv('﻿Date,Amount\n01/02/2026,5\n');
    expect(grid[0][0]).toBe('Date');
  });

  it('finds a semicolon-separated export', () => {
    // European bank exports are routinely semicolon-separated.
    expect(sniffDelimiter('Date;Amount;Reference\n')).toBe(';');
    expect(sniffDelimiter('Date,Amount,Reference\n')).toBe(',');
  });
});

describe('an amount is what the bank wrote', () => {
  it('reads both conventions for the same number', () => {
    expect(parseAmount('1.234,56', ',')).toBe(1234.56);
    expect(parseAmount('1,234.56', '.')).toBe(1234.56);
  });

  it('does not mistake a thousands separator for a decimal point', () => {
    // The case that makes guessing per row unsafe: `1.234` is 1234 in one convention and 1.234
    // in the other, and only the mapping knows which.
    expect(parseAmount('1.234', ',')).toBe(1234);
    expect(parseAmount('1,234', '.')).toBe(1234);
  });

  it('handles a currency symbol, spaces and a sign', () => {
    expect(parseAmount('€ 1 500,00', ',')).toBe(1500);
    expect(parseAmount('-42.50', '.')).toBe(-42.5);
  });

  it('reads an accounting negative', () => {
    expect(parseAmount('(250.00)', '.')).toBe(-250);
  });

  it('returns null for a blank, rather than zero', () => {
    // Zero is an amount. Blank is the absence of one, and a balance row must not become a
    // transaction worth nothing.
    expect(parseAmount('', '.')).toBeNull();
    expect(parseAmount('   ', '.')).toBeNull();
  });
});

describe('a date is read in the stated format', () => {
  it('reads day-first and month-first differently', () => {
    // `new Date('03/04/2026')` is March 4th. On a European statement that is silently wrong for
    // eleven days of every month — a valid date, nothing raised.
    expect(parseDate('03/04/2026', 'DD/MM/YYYY')).toBe('2026-04-03');
    expect(parseDate('03/04/2026', 'MM/DD/YYYY')).toBe('2026-03-04');
  });

  it('accepts ISO whatever the stated format', () => {
    expect(parseDate('2026-04-03', 'DD/MM/YYYY')).toBe('2026-04-03');
  });

  it('accepts the common separators', () => {
    expect(parseDate('03.04.2026', 'DD/MM/YYYY')).toBe('2026-04-03');
    expect(parseDate('03-04-2026', 'DD/MM/YYYY')).toBe('2026-04-03');
  });

  it('refuses an impossible date instead of rolling it over', () => {
    expect(parseDate('32/01/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('01/13/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('not a date', 'DD/MM/YYYY')).toBeNull();
  });
});

const SIGNED: StatementMapping = {
  date_column: 'Date', amount_column: 'Amount', reference_column: 'Description',
  counterparty_column: 'Payer', date_format: 'DD/MM/YYYY', decimal_mark: ',',
};

describe('a statement becomes feed rows', () => {
  it('splits a signed amount into a positive figure and a direction', () => {
    const csv = 'Date;Amount;Description;Payer\n'
      + '03/04/2026;1.234,56;INV-2026-0007;ACME LTD\n'
      + '04/04/2026;-99,00;Bank fee;\n';
    const r = parseStatement(csv, SIGNED);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      booked_at: '2026-04-03', amount: 1234.56, direction: 'in',
      reference: 'INV-2026-0007', counterparty_name: 'ACME LTD',
    });
    expect(r.rows[1]).toMatchObject({ amount: 99, direction: 'out', counterparty_name: null });
  });

  it('reads a separate credit and debit pair', () => {
    const m: StatementMapping = {
      date_column: 'Date', credit_column: 'Credit', debit_column: 'Debit',
      date_format: 'DD/MM/YYYY', decimal_mark: '.',
    };
    const csv = 'Date,Credit,Debit\n03/04/2026,500.00,\n04/04/2026,,120.00\n';
    const r = parseStatement(csv, m);
    expect(r.rows.map((x) => [x.amount, x.direction])).toEqual([[500, 'in'], [120, 'out']]);
  });

  it('REPORTS a line it could not read instead of dropping it', () => {
    // A silently skipped row is money missing from the feed with nothing to say so.
    const csv = 'Date;Amount;Description;Payer\nnonsense;5,00;x;y\n03/04/2026;;x;y\n';
    const r = parseStatement(csv, SIGNED);
    expect(r.rows).toHaveLength(0);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0].line).toBe(2);
    expect(r.problems[1].reason).toMatch(/no amount/);
  });
});

describe('re-importing the same statement is a no-op', () => {
  const rows = parseStatement(
    'Date;Amount;Description;Payer\n03/04/2026;10,00;REF;ACME\n04/04/2026;20,00;REF2;ACME\n',
    SIGNED,
  ).rows;

  it('produces the same reference every time', () => {
    expect(statementRefs(rows, 'acct-1')).toEqual(statementRefs(rows, 'acct-1'));
  });

  it('and a different one per account', () => {
    expect(statementRefs(rows, 'acct-1')[0]).not.toBe(statementRefs(rows, 'acct-2')[0]);
  });

  it('the bank\'s own id wins when the export carries one', () => {
    const withId = parseStatement(
      'Date;Amount;Description;Payer;Ref\n03/04/2026;10,00;R;A;TXN-9\n',
      { ...SIGNED, external_id_column: 'Ref' },
    ).rows;
    expect(statementRefs(withId, 'acct-1')[0]).toBe('ext:TXN-9');
  });

  it('two identical transactions on one day stay two transactions', () => {
    // Two genuine EUR 50 cash deposits fingerprint identically. Collapsing them would lose real
    // money from the feed, so the ordinal separates them.
    const twin = parseStatement(
      'Date;Amount;Description;Payer\n03/04/2026;50,00;CASH;\n03/04/2026;50,00;CASH;\n',
      SIGNED,
    ).rows;
    const refs = statementRefs(twin, 'acct-1');
    expect(refs[0]).not.toBe(refs[1]);
    expect(new Set(refs).size).toBe(2);
  });
});
