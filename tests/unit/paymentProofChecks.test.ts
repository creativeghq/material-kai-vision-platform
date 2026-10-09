import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareProofToOrder, parseProofExtraction, type ProofExtraction, type ProofOrderFacts,
} from '../../supabase/functions/_shared/payments/payment-proof-checks';
import { stripComments } from '../helpers/stripComments';

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const order: ProofOrderFacts = {
  internalNumber: 'INV-2026-0042',
  currency: 'EUR',
  amountDue: 444.91,
  depositAmount: null,
  earliestDate: '2026-10-07',
  latestDate: '2026-10-10',
  businessName: 'Materials Bank EE',
  accounts: [{ id: 'acct-1', iban: 'GR16 0110 1250 0000 0001 2300 695' }],
};

const receipt = (over: Partial<ProofExtraction> = {}): ProofExtraction => ({
  is_bank_transfer_receipt: true,
  transfer_status: 'completed',
  amount: 444.91,
  currency: 'EUR',
  transfer_date: '2026-10-08',
  beneficiary_name: 'MATERIALS BANK EE',
  beneficiary_iban: 'GR1601101250000000012300695',
  payer_name: 'Basilis Kanonidis',
  payer_iban: null,
  reference: 'INV-2026-0042',
  bank_name: 'Piraeus',
  transaction_id: null,
  legibility: 'clear',
  tamper_signals: [],
  ...over,
});

describe('a transfer receipt compared with its order', () => {
  it('matches when amount, currency, our IBAN and an executed transfer all line up', () => {
    const r = compareProofToOrder(receipt(), order, norm);
    expect(r.verdict).toBe('matches');
    expect(r.amount_kind).toBe('full');
    expect(r.bank_account_id).toBe('acct-1');
  });

  it('accepts the deposit as a matching amount', () => {
    const r = compareProofToOrder(receipt({ amount: 133.47 }), { ...order, depositAmount: 133.47 }, norm);
    expect(r.verdict).toBe('matches');
    expect(r.amount_kind).toBe('deposit');
  });

  it.each([
    ['money sent to an IBAN that is not ours', { beneficiary_iban: 'GR0000000000000000000000000' }],
    ['a different amount', { amount: 400 }],
    ['a scheduled, not executed, transfer', { transfer_status: 'scheduled' as const }],
    ['visible signs of editing', { tamper_signals: ['amount font differs'] }],
    ['a date before the order existed', { transfer_date: '2026-09-01' }],
    ['another currency', { currency: 'USD' }],
  ])('needs review for %s', (_label, over) => {
    expect(compareProofToOrder(receipt(over), order, norm).verdict).toBe('review');
  });

  it('a missing reference alone does not block a match, it only warns', () => {
    const r = compareProofToOrder(receipt({ reference: null }), order, norm);
    expect(r.verdict).toBe('matches');
    expect(r.checks.find((c) => c.key === 'reference')?.result).toBe('warn');
  });

  it('separates "not a receipt" and "unreadable" from a mismatch', () => {
    expect(compareProofToOrder(receipt({ is_bank_transfer_receipt: false }), order, norm).verdict).toBe('not_a_receipt');
    expect(compareProofToOrder(receipt({ amount: null }), order, norm).verdict).toBe('unreadable');
    expect(compareProofToOrder(receipt({ legibility: 'unreadable' }), order, norm).verdict).toBe('unreadable');
  });

  it('refuses a model reply that is not the declared shape', () => {
    expect(parseProofExtraction({ amount: 1 })).toBeNull();
    expect(parseProofExtraction('yes, paid')).toBeNull();
    const p = parseProofExtraction({ ...receipt(), beneficiary_iban: 'gr16 0110 1250 0000 0001 2300 695', transfer_date: '08/10/2026' });
    expect(p?.beneficiary_iban).toBe('GR1601101250000000012300695');
    expect(p?.transfer_date).toBeNull();
  });
});

describe('a receipt is evidence, never a payment', () => {
  const root = join(__dirname, '..', '..', 'supabase', 'functions');
  const ai = stripComments(readFileSync(join(root, '_shared', 'payments', 'payment-proof-ai.ts'), 'utf8'));
  const pay = stripComments(readFileSync(join(root, 'finance-pay-invoice', 'index.ts'), 'utf8'));

  it('the AI check books no money', () => {
    expect(ai).not.toMatch(/recordInvoicePayment|payment_allocations|from\('payments'\)/);
  });

  it('the model output is constrained by a schema, and the debit comes before the call', () => {
    expect(ai).toMatch(/output_config:\s*\{\s*format:\s*\{\s*type:\s*'json_schema'/);
    expect(ai.indexOf('debitExternalServiceCredits(')).toBeGreaterThan(-1);
    expect(ai.indexOf('debitExternalServiceCredits(')).toBeLessThan(ai.indexOf('callClaudeMessages('));
  });

  it('confirming a receipt books through recordInvoicePayment keyed on the proof, so a retry replays', () => {
    const confirm = pay.slice(pay.indexOf('async function handleProofAction'));
    expect(confirm).toMatch(/recordInvoicePayment\(supabase, inv\.id, \{[\s\S]{0,120}provider: 'bank_proof',\s*providerRef: proof\.id/);
    expect(confirm.indexOf("from('workspace_members')")).toBeGreaterThan(-1);
    expect(confirm.indexOf("from('workspace_members')")).toBeLessThan(confirm.indexOf('recordInvoicePayment('));
  });
});
