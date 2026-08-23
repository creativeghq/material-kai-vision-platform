/**
 * The one correct ORDER for pricing a configurator (#382).
 *
 * Extracted from `<materialkai-configurator>` so it can be tested without a DOM, and because the
 * ordering below is the whole content of it: every input is obvious, the sequence is not, and
 * getting it wrong produces a valid number that nothing downstream can catch.
 *
 * THE TRAP. A blueprint has TWO kinds of priced line:
 *   • zone lines, derived from the layout (cabinets, worktop) — `deriveComposition` owns these;
 *   • flat lines, sitting outside every zone (installation, delivery, edging) — ordinary formula
 *     lines that frequently read `run_length` / `wall_run_length` / `worktop_length`.
 *
 * Those variables are PUBLISHED BY THE ZONES. So the flat lines have to be priced against the
 * derived numbers, and `composeEstimate` does not do that for you: it merges the vars into the
 * `dims` it RETURNS, but it prices the flat items exactly as they were handed in. Seed them
 * against the blueprint's typed defaults and installation is billed on a run length nothing on
 * screen agrees with.
 *
 * Measured against the live endpoint on 2026-08-23: a 1.60 m layout with a 10/m fitting rate
 * billed 10 instead of 16, and the widget cheerfully showed a total of 490 where the same
 * blueprint derives 496. The in-app page already had this right and says so in a comment; the
 * widget was written from `composeEstimate`'s signature rather than from that page, which is
 * exactly how the second implementation of a derivation goes wrong.
 */
import {
  absorbedGroups, deriveComposition, type Composition, type RateItemLike, type ZoneDef,
} from '@/utils/blueprintComposition';
import { composeEstimate, seedPlanItems } from '@/utils/blueprintCompute';

export function computeConfiguratorEstimate(
  schema: ZoneDef[],
  config: Composition,
  items: RateItemLike[],
  baseDims: Record<string, number>,
) {
  const absorbed = new Set(absorbedGroups(schema));
  // 1. Derive the zone variables from the layout FIRST.
  const seedDims = { ...baseDims, ...deriveComposition(schema, config, items).vars };
  // 2. Seed and price the flat lines against those, not against the typed defaults.
  const flat = seedPlanItems(items, seedDims, absorbed);
  // 3. Only now is the subtotal the sum of two halves that agree about how long the run is.
  return composeEstimate(schema, config, items, baseDims, flat);
}
