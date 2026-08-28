/**
 * The reference a supplier payout carries (#359 CM-19).
 *
 * `PayViaRevolutDialog` sent `reference || bill.supplier_bill_number` — so anything typed into the
 * reference box REPLACED the bill number, and the box was right there, editable, next to the
 * amount. The file's own header states the intent it was breaking: *"The payment reference carries
 * the bill number, so when the transfer executes…"*. Edit it and the transfer reconciles to
 * nothing; combined with weak reference matching (CM-16) and internal legs failing open (CM-12),
 * an edited reference is a payment that will not match back to anything.
 *
 * The bill number is now composed IN rather than replaced. The operator's note is still theirs —
 * it just cannot displace the one part of the string the bank feed reads.
 *
 * The real binding is `revolut_payouts.supplier_bill_id`, a foreign key set at instruction time.
 * This string is for whoever reads the bank statement.
 *
 * Import-free so a test can load it directly.
 */

/** Revolut caps a payment reference at 140 characters. */
export const PAYOUT_REFERENCE_MAX = 140;

export function payoutReference(
  billNumber: string | null | undefined,
  note: string | null | undefined,
): string {
  const number = String(billNumber ?? '').trim();
  const extra = String(note ?? '').trim();
  if (!number) return extra.slice(0, PAYOUT_REFERENCE_MAX);
  if (!extra) return number.slice(0, PAYOUT_REFERENCE_MAX);
  // A note that already quotes the number does not get it twice — people type it, and
  // "INV-1042 INV-1042 deposit" is the kind of detail that makes an operator distrust the field
  // and start editing it again.
  if (extra.toUpperCase().includes(number.toUpperCase())) return extra.slice(0, PAYOUT_REFERENCE_MAX);
  // The number goes FIRST, so a bank that truncates a long reference truncates the note.
  return `${number} ${extra}`.slice(0, PAYOUT_REFERENCE_MAX);
}
