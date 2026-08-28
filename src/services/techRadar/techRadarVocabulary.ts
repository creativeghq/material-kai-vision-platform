/**
 * The tech-radar value-set, written ONCE (#391).
 *
 * `ring` was written out three times in two files: a union (widened with `| string`, which
 * collapses it back to `string` and made the literals decorative) plus a `RING_ORDER`
 * array in `TechRadarFindingsCard`, and a `RING_VALUES` const plus a second inline
 * `z.enum([...])` in `tech-radar-tools`.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `tech_radar_ring` is a Postgres ENUM on two columns, so an out-of-set ring cannot be
 * stored at all. Pinned to `pg_enum` by `tests/unit/techRadarVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/**
 * `tech_radar_ring`, in RADAR ORDER — adopt is the innermost ring, hold the outermost.
 *
 * The order is part of the vocabulary, not a display choice: this is the ThoughtWorks radar
 * convention and the card sorts findings by it, so a consumer that needs a rank uses
 * `indexOf` here rather than keeping a parallel `order` number. `RING_ORDER` and the
 * `order:` field inside `RING_META` were two such parallel copies of this sequence.
 */
export const RING_VALUES = ['adopt', 'trial', 'assess', 'hold'] as const;
export type TechRadarRing = (typeof RING_VALUES)[number];

export function isTechRadarRing(v: unknown): v is TechRadarRing {
  return typeof v === 'string' && (RING_VALUES as readonly string[]).includes(v);
}

/**
 * Rank for sorting, worst-known-last.
 *
 * A ring the model invented is not in the enum and cannot have been stored, but a finding
 * reaches the card as tool-result JSON BEFORE it is stored — so it sorts last rather than
 * throwing. That is the same reason the card falls back to the `assess` styling.
 */
export function ringRank(v: unknown): number {
  const i = (RING_VALUES as readonly string[]).indexOf(String(v));
  return i === -1 ? RING_VALUES.length : i;
}
