/**
 * Online storefront (public link / mini-store). Public browse + checkout go
 * through the anonymous `finance-storefront` edge function; admin config + publish toggles
 * are RLS-gated direct writes.
 */
import { supabase } from '@/integrations/supabase/client';

export interface StorefrontMeta {
  enabled: boolean;
  workspace_name?: string;
  headline?: string | null;
  subheadline?: string | null;
  accent?: string | null;
  /** Public Turnstile site key, or null when the platform has no Turnstile configured — in which
   *  case the storefront shows no challenge and the server accepts the checkout without a token
   *  (same fail-open ruling as every other public form here). */
  turnstile_site_key?: string | null;
}

export interface StorefrontProduct {
  product_id: string;
  name: string;
  description: string | null;
  unit: string | null;
  item_type: string;
  price: number;
  currency: string;
  image_url: string | null;
}

export interface StorefrontConfig {
  workspace_id: string;
  enabled: boolean;
  headline: string | null;
  subheadline: string | null;
  accent: string | null;
}

export interface PublishableProduct {
  product_id: string;
  name: string;
  price: number | null;
  currency: string;
  storefront_published: boolean;
}

async function callFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('finance-storefront', { body });
  if (error) throw error;
  if (data && (data as any).error) throw new Error((data as any).error);
  return data as T;
}

export const storefrontService = {
  // ── Public (anonymous) ──
  getMeta(slug: string) { return callFn<StorefrontMeta & { ok: boolean }>({ action: 'meta', slug }); },
  getProducts(slug: string) { return callFn<{ ok: boolean; products: StorefrontProduct[] }>({ action: 'products', slug }); },
  checkout(
    slug: string,
    items: { product_id: string; qty: number }[],
    customer: { name: string; email: string; note?: string },
    turnstileToken?: string | null,
  ) {
    return callFn<{ ok: boolean; invoice_id: string; pay_token: string; pay_url: string; total: number; currency: string }>(
      { action: 'checkout', slug, items, customer, turnstile_token: turnstileToken ?? null },
    );
  },

  // ── Admin (RLS-gated) ──
  async getConfig(workspaceId: string): Promise<StorefrontConfig> {
    const { data, error } = await supabase.from('workspace_storefront').select('*').eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    return (data as StorefrontConfig) ?? { workspace_id: workspaceId, enabled: false, headline: null, subheadline: null, accent: null };
  },
  async saveConfig(cfg: StorefrontConfig): Promise<void> {
    const { error } = await supabase.from('workspace_storefront').upsert(
      { workspace_id: cfg.workspace_id, enabled: cfg.enabled, headline: cfg.headline, subheadline: cfg.subheadline, accent: cfg.accent, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id' },
    );
    if (error) throw error;
  },
  async listPublishable(workspaceId: string): Promise<PublishableProduct[]> {
    const { data, error } = await supabase
      .from('product_prices')
      .select('product_id, list_price, currency, storefront_published, product:products(name)')
      .eq('workspace_id', workspaceId)
      .not('list_price', 'is', null);
    if (error) throw error;
    return (data ?? []).filter((r: any) => r.product).map((r: any) => ({
      product_id: r.product_id, name: r.product.name, price: r.list_price != null ? Number(r.list_price) : null,
      currency: r.currency ?? 'EUR', storefront_published: !!r.storefront_published,
    }));
  },
  async setPublished(workspaceId: string, productId: string, published: boolean): Promise<void> {
    const { error } = await supabase.from('product_prices')
      .update({ storefront_published: published })
      .eq('workspace_id', workspaceId).eq('product_id', productId);
    if (error) throw error;
  },
};
