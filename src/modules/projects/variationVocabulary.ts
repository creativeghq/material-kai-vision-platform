/**
 * Variation value-sets, written ONCE.
 *
 * IMPORT-FREE, like the cost-code, drawing and request vocabularies beside it: the service builds
 * a Supabase client at module load, so anything living next to it can only be tested by mocking a
 * database — and which variations count as money is exactly the decision worth testing directly.
 */

/** `project_variations_direction_check`. */
export type VariationDirection = 'client' | 'supplier';

/** `project_variations_status_check`. */
export type VariationStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'withdrawn';

/** `project_variations_origin_check`. */
export type VariationOrigin =
  | 'client_instruction' | 'design_change' | 'site_condition'
  | 'error_or_omission' | 'statutory' | 'other';

export const VARIATION_DIRECTIONS: VariationDirection[] = ['client', 'supplier'];
export const VARIATION_STATUSES: VariationStatus[] = [
  'draft', 'submitted', 'approved', 'rejected', 'withdrawn',
];
export const VARIATION_ORIGINS: VariationOrigin[] = [
  'client_instruction', 'design_change', 'site_condition', 'error_or_omission', 'statutory', 'other',
];

/**
 * The ONLY status that is money.
 *
 * Draft and submitted variations are a pipeline: real work that may or may not be paid for. A
 * cost report that counted them would tell an operator they are in profit on instructions the
 * client has not agreed to, which is the most expensive way to be wrong on a construction job.
 * `get_project_cvr` filters on `status = 'approved'` and this is the mirror of that filter — if
 * one ever admits more than the other, the screen and the report disagree about the job's value.
 */
export const VARIATION_COUNTS_AS_MONEY: VariationStatus[] = ['approved'];

export const isVariationMoney = (s: VariationStatus): boolean =>
  VARIATION_COUNTS_AS_MONEY.includes(s);

/** Statuses that are finished with, whatever the answer was. */
export const VARIATION_CLOSED_STATUSES: VariationStatus[] = ['approved', 'rejected', 'withdrawn'];

/**
 * Which side of the trade a direction moves.
 *
 * Stated as data rather than left to each reader, because netting the two is the defect
 * anti-regression rule 1 exists to prevent: a client variation is money IN and a supplier
 * variation is money OUT, and the platform has already shipped one implementation that added
 * them together.
 */
export const DIRECTION_SIDE: Record<VariationDirection, 'value' | 'cost'> = {
  client: 'value',
  supplier: 'cost',
};

/** How the reference is prefixed. Mirrors `_project_variations_assign_reference`. */
export const DIRECTION_PREFIX: Record<VariationDirection, string> = {
  client: 'VO',
  supplier: 'SVO',
};
