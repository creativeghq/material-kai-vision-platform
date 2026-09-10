// GENERATED MIRROR of src/modules/finance/invoice-templates/configuredOptions.ts — do not edit here.
// Regenerate: npm run finance:mirror (part of gen:all). Freshness is enforced by
// tests/unit/financeMirrors.test.ts, which fails the build on any drift.

/** What the customer chose, on the document that charges them for it (#375). */

export interface ConfiguredOption {
  group_id?: string;
  group_label?: string | null;
  value_id?: string;
  value_label?: string | null;
  price_delta?: number | string | null;
}

/** Rows that are actually renderable — a snapshot entry with no labels says nothing. */
function readable(raw: unknown): ConfiguredOption[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ConfiguredOption[]).filter(
    (o) => o && typeof o === 'object' && (o.group_label || o.value_label),
  );
}

/**
 * `Frame colour: Black · Handle: Brass`, or null when the line is not configured.
 *
 * Null rather than an empty string so a caller can tell "no options" from "options that rendered
 * to nothing" and fall back to whatever it printed before.
 */
export function configuredOptionsLabel(raw: unknown): string | null {
  const parts = readable(raw).map((o) =>
    o.group_label ? `${o.group_label}: ${o.value_label ?? '—'}` : String(o.value_label ?? ''),
  ).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The line's identity detail: its variant, its configuration, or both.
 *
 * One function because a product can have both — a Nero 60x60 tile with a brass trim — and two
 * separate render sites would eventually print one of them and not the other.
 */
export function lineDetailLabel(variantLabel: string | null | undefined, configuredRaw: unknown): string {
  return [variantLabel || null, configuredOptionsLabel(configuredRaw)].filter(Boolean).join(' · ');
}
