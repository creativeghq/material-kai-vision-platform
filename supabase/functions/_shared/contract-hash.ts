/** The one definition of "what was signed" (#356 `RC-1`). */

/**
 * Fields whose change alters what a signatory agreed to.
 *
 * Deliberately NOT the whole row. `status`, `sign_token`, `sent_at`, `signed_at`, `updated_at`
 * and the subject foreign keys all move as part of the normal lifecycle — including as a direct
 * result of signing — so hashing them would make every signature mismatch itself immediately.
 * This is the same list as `WRITABLE` in contracts-api, which is the point: exactly the fields a
 * user can edit are the fields the signature is bound to.
 */
export const SIGNED_FIELDS = [
  'contract_type', 'title', 'body_markdown', 'currency', 'value',
  'effective_date', 'expiry_date', 'counterparty_name', 'counterparty_email',
] as const;

/** Normalise one value so an incidental type change is not read as a terms change. */
function canonicalValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  // `value` is numeric in Postgres and arrives as a number or a string depending on the client.
  // 300000, "300000" and "300000.00" are the same amount and must hash the same.
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(n);
  }
  return s;
}

/**
 * Canonical text for a contract's terms. Field order is fixed by `SIGNED_FIELDS`, never by
 * object key order, which varies with how the row was selected.
 */
export function canonicalContractText(row: Record<string, unknown>): string {
  return SIGNED_FIELDS.map((f) => `${f}=${canonicalValue(row[f])}`).join('\n');
}

/** Lowercase hex sha-256 of the canonical terms. */
export async function contractContentHash(row: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalContractText(row));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
