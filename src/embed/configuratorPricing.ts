/** The one correct ORDER for pricing a configurator (#382). */
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
