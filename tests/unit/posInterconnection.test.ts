/**
 * POS interconnection, and the declaration that falls on the ERP builder (#448).
 *
 * The expensive readings here are the ones that sound safe: "we are mostly wholesale, so we owe
 * nothing" (Ε.2044 says one terminal doing mixed trade must be interconnected), and "this is our
 * own system, not a product" (Α.1054 attaches to whoever BUILDS and supports it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  INTERCONNECTION_LABEL, TERMINAL_VERDICT_LABEL, ROUTE_LABEL, DECLARATION_LABEL,
  SIGNATURE_VERDICT_LABEL, MATCHING_WINDOW_HOURS, AUTONOMY_RULE, BRANCH_IS_IDENTITY,
  EFTPOS_PREPAYMENT_CODE, EFTPOS_RECEIPT_TYPE,
  interconnectionNeedsAttention, interconnectionIsBreach, declarationNeedsAttention,
  signatureQueueNeedsAttention, needsUnderIssuanceFlag, paymentIsBlocked, wholesaleReceiptMissing,
  type InterconnectionPosition, type DeclarationPosition, type SignatureQueue,
  type SignatureRow, type PaymentGate, type WholesaleCardPosition,
  type InterconnectionStatus, type SignatureVerdict,
} from '@/modules/finance/posInterconnectionRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/posInterconnectionService.ts');
const posCard = read('src/modules/finance/components/PosInterconnectionCard.tsx');
const erpCard = read('src/modules/finance/components/ErpDeclarationCard.tsx');
const queueCard = read('src/modules/finance/components/PosSignatureQueueCard.tsx');
const notice = read('src/modules/finance/components/WholesaleCardNotice.tsx');
const settings = read('src/modules/finance/tabs/SettingsTab.tsx');
const posPage = read('src/modules/finance/pages/PosPage.tsx');
const invoicePage = read('src/pages/Admin/InvoiceDetailPage.tsx');
const novus = read('supabase/functions/_shared/fiscal/novus.ts');
const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
const issue = read('supabase/functions/finance-issue-invoice/index.ts');

const position = (over: Partial<InterconnectionPosition>): InterconnectionPosition => ({
  status: 'required', reason: '', terminals: 1, retail_terminals: 1, mixed_terminals: 1,
  not_interconnected: 0, legal_basis: '', penalty: '', rows: [], ...over,
});

const sig = (over: Partial<SignatureRow>): SignatureRow => ({
  id: 's', invoice_id: 'i', terminal_id: 'TID001', amount: 124, is_deferred: false,
  window_hours: 60, hours_remaining: 40, verdict: 'awaiting', must_flag_under_issuance: true, ...over,
});

describe('only "no duty" is a clean answer', () => {
  it('an unlisted terminal fleet is an unanswered question, not a pass', () => {
    expect(interconnectionNeedsAttention(position({ status: 'unknown' }))).toBe(true);
    expect(interconnectionNeedsAttention(position({ status: 'required' }))).toBe(true);
    expect(interconnectionNeedsAttention(position({ status: 'breach' }))).toBe(true);
    expect(interconnectionNeedsAttention(position({ status: 'not_required' }))).toBe(false);
    expect(interconnectionIsBreach(position({ status: 'breach' }))).toBe(true);
    expect(interconnectionIsBreach(position({ status: 'required' }))).toBe(false);
    const statuses: InterconnectionStatus[] = ['unknown', 'not_required', 'required', 'breach'];
    for (const s of statuses) expect(INTERCONNECTION_LABEL[s]).toBeTruthy();
    for (const v of ['interconnected', 'must_interconnect', 'out_of_scope'] as const) {
      expect(TERMINAL_VERDICT_LABEL[v]).toBeTruthy();
    }
  });

  it('the two routes are different mechanics and both are named', () => {
    expect(ROUTE_LABEL.a1098).toMatch(/ΦΗΜ/);
    expect(ROUTE_LABEL.a1155).toMatch(/ERP/);
  });

  it('the verdict is derived in SQL, not assembled in the card', () => {
    expect(service).toContain('pos_interconnection_position');
    expect(posCard).not.toMatch(/handles_retail\s*&&\s*!.*is_interconnected/);
  });

  it('the establishment code is stated as part of the document identity', () => {
    expect(BRANCH_IS_IDENTITY).toMatch(/ISO-8859-7/);
    expect(posCard).toContain('BRANCH_IS_IDENTITY');
  });
});

describe('the compatibility declaration is a filing, not a feature', () => {
  it('anything short of filed needs attention, including having declared nothing', () => {
    const d = (over: Partial<DeclarationPosition>): DeclarationPosition => ({
      status: 'undetermined', reason: '', versions: 0, filed: 0, overdue: 0, without_iris: 0,
      legal_basis: '', rows: [], ...over,
    });
    expect(declarationNeedsAttention(d({ status: 'undetermined' }))).toBe(true);
    expect(declarationNeedsAttention(d({ status: 'overdue' }))).toBe(true);
    expect(declarationNeedsAttention(d({ status: 'pending' }))).toBe(true);
    expect(declarationNeedsAttention(d({ status: 'filed' }))).toBe(false);
    for (const s of ['undetermined', 'overdue', 'pending', 'filed'] as const) {
      expect(DECLARATION_LABEL[s]).toBeTruthy();
    }
  });

  it('it is reachable from Finance settings', () => {
    expect(settings).toContain('ErpDeclarationCard');
    expect(settings).toContain('PosInterconnectionCard');
    expect(erpCard).toContain('Α.1054');
  });

  it('a failed read is unknown, not "nothing is due"', () => {
    expect(erpCard).toMatch(/not a statement that none are due/);
    expect(posCard).toMatch(/not a statement that nothing is owed/);
  });
});

describe('a payment terminal may not run on its own', () => {
  it('the gate blocks until the document is issued AND filed', () => {
    const g = (over: Partial<PaymentGate>): PaymentGate =>
      ({ allowed: false, code: 'not_issued', reason: '', ...over });
    expect(paymentIsBlocked(g({}))).toBe(true);
    expect(paymentIsBlocked(g({ allowed: false, code: 'not_transmitted' }))).toBe(true);
    expect(paymentIsBlocked(g({ allowed: true, code: 'ok' }))).toBe(false);
    expect(AUTONOMY_RULE).toMatch(/issued AND have reached myDATA/);
  });

  it('the approval and the signature close in ONE statement, and a retry replays', () => {
    // Two writes with an armed button is how one sale becomes two payments.
    expect(service).toContain('pos_record_payment_result');
    expect(service).not.toMatch(/from\('pos_payment_results'\)[\s\S]{0,120}\.insert/);
  });
});

describe('an unmatched signature ages out, and nothing here closes it', () => {
  it('the window is 60 hours and 2 for εστίαση', () => {
    expect(MATCHING_WINDOW_HOURS.standard).toBe(60);
    expect(MATCHING_WINDOW_HOURS.food_service).toBe(2);
  });

  it('only a SIMULTANEOUS transaction carries the «Υπό Έκδοση» flag', () => {
    // A deferred one is already filed and the token is bound to its MARK, so there is nothing
    // to flag — treating both the same transmits a flag against a document that has one.
    expect(needsUnderIssuanceFlag(sig({}))).toBe(true);
    expect(needsUnderIssuanceFlag(sig({ is_deferred: true }))).toBe(false);
    expect(needsUnderIssuanceFlag(sig({ must_flag_under_issuance: false }))).toBe(false);
  });

  it('the queue raises on the states that cost money', () => {
    const q = (over: Partial<SignatureQueue>): SignatureQueue => ({
      status: 'clean', reason: '', total: 0, awaiting: 0, expiring_soon: 0,
      expired_unmatched: 0, unflagged_under_issuance: 0, rows: [], ...over,
    });
    expect(signatureQueueNeedsAttention(q({ status: 'expired_unmatched' }))).toBe(true);
    expect(signatureQueueNeedsAttention(q({ status: 'unflagged' }))).toBe(true);
    expect(signatureQueueNeedsAttention(q({ status: 'expiring_soon' }))).toBe(true);
    expect(signatureQueueNeedsAttention(q({ status: 'clean' }))).toBe(false);
    expect(signatureQueueNeedsAttention(q({ status: 'none' }))).toBe(false);
    const verdicts: SignatureVerdict[] =
      ['matched', 'awaiting', 'expiring_soon', 'expired_unmatched', 'cancelled', 'expired'];
    for (const v of verdicts) expect(SIGNATURE_VERDICT_LABEL[v]).toBeTruthy();
  });

  it('the card reports and never expires anything', () => {
    expect(posPage).toContain('PosSignatureQueueCard');
    expect(queueCard).not.toMatch(/\.update\(|\.delete\(|expireSignature/);
  });
});

describe('wholesale on a terminal takes its own document', () => {
  it('355 to 8.4, correlated afterwards', () => {
    expect(EFTPOS_PREPAYMENT_CODE).toBe(355);
    expect(EFTPOS_RECEIPT_TYPE).toBe('8.4');
  });

  it('a missing receipt and an unknown route both need answering', () => {
    const w = (over: Partial<WholesaleCardPosition>): WholesaleCardPosition =>
      ({ status: 'receipt_missing', receipt_invoice_id: null, route: 'a1155', reason: '', ...over });
    expect(wholesaleReceiptMissing(w({}))).toBe(true);
    expect(wholesaleReceiptMissing(w({ status: 'route_unknown' }))).toBe(true);
    expect(wholesaleReceiptMissing(w({ status: 'correlated' }))).toBe(false);
    expect(wholesaleReceiptMissing(w({ status: 'not_wholesale' }))).toBe(false);
  });

  it('it is shown on the invoice it belongs to', () => {
    expect(invoicePage).toContain('WholesaleCardNotice');
    expect(notice).toContain('EFTPOS_RECEIPT_TYPE');
  });
});

describe('the envelope carries the terminal and the token, and the amounts reconcile', () => {
  it('type 7/8 carries tid and the ECRToken', () => {
    expect(novus).toMatch(/ECRToken:\s*\{\s*SigningAuthor/);
    expect(novus).toMatch(/pm\.tid/);
    expect(builder).toMatch(/ecrToken/);
  });

  it('the payment methods must sum exactly to the gross total', () => {
    expect(novus).toMatch(/paidTotal[\s\S]{0,200}totalGrossValue[\s\S]{0,200}throw new Error/);
  });

  it('the token is read from the database, never taken from the request body', () => {
    // A caller-supplied token is a claim about a signature rather than the signature.
    expect(issue).toMatch(/from\('pos_ecr_tokens'\)/);
    expect(issue).not.toMatch(/body\.pos_payment\.ecr_token|body\.pos_payment\.token/);
  });
});
