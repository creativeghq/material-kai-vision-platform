import { createHash } from 'node:crypto';

/**
 * Stable fingerprint of the projected `generation_models` rows.
 *
 * Lives in its own module because BOTH sides import it — `scripts/gen-generation-models.mjs`
 * writes it into the generated file, and `tests/unit/generationModelRegistry.test.ts` recomputes
 * it from the file's own rows. Copying the two lines into the test instead would create a second
 * definition of "how the fingerprint is formed", which is the drift this whole mechanism exists to
 * detect. It also cannot live in the generator itself: that script has top-level `await` and runs
 * on import, so a test importing it would fire a real generation.
 *
 * Deliberately NOT compared against a SQL-side hash. The database half of this check
 * (`dic_detect__generation_registry_projection_stale`) compares jsonb to jsonb, because
 * reproducing Postgres's jsonb text form in JavaScript byte-for-byte is the kind of agreement that
 * silently stops holding — and a fingerprint that quietly stops matching is worse than no
 * fingerprint at all.
 */
export function fingerprintRows(picked) {
  return createHash('sha256').update(JSON.stringify(picked)).digest('hex').slice(0, 32);
}

/** The columns the projection carries, in the order the generated file emits them. */
export const PROJECTION_COLUMNS = [
  'id', 'display_name', 'capability', 'sub_capability', 'provider', 'slug', 'version',
  'adapter', 'input_requirements', 'pricing_key', 'tier', 'status', 'enabled', 'sort_order',
];
