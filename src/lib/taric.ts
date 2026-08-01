/**
 * TARIC code shape helpers — pure, no Supabase client.
 *
 * Separate from `taricService` on purpose: these are the rules the database constraint and the
 * importer both encode, so they need to be importable from anywhere (and testable without
 * environment variables), not just from a screen that already has a client.
 */

/** The levels the EU nomenclature actually publishes. 7 digits is not one of them. */
const VALID_LENGTHS = [2, 4, 6, 8, 10];

/**
 * Digits only, zero-padded to the 10-digit form every TARIC level is stored in.
 * Returns null when the input is not a nomenclature level — padding an arbitrary length would
 * invent a subheading that does not exist.
 */
export function normalizeTaricInput(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  if (!VALID_LENGTHS.includes(digits.length)) return null;
  return digits.padEnd(10, '0');
}

/** `6907 21 00 90` — the grouping customs paperwork uses. */
export function formatTaricCode(code: string | null | undefined): string {
  const digits = (code ?? '').replace(/[^0-9]/g, '');
  if (digits.length !== 10) return code ?? '';
  return `${digits.slice(0, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
}
