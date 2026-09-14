/**
 * Allowances, selections and the change order an overage becomes (#431).
 *
 * The variance is derived in SQL once — an overage and an underage are the same subtraction with
 * different consequences, and computing it twice is how one screen says "on budget" while another
 * says "over" about the same room.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  SelectionPosition, ProjectSelection, ClientViewSettings, SelectionStatus,
} from '@/modules/projects/selectionRules';

export type {
  SelectionStatus, SelectionPositionStatus, AllowanceRow, SelectionPosition, ProjectSelection,
  ClientViewSettings,
} from '@/modules/projects/selectionRules';
export {
  SELECTION_STATUS_LABEL, POSITION_LABEL, allowanceIsFrozen, isOverage, isUnderage,
  overageNeedsBilling, positionNeedsAttention, totalIsAFloor, clientMaySeeCost,
  FROZEN_IS_THE_POINT, UNDERAGE_IS_NOT_A_CHANGE_ORDER, COMMITTED_VS_PENDING,
} from '@/modules/projects/selectionRules';

export const selectionsService = {
  async position(projectId: string): Promise<SelectionPosition> {
    const { data, error } = await supabase.rpc('project_selection_position' as never, {
      p_project: projectId,
    } as never);
    if (error) throw error;
    return data as unknown as SelectionPosition;
  },

  async selections(projectId: string): Promise<ProjectSelection[]> {
    const { data, error } = await supabase
      .from('project_selections')
      .select('id, allowance_id, room_id, product_id, stock_pool_id, description, quantity, unit, unit_price, currency, status, client_approved_at, order_item_id, variation_id')
      .eq('project_id', projectId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as unknown as ProjectSelection[];
  },

  async createAllowance(input: {
    workspaceId: string; projectId: string; roomId?: string | null;
    categoryKey?: string | null; label: string; amount: number; currency?: string;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('project_allowances').insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      room_id: input.roomId ?? null,
      category_key: input.categoryKey ?? null,
      label: input.label,
      amount: input.amount,
      currency: input.currency ?? 'EUR',
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  /** Freezing is one-way. The server refuses every later edit to the amount. */
  async freezeAllowance(allowanceId: string, estimateQuoteId?: string | null): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('project_allowances')
      .update({
        frozen_at: new Date().toISOString(),
        frozen_by: auth?.user?.id ?? null,
        estimate_quote_id: estimateQuoteId ?? null,
      })
      .eq('id', allowanceId)
      .is('frozen_at', null);
    if (error) throw error;
  },

  async createSelection(input: {
    workspaceId: string; projectId: string; allowanceId?: string | null;
    roomId?: string | null; productId?: string | null; stockPoolId?: string | null;
    description: string; quantity: number; unit?: string | null; unitPrice?: number | null;
    currency?: string;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('project_selections').insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      allowance_id: input.allowanceId ?? null,
      room_id: input.roomId ?? null,
      product_id: input.productId ?? null,
      stock_pool_id: input.stockPoolId ?? null,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      unit_price: input.unitPrice ?? null,
      currency: input.currency ?? 'EUR',
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  async setSelectionStatus(
    selectionId: string, status: SelectionStatus, approvedName?: string | null,
  ): Promise<void> {
    const { error } = await supabase
      .from('project_selections')
      .update({
        status,
        client_approved_at: status === 'client_approved' ? new Date().toISOString() : null,
        client_approved_name: status === 'client_approved' ? (approvedName ?? null) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectionId);
    if (error) throw error;
  },

  /** One writer. A second press finds the change order already there rather than raising a
   *  duplicate the customer gets billed for twice. */
  async billOverage(selectionId: string): Promise<{
    ok: boolean; replayed?: boolean; variation_id: string | null; variance?: number;
    reference?: string; reason: string;
  }> {
    const { data, error } = await supabase.rpc('raise_variation_for_selection' as never, {
      p_selection: selectionId,
    } as never);
    if (error) throw error;
    return data as unknown as {
      ok: boolean; replayed?: boolean; variation_id: string | null; variance?: number;
      reference?: string; reason: string;
    };
  },

  async clientView(projectId: string): Promise<ClientViewSettings> {
    const { data, error } = await supabase
      .from('projects')
      .select('client_sees_specs, client_sees_pricing, client_sees_cost')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? {
      client_sees_specs: true, client_sees_pricing: true, client_sees_cost: false,
    }) as ClientViewSettings;
  },

  async setClientView(projectId: string, patch: Partial<ClientViewSettings>): Promise<void> {
    const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
    if (error) throw error;
  },
};
