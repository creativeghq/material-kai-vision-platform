/**
 * The απογραφή and the pre-filled VAT rules, with no I/O (#452, #445).
 *
 * IMPORT-FREE on purpose. Both are asymmetric rules where getting the direction wrong is the
 * expensive way round, and both have a state that looks like compliance and is not.
 */

// ── Απογραφή (#452) ──────────────────────────────────────────────────────────

export type RollForwardStatus = 'same_day' | 'clean' | 'moved' | 'partial' | 'not_found';

export interface RollForward {
  status: RollForwardStatus;
  counted_on?: string;
  reference_date?: string;
  lines?: number;
  unlinked_lines?: number;
  movements_between?: number;
  reason: string;
}

export type MeasurementMethod = 'physical_count' | 'indirect' | 'roll_forward';

export const MEASUREMENT_LABEL: Record<MeasurementMethod, string> = {
  physical_count: 'Counted',
  indirect: 'Indirect technique',
  roll_forward: 'Rolled forward',
};

/**
 * Can a third-party line carry a value?
 *
 * No. Ν.4308/2014 άρθρο 4 §5 gives consigned goods description, unit and quantity per location and
 * NO «κατά μονάδα αξία επιμέτρησης», because we do not own them — and valuing them inflates the
 * balance sheet with somebody else's stock.
 */
export function thirdPartyLineMayBeValued(): boolean {
  return false;
}

/**
 * Does the roll-forward still need doing?
 *
 * `partial` is the one that matters: lines nobody could link stand as counted, which is an
 * assumption rather than a figure.
 */
export function rollForwardIncomplete(r: RollForward | null): boolean {
  return r?.status === 'moved' || r?.status === 'partial';
}

// ── Pre-filled VAT (#445) ────────────────────────────────────────────────────

export type SideStatus = 'ok' | 'within_tolerance' | 'breach';

export type PrefillStatus =
  | 'ok'
  | 'tolerance'
  | 'breach'
  | 'no_mydata_figures'
  | 'nothing_declared'
  | 'not_found';

export interface PrefillVerdict {
  status: PrefillStatus;
  income_status?: SideStatus;
  income_shortfall?: number;
  expense_status?: SideStatus;
  expense_excess?: number;
  mydata_income?: number;
  declared_income?: number;
  mydata_expenses?: number;
  declared_expenses?: number;
  declared_deviations?: number;
  undeclared_deviations?: number;
  legal_basis?: string;
  reason: string;
}

/**
 * Which direction breaches which rule.
 *
 * Income is a FLOOR: declaring more is always allowed. Expenses are a CEILING: declaring more
 * forfeits the deduction outright. Getting these the wrong way round is the expensive mistake, so
 * they are two functions rather than one "variance".
 */
export function incomeBreaches(declared: number, mydata: number, tolerancePct = 30): SideStatus {
  const gap = mydata - declared;
  if (gap <= 0) return 'ok';
  return gap <= mydata * tolerancePct / 100 ? 'within_tolerance' : 'breach';
}

export function expenseBreaches(declared: number, mydata: number, tolerancePct = 30): SideStatus {
  const gap = declared - mydata;
  if (gap <= 0) return 'ok';
  return gap <= mydata * tolerancePct / 100 ? 'within_tolerance' : 'breach';
}

/**
 * A deviation that was not TRANSMITTED is not a justified one.
 *
 * The escape hatch is an emitted document — 11.4 with characterisation 1.95 on income, 14.30 with
 * 2.4 or 2.95 on expenses — so a row with no MARK is a difference somebody wrote down, and the
 * deduction is still forfeit.
 */
export function deviationIsDeclared(d: { mydata_mark?: string | null }): boolean {
  return !!d.mydata_mark;
}

/** The document type and characterisation the decision fixes for each side. */
export const DEVIATION_DOCUMENT: Record<'income' | 'expense', { type: string; characterisation: string }> = {
  income: { type: '11.4', characterisation: '1.95' },
  expense: { type: '14.30', characterisation: '2.4' },
};

/** Whether the period should stop somebody filing rather than merely inform them. */
export function prefillBlocks(v: PrefillVerdict | null): boolean {
  return v?.status === 'breach';
}
