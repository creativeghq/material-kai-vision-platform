// GENERATED MIRROR of src/modules/finance/invoice-templates/lineName.ts — do not edit here.
// Regenerate: npm run finance:mirror (part of gen:all). Freshness is enforced by
// tests/unit/financeMirrors.test.ts, which fails the build on any drift.

/** A document line's name: the series plus its chosen variant ("Ardenza Gold 60x120"). */

const squash = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Whether `name` already carries `value` as whole words, case-insensitively. */
export function nameCarries(name: string | null | undefined, value: string | null | undefined): boolean {
  const v = squash(value).toLowerCase();
  if (!v) return true;
  return ` ${squash(name).toLowerCase()} `.includes(` ${v} `);
}

/**
 * Base name + each variant value it does not already carry. TypeScript twin of SQL
 * `public.compose_line_name(text, text[])`; the stored description is the source, and this only
 * names a line that has no row yet.
 */
export function composeLineName(base: string | null | undefined, values: ReadonlyArray<string | null | undefined>): string | null {
  let out = squash(base);
  if (!out) return null;
  for (const raw of values) {
    const v = squash(raw);
    if (!v || nameCarries(out, v)) continue;
    out = `${out} ${v}`;
  }
  return out;
}

/** The variant parts a renderer must still print beside `name` — none, once the name carries them. */
export function partsNotInName(name: string | null | undefined, parts: ReadonlyArray<string | null | undefined>): string[] {
  return parts.map(squash).filter((p) => p && !nameCarries(name, p));
}
