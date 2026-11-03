/** Takeoff review arithmetic, testable without a canvas: groups, totals, and printed-vs-outline checks. */
import type { TakeoffElementType, TakeoffReviewStatus } from '../takeoffVocabulary';

export interface GroupableMeasurement {
  id: string;
  element_type: TakeoffElementType;
  unit: string;
  label: string;
  kind: string;
  review_status: TakeoffReviewStatus;
  effective_value: number | null;
  value: number | null;
  detail: Record<string, unknown>;
  schedule_item_id: string | null;
}

export interface TakeoffGroup<M extends GroupableMeasurement> {
  key: string;
  element_type: TakeoffElementType;
  unit: string;
  rows: M[];
  proposed: number;
  confirmed: number;
  rejected: number;
  /** Sum of confirmed values, or NULL when any confirmed row has none — unknown, never partial. */
  confirmedTotal: number | null;
  /** Rows that cannot be valued yet: the sheet has no scale. */
  needsScale: number;
}

export function groupMeasurements<M extends GroupableMeasurement>(rows: readonly M[]): TakeoffGroup<M>[] {
  const byKey = new Map<string, TakeoffGroup<M>>();
  for (const m of rows) {
    const key = `${m.element_type}|${m.unit}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, element_type: m.element_type, unit: m.unit, rows: [], proposed: 0, confirmed: 0, rejected: 0, confirmedTotal: 0, needsScale: 0 };
      byKey.set(key, g);
    }
    g.rows.push(m);
    g[m.review_status] += 1;
    if (m.review_status !== 'rejected' && m.effective_value == null) g.needsScale += 1;
    if (m.review_status === 'confirmed') {
      g.confirmedTotal = g.confirmedTotal == null || m.effective_value == null ? null : g.confirmedTotal + m.effective_value;
    }
  }
  const groups = [...byKey.values()];
  for (const g of groups) {
    if (g.confirmed === 0) g.confirmedTotal = null;
    else if (g.confirmedTotal != null) g.confirmedTotal = Math.round(g.confirmedTotal * 1000) / 1000;
    g.rows.sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups.sort((a, b) => a.element_type.localeCompare(b.element_type) || a.unit.localeCompare(b.unit));
}

/** Proposed rows that CAN be confirmed now; a measured row without a scale is refused by the database. */
export function confirmable<M extends GroupableMeasurement>(rows: readonly M[]): M[] {
  return rows.filter((m) => m.review_status === 'proposed' && m.effective_value != null);
}

/** Confirmed rows not yet on a bill line, all in one unit — what "Send to bill" may take. */
export function billable<M extends GroupableMeasurement>(rows: readonly M[]): M[] {
  return rows.filter((m) => m.review_status === 'confirmed' && !m.schedule_item_id && m.effective_value != null);
}

/**
 * A printed room area checked against the outline the geometry found around its label.
 * Returns the outline's area in m² when the two differ by more than `tolerance`, else null.
 */
export function roomAreaDisagreement(
  m: GroupableMeasurement, scaleM: number | null, tolerance = 0.1,
): number | null {
  const norm = Number(m.detail?.polygon_area_norm);
  if (m.element_type !== 'room' || m.unit !== 'm2' || !(scaleM && scaleM > 0)) return null;
  if (!Number.isFinite(norm) || norm <= 0 || m.value == null || m.value <= 0) return null;
  const outline = Math.round(norm * scaleM * scaleM * 100) / 100;
  return Math.abs(outline - m.value) / m.value > tolerance ? outline : null;
}

/** The 16×16 fingerprint cell index → its normalised rectangle, for drawing what a revision changed. */
export function cellRect(index: number, grid = 16): { x: number; y: number; w: number; h: number } {
  const r = Math.floor(index / grid);
  const c = index % grid;
  return { x: c / grid, y: r / grid, w: 1 / grid, h: 1 / grid };
}
