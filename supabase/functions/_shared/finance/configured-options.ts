/**
 * What the customer chose, on the document that charges them for it (#375).
 *
 * A configured line's price is the base plus the deltas of the options picked in the configurator.
 * Until now those choices reached the quote line and stopped: the order, the invoice and the PDF
 * the customer holds said only the product's name, while the price silently included the extras.
 * That is anti-regression rule 1c — a figure that is stored and charged is a figure that is
 * PRINTED — and its failure mode is a document the reader cannot reconcile, which is worse than a
 * missing one because it looks complete.
 *
 * READ FROM THE LINE'S FROZEN SNAPSHOT, never from `product_option_values`. Renaming "Brass" to
 * "Antique brass" next spring must not rewrite an invoice issued last autumn — the same reason
 * the printed counterparty comes from `counterparty_snapshot` rather than a live CRM read.
 *
 * Deliberately NOT `selected_attributes`. That column is the line's variant identity: `_variant_key()`
 * turns it into a key the warehouse resolver and the variant price rows are looked up by. The
 * configurator used to write option labels into it, so a configured line claimed to be a variant
 * nobody has ever stocked or priced.
 */

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
