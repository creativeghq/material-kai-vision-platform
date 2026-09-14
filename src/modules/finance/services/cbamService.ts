/**
 * CBAM and the regulatory role (#429, #430).
 *
 * Ceramics are not in Annex I at all — what puts a tile importer inside CBAM is the metal that
 * travels with them: fixings, frames, profiles, trims. The threshold is 50 tonnes of NET MASS per
 * importer per calendar year and it is RETROACTIVE, so the position is re-derived over the whole
 * year in SQL rather than stamped on a consignment. What a verdict MEANS lives in
 * `complianceRules`, which is import-free so the guard test can reach it without a database.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  CbamYearPosition, CbamExtractRow, CbamScopeStatus, RegulatoryRoleVerdict,
} from '@/modules/finance/complianceRules';

export type {
  CbamScopeStatus, CbamYearStatus, CbamYearPosition, CbamExtractRow,
  RegulatoryRole, RegulatoryRoleVerdict,
} from '@/modules/finance/complianceRules';
export {
  cbamNeedsAttention, cbamIsWatched, formatTonnes, extractToRows, ROLE_OBLIGATIONS,
} from '@/modules/finance/complianceRules';

export interface CbamScopeVerdict {
  status: CbamScopeStatus;
  cn_prefix: string | null;
  description: string | null;
  reason: string | null;
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

  /**
   * The reconciliation extract.
   *
   * There is no CBAM API — IR 2024/3210 art. 9(1) makes the Declarants Portal the unique entry
   * point and it takes manual upload only. So this is shaped like the portal's own "Query goods
   * and emissions" screen, to be tied out against it rather than sent anywhere.
   */
  async portalExtract(workspaceId: string, year?: number): Promise<CbamExtractRow[]> {
    const { data, error } = await supabase.rpc('cbam_portal_extract' as never, {
      p_workspace: workspaceId,
      p_year: year ?? null,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as CbamExtractRow[];
  },

  /** Which economic operator we are for this product, derived from its non-preferential origin. */
  async regulatoryRole(productId: string): Promise<RegulatoryRoleVerdict> {
    const { data, error } = await supabase.rpc('product_regulatory_role' as never, {
      p_product: productId,
    } as never);
    if (error) throw error;
    return data as unknown as RegulatoryRoleVerdict;
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
