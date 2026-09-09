/**
 * Guard: a supplier's bank details are READ off their invoice, and reading one is not the same
 * as agreeing to pay it.
 *
 * WHAT THIS FEATURE IS. Almost every supplier invoice prints the account to pay it into, and the
 * platform already opens every one of those documents in front of a model — `scan-receipt` for
 * the expense form, `inbox-attachment-intelligence` for everything that lands in the Inbox. Until
 * now the IBAN on the paper was re-keyed by hand onto the counterparty, or not captured at all.
 *
 * WHY THE SHAPE MATTERS MORE THAN THE FEATURE. `crm_bank_accounts` is a payment DESTINATION:
 * `_shared/payments/payout.ts` loads a row from it and sends real money on Revolut/Viva. Anyone
 * can email us a PDF. So the one thing this must never become is "a document arrived, therefore a
 * new place to send money exists". Every property below is a way that could happen quietly:
 *
 *   1. ONE contract for the payment block, spliced into both forced tools — two hand-written
 *      copies would drift about what "the IBAN on the document" means, and one of them is on the
 *      path that files it.
 *   2. Neither reader writes to `crm_bank_accounts`, and the client's suggestion API cannot
 *      either: the ONLY door is `crm_accept_bank_account_suggestion`, which needs a member's JWT
 *      and claims the row before it inserts.
 *   3. A misread IBAN is RECORDED with the verdict on it, never dropped — dropping it is a
 *      hidden row, and "we read the document and found nothing" would be a lie.
 *   4. A sighting is only filed when a party is actually known. An unbound one would sit in a
 *      queue nobody looks at.
 *   5. What the ASSISTANT is told is masked. It reads inbox threads and writes replies into
 *      them; an assistant able to recite a supplier's IBAN is one paraphrase away from handing a
 *      payment destination to whoever is on the other end.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  documentBankToolProperties,
  readDocumentBankDetails,
  describeDocumentBankDetails,
} from '../../supabase/functions/_shared/finance/document-bank-details.ts';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const SHARED = read('supabase/functions/_shared/finance/document-bank-details.ts');
const INBOX_READER = read('supabase/functions/_shared/inbox-attachment-intelligence.ts');
const SCAN = read('supabase/functions/scan-receipt/index.ts');
const CRM_SERVICE = read('src/services/crm.service.ts');
const EXPENSE_DIALOG = read('src/modules/finance/components/NewExpenseDialog.tsx');
const BANK_CARD = read('src/components/business/crm/CrmBankAccountsCard.tsx');

/** A real IBAN and the same one with a digit changed — mod-97 tells them apart, eyes do not. */
const GOOD = 'GR1601101250000000012300695';
const BAD = 'GR1601101250000000012300699';

describe('the payment block is declared once and read by both document readers', () => {
  it('both forced tools splice in the shared properties rather than restating them', () => {
    for (const [name, src] of [['inbox reader', INBOX_READER], ['scan-receipt', SCAN]] as const) {
      expect(src, name).toContain('documentBankToolProperties()');
      // A hand-written property of the same name is the drift this exists to prevent.
      expect(src.match(/bank_iban:\s*\{/g) ?? [], name).toHaveLength(0);
    }
  });

  it('both readers parse the answer with the shared reader', () => {
    expect(INBOX_READER).toContain('readDocumentBankDetails(input)');
    expect(SCAN).toContain('readDocumentBankDetails(raw)');
  });

  it('the shared module uses the MIRRORED iban check, not a third hand-written copy', () => {
    // `src/utils/iban.ts` and `public.iban_is_valid` are the two that already exist; a Deno
    // re-implementation would be a third opinion on which IBAN is a typo.
    expect(SHARED).toContain("from '../iban.generated.ts'");
    expect(SHARED).not.toMatch(/remainder\s*=\s*Number/);
  });

  it('every declared property is optional — a model obliged to answer will invent an IBAN', () => {
    const props = documentBankToolProperties();
    expect(Object.keys(props).sort()).toEqual(
      ['bank_account_holder', 'bank_account_ref', 'bank_iban', 'bank_name'],
    );
    // The schema fragment carries no `required`; both callers own their own.
    expect(JSON.stringify(props)).not.toContain('"required"');
  });

  it('a fresh object each call, so one reader cannot mutate the other\'s schema', () => {
    expect(documentBankToolProperties()).not.toBe(documentBankToolProperties());
  });
});

describe('what the reader returns', () => {
  it('normalises a printed IBAN — documents print it in groups of four', () => {
    const b = readDocumentBankDetails({ bank_iban: 'gr16 0110 1250 0000 0001 2300 695' });
    expect(b?.iban).toBe(GOOD);
    expect(b?.checksum_ok).toBe(true);
  });

  it('records a MISREAD IBAN with the verdict on it, rather than dropping it', () => {
    const b = readDocumentBankDetails({ bank_iban: BAD, bank_name: 'Eurobank' });
    // Dropping it would report "no bank details on this document", which is not what happened.
    expect(b).not.toBeNull();
    expect(b?.iban).toBe(BAD);
    expect(b?.checksum_ok).toBe(false);
  });

  it('a document with no account at all returns null — a bank name is not somewhere to pay', () => {
    expect(readDocumentBankDetails({ bank_name: 'Piraeus' })).toBeNull();
    expect(readDocumentBankDetails({})).toBeNull();
    expect(readDocumentBankDetails(null)).toBeNull();
  });

  it('a SWIFT/account-number counterparty is a real answer with no IBAN', () => {
    const b = readDocumentBankDetails({ bank_account_ref: '5231.051355.768', bank_name: 'Alpha' });
    expect(b?.iban).toBeNull();
    expect(b?.account_ref).toBe('5231.051355.768');
    // Same contract as `isValidIban` and the SQL CHECK: this rejects a WRONG IBAN, not a missing one.
    expect(b?.checksum_ok).toBe(true);
  });
});

describe('the assistant is told a payment block exists, never what it says', () => {
  it('the description masks the number', () => {
    const word = describeDocumentBankDetails(readDocumentBankDetails({ bank_iban: GOOD, bank_name: 'Eurobank' }));
    expect(word).toBeTruthy();
    expect(word).not.toContain(GOOD);
    expect(word).toContain('0695');
  });

  it('a misread one says so, so nobody reads the masked tail as confirmation', () => {
    const word = describeDocumentBankDetails(readDocumentBankDetails({ bank_iban: BAD }));
    expect(word).toContain('checksum');
  });

  it('the inbox transcript builder uses that describer and never the raw field', () => {
    expect(INBOX_READER).toContain('describeDocumentBankDetails(d.bank)');
    expect(INBOX_READER).not.toMatch(/facts\.push\([^)]*d\.bank\.iban/);
  });
});

describe('reading is not paying — the only door into crm_bank_accounts is the review path', () => {
  it('neither document reader writes to the payment-destination table', () => {
    for (const [name, src] of [['inbox reader', INBOX_READER], ['scan-receipt', SCAN]] as const) {
      expect(src, name).not.toContain('crm_bank_accounts');
      expect(src, name).not.toContain('crm_record_bank_account_suggestion');
    }
  });

  it('the suggestions API proposes and reviews; it never inserts an account itself', () => {
    const api = CRM_SERVICE.slice(CRM_SERVICE.indexOf('crmBankAccountSuggestionsAPI'));
    expect(api).toContain('crm_record_bank_account_suggestion');
    expect(api).toContain('crm_accept_bank_account_suggestion');
    expect(api).toContain('crm_dismiss_bank_account_suggestion');
    // Not `.from('crm_bank_accounts').insert(...)`: the accept RPC claims the suggestion and
    // inserts in ONE transaction, so a double-click cannot create the destination twice.
    expect(api).not.toMatch(/from\('crm_bank_accounts'\)\s*\.\s*insert/);
  });

  it('accepting goes through the RPC from the card, with the OPERATOR\'s values', () => {
    expect(BANK_CARD).toContain('crmBankAccountSuggestionsAPI.accept(reviewing.id');
    // The confirmed form fields, not the suggestion's own — the document prefills, it does not decide.
    expect(BANK_CARD).toContain('bankName: (form.bank_name ?? \'\').trim()');
    // A one-click accept would skip the only human check on a payment destination.
    expect(BANK_CARD).not.toMatch(/accept\(\s*s\.id/);
  });

  it('reviewing never promotes the new account over the one already being paid', () => {
    // `is_primary` on a just-read account is precisely what an invoice-fraud attempt wants.
    const review = BANK_CARD.slice(BANK_CARD.indexOf('const startReview'), BANK_CARD.indexOf('const dismiss'));
    expect(review).toContain('is_primary: false');
  });

  it('a conflict with the account on file is stated, in the list AND in the editor', () => {
    expect(BANK_CARD).toContain('conflicts_with_account_id');
    expect(BANK_CARD).toMatch(/not the account you have on file/);
    expect(BANK_CARD).toMatch(/invoice fraud/);
  });

  it('a suggestions read that FAILED does not render as a party with nothing to review', () => {
    // `.catch(() => [])` here would make a broken read pixel-identical to a clean supplier.
    expect(BANK_CARD).not.toMatch(/listPending\(parent\)\.catch/);
    expect(BANK_CARD).toContain('suggestionsError');
  });
});

describe('a sighting is filed only where the party is actually known', () => {
  it('the expense form records it after the bill exists, and only for a CRM party', () => {
    const save = EXPENSE_DIALOG.slice(EXPENSE_DIALOG.indexOf('const created = await financeService.createExpense'));
    const record = save.indexOf('crmBankAccountSuggestionsAPI.record');
    expect(record).toBeGreaterThan(-1);
    // An `adhoc` payee has no CRM row to hang it on — the guard is the party ids, not the label.
    expect(save.slice(0, record)).toContain('if (scannedBank && (cpCompanyId || cpContactId))');
  });

  it('filing it cannot fail the expense silently — the bill is already committed', () => {
    const save = EXPENSE_DIALOG.slice(EXPENSE_DIALOG.indexOf('crmBankAccountSuggestionsAPI.record'));
    expect(save).toContain('Expense saved, bank details not filed');
  });

  it('a bank block from the last document is cleared on every open of the persistent dialog', () => {
    expect(EXPENSE_DIALOG).toContain('setScannedBank(prefill?.bankDetails ?? null)');
  });

  it('a scan clears the previous reading BEFORE the call, not after a successful one', () => {
    // Every other exit from scanReceipt returns early (unreadable image, thrown request). Clearing
    // on success only would file document A's IBAN against the supplier on document B.
    const scan = EXPENSE_DIALOG.slice(EXPENSE_DIALOG.indexOf('const scanReceipt'));
    const cleared = scan.indexOf('setScannedBank(null)');
    const call = scan.indexOf('await receiptScanService.scan');
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(call);
  });

  it('an ad-hoc payee is TOLD the reading was not filed — it is the default case, not an edge one', () => {
    // A scan and the Inbox both prefill the issuer as an ad-hoc payee, so the commonest path is
    // the one with no CRM record to file against. Silence there is a feature that never runs.
    const save = EXPENSE_DIALOG.slice(EXPENSE_DIALOG.indexOf('crmBankAccountSuggestionsAPI.record'));
    expect(save).toContain('Bank details not filed — the payee is a one-off');
  });

  it('a conflict is announced on every open sighting, not only the first', () => {
    // The SECOND invoice carrying a changed IBAN is the one worth reacting to, and by then the
    // row is `seen_again`.
    const save = EXPENSE_DIALOG.slice(EXPENSE_DIALOG.indexOf('crmBankAccountSuggestionsAPI.record'));
    expect(save).toContain("if (res.conflict && res.status === 'pending')");
    expect(save).not.toMatch(/outcome === 'new'[\s\S]{0,80}res\.conflict \?/);
  });

  it('the Inbox carries what it read into the form rather than filing it itself', () => {
    const page = read('src/pages/Inbox/InboxPage.tsx');
    expect(page).toContain("source: 'inbox_attachment'");
    expect(page).not.toContain('crmBankAccountSuggestionsAPI');
  });
});
