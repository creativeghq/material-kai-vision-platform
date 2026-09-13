/**
 * CBAM and the regulatory role (#429, #430).
 *
 * Ceramics are not in Annex I at all — what puts a tile importer inside CBAM is the metal that
 * travels with them: fixings, frames, profiles, trims. The threshold is 50 tonnes of NET MASS per
 * importer per calendar year and it is RETROACTIVE, so the position is re-derived over the whole
 * year in SQL rather than stamped on a consignment.
 */
import { supabase } from '@/integrations/supabase/client';

export type CbamScopeStatus =
  | 'in_scope'
  | 'out_of_scope'
  | 'unlisted'
  | 'undeclared'
  /** Annex III point 1 — Iceland, Liechtenstein, Norway, Switzerland and five territories. */
  | 'exempt_origin';

export interface CbamScopeVerdict {
  status: CbamScopeStatus;
  cn_prefix: string | null;
  description: string | null;
  reason: string | null;
}

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

export interface CbamOrderLine {
  order_item_id: string;
  description: string | null;
  cn: string | null;
  origin: string | null;
  net_mass_kg: number | null;
  scope: CbamScopeStatus;
  heading: string | null;
  scope_reason: string | null;
  already_recorded: boolean;
}

export interface CbamOrderPreview {
  status: 'ok' | 'not_found';
  in_scope_lines?: number;
  in_scope_mass_kg?: number;
  unweighed_lines?: number;
  undecided_lines?: number;
  exempt_origin_lines?: number;
  already_recorded_lines?: number;
  lines?: CbamOrderLine[];
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

export type RegulatoryRole = 'manufacturer' | 'importer' | 'distributor';

export interface RegulatoryRoleVerdict {
  role: RegulatoryRole | null;
  status: 'derived' | 'unknown_origin' | 'not_found';
  origin?: string | null;
  legal_basis?: string;
  reason: string;
}

export const cbamService = {
  /** The year's position for a workspace. */
  async yearPosition(workspaceId: string, year?: number): Promise<CbamYearPosition> {
    const { data, error } = await supabase.rpc('cbam_year_position' as never, {
      p_workspace: workspaceId,
      p_year: year ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as CbamYearPosition;
  },

  /** What an order would contribute, line by line, and what it cannot answer. */
  async orderPreview(orderId: string): Promise<CbamOrderPreview> {
    const { data, error } = await supabase.rpc('cbam_order_preview' as never, {
      p_order: orderId,
    } as never);
    if (error) throw error;
    return data as unknown as CbamOrderPreview;
  },

  /**
   * Promote an order's in-scope lines into the register.
   *
   * Idempotent on the order line, so a retry after a dropped connection records nothing a second
   * time — a doubled net mass is a valid number and nothing downstream could catch it.
   */
  async recordFromOrder(orderId: string, entryDate: string, declarationRef?: string) {
    const { data, error } = await supabase.rpc('record_cbam_entries_from_order' as never, {
      p_order: orderId,
      p_entry_date: entryDate,
      p_declaration_ref: declarationRef ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as { recorded: number; already_present: number; position: CbamYearPosition };
  },

  /** Which economic operator we are for this product, derived from its non-preferential origin. */
  async regulatoryRole(productId: string): Promise<RegulatoryRoleVerdict> {
    const { data, error } = await supabase.rpc('product_regulatory_role' as never, {
      p_product: productId,
    } as never);
    if (error) throw error;
    return data as unknown as RegulatoryRoleVerdict;
  },

  /**
   * The reconciliation extract.
   *
   * There is no CBAM API — IR 2024/3210 art. 9(1) makes the Declarants Portal the unique entry
   * point and it takes manual upload only. So this is shaped like the portal’s own “Query goods
   * and emissions” screen, to be tied out against it rather than sent anywhere.
   */
  async portalExtract(workspaceId: string, year?: number): Promise<CbamExtractRow[]> {
    const { data, error } = await supabase.rpc('cbam_portal_extract' as never, {
      p_workspace: workspaceId,
      p_year: year ?? null,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as CbamExtractRow[];
  },

  /** The Annex I table, so an operator can check it rather than trust it. */
  async scopeTable() {
    const { data, error } = await supabase
      .from('cbam_cn_scope')
      .select('*')
      .order('in_scope', { ascending: false })
      .order('cn_prefix');
    if (error) throw error;
    return data ?? [];
  },
};

/**
 * Mass, as tonnes, for a reader.
 *
 * An absent figure renders as a dash and NEVER as 0 t: an undecidable year is not a light one,
 * and “0 t of 50 t” is the most reassuring possible way to say “we do not know”.
 */
export function formatTonnes(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} t`;
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
 * effectively paid, and a zero would read as “checked, and there was none”.
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

/**
 * The obligations each role carries, in the order someone has to do them.
 *
 * Held here rather than in prose on the card so the importer list cannot quietly become the
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
