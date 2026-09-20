import { supabase } from '@/integrations/supabase/client';

export type ShipmentStatus = 'ready' | 'handed_over' | 'in_transit' | 'delivered' | 'returned' | 'lost' | 'cancelled';

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'ready', 'handed_over', 'in_transit', 'delivered', 'returned', 'lost', 'cancelled',
];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  ready: 'Ready to ship',
  handed_over: 'Handed to carrier',
  in_transit: 'In transit',
  delivered: 'Delivered',
  returned: 'Returned',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

export interface Shipment {
  id: string;
  order_id: string | null;
  delivery_note_id: string | null;
  carrier_code: string;
  carrier_name_other: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: ShipmentStatus;
  parcels: number;
  weight_kg: number | null;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
}

const COLUMNS = 'id, order_id, delivery_note_id, carrier_code, carrier_name_other, tracking_number, '
  + 'tracking_url, status, parcels, weight_kg, shipped_at, delivered_at, notes, created_at';

export const shipmentsService = {
  async forOrder(orderId: string): Promise<Shipment[]> {
    const { data, error } = await supabase.from('order_shipments').select(COLUMNS)
      .eq('order_id', orderId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Shipment[];
  },

  async recent(workspaceId: string, limit = 100): Promise<Shipment[]> {
    const { data, error } = await supabase.from('order_shipments').select(COLUMNS)
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as Shipment[];
  },

  async create(workspaceId: string, input: {
    order_id?: string | null;
    delivery_note_id?: string | null;
    carrier_code: string;
    carrier_name_other?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
    parcels?: number;
    weight_kg?: number | null;
    notes?: string | null;
  }): Promise<Shipment> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('order_shipments').insert({
      workspace_id: workspaceId,
      order_id: input.order_id ?? null,
      delivery_note_id: input.delivery_note_id ?? null,
      carrier_code: input.carrier_code,
      carrier_name_other: input.carrier_name_other ?? null,
      tracking_number: input.tracking_number?.trim() || null,
      tracking_url: input.tracking_url?.trim() || null,
      parcels: input.parcels ?? 1,
      weight_kg: input.weight_kg ?? null,
      notes: input.notes ?? null,
      created_by: auth?.user?.id ?? null,
    }).select(COLUMNS).single();
    if (error) throw error;
    return data as Shipment;
  },

  async setStatus(id: string, status: ShipmentStatus): Promise<void> {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'handed_over') patch.shipped_at = new Date().toISOString();
    if (status === 'delivered') patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from('order_shipments').update(patch).eq('id', id);
    if (error) throw error;
  },

  async update(id: string, patch: Partial<Pick<Shipment, 'tracking_number' | 'tracking_url' | 'carrier_code' | 'parcels' | 'weight_kg' | 'notes'>>): Promise<void> {
    const { error } = await supabase.from('order_shipments').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('order_shipments').delete().eq('id', id);
    if (error) throw error;
  },
};
