/** The tech-radar value-set, written ONCE (#391). */

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
