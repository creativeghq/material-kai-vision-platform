import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { ADMIN_ROLES, isAdmin as isAdminRole } from '@/auth/roles';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';

// =====================================================
// INTERFACES
// =====================================================

export interface Quote {
  id: string;
  user_id: string;
  workspace_id?: string;
  /** Project Workspace linkage (Phase 1). Nullable for legacy + standalone quotes. */
  project_id?: string | null;
  /** Quote revisions (Phase 2). parent_quote_id points to the originating quote; revision_number starts at 1. */
  parent_quote_id?: string | null;
  revision_number?: number;
  name?: string;
  status: 'draft' | 'submitted' | 'quoted' | 'accepted' | 'rejected' | 'expired';
  status_tag_id?: string;
  total_items: number;
  extras_total?: number; // Total of accepted upsells (price × quantity)
  notes?: string;
  custom_request_text?: string; // Custom text request instead of products
  expires_at: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  // PDF & pricing fields
  quote_number?: string;
  pdf_storage_path?: string;
  pdf_generated_at?: string;
  pdf_generation_status?: 'pending' | 'generating' | 'completed' | 'failed' | null;
  subtotal?: number;
  vat_rate?: number;
  vat_amount?: number;
  grand_total?: number;
  currency?: string;
  /** B2B customer. XOR with customer_contact_id at the DB level. */
  customer_company_id?: string | null;
  /** B2C / private customer. XOR with customer_company_id at the DB level. */
  customer_contact_id?: string | null;
  /** Chosen sub-unit (branch) address of the customer; null = main address. */
  customer_address_unit_id?: string | null;
  /** Public share link. Token is a random uuid surfaced at /q/:token. */
  public_share_enabled?: boolean;
  public_share_token?: string | null;
  public_share_created_at?: string | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_id: string | null;
  quantity: number;
  notes?: string;
  added_from?: 'search' | 'agent' | '3d_generation' | 'manual' | 'product_page' | 'moodboard';
  added_at: string;
  selected_size?: string;
  selected_color?: string;
  // Custom product fields (when product_id is null)
  custom_product_name?: string;
  custom_product_description?: string;
  custom_sku?: string;
  custom_unit?: string;
  // Pricing fields
  unit_price?: number;
  discounted_price?: number;
  line_total?: number;
  // FF&E fields
  room?: string;
  /** Structured room linkage. Wins over freeform `room` when set. */
  room_id?: string | null;
  dimensions?: string;
  installation_requirements?: string;
  delivery_date?: string;
}

export interface QuoteWithItems extends Quote {
  items?: QuoteItemWithProduct[];
}

export interface Product {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  metadata?: Record<string, any>;
  image_url?: string;
  /** Per-unit procurement cost (numeric). Snapshotted to quote_items.cost_snapshot at acceptance. */
  cost?: number | null;
  cost_currency?: string | null;
}

export interface QuoteItemWithProduct extends QuoteItem {
  product?: Product;
}

// =====================================================
// STATUS TAGS
// =====================================================

export interface StatusTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  is_system: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// =====================================================
// UPSELLS/EXTRAS
// =====================================================

export interface Upsell {
  id: string;
  name: string;
  description?: string;
  price: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteUpsell {
  id: string;
  quote_id: string;
  upsell_id: string;
  customer_accepted?: boolean | null;
  admin_notes?: string;
  metadata?: {
    custom_price?: number;
    quantity?: number;
    measurement?: string;
  } | null;
  added_at: string;
  decided_at?: string;
  upsell?: Upsell;
}

// =====================================================
// PROJECT TIMELINE
// =====================================================

export interface TimelineStep {
  id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuoteTimeline {
  id: string;
  quote_id: string;
  timeline_step_id: string;
  quote_item_id?: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  timeline_step?: TimelineStep;
  quote_item?: { id: string; product_id?: string; custom_product_name?: string; product?: { name: string } | null } | null;
}

// =====================================================
// QUOTES SERVICE
// =====================================================

export class QuotesService {
  /**
   * Create a new quote
   */
  async createQuote(data?: {
    name?: string;
    workspace_id?: string;
    project_id?: string | null;
    notes?: string;
    custom_request_text?: string;
    /** Optional customer link (used by the Sales portal #201 — rep builds a quote for a customer). */
    customer_contact_id?: string | null;
    customer_company_id?: string | null;
  }): Promise<Quote> {
    // user_id is required by the RLS policy on quotes
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        user_id: user.id, // required for RLS policy
        name: data?.name,
        // Default to the user's ACTIVE workspace so quotes (and the invoices/myDATA
        // docs derived from them) land in the workspace they're working in, not root.
        workspace_id: data?.workspace_id ?? getActiveWorkspaceId(user.id) ?? undefined,
        project_id: data?.project_id ?? null,
        notes: data?.notes,
        custom_request_text: data?.custom_request_text,
        customer_contact_id: data?.customer_contact_id ?? null,
        customer_company_id: data?.customer_company_id ?? null,
        status: 'draft',
      } as any)
      .select()
      .single();

    if (error) throw error;

    flowEventService.emit('quote_requested', {
      quote_id: quote.id,
      user_id: user.id,
      name: quote.name,
      status: quote.status,
    });

    return quote;
  }

  /**
   * Get all quotes for the current user
   */
  async getQuotes(filters?: {
    status?: Quote['status'];
    workspace_id?: string;
  }): Promise<Quote[]> {
    let query = supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.workspace_id) {
      query = query.eq('workspace_id', filters.workspace_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all quotes for the current user with their items (for customer-facing quotes page)
   */
  async getUserQuotes(): Promise<QuoteWithItems[]> {
    // Get all quotes for the current user
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (quotesError) throw quotesError;
    if (!quotes || quotes.length === 0) return [];

    // Fetch items for all quotes
    const quoteIds = quotes.map((q: Quote) => q.id);
    const { data: allItems, error: itemsError } = await supabase
      .from('quote_items')
      .select('*')
      .in('quote_id', quoteIds);

    if (itemsError) throw itemsError;

    // Map items to their quotes
    const itemsByQuoteId = (allItems || []).reduce((acc: Record<string, QuoteItem[]>, item: QuoteItem) => {
      if (!acc[item.quote_id]) {
        acc[item.quote_id] = [];
      }
      acc[item.quote_id].push(item);
      return acc;
    }, {} as Record<string, QuoteItem[]>);

    // Combine quotes with their items
    return quotes.map((quote: Quote) => ({
      ...quote,
      items: itemsByQuoteId[quote.id] || [],
    }));
  }

  /**
   * Get a specific quote with its items
   */
  async getQuote(quoteId: string): Promise<QuoteWithItems> {
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (quoteError) throw quoteError;

    const { data: items, error: itemsError } = await supabase
      .from('quote_items')
      .select('*, product:products(*)')
      .eq('quote_id', quoteId)
      .order('added_at', { ascending: true });

    if (itemsError) throw itemsError;

    // Fetch images for all products in this quote
    const productIds = (items || [])
      .filter(item => item.product?.id)
      .map(item => item.product!.id);

    const productImageMap: Record<string, string> = {};

    if (productIds.length > 0) {
      const { data: imageRelations } = await supabase
        .from('image_product_associations')
        .select('product_id, image:document_images(image_url)')
        .in('product_id', productIds)
        .order('overall_score', { ascending: false });

      if (imageRelations) {
        for (const rel of imageRelations) {
          const imgData = rel.image as any;
          if (!productImageMap[rel.product_id] && imgData?.image_url) {
            productImageMap[rel.product_id] = imgData.image_url;
          }
        }
      }
    }

    // Attach images to products
    const itemsWithImages = (items || []).map(item => ({
      ...item,
      product: item.product ? {
        ...item.product,
        image_url: productImageMap[item.product.id] || item.product.image_url,
      } : item.product,
    }));

    return {
      ...quote,
      items: itemsWithImages,
    };
  }

  /**
   * Update quote details
   */
  async updateQuote(
    quoteId: string,
    data: {
      name?: string;
      notes?: string;
      status?: Quote['status'];
      custom_request_text?: string;
    },
  ): Promise<Quote> {
    const { data: quote, error } = await supabase
      .from('quotes')
      .update(data)
      .eq('id', quoteId)
      .select()
      .single();

    if (error) throw error;

    if (data.status === 'accepted' || data.status === 'rejected') {
      // Admin fan-out is delivered by the "Quote Accepted/Rejected → Notify
      // Admins" flow (Loop over admin_ids → Create Notification). The event
      // carries the admin recipient list + payload so an admin can pause/edit it.
      const accepted = data.status === 'accepted';
      const eventName = accepted ? 'quote_approved' : 'quote_rejected';
      const quoteRef = quote.quote_number || quote.id.slice(0, 8);
      const emitQuoteEvent = (adminIds: string[]) =>
        flowEventService.emit(eventName, {
          quote_id: quote.id,
          user_id: quote.user_id,
          admin_ids: adminIds,
          type: accepted ? 'quote_accepted' : 'quote_rejected',
          title: accepted ? `Quote ${quoteRef} accepted` : `Quote ${quoteRef} declined`,
          body: accepted ? 'A client has accepted the quote.' : 'A client has declined the quote.',
          action_url: `/admin/quotes/${quote.id}`,
        });
      if (quote.workspace_id) {
        supabase
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', quote.workspace_id)
          .in('role', ADMIN_ROLES)
          .then(({ data: admins }) => emitQuoteEvent((admins || []).map((m) => m.user_id)));
      } else {
        emitQuoteEvent([]);
      }
    }

    return quote;
  }

  /**
   * Delete a quote (users can delete their own quotes, admins can delete any quote)
   */
  async deleteQuote(quoteId: string): Promise<void> {
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', quoteId);

    if (error) throw error;
  }

  /**
   * Add item to quote (catalog product)
   */
  async addItem(data: {
    quote_id: string;
    product_id: string;
    quantity?: number;
    notes?: string;
    added_from?: QuoteItem['added_from'];
    selected_size?: string;
    selected_color?: string;
    selected_attributes?: Record<string, any>;
    room?: string;
    room_id?: string | null;
    dimensions?: string;
    installation_requirements?: string;
    delivery_date?: string;
  }): Promise<QuoteItem> {
    // Resolve default unit + category from product metadata
    let customUnit: string | null = null;
    let productCategory: string | null = null;
    try {
      const { data: product } = await supabase
        .from('products')
        .select('metadata')
        .eq('id', data.product_id)
        .single();
      if (product?.metadata?.unit) {
        customUnit = product.metadata.unit;
      }
      productCategory = product?.metadata?.material_category ?? null;
    } catch { /* non-fatal — falls back to null (displays as pcs) */ }

    // #176: pre-fill the line from the cascade resolver so catalog lines aren't blank.
    // For an OWN product the resolved figure IS the sell price; for an operator-catalog
    // product it's the seller's COST (snapshotted so margin is computable) and seeds the
    // unit_price as a starting sell the seller marks up.
    const qtyNow = data.quantity || 1;
    let unitPrice: number | null = null;
    let costSnapshot: number | null = null;
    let retailPrice: number | null = null;
    let quoteWorkspaceId: string | null = null;
    try {
      const { data: quote } = await supabase
        .from('quotes')
        .select('workspace_id, customer_company_id, customer_contact_id')
        .eq('id', data.quote_id)
        .single();
      if (quote?.workspace_id) {
        quoteWorkspaceId = quote.workspace_id;
        // #227: pass the quote's customer so the resolver applies their pricing-level discount.
        // audience='seller' → staff get cost_basis + margin (never exposed to the buyer).
        const { data: priced } = await supabase.rpc('get_product_price_for_workspace', {
          p_workspace_id: quote.workspace_id,
          p_product_id: data.product_id,
          p_company_id: quote.customer_company_id ?? null,
          p_contact_id: quote.customer_contact_id ?? null,
          p_audience: 'seller',
        });
        const p: any = priced;
        if (p && typeof p === 'object') {
          const basis = p.cost_basis != null ? Number(p.cost_basis) : null;
          const sell = p.suggested_sell != null ? Number(p.suggested_sell) : null;
          const retail = p.retail != null ? Number(p.retail) : null;
          // Prefill the sell price (retail × customer discount); fall back to bare cost.
          if (sell != null && !Number.isNaN(sell)) unitPrice = sell;
          else if (basis != null && !Number.isNaN(basis)) unitPrice = basis;
          // Store the pre-discount retail anchor for the line breakdown (ex-VAT).
          if (retail != null && !Number.isNaN(retail)) retailPrice = retail;
          // Snapshot the procurement cost so the margin/profit block is honest.
          if (p.mode === 'operator_catalog' && basis != null && !Number.isNaN(basis)) costSnapshot = basis;
        }
      }
    } catch { /* non-fatal — leaves the line unpriced for manual entry */ }

    // Layer B (#227): quote-time custom rules (volume per category, category extra) applied on
    // top of the level discount, with category-tree inheritance (most-specific-wins).
    if (unitPrice != null && quoteWorkspaceId && productCategory) {
      try {
        const factor = await this._layerBFactor(quoteWorkspaceId, productCategory, qtyNow);
        if (factor < 1) unitPrice = Math.round(unitPrice * factor * 100) / 100;
      } catch { /* non-fatal — Layer B is additive on top of the resolved price */ }
    }

    const { data: item, error } = await supabase
      .from('quote_items')
      .insert({
        quote_id: data.quote_id,
        product_id: data.product_id,
        quantity: qtyNow,
        notes: data.notes,
        added_from: data.added_from || 'manual',
        selected_size: data.selected_size,
        selected_color: data.selected_color,
        selected_attributes: data.selected_attributes ?? {},
        room: data.room || null,
        room_id: data.room_id ?? null,
        dimensions: data.dimensions || null,
        installation_requirements: data.installation_requirements || null,
        delivery_date: data.delivery_date || null,
        custom_unit: customUnit,
        unit_price: unitPrice,
        line_total: unitPrice != null ? Math.round(unitPrice * qtyNow * 100) / 100 : null,
        cost_snapshot: costSnapshot,
        retail_price: retailPrice,
      } as any)
      .select()
      .single();

    if (error) throw error;

    flowEventService.emit('product_added_to_quote', {
      quote_id: data.quote_id,
      product_id: data.product_id,
      quantity: data.quantity || 1,
      added_from: data.added_from || 'manual',
    });

    return item;
  }

  /**
   * Add a custom (non-catalog) item to quote
   */
  async addCustomItem(data: {
    quote_id: string;
    custom_product_name: string;
    custom_product_description?: string;
    custom_sku?: string;
    custom_unit?: string;
    unit_price?: number;
    quantity?: number;
    selected_size?: string;
    selected_color?: string;
    notes?: string;
    room?: string;
    room_id?: string | null;
    dimensions?: string;
    installation_requirements?: string;
    delivery_date?: string;
  }): Promise<QuoteItem> {
    const qty = data.quantity || 1;
    const unitPrice = data.unit_price ?? null;
    const { data: item, error } = await supabase
      .from('quote_items')
      .insert({
        quote_id: data.quote_id,
        product_id: null,
        custom_product_name: data.custom_product_name,
        custom_product_description: data.custom_product_description || null,
        custom_sku: data.custom_sku || null,
        custom_unit: data.custom_unit || null,
        quantity: qty,
        unit_price: unitPrice,
        line_total: unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : null,
        selected_size: data.selected_size || null,
        selected_color: data.selected_color || null,
        notes: data.notes || null,
        added_from: 'manual',
        room: data.room || null,
        room_id: data.room_id ?? null,
        dimensions: data.dimensions || null,
        installation_requirements: data.installation_requirements || null,
        delivery_date: data.delivery_date || null,
      } as any)
      .select()
      .single();

    if (error) throw error;
    return item;
  }

  /**
   * #227 Layer B — combined quote-time custom-rule factor for a product category, with tree
   * inheritance + most-specific-wins. For each category-scoped rule type (category_extra,
   * volume_category) the rule on the most-specific ancestor of the product's category applies
   * (a subcategory rule beats its parent's; a global/null-category rule is least specific).
   */
  private async _layerBFactor(workspaceId: string, category: string | null, qty: number): Promise<number> {
    if (!category) return 1;
    let anc: string[] = [category];
    try {
      const { data } = await supabase.rpc('pricing_category_ancestry', { p_category_key: category });
      if (Array.isArray(data) && data.length) anc = data as string[];
    } catch { /* fall back to exact-category match */ }
    const { data: cRules } = await supabase
      .from('pricing_custom_rules')
      .select('rule_type, category_key, params, discount_pct')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);
    const ancIndex = (k: string | null) => {
      if (k == null) return Number.MAX_SAFE_INTEGER;
      const i = anc.indexOf(k);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    let factor = 1;
    for (const type of ['category_extra', 'volume_category'] as const) {
      const candidates = ((cRules ?? []) as any[])
        .filter((r) => r.rule_type === type)
        .filter((r) => r.category_key == null || anc.includes(r.category_key))
        .filter((r) => (Number(r.discount_pct) || 0) > 0)
        .filter((r) => type === 'volume_category'
          ? (Number(r.params?.min_qty ?? 0) > 0 && qty >= Number(r.params?.min_qty ?? 0))
          : true);
      if (!candidates.length) continue;
      candidates.sort((a, b) => ancIndex(a.category_key) - ancIndex(b.category_key));
      factor *= 1 - (Number(candidates[0].discount_pct) || 0) / 100;
    }
    return factor;
  }

  /**
   * Update quote item
   */
  async updateItem(
    itemId: string,
    data: {
      quantity?: number;
      notes?: string;
      selected_size?: string;
      selected_color?: string;
      unit_price?: number | null;
      discounted_price?: number | null;
      custom_unit?: string;
      room?: string;
      room_id?: string | null;
      dimensions?: string;
      installation_requirements?: string;
      delivery_date?: string | null;
      // Audit trail for admin price-lookup commits
      price_source?: string | null;
      price_lookup_call_id?: string | null;
    },
  ): Promise<QuoteItem> {
    // Recalculate line_total when pricing or quantity changes.
    const payload: Record<string, any> = { ...data };
    if (data.unit_price !== undefined || data.discounted_price !== undefined || data.quantity !== undefined) {
      const { data: current } = await supabase
        .from('quote_items')
        .select('unit_price, discounted_price, quantity, quote_id, product_id')
        .eq('id', itemId)
        .single();
      if (current) {
        const qty = data.quantity ?? current.quantity ?? 1;
        let unitPrice = data.unit_price !== undefined ? data.unit_price : current.unit_price;
        let discountedPrice = data.discounted_price !== undefined ? data.discounted_price : current.discounted_price;

        // #227 (Option B) — a quantity change (without an explicit price edit) ALWAYS re-runs the
        // engine so the line stays correct (e.g. crossing a volume threshold), overwriting any
        // prior price. Explicit price edits (data.unit_price set) are respected.
        if (data.quantity !== undefined && data.unit_price === undefined && current.product_id) {
          try {
            const { data: q } = await supabase
              .from('quotes')
              .select('workspace_id, customer_company_id, customer_contact_id')
              .eq('id', current.quote_id).single();
            if (q?.workspace_id) {
              const { data: priced } = await supabase.rpc('get_product_price_for_workspace', {
                p_workspace_id: q.workspace_id, p_product_id: current.product_id,
                p_company_id: q.customer_company_id ?? null, p_contact_id: q.customer_contact_id ?? null,
                p_audience: 'seller',
              });
              const p: any = priced;
              let recomputed = p?.suggested_sell != null ? Number(p.suggested_sell) : null;
              if (recomputed != null) {
                const { data: prod } = await supabase.from('products').select('metadata').eq('id', current.product_id).single();
                const cat = prod?.metadata?.material_category ?? null;
                if (cat) {
                  const factor = await this._layerBFactor(q.workspace_id, cat, qty);
                  if (factor < 1) recomputed = Math.round(recomputed * factor * 100) / 100;
                }
                unitPrice = recomputed;
                discountedPrice = null;       // engine price replaces any prior per-line discount
                payload.unit_price = recomputed;
                payload.discounted_price = null;
              }
            }
          } catch { /* non-fatal — keep the existing price */ }
        }

        const effectivePrice = discountedPrice ?? unitPrice;
        payload.line_total = effectivePrice != null ? Math.round(Number(effectivePrice) * qty * 100) / 100 : null;
      }
    }

    const { data: item, error } = await supabase
      .from('quote_items')
      .update(payload)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    return item;
  }

  /**
   * Remove item from quote
   */
  async removeItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('quote_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  }

  /**
   * Submit quote (convert to quote request)
   */
  async submitQuote(quoteId: string, notes?: string): Promise<void> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get the quote to retrieve workspace_id
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('workspace_id, items:quote_items(count)')
      .eq('id', quoteId)
      .single();

    if (quoteError) throw quoteError;

    // Update quote status
    await this.updateQuote(quoteId, {
      status: 'submitted',
      notes: notes,
    });

    // Create quote request with user_id
    const { error } = await supabase
      .from('quote_requests')
      .insert({
        quote_id: quoteId,
        user_id: user.id,
        workspace_id: quote?.workspace_id,
        items_count: quote?.items?.[0]?.count || 0,
        status: 'pending',
        notes: notes,
      });

    if (error) throw error;
  }

  /**
   * Get quote expiration info
   */
  async getExpirationInfo(quoteId: string): Promise<{
    expires_at: string;
    days_until_expiration: number;
    is_expired: boolean;
  }> {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('expires_at, status')
      .eq('id', quoteId)
      .single();

    if (error) throw error;

    const expiresAt = new Date(quote.expires_at);
    const now = new Date();
    const daysUntilExpiration = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      expires_at: quote.expires_at,
      days_until_expiration: daysUntilExpiration,
      is_expired: quote.status === 'expired' || daysUntilExpiration < 0,
    };
  }

  /**
   * Get all quotes for the admin view (not just those with a quote_requests entry).
   */
  async getQuoteRequests(): Promise<QuoteWithItems[]> {
    // Get ALL quotes (admin view shows everything)
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (quotesError) throw quotesError;

    if (!quotes || quotes.length === 0) {
      return [];
    }

    // Get items for each quote
    const quotesWithItems = await Promise.all(
      quotes.map(async (quote) => {
        const { data: items, error: itemsError } = await supabase
          .from('quote_items')
          .select('*, product:products(*)')
          .eq('quote_id', quote.id)
          .order('added_at', { ascending: true });

        if (itemsError) throw itemsError;

        return {
          ...quote,
          items: items || [],
        };
      }),
    );

    return quotesWithItems;
  }

  /**
   * Get a specific quote request
   */
  async getQuoteRequest(quoteId: string): Promise<QuoteWithItems> {
    return this.getQuote(quoteId);
  }

  /**
   * Delete a quote request (and its associated quote)
   * Note: quote_requests may not exist for draft quotes that haven't been submitted
   * Cascade deletes: quote_items, quote_upsells, quote_timeline
   * Admins can delete any quote, users can only delete their own quotes
   */
  async deleteQuoteRequest(quoteId: string): Promise<void> {
    // Get current user for RLS verification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Check if user is admin
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role_id, roles(name)')
      .eq('user_id', user.id)
      .single();

    const isAdmin = isAdminRole(userProfile?.roles?.name as string | undefined);

    // If not admin, verify quote ownership
    if (!isAdmin) {
      const { data: quote, error: fetchError } = await supabase
        .from('quotes')
        .select('id, user_id')
        .eq('id', quoteId)
        .single();

      if (fetchError) {
        console.error('Error fetching quote for deletion:', fetchError);
        throw new Error('Quote not found');
      }

      if (quote.user_id !== user.id) {
        throw new Error('You do not have permission to delete this quote');
      }
    }

    // First try to delete the quote_request entry (may not exist for draft quotes)
    const { error: requestError } = await supabase
      .from('quote_requests')
      .delete()
      .eq('quote_id', quoteId);

    // Ignore error if quote_request doesn't exist (draft quotes won't have one)
    if (requestError && !requestError.message.includes('0 rows')) {
      console.warn('Error deleting quote_request:', requestError);
    }

    // Then delete the quote (this will cascade delete quote_items, quote_upsells, quote_timeline)
    // RLS policies will handle permission checks (admin can delete any, users can delete their own)
    const { error: quoteError } = await supabase
      .from('quotes')
      .delete()
      .eq('id', quoteId);

    if (quoteError) {
      console.error('Error deleting quote:', quoteError);
      throw new Error(`Failed to delete quote: ${quoteError.message}`);
    }
  }

  // =====================================================
  // STATUS TAGS METHODS
  // =====================================================

  /**
   * Get all status tags
   */
  async getStatusTags(): Promise<StatusTag[]> {
    const { data, error } = await supabase
      .from('status_tags')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new status tag
   */
  async createStatusTag(data: {
    name: string;
    color: string;
    description?: string;
    display_order?: number;
  }): Promise<StatusTag> {
    const { data: tag, error } = await supabase
      .from('status_tags')
      .insert({
        name: data.name,
        color: data.color,
        description: data.description,
        display_order: data.display_order || 0,
        is_system: false,
      })
      .select()
      .single();

    if (error) throw error;
    return tag;
  }

  /**
   * Update quote status tag
   */
  async updateQuoteStatusTag(quoteId: string, statusTagId: string | null): Promise<Quote> {
    const { data: quote, error } = await supabase
      .from('quotes')
      .update({ status_tag_id: statusTagId })
      .eq('id', quoteId)
      .select()
      .single();

    if (error) throw error;
    return quote;
  }

  // =====================================================
  // PUBLIC SHARE LINK
  // =====================================================

  /**
   * Enable or disable the public share link for a quote.
   * Enabling mints a fresh random token if none exists; disabling keeps the
   * token row but flips `public_share_enabled=false` so the /q/:token page
   * stops resolving (re-enabling reuses the same link). Admin-only via RLS.
   */
  async setQuotePublicShare(quoteId: string, enabled: boolean): Promise<Quote> {
    // Routed through a SECURITY DEFINER RPC so the quote OWNER (not just admins)
    // can toggle sharing at any status — the table's UPDATE RLS otherwise blocks
    // owner writes once the quote leaves draft/submitted. The RPC mints a random
    // token on first enable and reuses it afterwards.
    const { data, error } = await supabase.rpc('set_quote_public_share', {
      p_quote_id: quoteId,
      p_enabled: enabled,
    });

    if (error) throw error;
    return data as Quote;
  }

  // =====================================================
  // UPSELLS/EXTRAS METHODS
  // =====================================================

  /**
   * Get all upsells
   */
  async getUpsells(activeOnly: boolean = false): Promise<Upsell[]> {
    let query = supabase
      .from('upsells')
      .select('*')
      .order('display_order', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new upsell
   */
  async createUpsell(data: {
    name: string;
    description?: string;
    price: number;
    display_order?: number;
    is_active?: boolean;
  }): Promise<Upsell> {
    const { data: upsell, error } = await supabase
      .from('upsells')
      .insert({
        name: data.name,
        description: data.description,
        price: data.price,
        display_order: data.display_order || 0,
        is_active: data.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return upsell;
  }

  /**
   * Update an upsell
   */
  async updateUpsell(
    upsellId: string,
    data: {
      name?: string;
      description?: string;
      price?: number;
      is_active?: boolean;
      display_order?: number;
    },
  ): Promise<Upsell> {
    const { data: upsell, error } = await supabase
      .from('upsells')
      .update(data)
      .eq('id', upsellId)
      .select()
      .single();

    if (error) throw error;
    return upsell;
  }

  /**
   * Delete an upsell
   */
  async deleteUpsell(upsellId: string): Promise<void> {
    const { error } = await supabase
      .from('upsells')
      .delete()
      .eq('id', upsellId);

    if (error) throw error;
  }

  /**
   * Get quote upsells
   */
  async getQuoteUpsells(quoteId: string): Promise<QuoteUpsell[]> {
    const { data, error } = await supabase
      .from('quote_upsells')
      .select('*, upsell:upsells(*)')
      .eq('quote_id', quoteId)
      .order('added_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Add upsell to quote with optional metadata (custom price, quantity, measurement)
   */
  async addUpsellToQuote(
    quoteId: string,
    upsellId: string,
    adminNotes?: string,
    metadata?: { custom_price?: number; quantity?: number; measurement?: string },
  ): Promise<QuoteUpsell> {
    const { data, error } = await supabase
      .from('quote_upsells')
      .insert({
        quote_id: quoteId,
        upsell_id: upsellId,
        admin_notes: adminNotes,
        metadata: metadata || null,
      })
      .select('*, upsell:upsells(*)')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update customer acceptance of upsell and recalculate quote extras_total
   */
  async updateUpsellAcceptance(
    quoteUpsellId: string,
    accepted: boolean,
  ): Promise<QuoteUpsell> {
    // First update the upsell acceptance
    const { data, error } = await supabase
      .from('quote_upsells')
      .update({
        customer_accepted: accepted,
        decided_at: new Date().toISOString(),
      })
      .eq('id', quoteUpsellId)
      .select('*, upsell:upsells(*)')
      .single();

    if (error) throw error;

    // Recalculate extras_total for the quote
    await this.recalculateQuoteExtrasTotal(data.quote_id);

    return data;
  }

  /**
   * Recalculate and update the extras_total for a quote
   * Only includes accepted upsells, using custom_price from metadata if available
   */
  async recalculateQuoteExtrasTotal(quoteId: string): Promise<number> {
    // Get all quote upsells with their upsell details
    const quoteUpsells = await this.getQuoteUpsells(quoteId);

    // Calculate total from accepted upsells only
    const extrasTotal = quoteUpsells.reduce((sum, qu) => {
      // Only count accepted upsells
      if (qu.customer_accepted !== true) return sum;

      // Get price: use custom_price from metadata if available, otherwise use default upsell price
      const metadata = qu.metadata as { custom_price?: number; quantity?: number } | null;
      const price = metadata?.custom_price ?? qu.upsell?.price ?? 0;
      const quantity = metadata?.quantity ?? 1;

      return sum + (price * quantity);
    }, 0);

    // Update the quote with new extras_total
    const { error } = await supabase
      .from('quotes')
      .update({ extras_total: extrasTotal })
      .eq('id', quoteId);

    if (error) throw error;

    return extrasTotal;
  }

  /**
   * Reset upsell decision (set customer_accepted back to null)
   */
  async resetUpsellDecision(quoteUpsellId: string): Promise<QuoteUpsell> {
    const { data, error } = await supabase
      .from('quote_upsells')
      .update({
        customer_accepted: null,
        decided_at: null,
      })
      .eq('id', quoteUpsellId)
      .select('*, upsell:upsells(*)')
      .single();

    if (error) throw error;

    // Recalculate extras_total for the quote
    await this.recalculateQuoteExtrasTotal(data.quote_id);

    return data;
  }

  /**
   * Remove upsell from quote
   */
  async removeUpsellFromQuote(quoteUpsellId: string): Promise<void> {
    const { error } = await supabase
      .from('quote_upsells')
      .delete()
      .eq('id', quoteUpsellId);

    if (error) throw error;
  }

  // =====================================================
  // PROJECT TIMELINE METHODS
  // =====================================================

  /**
   * Get all timeline steps (active only by default)
   */
  async getTimelineSteps(activeOnly: boolean = true): Promise<TimelineStep[]> {
    let query = supabase
      .from('timeline_steps')
      .select('*')
      .order('display_order', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all timeline steps including inactive ones
   */
  async getAllTimelineSteps(): Promise<TimelineStep[]> {
    return this.getTimelineSteps(false);
  }

  /**
   * Create a new timeline step
   */
  async createTimelineStep(data: {
    name: string;
    description?: string;
    display_order?: number;
    is_active?: boolean;
  }): Promise<TimelineStep> {
    const { data: step, error } = await supabase
      .from('timeline_steps')
      .insert({
        name: data.name,
        description: data.description,
        display_order: data.display_order || 0,
        is_active: data.is_active !== false,
      })
      .select()
      .single();

    if (error) throw error;
    return step;
  }

  /**
   * Update a timeline step
   */
  async updateTimelineStepDefinition(
    stepId: string,
    data: {
      name?: string;
      description?: string;
      is_active?: boolean;
      display_order?: number;
    },
  ): Promise<TimelineStep> {
    const { data: step, error } = await supabase
      .from('timeline_steps')
      .update(data)
      .eq('id', stepId)
      .select()
      .single();

    if (error) throw error;
    return step;
  }

  /**
   * Delete a timeline step
   */
  async deleteTimelineStepDefinition(stepId: string): Promise<void> {
    const { error } = await supabase
      .from('timeline_steps')
      .delete()
      .eq('id', stepId);

    if (error) throw error;
  }

  /**
   * Reorder timeline steps
   */
  async reorderTimelineSteps(stepIds: string[]): Promise<void> {
    // Update each step's display_order based on its position in the array
    const updates = stepIds.map((id, index) => ({
      id,
      display_order: index,
    }));

    for (const update of updates) {
      const { error } = await supabase
        .from('timeline_steps')
        .update({ display_order: update.display_order })
        .eq('id', update.id);

      if (error) throw error;
    }
  }

  /**
   * Get timeline step usage count (how many quotes use this step)
   */
  async getTimelineStepUsageCount(stepId: string): Promise<number> {
    const { count, error } = await supabase
      .from('quote_timeline')
      .select('*', { count: 'exact', head: true })
      .eq('timeline_step_id', stepId);

    if (error) throw error;
    return count || 0;
  }

  /**
   * Reorder upsells
   */
  async reorderUpsells(upsellIds: string[]): Promise<void> {
    // Update each upsell's display_order based on its position in the array
    const updates = upsellIds.map((id, index) => ({
      id,
      display_order: index,
    }));

    for (const update of updates) {
      const { error } = await supabase
        .from('upsells')
        .update({ display_order: update.display_order })
        .eq('id', update.id);

      if (error) throw error;
    }
  }

  /**
   * Get upsell usage count (how many quotes have this upsell attached)
   */
  async getUpsellUsageCount(upsellId: string): Promise<number> {
    const { count, error } = await supabase
      .from('quote_upsells')
      .select('*', { count: 'exact', head: true })
      .eq('upsell_id', upsellId);

    if (error) throw error;
    return count || 0;
  }

  // =====================================================
  // PRODUCT SEARCH FOR QUOTES
  // =====================================================

  /**
   * Search products with their primary images for the add products sheet
   * Uses MIVAA API's powerful /api/rag/search endpoint for semantic + text search
   */
  async searchProductsWithImages(query: string, limit: number = 20): Promise<(Product & { image_url?: string })[]> {
    // Get the current user to find their workspace
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get user's workspace
    const { data: workspaceData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .single();

    if (!workspaceData) {
      throw new Error('No workspace found for user');
    }

    try {
      // Use MIVAA API for semantic search with multi_vector strategy
      const MIVAA_API_URL = 'https://v1api.materialshub.gr';
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || '';

      const response = await fetch(`${MIVAA_API_URL}/api/rag/search?strategy=multi_vector`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          query,
          workspace_id: workspaceData.workspace_id,
          top_k: limit,
          similarity_threshold: 0.3, // Lower threshold for broader results
        }),
      });

      if (!response.ok) {
        console.warn('MIVAA search failed, falling back to direct DB search');
        return this.searchProductsDirectDB(query, workspaceData.workspace_id, limit);
      }

      const result = await response.json();

      if (!result.success || !result.results || result.results.length === 0) {
        // Fallback to direct DB search if MIVAA returns no results
        return this.searchProductsDirectDB(query, workspaceData.workspace_id, limit);
      }

      // Extract unique product IDs from search results
      const productIds = new Set<string>();
      const productDataMap: Record<string, { image_url?: string; score?: number }> = {};

      for (const item of result.results) {
        // MIVAA search returns products in various formats
        const productId = item.product_id || item.metadata?.product_id;
        const imageUrl = item.image_url || item.metadata?.image_url;

        if (productId && !productIds.has(productId)) {
          productIds.add(productId);
          productDataMap[productId] = {
            image_url: imageUrl,
            score: item.score || item.similarity_score,
          };
        }
      }

      if (productIds.size === 0) {
        return this.searchProductsDirectDB(query, workspaceData.workspace_id, limit);
      }

      // Fetch full product details
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, description, metadata')
        .in('id', Array.from(productIds));

      if (error) throw error;
      if (!products || products.length === 0) {
        return this.searchProductsDirectDB(query, workspaceData.workspace_id, limit);
      }

      // Get images for products that don't have them from search results
      const productsNeedingImages = products.filter(p => !productDataMap[p.id]?.image_url).map(p => p.id);

      if (productsNeedingImages.length > 0) {
          const { data: relationships } = await supabase
          .from('image_product_associations')
          .select('product_id, image:document_images(image_url)')
          .in('product_id', productsNeedingImages)
          .order('overall_score', { ascending: false });

        if (relationships) {
          for (const rel of relationships) {
            if (!productDataMap[rel.product_id]?.image_url && rel.image?.image_url) {
              productDataMap[rel.product_id] = {
                ...productDataMap[rel.product_id],
                image_url: rel.image.image_url,
              };
            }
          }
        }
      }

      // Combine and return sorted by relevance
      return products.map(product => ({
        ...product,
        image_url: productDataMap[product.id]?.image_url || undefined,
      })).sort((a, b) => {
        const scoreA = productDataMap[a.id]?.score || 0;
        const scoreB = productDataMap[b.id]?.score || 0;
        return scoreB - scoreA;
      });
    } catch (error) {
      console.error('MIVAA search error:', error);
      // Fallback to direct DB search
      return this.searchProductsDirectDB(query, workspaceData.workspace_id, limit);
    }
  }

  /**
   * Direct database search fallback when MIVAA API is unavailable
   */
  private async searchProductsDirectDB(
    query: string,
    workspaceId: string,
    limit: number,
  ): Promise<(Product & { image_url?: string })[]> {
    // Search products by name or description
    // Note: products table doesn't have 'sku' column - it may be in metadata
    const searchTerms = query.split(/\s+/).filter(t => t.length > 1);

    // Build OR conditions for each search term across name and description
    let orConditions = '';
    if (searchTerms.length > 0) {
      const conditions: string[] = [];
      for (const term of searchTerms) {
        conditions.push(`name.ilike.%${term}%`);
        conditions.push(`description.ilike.%${term}%`);
      }
      orConditions = conditions.join(',');
    } else {
      // Fallback to full query if no valid terms
      orConditions = `name.ilike.%${query}%,description.ilike.%${query}%`;
    }

    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, description, metadata')
      .eq('workspace_id', workspaceId)
      .or(orConditions)
      .limit(limit);

    if (error) throw error;
    if (!products || products.length === 0) return [];

    // Get images for these products from image_product_associations
    const productIds = products.map(p => p.id);
    const { data: relationships } = await supabase
      .from('image_product_associations')
      .select('product_id, image:document_images(image_url)')
      .in('product_id', productIds)
      .order('overall_score', { ascending: false });

    // Create a map of product_id to first image URL
    const productImageMap: Record<string, string> = {};
    if (relationships) {
      for (const rel of relationships) {
        if (!productImageMap[rel.product_id] && rel.image?.image_url) {
          productImageMap[rel.product_id] = rel.image.image_url;
        }
      }
    }

    // Combine products with their images
    return products.map(product => ({
      ...product,
      image_url: productImageMap[product.id] || undefined,
    }));
  }

  // =====================================================
  // QUOTE ACCEPTANCE
  // =====================================================

  /**
   * Accept a quote with validation
   * Validates that all upsells have been decided before accepting
   */
  async acceptQuote(quoteId: string): Promise<{ success: boolean; error?: string }> {
    // Get quote upsells
    const upsells = await this.getQuoteUpsells(quoteId);

    // Check if all upsells have been decided
    const pendingUpsells = upsells.filter(u => u.customer_accepted === null);
    if (pendingUpsells.length > 0) {
      return {
        success: false,
        error: `Please decide on all ${pendingUpsells.length} pending extra(s) before accepting the quote.`,
      };
    }

    // Update quote status to accepted
    await this.updateQuote(quoteId, { status: 'accepted' });

    // Initialize timeline for the quote
    await this.initializeQuoteTimeline(quoteId);

    return { success: true };
  }

  /**
   * Get quote timeline
   */
  async getQuoteTimeline(quoteId: string): Promise<QuoteTimeline[]> {
    const { data, error } = await supabase
      .from('quote_timeline')
      .select('*, timeline_step:timeline_steps(*), quote_item:quote_items(id, product_id, custom_product_name, product:products(name))')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Initialize quote timeline (create entries for all active steps)
   */
  async initializeQuoteTimeline(quoteId: string): Promise<void> {
    const steps = await this.getTimelineSteps();

    const timelineEntries = steps.map(step => ({
      quote_id: quoteId,
      timeline_step_id: step.id,
      status: 'pending' as const,
    }));

    const { error } = await supabase
      .from('quote_timeline')
      .insert(timelineEntries);

    if (error) throw error;
  }

  /**
   * Update timeline step status
   */
  async updateTimelineStep(
    quoteTimelineId: string,
    data: {
      status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
      notes?: string;
    },
  ): Promise<QuoteTimeline> {
    const updateData: Record<string, unknown> = { ...data };

    if (data.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: timeline, error } = await supabase
      .from('quote_timeline')
      .update(updateData)
      .eq('id', quoteTimelineId)
      .select('*, timeline_step:timeline_steps(*)')
      .single();

    if (error) throw error;
    return timeline;
  }

  /**
   * Add a single timeline step to a quote
   */
  async addTimelineStepToQuote(
    quoteId: string,
    timelineStepId: string,
    notes?: string,
    quoteItemId?: string,
  ): Promise<QuoteTimeline> {
    // Get the current max order for this quote
    const { data: existingSteps } = await supabase
      .from('quote_timeline')
      .select('step_order')
      .eq('quote_id', quoteId)
      .order('step_order', { ascending: false })
      .limit(1);

    const nextOrder = existingSteps && existingSteps.length > 0 ? existingSteps[0].step_order + 1 : 1;

    const { data, error } = await supabase
      .from('quote_timeline')
      .insert({
        quote_id: quoteId,
        timeline_step_id: timelineStepId,
        step_order: nextOrder,
        status: 'pending',
        notes: notes || null,
        quote_item_id: quoteItemId || null,
      })
      .select('*, timeline_step:timeline_steps(*), quote_item:quote_items(id, product_id, custom_product_name, product:products(name))')
      .single();

    if (error) throw error;
    return data;
  }

  // =====================================================
  // QUOTE REVISIONS (Phase 2)
  // =====================================================

  /**
   * Issue a new revision of an existing quote.
   * Clones the source quote + all its items, links via parent_quote_id,
   * sets revision_number = max(siblings)+1, status='draft'.
   * The revision becomes the new "live" doc; the original is kept untouched
   * so the audit trail of what was sent + accepted remains intact.
   */
  /** Derive an end-user (client) quote from this quote at +margin% (#177). Returns the new quote id. */
  async generateClientQuote(sourceQuoteId: string, marginPct: number): Promise<string> {
    const { data, error } = await supabase.rpc('generate_client_quote', {
      p_source_quote_id: sourceQuoteId,
      p_margin_pct: marginPct,
    });
    if (error) throw error;
    return data as string;
  }

  async issueRevision(sourceQuoteId: string): Promise<Quote> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Pull the source quote
    const { data: source, error: srcErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', sourceQuoteId)
      .single();
    if (srcErr || !source) throw srcErr || new Error('Source quote not found');

    // Find the root of the chain (could be sourceQuote itself, or its parent if it's already a rev)
    const rootId = (source as any).parent_quote_id || source.id;

    // Find the max revision_number across the chain (root + all its revisions)
    const { data: chain } = await (supabase as any)
      .from('quotes')
      .select('id, revision_number')
      .or(`id.eq.${rootId},parent_quote_id.eq.${rootId}`);
    const maxRev = (chain || []).reduce(
      (m: number, r: any) => Math.max(m, r.revision_number || 1),
      1,
    );

    // Insert the new revision
    const { data: newQuote, error: insErr } = await (supabase as any)
      .from('quotes')
      .insert({
        user_id: user.id,
        workspace_id: source.workspace_id ?? null,
        project_id: source.project_id ?? null,
        parent_quote_id: rootId,
        revision_number: maxRev + 1,
        name: source.name ? `${source.name} (rev ${maxRev + 1})` : `Revision ${maxRev + 1}`,
        notes: source.notes ?? null,
        customer_company_id: source.customer_company_id ?? null,
        customer_contact_id: source.customer_contact_id ?? null,
        currency: source.currency ?? 'EUR',
        vat_rate: source.vat_rate ?? null,
        status: 'draft',
      })
      .select()
      .single();
    if (insErr) throw insErr;

    // Clone items
    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', sourceQuoteId);

    if (items && items.length > 0) {
      const rows = items.map((it: any) => {
        const { id, quote_id, added_at, ...rest } = it;
        return { ...rest, quote_id: newQuote.id };
      });
      const { error: itemsErr } = await (supabase as any).from('quote_items').insert(rows);
      if (itemsErr) throw itemsErr;
    }

    return newQuote as Quote;
  }

  /**
   * List the full revision chain for a quote (root + all its revisions, sorted by revision_number).
   */
  async listRevisionChain(quoteId: string): Promise<Quote[]> {
    const { data: q } = await supabase
      .from('quotes')
      .select('id, parent_quote_id')
      .eq('id', quoteId)
      .maybeSingle();
    if (!q) return [];
    const rootId = (q as any).parent_quote_id || (q as any).id;

    const { data: chain, error } = await (supabase as any)
      .from('quotes')
      .select('*')
      .or(`id.eq.${rootId},parent_quote_id.eq.${rootId}`)
      .order('revision_number', { ascending: true });
    if (error) throw error;
    return (chain || []) as Quote[];
  }
}

export const quotesService = new QuotesService();

