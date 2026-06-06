/**
 * #203 — sellable services. A service is a `products` row with item_type='service'
 * (no stock, no image suite) so it reuses the pricing/line/myDATA machinery. Price lives
 * in product_prices (per workspace); myDATA VAT + income classification live on the product.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  list_price: number | null;
  currency: string;
  vat_category: number | null;
  income_classification_type: string | null;
  income_classification_category: string | null;
}

export interface ServiceInput {
  name: string;
  description?: string;
  unit?: string;
  price?: number | null;
  currency?: string;
  vatCategory?: number | null;
  incType?: string | null;
  incCat?: string | null;
}

export const servicesService = {
  async list(workspaceId: string): Promise<ServiceItem[]> {
    const { data: rows, error } = await supabase
      .from('products')
      .select('id, name, description, metadata, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category')
      .eq('workspace_id', workspaceId)
      .eq('item_type', 'service')
      .order('name', { ascending: true });
    if (error) throw error;
    const ids = (rows ?? []).map((r: any) => r.id);
    const priceMap: Record<string, { list_price: number | null; currency: string; unit: string | null }> = {};
    if (ids.length) {
      const { data: prices } = await supabase
        .from('product_prices')
        .select('product_id, list_price, currency, unit')
        .eq('workspace_id', workspaceId)
        .in('product_id', ids);
      for (const p of prices ?? []) priceMap[(p as any).product_id] = p as any;
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      unit: priceMap[r.id]?.unit ?? r.metadata?.unit ?? null,
      list_price: priceMap[r.id]?.list_price ?? null,
      currency: priceMap[r.id]?.currency ?? 'EUR',
      vat_category: r.mydata_vat_category ?? null,
      income_classification_type: r.mydata_income_classification_type ?? null,
      income_classification_category: r.mydata_income_classification_category ?? null,
    }));
  },

  async create(workspaceId: string, input: ServiceInput): Promise<string> {
    const { data: prod, error } = await supabase
      .from('products')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        description: input.description || null,
        item_type: 'service',
        metadata: { unit: input.unit || null, item_type: 'service' },
        mydata_vat_category: input.vatCategory ?? null,
        mydata_income_classification_type: input.incType || null,
        mydata_income_classification_category: input.incCat || null,
      } as any)
      .select('id')
      .single();
    if (error) throw error;
    const productId = (prod as any).id;
    await this._writePrice(workspaceId, productId, input);
    return productId;
  },

  async update(workspaceId: string, productId: string, input: ServiceInput): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({
        name: input.name,
        description: input.description || null,
        metadata: { unit: input.unit || null, item_type: 'service' },
        mydata_vat_category: input.vatCategory ?? null,
        mydata_income_classification_type: input.incType || null,
        mydata_income_classification_category: input.incCat || null,
      } as any)
      .eq('id', productId);
    if (error) throw error;
    await this._writePrice(workspaceId, productId, input);
  },

  async remove(productId: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
  },

  async _writePrice(workspaceId: string, productId: string, input: ServiceInput): Promise<void> {
    if (input.price == null) return;
    await supabase.from('product_prices').upsert({
      workspace_id: workspaceId,
      product_id: productId,
      list_price: input.price,
      currency: input.currency || 'EUR',
      unit: input.unit || null,
    }, { onConflict: 'workspace_id,product_id' });
  },
};
