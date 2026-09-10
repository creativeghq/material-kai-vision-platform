/** The reference a supplier payout carries (#359 CM-19). */

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
