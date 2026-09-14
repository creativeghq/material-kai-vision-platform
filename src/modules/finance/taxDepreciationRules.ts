/**
 * The second depreciation basis (#451).
 *
 * A Greek company keeps two: the book basis (useful life + salvage) for the financial statements,
 * and the tax basis — a statutory RATE on acquisition cost by category, άρθρο 24 ν.4172/2013 — for
 * the Ε3 and the income-tax return. Import-free so the predicates can be tested without a client.
 */

export type TaxDepreciationStatus =
  | 'ok'
  | 'no_tax_category'
  | 'no_cost'
  | 'no_service_date'
  | 'not_started'
  | 'rate_not_configured';

export type TaxRateStatus = 'in_force' | 'unconfirmed' | 'not_configured';

export interface AssetTaxDepreciation {
  asset_id: string;
  status: TaxDepreciationStatus;
  reason: string;
  category_code: string | null;
  basis: number | null;
  rate_percent: number | null;
  months_charged: number;
  months_unrated: number;
  accumulated: number | null;
  written_down_value: number | null;
  fully_depreciated: boolean;
}

export interface TaxRateRow {
  code: string;
  label_el: string;
  label_en: string;
  sort_order: number;
  notes: string | null;
  rate_percent: number | null;
  effective_from: string | null;
  effective_to: string | null;
  confirmed_on: string | null;
  source_note: string | null;
  status: TaxRateStatus;
  asset_count: number;
}

export interface BasisDifferenceAsset {
  asset_id: string;
  name: string;
  category: string | null;
  book_method: string | null;
  book_accumulated: number | null;
  tax_category: string | null;
  tax_rate_percent: number | null;
  tax_accumulated: number | null;
  tax_status: TaxDepreciationStatus;
  tax_reason: string;
  difference: number | null;
}

export interface BasisDifference {
  as_of: string;
  status: 'ok' | 'nothing_comparable' | 'no_assets';
  reason: string;
  book_total?: number;
  tax_total?: number;
  difference?: number;
  comparable_assets?: number;
  unknown_assets?: number;
  unknown_reason?: string;
  adjustment_document?: string;
  assets: BasisDifferenceAsset[];
}

export const TAX_STATUS_LABEL: Record<TaxDepreciationStatus, string> = {
  ok: 'On the statutory rate',
  no_tax_category: 'No statutory category',
  no_cost: 'No acquisition cost',
  no_service_date: 'No in-service date',
  not_started: 'Starts next month',
  rate_not_configured: 'Rate not on file',
};

export const TAX_RATE_STATUS_LABEL: Record<TaxRateStatus, string> = {
  in_force: 'In force',
  unconfirmed: 'Recorded, not confirmed',
  not_configured: 'Not configured',
};

/**
 * A tax basis that is not `ok` is UNKNOWN, and an unknown is never nil. Treating it as zero
 * understates the adjustment by exactly the amount nobody has checked.
 */
export const taxBasisIsUnknown = (status: TaxDepreciationStatus): boolean => status !== 'ok';

/** A rate somebody typed and nobody confirmed is still not the statutory rate. */
export const rateIsConfirmed = (row: Pick<TaxRateRow, 'rate_percent' | 'confirmed_on'>): boolean =>
  row.rate_percent != null && !!row.confirmed_on;

export const rateNeedsAttention = (row: TaxRateRow): boolean =>
  row.asset_count > 0 && !rateIsConfirmed(row);

/**
 * The two bases legitimately differ, and where they do the difference is a real adjustment on the
 * income-tax return. It is not a VAT figure and does not belong to a VAT period.
 */
export const ADJUSTMENT_DOCUMENT = 'εγγραφή τακτοποίησης — income-tax return';

export const differenceIsReportable = (d: BasisDifference | null): boolean =>
  !!d && d.status === 'ok' && (d.comparable_assets ?? 0) > 0;

export const LEGAL_BASIS = 'άρθρο 24 ν.4172/2013';
