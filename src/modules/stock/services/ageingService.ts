/**
 * Stock ageing and the obsolescence provision (#438).
 *
 * The optimisation vendors can compute the buckets and cannot post the journal; the ERPs that can
 * post it do not compute the buckets. We own the ledger, so we can do both — and the provision is
 * derived once, in SQL, like every other money quantity here.
 */
import { supabase } from '@/integrations/supabase/client';

import type { AgeingPosition } from '@/modules/stock/ageingRules';

export type { AgeingStatus, AgeingRow, AgeingPosition } from '@/modules/stock/ageingRules';
export { describeAge, provisionIsIncomplete, poolsNeedingAttention } from '@/modules/stock/ageingRules';

export interface ProvisionBand {
  id: string;
  workspace_id: string;
  effective_from: string;
  days_from: number;
  days_to: number | null;
  percent: number;
  applies_to: 'any' | 'full_pack' | 'remainder';
}

export const ageingService = {
  /** Every pool, its age, and what the policy in force provides against it. */
  async position(workspaceId: string, asOf?: string): Promise<AgeingPosition> {
    const { data, error } = await supabase.rpc('stock_ageing' as never, {
      p_workspace: workspaceId,
      p_as_of: asOf ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as AgeingPosition;
  },

  async bands(workspaceId: string): Promise<ProvisionBand[]> {
    const { data, error } = await supabase
      .from('stock_provision_bands')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('effective_from', { ascending: false })
      .order('days_from');
    if (error) throw error;
    return (data ?? []) as ProvisionBand[];
  },

  /**
   * Put a policy in force from a date.
   *
   * Dated rather than edited in place, because changing the bands changes what past reporting
   * said — and a provision that silently re-states last quarter is worse than none.
   */
  async setPolicy(
    workspaceId: string,
    effectiveFrom: string,
    bands: { days_from: number; days_to: number | null; percent: number; applies_to?: ProvisionBand['applies_to'] }[],
  ) {
    const { data: auth } = await supabase.auth.getUser();
    const { error: pErr } = await supabase.from('stock_provision_policies').upsert(
      { workspace_id: workspaceId, effective_from: effectiveFrom, created_by: auth?.user?.id ?? null },
      { onConflict: 'workspace_id,effective_from' },
    );
    if (pErr) throw pErr;
    const { error } = await supabase.from('stock_provision_bands').insert(
      bands.map((b) => ({ ...b, workspace_id: workspaceId, effective_from: effectiveFrom, applies_to: b.applies_to ?? 'any' })),
    );
    if (error) throw error;
  },

  /** Record that the factory has dropped a range — the earliest signal there is. */
  async markDiscontinued(productId: string, on: string | null) {
    const { error } = await supabase
      .from('products')
      .update({ discontinued_by_supplier_on: on })
      .eq('id', productId);
    if (error) throw error;
  },
};
