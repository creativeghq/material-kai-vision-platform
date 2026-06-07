/**
 * Delivery notes (Δελτίο Αποστολής). A note moves goods to a customer; issuing decrements
 * warehouse stock for lines linked to a warehouse item. myDATA 9.3 transmission is a
 * follow-up — this covers the internal note + stock-out + list.
 */
import { supabase } from '@/integrations/supabase/client';

export interface DeliveryNote {
  id: string;
  workspace_id: string;
  delivery_note_number: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  status: 'draft' | 'issued' | 'invoiced' | 'void';
  issued_at: string | null;
  notes: string | null;
  fiscal_mark: string | null;
  created_at: string;
}

export interface DeliveryLineInput {
  warehouse_item_id?: string | null;
  product_id?: string | null;
  description: string;
  sku?: string | null;
  quantity: number;
  unit?: string | null;
}

export interface WarehousePick {
  id: string; name: string; sku: string | null; unit: string | null; qty_on_hand: number | null; product_id: string | null;
}

export const deliveryNotesService = {
  async list(workspaceId: string): Promise<DeliveryNote[]> {
    const { data, error } = await supabase
      .from('delivery_notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DeliveryNote[];
  },

  async listWarehouse(workspaceId: string): Promise<WarehousePick[]> {
    const { data } = await supabase
      .from('warehouse_items')
      .select('id, name, sku, unit, qty_on_hand, product_id')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true });
    return (data ?? []) as WarehousePick[];
  },

  async create(workspaceId: string, input: {
    customerCompanyId?: string | null;
    customerContactId?: string | null;
    notes?: string;
    lines: DeliveryLineInput[];
    transportDate?: string;
    transportTime?: string;
    vehicleNumber?: string;
    movePurpose?: string;
    responsible?: string;
    shipFrom?: string;
    shipTo?: string;
    relatedDocument?: string;
  }): Promise<string> {
    const { data: dn, error } = await supabase
      .from('delivery_notes')
      .insert({
        workspace_id: workspaceId,
        customer_company_id: input.customerCompanyId ?? null,
        customer_contact_id: input.customerContactId ?? null,
        notes: input.notes || null,
        transport_date: input.transportDate || null,
        transport_time: input.transportTime || null,
        vehicle_number: input.vehicleNumber || null,
        move_purpose: input.movePurpose || null,
        responsible: input.responsible || null,
        ship_from: input.shipFrom || null,
        ship_to: input.shipTo || null,
        related_document: input.relatedDocument || null,
      } as any)
      .select('id')
      .single();
    if (error) throw error;
    const id = (dn as any).id;
    const items = input.lines.filter((l) => l.description.trim() && l.quantity > 0).map((l) => ({
      delivery_note_id: id,
      warehouse_item_id: l.warehouse_item_id ?? null,
      product_id: l.product_id ?? null,
      description: l.description.trim(),
      sku: l.sku ?? null,
      quantity: l.quantity,
      unit: l.unit ?? null,
    }));
    if (items.length) {
      const { error: itErr } = await supabase.from('delivery_note_items').insert(items);
      if (itErr) throw itErr;
    }
    return id;
  },

  async issue(id: string): Promise<void> {
    const { error } = await supabase.rpc('issue_delivery_note', { p_id: id });
    if (error) throw error;
  },

  /** Convert an issued delivery note into a draft invoice (prices via the cascade resolver). */
  async toInvoice(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('delivery_note_to_invoice', { p_id: id });
    if (error) throw error;
    return data as string;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('delivery_notes').delete().eq('id', id);
    if (error) throw error;
  },
};
