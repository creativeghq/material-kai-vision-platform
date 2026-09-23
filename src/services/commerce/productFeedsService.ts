import { supabase } from '@/integrations/supabase/client';

export type FeedFormat = 'google' | 'skroutz' | 'generic';

export const FEED_FORMATS: { value: FeedFormat; label: string; hint: string }[] = [
  { value: 'google', label: 'Google / Shopify / WooCommerce', hint: 'RSS 2.0 with the g: namespace — what Google Merchant Center and both webshop importers read.' },
  { value: 'skroutz', label: 'Skroutz', hint: 'Skroutz has its own <mywebstore> dialect and rejects a product missing any mandatory attribute, silently.' },
  { value: 'generic', label: 'Generic', hint: 'The same RSS document, for any other importer that accepts it.' },
];

export type FeedSelectionMode = 'all_published' | 'category' | 'products';

export interface FeedSelection {
  mode: FeedSelectionMode;
  ids?: string[];
}

export interface ProductFeed {
  id: string;
  name: string;
  slug: string;
  format: FeedFormat;
  selection: FeedSelection;
  currency: string;
  only_storefront_published: boolean;
  include_out_of_stock: boolean;
  public_token: string;
  enabled: boolean;
  last_built_at: string | null;
  last_item_count: number | null;
  last_fetched_at: string | null;
  fetch_count: number;
}

const COLUMNS = 'id, name, slug, format, selection, currency, only_storefront_published, include_out_of_stock, '
  + 'public_token, enabled, last_built_at, last_item_count, last_fetched_at, fetch_count';

export function feedUrl(token: string): string {
  const base = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${base.replace(/\/$/, '')}/functions/v1/product-feed?token=${encodeURIComponent(token)}`;
}

export const productFeedsService = {
  async list(workspaceId: string): Promise<ProductFeed[]> {
    const { data, error } = await supabase.from('product_feeds').select(COLUMNS)
      .eq('workspace_id', workspaceId).order('created_at');
    if (error) throw error;
    return (data ?? []) as ProductFeed[];
  },

  async create(workspaceId: string, input: { name: string; format: FeedFormat }): Promise<void> {
    const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feed';
    const { error } = await supabase.from('product_feeds').insert({
      workspace_id: workspaceId, name: input.name.trim(), slug, format: input.format,
    });
    if (error) throw error;
  },

  async setSelection(id: string, selection: FeedSelection): Promise<void> {
    const { error } = await supabase.from('product_feeds')
      .update({ selection, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async setGates(id: string, gates: { only_storefront_published?: boolean; include_out_of_stock?: boolean }): Promise<void> {
    const { error } = await supabase.from('product_feeds')
      .update({ ...gates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async categories(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase.from('material_categories').select('id, name').order('name');
    if (error) throw error;
    return (data ?? []) as { id: string; name: string }[];
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.from('product_feeds').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async rotateToken(id: string): Promise<void> {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('product_feeds').update({ public_token: token, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('product_feeds').delete().eq('id', id);
    if (error) throw error;
  },
};
