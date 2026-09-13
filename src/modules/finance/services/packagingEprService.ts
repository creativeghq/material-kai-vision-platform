/**
 * Packaging EPR reads and writes (#454).
 *
 * The declaration is derived in SQL ONCE and feeds both the ΕΜΠΑ report and the ΣΣΕΔ declaration.
 * The scheme is required to report any difference between the two to ΕΟΑΝ, so a second tonnage
 * computed a second way is the expensive form of a wrong number nothing raises.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  PackagingDeclaration, PackagingComponent, ReusableAsset, MaterialCategory,
  SupplierEprPosition, EsprPosition, PackagingTier, RecyclabilityGrade,
} from '@/modules/finance/packagingEprRules';

export type {
  PackagingTier, RecyclabilityGrade, DeclarationStatus, SupplierEprStatus, EsprStatus,
  MaterialCategory, DeclarationRow, PackagingDeclaration, PackagingComponent, ReusableAsset,
  SupplierRegistration, SupplierEprRow, SupplierEprPosition, EsprPosition,
} from '@/modules/finance/packagingEprRules';
export {
  TIER_LABEL, GRADE_LABEL, ESPR_LABEL, gradeIsAssessed, componentIsIncomplete,
  recycledContentIsKnown, retentionYearsFor, firstPlacedPieces, totalPlacedPieces,
  declarationNeedsAttention, supplierEprBlocksSale, esprNeedsAnswer,
  PACKAGING_LEGAL_BASIS, AMP_ON_EVERY_DOCUMENT, FOREIGN_EPR_DOES_NOT_EXEMPT,
  CONTAINER_IS_NOT_PACKAGING, REUSE_TARGET_FROM, REUSE_TARGET_PERCENT, WRAPS_STAY_IN_THE_POOL,
} from '@/modules/finance/packagingEprRules';

export const packagingEprService = {
  async materials(): Promise<MaterialCategory[]> {
    const { data, error } = await supabase
      .from('ppwr_material_categories')
      .select('code, label_el, label_en, annex_ii_category, is_composite, sort_order')
      .order('sort_order');
    if (error) throw error;
    return (data ?? []) as unknown as MaterialCategory[];
  },

  async declaration(workspaceId: string, year?: number): Promise<PackagingDeclaration> {
    const { data, error } = await supabase.rpc('packaging_declaration' as never, {
      p_workspace: workspaceId, p_year: year ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as PackagingDeclaration;
  },

  async componentsFor(productId: string): Promise<PackagingComponent[]> {
    const { data, error } = await supabase
      .from('product_packaging_components')
      .select('id, product_id, component_name, tier, material_code, grams_per_unit, pieces_per_unit, is_reusable, recyclability_grade, recyclability_assessed_on, recycled_content_percent, retention_years')
      .eq('product_id', productId)
      .order('tier');
    if (error) throw error;
    return (data ?? []) as unknown as PackagingComponent[];
  },

  async saveComponent(input: {
    workspaceId: string;
    productId: string;
    componentName: string;
    tier: PackagingTier;
    materialCode: string;
    gramsPerUnit?: number | null;
    piecesPerUnit?: number;
    isReusable?: boolean;
    recyclabilityGrade?: RecyclabilityGrade;
    recycledContentPercent?: number | null;
  }): Promise<void> {
    const { error } = await supabase.from('product_packaging_components').upsert({
      workspace_id: input.workspaceId,
      product_id: input.productId,
      component_name: input.componentName,
      tier: input.tier,
      material_code: input.materialCode,
      grams_per_unit: input.gramsPerUnit ?? null,
      pieces_per_unit: input.piecesPerUnit ?? 1,
      is_reusable: input.isReusable ?? false,
      recyclability_grade: input.recyclabilityGrade ?? 'unassessed',
      recycled_content_percent: input.recycledContentPercent ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id,component_name,tier' });
    if (error) throw error;
  },

  async deleteComponent(id: string): Promise<void> {
    const { error } = await supabase.from('product_packaging_components').delete().eq('id', id);
    if (error) throw error;
  },

  async reusableAssets(workspaceId: string, year: number): Promise<ReusableAsset[]> {
    const { data, error } = await supabase
      .from('packaging_reusable_assets')
      .select('id, declaration_year, material_code, asset_name, acquired_new_in_year, acquired_used_in_year, held_from_prior_year, average_cycles, kg_per_piece, first_placed_pieces, total_placed_pieces')
      .eq('workspace_id', workspaceId)
      .eq('declaration_year', year)
      .order('asset_name');
    if (error) throw error;
    return (data ?? []) as unknown as ReusableAsset[];
  },

  async saveReusableAsset(input: {
    workspaceId: string;
    year: number;
    materialCode: string;
    assetName: string;
    acquiredNew: number;
    acquiredUsed: number;
    heldFromPrior: number;
    averageCycles?: number | null;
    kgPerPiece?: number | null;
  }): Promise<void> {
    const { error } = await supabase.from('packaging_reusable_assets').upsert({
      workspace_id: input.workspaceId,
      declaration_year: input.year,
      material_code: input.materialCode,
      asset_name: input.assetName,
      acquired_new_in_year: input.acquiredNew,
      acquired_used_in_year: input.acquiredUsed,
      held_from_prior_year: input.heldFromPrior,
      average_cycles: input.averageCycles ?? null,
      kg_per_piece: input.kgPerPiece ?? null,
    }, { onConflict: 'workspace_id,declaration_year,material_code,asset_name' });
    if (error) throw error;
  },

  async supplierPosition(workspaceId: string): Promise<SupplierEprPosition> {
    const { data, error } = await supabase.rpc('epr_supplier_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as SupplierEprPosition;
  },

  async recordSupplierRegistration(input: {
    workspaceId: string;
    companyId: string;
    memberState: string;
    registrationNumber: string;
    registerUrl?: string | null;
    verified?: boolean;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('supplier_epr_registrations').upsert({
      workspace_id: input.workspaceId,
      company_id: input.companyId,
      member_state: input.memberState.toUpperCase(),
      registration_number: input.registrationNumber,
      register_url: input.registerUrl ?? null,
      verified_at: input.verified ? new Date().toISOString() : null,
      verified_by: input.verified ? (auth?.user?.id ?? null) : null,
    }, { onConflict: 'company_id,member_state' });
    if (error) throw error;
  },

  async esprPosition(workspaceId: string): Promise<EsprPosition> {
    const { data, error } = await supabase.rpc('espr_unsold_goods_duty' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as EsprPosition;
  },

  async setEnterpriseSize(workspaceId: string, size: string): Promise<void> {
    const { error } = await supabase
      .from('finance_settings')
      .update({ enterprise_size: size })
      .eq('workspace_id', workspaceId);
    if (error) throw error;
  },
};
