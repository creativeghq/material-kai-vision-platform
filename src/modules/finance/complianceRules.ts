/**
 * Product-regulation verdicts, with no I/O (#429, #430, #449, #450).
 *
 * IMPORT-FREE on purpose. Every verdict here is DERIVED in SQL; the services that fetch them pull
 * in the Supabase client, which fails closed with no environment configured, so a hermetic unit
 * test cannot import one. These are the rules about what a verdict MEANS, which have no
 * dependencies at all — and they are the half that has to be guarded.
 */

// ── CBAM (#429) ──────────────────────────────────────────────────────────────

export type CbamScopeStatus =
  | 'in_scope'
  | 'out_of_scope'
  | 'unlisted'
  | 'undeclared'
  /** Annex III point 1 — Iceland, Liechtenstein, Norway, Switzerland and five territories. */
  | 'exempt_origin';

export type CbamYearStatus =
  | 'liable'
  /** Past the ratio at which the Commission circulates us to the national authority. */
  | 'watch'
  | 'below_threshold'
  | 'undecidable'
  | 'no_entries'
  | 'no_workspace';

export interface CbamYearPosition {
  status: CbamYearStatus;
  year?: number;
  threshold_kg?: number;
  watch_kg?: number;
  /** NULL when the year cannot be totalled — never 0, which would read as "nothing imported". */
  net_mass_kg?: number | null;
  measured_kg?: number;
  remaining_kg?: number;
  in_scope_entries?: number;
  unmeasured_entries?: number;
  unlisted_entries?: number;
  exempt_origin_entries?: number;
  first_entry_date?: string | null;
  crossed_on?: string | null;
  retroactive_from?: string | null;
  legal_basis?: string;
  reason: string;
}

export interface CbamExtractRow {
  sector: string;
  goods_code: string;
  country_of_origin: string;
  entries: number;
  net_mass_kg: number | null;
  /** NULL until the Commission publishes default prices (art. 9(4), from 2027). */
  carbon_price_paid_eur: number | null;
}

/**
 * Mass, as tonnes, for a reader.
 *
 * An absent figure renders as a dash and NEVER as 0 t: an undecidable year is not a light one,
 * and "0 t of 50 t" is the most reassuring possible way to say "we do not know".
 */
export function formatTonnes(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  // Deliberately not `toLocaleString`: the separator would then be the viewer's, and the same
  // tonnage would read differently for the operator and the auditor looking at one screen.
  return `${Math.round((kg / 1000) * 1000) / 1000} t`;
}

/**
 * Does this year's position need someone to act?
 *
 * `undecidable` does — the year cannot be totalled, and an untotalled year is not a light one.
 * `liable` does too: the obligation has already arrived, retroactively. `below_threshold` and
 * `no_entries` are answers.
 */
export function cbamNeedsAttention(p: CbamYearPosition | null): boolean {
  return p?.status === 'undecidable' || p?.status === 'liable';
}

/**
 * Past the ratio at which the Commission circulates us to the national authority.
 *
 * Separate from {@link cbamNeedsAttention} because it is a different instruction: the year is
 * still clear, and what is running out is the 120 days an authorisation takes.
 */
export function cbamIsWatched(p: CbamYearPosition | null): boolean {
  return p?.status === 'watch';
}

/**
 * The extract as rows, for tying our figures out against the portal.
 *
 * An absent carbon price is written as an EMPTY cell, never 0: art. 9(1) counts only a price
 * effectively paid, and a zero would read as "checked, and there was none".
 */
export function extractToRows(rows: CbamExtractRow[]): string[][] {
  const cell = (v: string | number | null) => (v == null ? '' : String(v));
  return [
    ['Sector', 'Goods code', 'Country of origin', 'Entries', 'Net mass (kg)', 'Carbon price paid (EUR)'],
    ...rows.map((r) => [
      cell(r.sector), cell(r.goods_code), cell(r.country_of_origin),
      cell(r.entries), cell(r.net_mass_kg), cell(r.carbon_price_paid_eur),
    ]),
  ];
}

// ── Regulatory role (#430) ───────────────────────────────────────────────────

export type RegulatoryRole = 'manufacturer' | 'importer' | 'distributor';

export interface RegulatoryRoleVerdict {
  role: RegulatoryRole | null;
  status: 'derived' | 'unknown_origin' | 'not_found';
  origin?: string | null;
  legal_basis?: string;
  reason: string;
}

/**
 * The obligations each role carries, in the order someone has to do them.
 *
 * Held here rather than in prose on a card so the importer list cannot quietly become the
 * distributor list — they differ by exactly the things that cost money.
 */
export const ROLE_OBLIGATIONS: Record<RegulatoryRole, string[]> = {
  manufacturer: [
    'Draw up the Declaration of Performance and the technical documentation',
    'Affix the CE marking and keep the file for 10 years',
    'Run the applicable AVCP system with a notified body where one is required',
  ],
  importer: [
    'Verify the manufacturer ran AVCP and drew up the DoP before placing it on the market',
    'Put our own name, registered trade name and address on the product or its packaging',
    'Keep a copy of the DoP and the technical documentation for 10 years',
    'Ensure storage and transport do not put the declared performance at risk',
  ],
  distributor: [
    'Check the CE marking and the DoP are present and in the right language',
    'Check the importer put their name and address on it',
    'Keep the paper with the goods; do not alter the marking',
  ],
};

// ── Declaration of performance (#430) ────────────────────────────────────────

export type DopcStatus =
  | 'ok'
  | 'missing'
  | 'unlinked'
  | 'translation_missing'
  | 'translation_only'
  | 'not_found';

export interface DopcVerdict {
  status: DopcStatus;
  product_type_code?: string;
  versions?: number;
  current_version?: string | null;
  language?: string;
  reason: string;
}

/**
 * The literal word Annex V §9(b) requires where no performance is declared.
 *
 * A blank, a 0 or an em-dash is wrong on the face of the document. This is the platform's own "a
 * metric is a value or a stated reason there is no value" rule, written into law.
 */
export const NO_PERFORMANCE_DECLARED = 'NULL';

/**
 * How a declared value is printed.
 *
 * An absent performance is the literal string `NULL` and is passed through unchanged — never
 * softened into a dash, a blank or a zero, any of which makes the document non-compliant.
 */
export function formatDeclaredValue(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v === '' ? NO_PERFORMANCE_DECLARED : v;
}

/** Whether the DoPC position should stop someone rather than merely inform them. */
export function dopcNeedsAttention(v: DopcVerdict | null): boolean {
  return v != null && v.status !== 'ok' && v.status !== 'not_found';
}
