import { createHash } from 'node:crypto';

/** Stable fingerprint of the projected `generation_models` rows. */
export function fingerprintRows(picked) {
  return createHash('sha256').update(JSON.stringify(picked)).digest('hex').slice(0, 32);
}

/** The columns the projection carries, in the order the generated file emits them. */
export const PROJECTION_COLUMNS = [
  'id', 'display_name', 'capability', 'sub_capability', 'provider', 'slug', 'version',
  'adapter', 'input_requirements', 'pricing_key', 'tier', 'status', 'enabled', 'sort_order',
];
