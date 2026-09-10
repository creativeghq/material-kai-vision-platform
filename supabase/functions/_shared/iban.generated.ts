// GENERATED MIRROR of src/utils/iban.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

// Canonical IBAN input normalizer.
// Bank statements and e-banking screens print IBANs in 4-char groups ("GR16 0110 1250 …"),
// so a pasted value arrives with spaces — sometimes non-breaking ones. Stored that way it
// breaks equality matching against the same account entered elsewhere and prints inconsistently
// on invoices. Normalize at every IBAN <Input> onChange and on the service write path.
// Whitespace + separators only: no length/checksum validation, so a half-typed IBAN stays editable.

export function normalizeIban(raw: unknown): string {
  return String(raw ?? '').replace(/[\s -]/g, '').toUpperCase();
}

/** ISO 13616 mod-97 check — is this a structurally valid IBAN? */
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
