/**
 * Sellable services. A service is a `products` row with item_type='service'
 * (no stock, no image suite) so it reuses the pricing/line/myDATA machinery. Price lives
 * in product_prices (per workspace); myDATA VAT + income classification live on the product.
 *
 * ONE store, two doors. Finance → Settings → Services manages the workspace's whole list
 * (fiscal classification included). Profile → Services is the SAME rows filtered to the ones
 * a member has listed on their public profile (`products.profile_user_id`), edited through
 * self-guarding RPCs because a profile owner is often a plain member and products
 * UPDATE/DELETE RLS is admin/owner only. There used to be a second store — a jsonb blob on
 * `user_profiles` with a free-text price — that no invoice could ever read.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface PreviousWork {
  title: string;
  url?: string;
}

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
  /** The member whose public profile lists this service, or null when it is not on any. */
  profile_user_id: string | null;
  previous_work: PreviousWork[];
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

/** What a PUBLIC profile shows for one service — marketing fields only, never cost. */
export interface ProfileService {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  unit: string | null;
  /** NULL = "on request": the profile shows no figure and a hire is an enquiry, never an order. */
  list_price: number | null;
  currency: string;
  vat_category: number | null;
  previous_work: PreviousWork[];
}

export interface ProfileServiceInput {
  name: string;
  description?: string;
  unit?: string;
  price: number | null;
  currency?: string;
  previous_work: PreviousWork[];
}

function readPreviousWork(raw: unknown): PreviousWork[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w): PreviousWork | null => {
      const rec = (w ?? {}) as Record<string, unknown>;
      const title = typeof rec.title === 'string' ? rec.title.trim() : '';
      const url = typeof rec.url === 'string' && rec.url ? rec.url : undefined;
      return title ? { title, url } : null;
    })
    .filter((w): w is PreviousWork => w !== null);
}

export const servicesService = {
  async list(workspaceId: string): Promise<ServiceItem[]> {
    const { data: rows, error } = await supabase
      .from('products')
      .select('id, name, description, metadata, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category, profile_user_id')
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
        .in('product_id', ids)
        .is('variant_key', null);
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
      profile_user_id: r.profile_user_id ?? null,
      previous_work: readPreviousWork(r.metadata?.previous_work),
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
    // `previous_work` is profile content and lives beside `unit` in metadata; a Finance edit
    // must not wipe what the member wrote on their profile, so merge rather than replace.
    const { data: cur } = await supabase.from('products').select('metadata').eq('id', productId).maybeSingle();
    const prior = ((cur as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from('products')
      .update({
        name: input.name,
        description: input.description || null,
        metadata: { ...prior, unit: input.unit || null, item_type: 'service' },
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

  // ── Profile door ─────────────────────────────────────────────────────────────

  /**
   * The services listed on a member's PUBLIC profile. Works for an anonymous visitor (the
   * profile must be public) and for the owner looking at their own, public or not.
   */
  async listForProfile(userId: string): Promise<ProfileService[]> {
    const { data, error } = await supabase.rpc('get_public_profile_services', { p_user_id: userId });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      name: r.name,
      description: r.description ?? null,
      unit: r.unit ?? null,
      list_price: r.list_price != null ? Number(r.list_price) : null,
      currency: r.currency ?? 'EUR',
      vat_category: r.vat_category ?? null,
      previous_work: readPreviousWork(r.previous_work),
    }));
  },

  /** Create a service listed on MY profile, or edit one I list. Returns the product id. */
  async upsertProfileService(workspaceId: string, productId: string | null, input: ProfileServiceInput): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_profile_service', {
      p_workspace_id: workspaceId,
      p_product_id: productId as unknown as string,
      p_name: input.name,
      p_description: input.description ?? '',
      p_unit: input.unit ?? '',
      p_price: input.price as unknown as number,
      p_currency: input.currency ?? 'EUR',
      p_previous_work: input.previous_work as unknown as Json,
    });
    if (error) throw error;
    return data as string;
  },

  /** Put an existing Finance service on my profile, or take mine off it. Never deletes it. */
  async setProfileListing(productId: string, listed: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_profile_service_listing', { p_product_id: productId, p_listed: listed });
    if (error) throw error;
  },

  async _writePrice(workspaceId: string, productId: string, input: ServiceInput): Promise<void> {
    if (input.price == null) return;
    // supabase-js resolves on an RLS denial rather than throwing, so an unbound write is
    // silent (#389). This is a PRICE: a silently-dropped upsert leaves the service
    // quotable at whatever the previous number was, and a wrong price is a valid number.
    const { error } = await supabase.from('product_prices').upsert({
      workspace_id: workspaceId,
      product_id: productId,
      // #374 — a SERVICE has no identity axes, so its price is the product-wide row by nature.
      // Stated explicitly so the guard test can tell "no variants exist" from "forgot to pass".
      variant_key: null,
      list_price: input.price,
      currency: input.currency || 'EUR',
      unit: input.unit || null,
    }, { onConflict: 'workspace_id,product_id,variant_key' });
    if (error) throw error;
  },
};
