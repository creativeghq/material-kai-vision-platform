import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildExpenseEnvelope, expenseEnvelopeProblems, parseSendResponse,
  type ExpenseEnvelopeInput,
} from '../../supabase/functions/_shared/fiscal/mydata-expense-envelope';

const rent = (over: Partial<ExpenseEnvelopeInput> = {}): ExpenseEnvelopeInput => ({
  invoiceType: '16.1',
  series: 'A',
  aa: '1',
  issueDate: '2026-09-30',
  issuer: { vatNumber: '051047336', country: 'GR', branch: 0, name: 'Landlord' },
  counterpart: { vatNumber: '802349569', country: 'GR', branch: 0 },
  lines: [{
    lineNumber: 1, netValue: 250, vatCategory: 7, vatAmount: 0,
    vatExemptionCategory: 16, classificationCategory: 'category2_5',
  }],
  ...over,
});

describe('the myDATA expense envelope', () => {
  it('puts the elements in the order the schema demands', () => {
    const xml = buildExpenseEnvelope(rent());
    const order = ['<issuer>', '<counterpart>', '<invoiceHeader>', '<invoiceDetails>', '<invoiceSummary>'];
    const at = order.map((t) => xml.indexOf(t));
    expect(at.every((i) => i > -1), `missing one of ${order.join(' ')}`).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('and the header in ITS order', () => {
    const xml = buildExpenseEnvelope(rent());
    const order = ['<series>', '<aa>', '<issueDate>', '<invoiceType>', '<currency>'];
    const at = order.map((t) => xml.indexOf(t));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('omits the counterpart for an entity entry, which has none', () => {
    const xml = buildExpenseEnvelope(rent({ invoiceType: '17.1', counterpart: undefined }));
    expect(xml).not.toContain('<counterpart>');
    expect(xml).toContain('<invoiceType>17.1</invoiceType>');
  });

  it('never sends a uid, mark or authentication code — AADE assigns those', () => {
    const xml = buildExpenseEnvelope(rent());
    for (const tag of ['<uid>', '<mark>', '<authenticationCode>']) {
      expect(xml, `${tag} must not be sent`).not.toContain(tag);
    }
  });

  it('escapes a party name rather than breaking the document with it', () => {
    const xml = buildExpenseEnvelope(rent({
      issuer: { vatNumber: '1', country: 'GR', branch: 0, name: 'A & B <Ltd>' },
    }));
    expect(xml).toContain('A &amp; B &lt;Ltd&gt;');
    expect(xml).not.toContain('<Ltd>');
  });

  it('states money to two decimals, never a float', () => {
    const xml = buildExpenseEnvelope(rent({
      lines: [{ lineNumber: 1, netValue: 0.1 + 0.2, vatCategory: 7, vatAmount: 0, vatExemptionCategory: 16, classificationCategory: 'c' }],
    }));
    expect(xml).toContain('<netValue>0.30</netValue>');
    expect(xml).not.toMatch(/0\.30000000000000004/);
  });

  it('totals the summary classification from the LINES', () => {
    const xml = buildExpenseEnvelope(rent({
      lines: [
        { lineNumber: 1, netValue: 100, vatCategory: 1, vatAmount: 24, classificationCategory: 'category2_5' },
        { lineNumber: 2, netValue: 50, vatCategory: 1, vatAmount: 12, classificationCategory: 'category2_5' },
      ],
    }));
    const summary = xml.slice(xml.indexOf('<invoiceSummary>'));
    expect(summary).toContain('<ecls:amount>150.00</ecls:amount>');
    expect(summary).toContain('<totalNetValue>150.00</totalNetValue>');
    expect(summary).toContain('<totalVatAmount>36.00</totalVatAmount>');
    expect(summary).toContain('<totalGrossValue>186.00</totalGrossValue>');
  });

  it('keeps two different categories apart in the summary', () => {
    const xml = buildExpenseEnvelope(rent({
      lines: [
        { lineNumber: 1, netValue: 100, vatCategory: 1, vatAmount: 24, classificationCategory: 'category2_5' },
        { lineNumber: 2, netValue: 40, vatCategory: 1, vatAmount: 9.6, classificationCategory: 'category2_6' },
      ],
    }));
    const summary = xml.slice(xml.indexOf('<invoiceSummary>'));
    expect(summary).toContain('category2_5');
    expect(summary).toContain('category2_6');
    expect(summary).toContain('<ecls:amount>100.00</ecls:amount>');
    expect(summary).toContain('<ecls:amount>40.00</ecls:amount>');
  });
});

describe('what is refused before the call rather than by AADE', () => {
  it('a 0% line with no exemption article', () => {
    const problems = expenseEnvelopeProblems(rent({
      lines: [{ lineNumber: 1, netValue: 250, vatCategory: 7, vatAmount: 0, classificationCategory: 'c' }],
    }));
    expect(problems.join(' ')).toMatch(/exemption article/);
  });

  it('a line with no expense classification', () => {
    const problems = expenseEnvelopeProblems(rent({
      lines: [{ lineNumber: 1, netValue: 250, vatCategory: 1, vatAmount: 60, classificationCategory: '' }],
    }));
    expect(problems.join(' ')).toMatch(/classification/);
  });

  it('a sales document type, which a provider must carry instead', () => {
    expect(expenseEnvelopeProblems(rent({ invoiceType: '1.1' })).join(' ')).toMatch(/not an expense-side/);
  });

  it('and a well-formed rent document is not refused', () => {
    expect(expenseEnvelopeProblems(rent())).toEqual([]);
  });
});

describe('reading what AADE answered', () => {
  it('a MARK is a filing', () => {
    const out = parseSendResponse(200, '<response><index>1</index><statusCode>Success</statusCode><invoiceUid>ABC</invoiceUid><invoiceMark>400001234567890</invoiceMark><mark>400001234567890</mark></response>');
    expect(out.ok).toBe(true);
    expect(out.mark).toBe('400001234567890');
    expect(out.errors).toEqual([]);
  });

  it('a 200 with NO mark is a refusal, not a filing', () => {
    const out = parseSendResponse(200, '<response><statusCode>ValidationError</statusCode><errors><error><code>214</code><message>Invalid vat category</message></error></errors></response>');
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/214: Invalid vat category/);
  });

  it('and an empty body is a refusal with a stated reason', () => {
    const out = parseSendResponse(500, '');
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/500/);
  });
});

describe('the write-back after a filing', () => {
  const SEND = readFileSync(
    join(__dirname, '..', '..', 'supabase/functions/finance-mydata-send/index.ts'), 'utf8',
  );
  const RECORD = readFileSync(
    join(__dirname, '..', '..', 'src/modules/finance/services/inboundService.ts'), 'utf8',
  );

  it('never writes a GENERATED column, which Postgres refuses outright', () => {
    const update = SEND.slice(SEND.indexOf("from('inbound_documents').update("), SEND.indexOf('if (!outcome.ok)'));
    const at = update.indexOf('source_ref:');
    expect(at, 'the MARK is no longer written through source_ref').toBeGreaterThan(-1);
    const topLevel = update.slice(0, at) + update.slice(update.indexOf('},', at) + 2);
    for (const col of ['mark', 'uid', 'authentication_code']) {
      expect(topLevel, `${col} is a generated column`)
        .not.toMatch(new RegExp(`(^|[^_.a-zA-Z])${col}\\s*:`, 'm'));
    }
  });

  it('records the attempt whether AADE accepted it or refused it', () => {
    const update = SEND.slice(SEND.indexOf("from('inbound_documents').update("), SEND.indexOf('if (!outcome.ok)'));
    expect(update).toMatch(/transmit_attempted_at:/);
    expect(update).toMatch(/transmit_error:/);
  });

  it('and the recorder writes recorded_by, not a created_by this table has never had', () => {
    const insert = RECORD.slice(RECORD.indexOf('recordExpenseDocument'));
    expect(insert.slice(0, 2000)).toMatch(/recorded_by:/);
    expect(insert.slice(0, 2000), 'inbound_documents has no created_by').not.toMatch(/created_by:/);
  });
});
