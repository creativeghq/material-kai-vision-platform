/**
 * Catalog grants — which of the operator's factories a dealer workspace may see and resell.
 *
 * The shape this exists to protect: a dealer NEVER gets a copy of an operator product. They
 * get visibility of the operator's row plus their own `product_prices` row against it. One
 * product, N prices — so the operator's updates, images and embeddings propagate, and there
 * is nothing to drift.
 *
 * Everything here goes through workspace-scoped RPCs rather than table reads, because
 * visibility depends on WHICH workspace you are acting in and an RLS policy on `products` can
 * only see the user. A user in one granted and one ungranted workspace would otherwise see
 * the granted catalog in both.
 */
import { supabase } from '@/integrations/supabase/client';

export interface GrantedCatalogProduct {
  productId: string;
  name: string;
  sku: string | null;
  factoryName: string | null;
  imageUrl: string | null;
  /** This workspace already has a price row for it — it is already in their catalog. */
  alreadyListed: boolean;
}

export interface CatalogGrant {
  id: string;
  workspaceId: string;
  /** null = every factory. */
  factoryName: string | null;
  status: 'requested' | 'active' | 'revoked';
  requestedAt: string;
  grantedAt: string | null;
  note: string | null;
}

export const catalogGrantsService = {
  /** The operator products this workspace is entitled to browse. */
  async listGranted(
    workspaceId: string,
    opts: { query?: string; factory?: string; limit?: number } = {},
  ): Promise<GrantedCatalogProduct[]> {
    const { data, error } = await supabase.rpc('list_granted_catalog_products', {
      p_workspace_id: workspaceId,
      p_query: opts.query ?? null,
      p_factory: opts.factory ?? null,
      p_limit: opts.limit ?? 50,
    });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      productId: r.product_id, name: r.name, sku: r.sku ?? null,
      factoryName: r.factory_name ?? null, imageUrl: r.image_url ?? null,
      alreadyListed: !!r.already_listed,
    }));
  },

  /** Grants and pending requests for a workspace. */
  async list(workspaceId: string): Promise<CatalogGrant[]> {
    const { data, error } = await supabase
      .from('workspace_catalog_grants')
      .select('id, workspace_id, factory_name, status, requested_at, granted_at, note')
      .eq('workspace_id', workspaceId)
      .order('requested_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id, workspaceId: r.workspace_id, factoryName: r.factory_name ?? null,
      status: r.status, requestedAt: r.requested_at, grantedAt: r.granted_at ?? null,
      note: r.note ?? null,
    }));
  },

  /**
   * Ask the operator for access to a factory (or to everything when factoryName is null).
   * RLS permits a dealer to insert ONLY with status 'requested'; approving is the operator's
   * to do, so this cannot self-grant.
   */
  async request(workspaceId: string, factoryName: string | null, note?: string): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('workspace_catalog_grants').insert({
      workspace_id: workspaceId,
      factory_name: factoryName,
      status: 'requested',
      requested_by: auth?.user?.id ?? null,
      note: note ?? null,
    });
    // A duplicate request is not an error worth surfacing — they already asked.
    if (error && !String(error.message).includes('duplicate key')) throw error;
  },

  /** Operator-only: approve or revoke. RLS enforces `is_platform_operator()`. */
  async setStatus(grantId: string, status: 'active' | 'revoked'): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('workspace_catalog_grants')
      .update({
        status,
        granted_by: auth?.user?.id ?? null,
        granted_at: status === 'active' ? new Date().toISOString() : null,
      })
      .eq('id', grantId);
    if (error) throw error;
  },

  /**
   * Put an operator product into this workspace's catalog — ONE price row, no product copy.
   * `product_prices` INSERT requires only membership of the caller's own workspace, so this
   * is the whole operation.
   */
  async addToMyCatalog(
    workspaceId: string,
    productId: string,
    listPrice: number | null,
    opts: { currency?: string; unit?: string | null } = {},
  ): Promise<void> {
    const { error } = await supabase.from('product_prices').upsert({
      workspace_id: workspaceId,
      product_id: productId,
      list_price: listPrice,
      currency: opts.currency ?? 'EUR',
      unit: opts.unit ?? null,
      confirmed_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,product_id,variant_key' });
    if (error) throw error;
  },
};
