/**
 * Reads the tax depreciation basis and the difference from the book one (#451).
 *
 * Both schedules are derived in SQL against the rate in force in each month, so a rate change is
 * piecewise rather than retroactive. Nothing here recomputes either.
 */
import { supabase } from '@/integrations/supabase/client';

import type { AssetTaxDepreciation, TaxRateRow, BasisDifference } from '@/modules/finance/taxDepreciationRules';

export type {
  TaxDepreciationStatus, TaxRateStatus, AssetTaxDepreciation, TaxRateRow,
  BasisDifference, BasisDifferenceAsset,
} from '@/modules/finance/taxDepreciationRules';
export {
  TAX_STATUS_LABEL, TAX_RATE_STATUS_LABEL, taxBasisIsUnknown, rateIsConfirmed,
  rateNeedsAttention, differenceIsReportable, ADJUSTMENT_DOCUMENT, LEGAL_BASIS,
  rateDiffersFromStatutory, prefillableCategories, suggestTaxCategory, formatRate,
} from '@/modules/finance/taxDepreciationRules';

export interface TaxRateInput {
  workspaceId: string;
  categoryCode: string;
  ratePercent: number;
  effectiveFrom: string;
  sourceNote?: string | null;
  confirmedOn?: string | null;
}

export const taxDepreciationService = {
  async rateTable(workspaceId: string, on?: string): Promise<TaxRateRow[]> {
    const { data, error } = await supabase.rpc('tax_depreciation_rate_table' as never, {
      p_workspace: workspaceId, p_on: on ?? null,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as TaxRateRow[];
  },

  async forAssets(assetIds: string[], asOf?: string): Promise<AssetTaxDepreciation[]> {
    if (assetIds.length === 0) return [];
    const { data, error } = await supabase.rpc('get_asset_tax_depreciation' as never, {
      p_asset_ids: assetIds, p_as_of: asOf ?? null,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as AssetTaxDepreciation[];
  },

  async basisDifference(workspaceId: string, asOf?: string): Promise<BasisDifference> {
    const { data, error } = await supabase.rpc('asset_basis_difference' as never, {
      p_workspace: workspaceId, p_as_of: asOf ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as BasisDifference;
  },

  /**
   * A rate change is a NEW ROW closing the previous one, never an edit: editing one rewrites every
   * year that was already filed on the old rate. Same effective date = correcting that entry.
   */
  async recordRate(input: TaxRateInput): Promise<void> {
    const { error } = await supabase.rpc('record_tax_depreciation_rate' as never, {
      p_workspace: input.workspaceId,
      p_category: input.categoryCode,
      p_rate: input.ratePercent,
      p_effective_from: input.effectiveFrom,
      p_source_note: input.sourceNote ?? null,
      p_confirmed_on: input.confirmedOn ?? null,
    } as never);
    if (error) throw error;
  },

  /** Copies the statutory table into every category with nothing on file; lands unconfirmed. */
  async prefillStatutory(workspaceId: string): Promise<number> {
    const { data, error } = await supabase.rpc('adopt_statutory_tax_rates' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return Number(data ?? 0);
  },

  async confirmRate(workspaceId: string, categoryCode: string, confirmedOn: string, sourceNote?: string | null): Promise<void> {
    const { error } = await supabase.rpc('confirm_tax_depreciation_rate' as never, {
      p_workspace: workspaceId,
      p_category: categoryCode,
      p_confirmed_on: confirmedOn,
      p_source_note: sourceNote ?? null,
    } as never);
    if (error) throw error;
  },
};
