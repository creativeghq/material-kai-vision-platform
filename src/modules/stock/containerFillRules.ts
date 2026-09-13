/**
 * What a container-fill answer MEANS, with no I/O (#439).
 *
 * IMPORT-FREE on purpose. The published state of the art is volume-first and wrong for tile:
 * palletised porcelain runs ~1,800-2,000 kg/m³, so a 20ft box hits its payload at about 14-15 m³
 * against a ~33 m³ cube. A volume-first packer builds a container that looks correct and cannot
 * be lifted.
 */

export type FillStatus =
  | 'space_left'
  | 'full'
  | 'over_payload'
  | 'partial'
  | 'unweighable'
  | 'no_lines'
  | 'unknown_container';

export interface ContainerFill {
  status: FillStatus;
  container?: string;
  container_name?: string;
  payload_kg?: number;
  volume_m3?: number;
  loaded_kg?: number;
  loaded_pct?: number;
  remaining_kg?: number;
  binding_constraint?: 'weight' | 'volume';
  lines?: number;
  unweighed_lines?: number;
  reason: string;
}

/**
 * Is the figure on screen the real load?
 *
 * With any line unweighed it is a FLOOR, not a total — the true weight is higher by an unknown
 * amount, which is the one direction that gets a container turned away at the port.
 */
export function loadIsAFloor(f: ContainerFill | null): boolean {
  return f?.status === 'partial' || f?.status === 'unweighable';
}

/** A load that cannot ship as proposed. */
export function loadIsOverweight(f: ContainerFill | null): boolean {
  return f?.status === 'over_payload';
}

/**
 * How much more of THIS supplier's goods would fit.
 *
 * Per-supplier because there is no shipping consolidation between suppliers — composing a box
 * means reaching for that one supplier's other lines. `null` when the load is not knowable, which
 * is different from "no room".
 */
export function headroomKg(f: ContainerFill | null): number | null {
  if (!f) return null;
  if (loadIsAFloor(f) || loadIsOverweight(f)) return null;
  return f.remaining_kg ?? null;
}
