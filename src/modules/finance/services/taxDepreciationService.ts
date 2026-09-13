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
   * year that was already filed on the old rate.
   */
  async recordRate(input: TaxRateInput): Promise<void> {
    const { error: closeError } = await supabase
      .from('tax_depreciation_rates')
      .update({ effective_to: input.effectiveFrom })
      .eq('workspace_id', input.workspaceId)
      .eq('category_code', input.categoryCode)
      .is('effective_to', null)
      .lt('effective_from', input.effectiveFrom);
    if (closeError) throw closeError;

    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('tax_depreciation_rates').insert({
      workspace_id: input.workspaceId,
      category_code: input.categoryCode,
      rate_percent: input.ratePercent,
      effective_from: input.effectiveFrom,
      source_note: input.sourceNote ?? null,
      confirmed_on: input.confirmedOn ?? null,
      confirmed_by: input.confirmedOn ? (auth?.user?.id ?? null) : null,
    });
    if (error) throw error;
  },
};
