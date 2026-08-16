// Canonical IBAN input normalizer.
// Bank statements and e-banking screens print IBANs in 4-char groups ("GR16 0110 1250 …"),
// so a pasted value arrives with spaces — sometimes non-breaking ones. Stored that way it
// breaks equality matching against the same account entered elsewhere and prints inconsistently
// on invoices. Normalize at every IBAN <Input> onChange and on the service write path.
// Whitespace + separators only: no length/checksum validation, so a half-typed IBAN stays editable.

export function normalizeIban(raw: unknown): string {
  return String(raw ?? '').replace(/[\s -]/g, '').toUpperCase();
}

/**
 * ISO 13616 mod-97 check — is this a structurally valid IBAN?
 *
 * `normalizeIban` above deliberately does NOT validate, because it runs on every keystroke and a
 * half-typed IBAN has to stay editable. Nothing validated on the way in either: there were zero
 * mod-97 checks across both repos (#366 BU-9), so a typo'd IBAN was storable as a counterparty
 * payment destination and the first thing to notice would be a failed — or misdirected —
 * transfer. Confirmation of Payee via Revolut exists, but it is optional, manual, and needs a
 * Revolut connection.
 *
 * Call it on the SERVICE WRITE PATH, never on change. The DB backstop is
 * `public.iban_is_valid(text)`, which the same-named CHECK constraint on `crm_bank_accounts`
 * uses; this copy exists so the operator gets the error at the field instead of a raw
 * constraint-violation string.
 *
 * Empty is VALID: an account may legitimately have no IBAN on file (a SWIFT/account-number
 * counterparty). This rejects a WRONG IBAN, not a missing one — same contract as the SQL twin.
 */
export function isValidIban(raw: unknown): boolean {
  const s = normalizeIban(raw);
  if (!s) return true;
  // 2 letters (country) + 2 check digits + 11–30 alphanumerics.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  // Move the first four characters to the end, map letters to numbers (A=10 … Z=35).
  const rearranged = s.slice(4) + s.slice(0, 4);
  let digits = '';
  for (const ch of rearranged) {
    digits += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
  }
  // mod 97 in slices — the full number overflows Number.MAX_SAFE_INTEGER long before the end.
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(String(remainder) + digits.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}
