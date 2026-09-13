/**
 * Container fill, bound on weight (#439).
 *
 * The one place in the sweep where the published state of the art is demonstrably wrong for our
 * product — and `product_packaging.kg_per_piece` already existed, so binding correctly was
 * available all along.
 */
import { supabase } from '@/integrations/supabase/client';

import type { ContainerFill } from '@/modules/stock/containerFillRules';

export type { FillStatus, ContainerFill } from '@/modules/stock/containerFillRules';
export { loadIsAFloor, loadIsOverweight, headroomKg } from '@/modules/stock/containerFillRules';

export interface ContainerType {
  code: string;
  name: string;
  payload_kg: number;
  volume_m3: number;
  note: string | null;
}

export const containerFillService = {
  async types(): Promise<ContainerType[]> {
    const { data, error } = await supabase
      .from('container_types')
      .select('*')
      .order('payload_kg', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ContainerType[];
  },

  /** What this proposed order does to a box. */
  async fill(
    workspaceId: string,
    lines: { product_id: string; quantity: number }[],
    container = '20GP',
  ): Promise<ContainerFill> {
    const { data, error } = await supabase.rpc('container_fill' as never, {
      p_workspace: workspaceId,
      p_lines: lines,
      p_container: container,
    } as never);
    if (error) throw error;
    return data as unknown as ContainerFill;
  },
};
