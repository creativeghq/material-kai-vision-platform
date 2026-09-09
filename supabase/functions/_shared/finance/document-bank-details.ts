/**
 * The payment block printed on somebody else's invoice — declared ONCE for both readers.
 *
 * WHAT THIS IS FOR. A supplier invoice almost always prints where to pay it: "ΤΡΑΠΕΖΑ ΠΕΙΡΑΙΩΣ ·
 * IBAN GR16 0110 1250 0000 0001 2300 695 · δικαιούχος ACME ΑΕ". We hold exactly that fact per
 * counterparty in `crm_bank_accounts`, and until now every one of them was typed in by hand off a
 * document the platform had already opened and read.
 *
 * TWO READERS, ONE CONTRACT. `scan-receipt` reads a photographed/scanned invoice for the expense
 * form; `inbox-attachment-intelligence` reads every PDF and photo that arrives in the Inbox. Both
 * already send the file to Claude behind a FORCED tool call, so extracting the payment block costs
 * no extra model call and no extra credit — it is four more properties on a schema the file is
 * already being read against. They share this module so the two cannot come to different answers
 * about what "the IBAN on the document" means, and so a test can hold both to it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not write anything, anywhere. `crm_bank_accounts` is
 * a payment DESTINATION — `_shared/payments/payout.ts` loads a row from it and sends real money on
 * Revolut/Viva — so an IBAN a model read off a PDF that anyone can email us must never become one
 * without a person looking at it. The reading lands on the document's own row; binding it to a
 * party and reviewing it is `crm_record_bank_account_suggestion` /
 * `crm_accept_bank_account_suggestion`, both of which need a member's JWT.
 *
 * THE CHECKSUM IS REPORTED, NOT ENFORCED. A document can print a typo and a model can misread a
 * character, and the two are worth telling apart — but neither is a reason to drop the sighting on
 * the floor. `checksum_ok: false` is a value with a verdict on it; silently returning null would
 * be a hidden row.
 *
 * Guarded by tests/unit/documentBankDetails.test.ts.
 */

import { isValidIban, normalizeIban } from '../iban.generated.ts';

/**
 * The tool-schema properties both readers splice into their own forced tool. Written as a
 * function so neither reader can mutate the other's copy by accident.
 *
 * Every field is optional: most documents print a bank block and plenty do not, and a model
 * obliged to produce an IBAN for a receipt that has none will invent one. There is no
 * "bank_details_present" boolean for the same reason — absence IS the answer, and a second field
 * saying so is a second thing that can disagree.
 */
export function documentBankToolProperties(): Record<string, unknown> {
  return {
    bank_iban: {
      type: 'string',
      description:
        'The IBAN printed on the document as the account to pay INTO, exactly as printed '
        + '(spaces are fine). This is the ISSUER\'s account. Omit it entirely if no IBAN is printed. '
        + 'Never reconstruct or complete one that is partly cut off or illegible.',
    },
    bank_account_ref: {
      type: 'string',
      description:
        'A SWIFT/BIC or a plain account number printed instead of, or beside, the IBAN. Omit if absent.',
    },
    bank_name: {
      type: 'string',
      description: 'The bank named next to that account, as printed (e.g. "Πειραιώς", "Eurobank"). Omit if absent.',
    },
    bank_account_holder: {
      type: 'string',
      description: 'The account holder / beneficiary named for that account, as printed. Omit if absent.',
    },
  };
}

/** What the document said about where to pay it. */
export interface DocumentBankDetails {
  /** Normalised (no spaces, upper). Null when the document printed no IBAN. */
  iban: string | null;
  /** SWIFT/BIC or a bare account number. Null when absent. */
  account_ref: string | null;
  bank_name: string | null;
  account_holder: string | null;
  /**
   * mod-97 verdict on `iban`. True when there is no IBAN at all — same contract as
   * `isValidIban` and as the `iban_is_valid` CHECK: this rejects a WRONG IBAN, not a missing one.
   */
  checksum_ok: boolean;
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Read the payment block out of a forced tool call's input.
 *
 * Returns null when the document stated no account at all — a bank name on its own is not a
 * payment destination, and recording one would put a row on a supplier's card that can never be
 * paid to and never be completed.
 */
export function readDocumentBankDetails(input: Record<string, unknown> | null | undefined): DocumentBankDetails | null {
  if (!input || typeof input !== 'object') return null;
  const rawIban = clean(input.bank_iban, 60);
  const iban = rawIban ? normalizeIban(rawIban) : null;
  const account_ref = clean(input.bank_account_ref, 60);
  if (!iban && !account_ref) return null;
  return {
    iban: iban || null,
    account_ref,
    bank_name: clean(input.bank_name, 120),
    account_holder: clean(input.bank_account_holder, 160),
    checksum_ok: isValidIban(iban ?? ''),
  };
}

/**
 * How the block reads to a person — used for the operator-facing line and nothing else.
 *
 * The IBAN is deliberately MASKED here. This string is what the assistant is told about an inbox
 * attachment, and an assistant that can recite a supplier's full IBAN into a chat reply is one
 * paraphrase away from handing a payment destination to whoever is on the other end of the thread.
 * The real number lives on the row and on the review card, where a person is looking at it.
 */
export function describeDocumentBankDetails(b: DocumentBankDetails | null | undefined): string | null {
  if (!b) return null;
  const number = b.iban
    ? `IBAN ending ${b.iban.slice(-4)}`
    : b.account_ref
      ? `account ending ${b.account_ref.slice(-4)}`
      : null;
  if (!number) return null;
  const parts = [b.bank_name, number, b.checksum_ok ? null : 'the IBAN fails its checksum'].filter(Boolean);
  return `bank details printed (${parts.join(', ')})`;
}
