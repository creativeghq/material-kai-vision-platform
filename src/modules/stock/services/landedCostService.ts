/**
 * Landed cost, apportioned over a container (#422).
 *
 * The allocation object is the CONTAINER, not the purchase order: one container often holds several
 * POs and one PO can span containers. Greek practice calls the same thing a «φάκελος εισαγωγής».
 */
import { supabase } from '@/integrations/supabase/client';

import type { FolderAllocation, AllocationBasis } from '@/modules/stock/landedCostRules';

export type {
  AllocationBasis, AllocationStatus, AllocationLine, FolderAllocation,
} from '@/modules/stock/landedCostRules';
export {
  BASIS_LABEL, allocationIsForecast, allocationRefused, onCostVariance,
} from '@/modules/stock/landedCostRules';

export interface ImportFolder {
  id: string;
  workspace_id: string;
  reference: string;
  container_number: string | null;
  status: 'open' | 'received' | 'closed';
  allocation_basis: AllocationBasis;
  currency: string;
  expected_arrival: string | null;
  arrived_on: string | null;
  notes: string | null;
}

export interface FolderCost {
  id: string;
  folder_id: string;
  kind: string;
  stage: 'forecast' | 'actual';
  amount: number;
  currency: string;
  invoice_reference: string | null;
  incurred_on: string | null;
}

export const landedCostService = {
  async listFolders(workspaceId: string): Promise<ImportFolder[]> {
    const { data, error } = await supabase
      .from('import_folders')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ImportFolder[];
  },

  async createFolder(f: Partial<ImportFolder> & { workspace_id: string; reference: string }) {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('import_folders')
      .insert({ ...f, created_by: auth?.user?.id ?? null })
      .select('*')
      .single();
    if (error) throw error;
    return data as ImportFolder;
  },

  async listCosts(folderId: string): Promise<FolderCost[]> {
    const { data, error } = await supabase
      .from('import_folder_costs')
      .select('*')
      .eq('folder_id', folderId)
      .order('stage')
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as FolderCost[];
  },

  async addCost(c: Partial<FolderCost> & { folder_id: string; amount: number }) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('import_folder_costs')
      .insert({ ...c, created_by: auth?.user?.id ?? null });
    if (error) throw error;
  },

  /** Purchase orders that could have arrived in this container. */
  async attachableOrders(workspaceId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('order_type', 'purchase')
      .in('status', ['confirmed', 'partially_fulfilled', 'fulfilled'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as { id: string; order_number: string | null; status: string }[];
  },

  /** Attach a purchase order to the container it arrived in. */
  async attachOrder(folderId: string, orderId: string) {
    const { error } = await supabase
      .from('import_folder_orders')
      .insert({ folder_id: folderId, order_id: orderId });
    if (error) throw error;
  },

  /** The apportionment, derived once. */
  async allocation(folderId: string): Promise<FolderAllocation> {
    const { data, error } = await supabase.rpc('import_folder_allocation' as never, {
      p_folder: folderId,
    } as never);
    if (error) throw error;
    return data as unknown as FolderAllocation;
  },
};
