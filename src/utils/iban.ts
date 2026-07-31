// Canonical IBAN input normalizer.
//
// Bank statements and e-banking screens print IBANs in 4-char groups ("GR16 0110 1250 …"),
// so a pasted value arrives with spaces — sometimes non-breaking ones. Stored that way it
// breaks equality matching against the same account entered elsewhere and prints inconsistently
// on invoices. Normalize at every IBAN <Input> onChange and on the service write path.
//
// Whitespace + separators only: no length/checksum validation, so a half-typed IBAN stays editable.

export function normalizeIban(raw: unknown): string {
  return String(raw ?? '').replace(/[\s -]/g, '').toUpperCase();
}
