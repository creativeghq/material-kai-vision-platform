import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { ADMIN_ROLES, isAdmin as isAdminRole } from '@/auth/roles';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { productDetailService } from '@/services/productDetailService';
import { variantKey } from '@/services/lineIdentityRules';

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
  // 'expired' = the storage-retention sweep purged the stored PDF; QuotePDFService.refreshPDFUrl
  // rebuilds it on open (regeneration is credit-free). It was missing from this union while the
  // DB CHECK also rejected it, so the sweep threw on every run and the rebuild branch was dead.
  pdf_generation_status?: 'pending' | 'generating' | 'completed' | 'failed' | 'expired' | null;
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
  custom_image_url?: string;
  // Pricing fields
  unit_price?: number;
  discounted_price?: number;
  /** DERIVED in SQL (generated column) — read it, never send it. #358 PQ-6. */
  line_total?: number;
  // FF&E fields
  room?: string;
  /** Structured room linkage. Wins over freeform `room` when set. */
  room_id?: string | null;
  dimensions?: string;
  installation_requirements?: string;
  delivery_date?: string;
}

/** The derived money on a quote — the shape `public.get_quote_totals` returns. */
export interface QuoteTotals {
  quote_id: string;
  subtotal: number;
  cash_discount_pct: number;
  discount: number;
  price_after_discount: number;
  extras_total: number;
  taxable_base: number;
  vat_rate: number;
  vat_amount: number;
  grand_total: number;
}

export interface QuoteWithItems extends Quote {
  items?: QuoteItemWithProduct[];
  /** CRM company/contact name behind `customer_company_id`/`customer_contact_id`, resolved on read. */
  customer_name?: string | null;
}

/**
 * Batch-resolve the CRM display name behind each quote's customer FK, keyed by that FK's id.
 * Two `in()` queries regardless of list length — the quote row itself stores only uuids.
 */
async function resolveCustomerNames(quotes: Quote[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const companyIds = [...new Set(quotes.map((q) => q.customer_company_id).filter(Boolean))] as string[];
  const contactIds = [...new Set(quotes.map((q) => q.customer_contact_id).filter(Boolean))] as string[];

  const [companies, contacts] = await Promise.all([
    companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as any[] }),
    contactIds.length ? supabase.from('crm_contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  // A missing name must not break the list — the filter just won't offer that option.
  for (const row of (companies as any).data ?? []) if (row?.name) names.set(row.id, row.name);
  for (const row of (contacts as any).data ?? []) if (row?.name) names.set(row.id, row.name);
  return names;
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

/**
 * A request nobody has quoted yet — an inbox row, not a quote.
 *
 * Carries no total, deliberately. Nothing has been priced, and a number here would anchor the
 * negotiation on a figure that came from nowhere.
 */
export interface UnquotedRequest {
  id: string;
  created_at: string;
  status: string;
  source: string;
  notes: string | null;
  contact_name: string | null;
  contact_email: string | null;
  spec: Record<string, unknown>;
  from_embed: boolean;
  /**
   * The AI impression the visitor was looking at when they asked (#341 join 7), when the catalogue
   * had nothing to show them. Null means none was generated — never "we lost it".
   */
  generated_image_url: string | null;
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

/**
 * What a quote line needs to know about its product (#368 follow-up).
 *
 * These are the only fields the quote surfaces actually read off the embed. The cost columns are
 * NOT among them and cannot be: `authenticated` has no SELECT privilege on `products.cost` /
 * `cost_currency` at all since #358, so naming one here would fail the whole embed rather than
 * over-share. The seller's cost arrives through `productDetailService.costs()`, which gates on
 * `is_workspace_sell_side` — the same treatment the per-line `cost_snapshot` got.
 */
const QUOTE_PRODUCT_SELECT = 'id, name, sku, description, metadata';

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
    /** Optional customer link (used by the Sales portal — rep builds a quote for a customer). */
    customer_contact_id?: string | null;
    customer_company_id?: string | null;
    /** Source moodboard, when the quote was generated from one (real FK, not a name match). */
    moodboard_id?: string | null;
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
        moodboard_id: data?.moodboard_id ?? null,
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
   * Create a quote OWNED BY another member of the workspace.
   *
   * Not a variant of `createQuote` with a `user_id` argument: the RLS INSERT policy on
   * `quotes` checks only `is_workspace_member(workspace_id)` and never binds `user_id`, so
   * a client-side insert would let any member attribute a quote to anyone. The RPC verifies
   * the caller administers the workspace AND that the target is an active member of it.
   */
  async createQuoteForMember(data: {
    ownerUserId: string;
    workspaceId: string;
    name?: string;
    notes?: string;
    custom_request_text?: string;
  }): Promise<Quote> {
    const { data: quote, error } = await supabase.rpc('create_quote_for_member', {
      p_workspace_id: data.workspaceId,
      p_owner_user_id: data.ownerUserId,
      p_name: data.name ?? null,
      p_notes: data.notes ?? null,
      p_custom_request_text: data.custom_request_text ?? null,
    });

    if (error) throw error;
    const created = quote as unknown as Quote;

    flowEventService.emit('quote_requested', {
      quote_id: created.id,
      user_id: data.ownerUserId,
      name: created.name,
      status: created.status,
    });

    return created;
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
   * Quotes for the ACTIVE WORKSPACE, with their items (the /quotes list and the sales portal).
   *
   * The workspace filter is explicit and it is not a duplicate of RLS. The read policy on
   * `quotes` is `user_id = auth.uid() OR is_workspace_admin(ws) OR is_workspace_sales_manager(ws)`
   * — a user-and-role rule, not a workspace one — so an unfiltered select returns every quote the
   * caller owns ANYWHERE plus every quote of every workspace they administer, all merged into one
   * list. Every count next to it (the dashboard's Quotes block, this page's own stat cards) is
   * scoped to one workspace, so the tile and the list it links to disagreed by exactly the quotes
   * belonging to the other workspaces.
   */
  async getUserQuotes(): Promise<QuoteWithItems[]> {
    const { data: userData } = await supabase.auth.getUser();
    const workspaceId = getActiveWorkspaceId(userData.user?.id);
    let q = supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });
    // No active workspace resolved (first load, storage blocked) → fall back to RLS alone rather
    // than showing an empty list, which would read as "you have no quotes".
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data: quotes, error: quotesError } = await q;

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

    // Resolve customer names in two batched lookups. Without these the quote row carries only
    // bare uuids, which is why the list could offer a "has customer" flag but not a real
    // customer filter — there was nothing to label the options with.
    const customerNames = await resolveCustomerNames(quotes);

    // Combine quotes with their items
    return quotes.map((quote: Quote) => ({
      ...quote,
      items: itemsByQuoteId[quote.id] || [],
      customer_name: customerNames.get(quote.customer_company_id ?? quote.customer_contact_id ?? '') ?? null,
    }));
  }

  /**
   * Get a specific quote with its items
   *
   * `includeCost` is a SELLER switch (#368 follow-up). The embed used to be
   * `product:products(*)`, and `products` carries `cost`, `cost_source`, `markup_percent`,
   * `supplier_company_id` and the raw supplier feed in `attributes_raw`. This method backs the
   * customer page (`/quotes/:id`, no admin gate) as well as the admin one, and `quote_items`'
   * RLS only requires workspace membership — which a project client has. So every one of those
   * columns was landing in the customer's browser on the page where they read their own quote.
   * The list scrubbed cost before RENDER (`convertToDisplayProduct` sets `wholesale: 0`), which
   * is why nothing looked wrong; the row was already over the wire.
   *
   * Per-line `cost_snapshot` is no longer a column on `quote_items` at all — it lives in
   * `quote_item_costs`, whose RLS answers only the sell side (#358 PQ-2). `includeCost` decides
   * whether to go and ask for it; a customer asking gets an empty set, not a filtered row.
   */
  async getQuote(quoteId: string, opts?: { includeCost?: boolean }): Promise<QuoteWithItems> {
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (quoteError) throw quoteError;

    const { data: items, error: itemsError } = await supabase
      .from('quote_items')
      .select(`*, product:products(${QUOTE_PRODUCT_SELECT})`)
      .eq('quote_id', quoteId)
      .order('added_at', { ascending: true });

    if (itemsError) throw itemsError;

    // Two cost basifications, both sell-side-gated at the database: what this LINE was quoted at
    // (frozen on acceptance) and what the product costs TODAY. The seller view needs the second
    // for a line that has no snapshot yet; a customer asking for either gets an empty map.
    const costByItemId = opts?.includeCost
      ? await this.getQuoteItemCosts(quoteId)
      : new Map<string, number>();
    const productCosts = opts?.includeCost
      ? await productDetailService.costs((items ?? []).map((it) => it.product_id))
      : new Map();

    // Fetch images for all products in this quote
    const productIds = (items || [])
      .filter(item => item.product?.id)
      .map(item => item.product!.id);

    // #374 Phase 8 — THE image for this line: the chosen variant's own photo, else a general
    // product photo, never another variant's. Derived by `get_product_variant_images` because
    // this was resolved independently here and in generate-quote-pdf (which did not even order by
    // score), so the quote on screen and the quote PDF could show different photos for one
    // product — the five-money-derivations shape, in pixels.
    const productImageMap: Record<string, string> = {};
    if (productIds.length > 0) {
      try {
        const { data: imageRows } = await (supabase as any).rpc('get_product_variant_images', {
          p_pairs: (items || [])
            .filter((it) => it.product?.id)
            .map((it) => ({
              product_id: it.product!.id,
              variant_key: variantKey(it.selected_attributes as Record<string, string> | null),
            })),
        });
        for (const r of (imageRows ?? []) as Array<{ product_id: string; image_url: string | null }>) {
          if (r.image_url && !productImageMap[r.product_id]) productImageMap[r.product_id] = r.image_url;
        }
      } catch { /* a thumbnail is an aid; the quote still opens without it */ }
    }

    // Attach images to products
    const itemsWithImages = (items || []).map(item => ({
      ...item,
      cost_snapshot: costByItemId.get(item.id) ?? null,
      product: item.product ? {
        ...item.product,
        image_url: productImageMap[item.product.id] || item.product.image_url,
        cost: productCosts.get(item.product.id)?.cost ?? null,
        cost_currency: productCosts.get(item.product.id)?.cost_currency ?? null,
      } : item.product,
    }));

    return {
      ...quote,
      items: itemsWithImages,
    };
  }

  /**
   * THE money on a quote, derived — subtotal, the cash discount, accepted extras, the taxable
   * base, VAT and the grand total.
   *
   * `public.get_quote_totals(uuid[])` is the single source (CLAUDE.md, "one derivation per money
   * quantity"). Read it rather than the cached `quotes.subtotal` / `vat_amount` / `grand_total`
   * columns: those are restamped by `reprice_quote_items` and are stale between repricings — the
   * cached `extras_total` was removed outright because its writer missed the delete path.
   *
   * Returns null when the derivation could not be read. A caller must render that as "unknown",
   * never as zero.
   */
  async getQuoteTotals(quoteId: string): Promise<QuoteTotals | null> {
    const { data, error } = await (supabase as any).rpc('get_quote_totals', { p_quote_ids: [quoteId] });
    if (error) {
      console.error('[QuotesService] get_quote_totals failed - totals are unknown, not zero:', error);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return (row as QuoteTotals | undefined) ?? null;
  }

  /**
   * Per-line procurement cost for a quote, keyed by quote_item id.
   *
   * `quote_item_costs` is gated on `is_workspace_sell_side(workspace_id)`, so this returns an
   * EMPTY map — not an error — for a customer or a project collaborator. That is the point: the
   * seller's cost basis is withheld by the database, not by whether a component asked for it.
   */
  async getQuoteItemCosts(quoteId: string): Promise<Map<string, number>> {
    const { data, error } = await (supabase as any)
      .from('quote_item_costs')
      .select('quote_item_id, cost_snapshot')
      .eq('quote_id', quoteId);
    // A failed read is "cost unknown", never "cost is zero" — the caller renders a dash.
    if (error) {
      console.error('[QuotesService] quote_item_costs read failed - margin is unknown, not zero:', error);
      return new Map();
    }
    const map = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ quote_item_id: string; cost_snapshot: number | null }>) {
      if (row.cost_snapshot != null) map.set(row.quote_item_id, Number(row.cost_snapshot));
    }
    return map;
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
      // A quote born without a customer can be given one later (drives pricing/email/invoicing).
      // Pass exactly one; the other is nulled so the pair stays mutually exclusive.
      customer_company_id?: string | null;
      customer_contact_id?: string | null;
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
          // Without workspace_id the flow-engine can only match GLOBAL flows for a user caller, so a
          // tenant's own quote_approved/rejected automation would silently never fire.
          workspace_id: quote.workspace_id,
          admin_ids: adminIds,
          type: accepted ? 'quote_accepted' : 'quote_rejected',
          title: accepted ? `Quote ${quoteRef} accepted` : `Quote ${quoteRef} declined`,
          body: accepted ? 'A client has accepted the quote.' : 'A client has declined the quote.',
          action_url: `/quotes/manage/${quote.id}`,
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
    // Resolve default unit from product metadata
    let customUnit: string | null = null;
    try {
      const { data: product } = await supabase
        .from('products')
        .select('metadata')
        .eq('id', data.product_id)
        .single();
      if (product?.metadata?.unit) {
        customUnit = product.metadata.unit;
      }
    } catch { /* non-fatal — falls back to null (displays as pcs) */ }

    // pre-fill the line from the cascade resolver so catalog lines aren't blank.
    // For an OWN product the resolved figure IS the sell price; for an operator-catalog
    // product it's the seller's COST (snapshotted so margin is computable) and seeds the
    // unit_price as a starting sell the seller marks up.
    const qtyNow = data.quantity || 1;
    let unitPrice: number | null = null;
    let costSnapshot: number | null = null;
    let retailPrice: number | null = null;
    // Line pricing state. Unpriced operator-catalog lines become
    // "call for price" (rendered as such, excluded from totals, RFQ-able upstream)
    // instead of a silently-broken NULL-priced line.
    let pricingStatus: 'priced' | 'call_for_price' = 'priced';
    // Needed after the try block: the cost basis is written to `quote_item_costs`, which is
    // scoped by workspace (#358 PQ-2).
    let quoteWorkspaceId: string | null = null;
    try {
      const { data: quote } = await supabase
        .from('quotes')
        .select('workspace_id, customer_company_id, customer_contact_id')
        .eq('id', data.quote_id)
        .single();
      quoteWorkspaceId = quote?.workspace_id ?? null;
      if (quote?.workspace_id) {
        // Pass the quote's customer so the resolver applies their pricing-level discount.
        // audience='seller' → staff get cost_basis + margin (never exposed to the buyer).
        // Quantity + unit so `product_price_breaks` can fire (#347 defect 16). They travel
        // together or not at all: `get_product_price_break` does
        // `coalesce(convert_to_base_unit(product, qty, unit), qty)`, so a quantity sent without
        // its unit is silently read as already being in base units and can match the wrong
        // threshold — "5 pallets" firing at 5 pieces is exactly what the UoM ladder prevents.
        const breakArgs = customUnit && qtyNow > 0
          ? { p_quantity: qtyNow, p_unit: customUnit }
          : {};
        const { data: priced } = await supabase.rpc('get_product_price_for_workspace', {
          p_workspace_id: quote.workspace_id,
          p_product_id: data.product_id,
          p_company_id: quote.customer_company_id ?? null,
          p_contact_id: quote.customer_contact_id ?? null,
          p_audience: 'seller',
          // #374 Phase 4 — price THIS variant. The resolver prefers a row keyed to it and
          // falls back to the product-wide row, so a line that has chosen nothing prices
          // exactly as before. `variantKey` is the twin of SQL `_variant_key`, held equal by
          // tests/unit/variantKeyParity.test.ts.
          p_variant_key: variantKey(data.selected_attributes as Record<string, string> | undefined) ?? null,
          ...breakArgs,
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
          // Resolver couldn't produce a sell price → flag the line for pricing.
          if (p.unpriced === true) pricingStatus = 'call_for_price';
        }
      }
    } catch { /* non-fatal — leaves the line unpriced for manual entry */ }
    // Any catalog line we couldn't price is a call-for-price candidate.
    if (unitPrice == null) pricingStatus = 'call_for_price';

    // The category custom rules (Layer B) used to be applied HERE, in TypeScript, on top of what
    // the resolver returned — which meant a quote line and an order line for the same product and
    // customer produced different money. They now live inside `get_product_price_for_workspace`
    // and are already in `suggested_sell` above (#347 phase 1.1). Do not reintroduce a factor
    // here; `tests/unit/moneyDerivation.test.ts` fails the build if you do.

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
        // `line_total` is a generated column — SQL derives it from the price and the quantity.
        retail_price: retailPrice,
        pricing_status: pricingStatus,
      } as any)
      .select()
      .single();

    if (error) throw error;

    // The procurement cost lives beside the line, in a table only the sell side can read — the
    // quote_items ROW is readable by the customer and RLS cannot withhold a column (#358 PQ-2).
    if (costSnapshot != null && quoteWorkspaceId) {
      await (supabase as any).from('quote_item_costs').upsert({
        quote_item_id: item.id,
        quote_id: data.quote_id,
        workspace_id: quoteWorkspaceId,
        cost_snapshot: costSnapshot,
        cost_snapshot_currency: 'EUR',
        cost_snapshot_at: new Date().toISOString(),
        cost_snapshot_source: 'price_resolver',
      }, { onConflict: 'quote_item_id' });
    }

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
    custom_image_url?: string;
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
        custom_image_url: data.custom_image_url || null,
        quantity: qty,
        unit_price: unitPrice,
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
      custom_image_url?: string | null;
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
    // A quantity change re-runs the pricing engine (a new quantity can cross a volume break).
    // The LINE TOTAL is not computed here and never was ours to compute — it is a generated
    // column derived from the prices below (#358 PQ-6).
    const payload: Record<string, any> = { ...data };
    if (data.unit_price !== undefined || data.discounted_price !== undefined || data.quantity !== undefined) {
      const { data: current } = await supabase
        .from('quote_items')
        .select('unit_price, discounted_price, quantity, quote_id, product_id, custom_unit, selected_attributes')
        .eq('id', itemId)
        .single();
      if (current) {
        const qty = data.quantity ?? current.quantity ?? 1;

        // Option B: a quantity change (without an explicit price edit) ALWAYS re-runs the
        // engine so the line stays correct (e.g. crossing a volume threshold), overwriting any
        // prior price. Explicit price edits (data.unit_price set) are respected.
        if (data.quantity !== undefined && data.unit_price === undefined && current.product_id) {
          try {
            const { data: q } = await supabase
              .from('quotes')
              .select('workspace_id, customer_company_id, customer_contact_id')
              .eq('id', current.quote_id).single();
            if (q?.workspace_id) {
              // The product's own unit, so the resolver can convert the new quantity and match a
              // break threshold. It used to be read AFTER the pricing call (for the Layer-B
              // category, now gone), which is precisely why this branch — the "quantity changed,
              // reprice" path — could never tell the resolver what unit the quantity was in.
              const { data: prod } = await supabase.from('products').select('metadata').eq('id', current.product_id).single();
              const unit: string | null = prod?.metadata?.unit ?? current.custom_unit ?? null;
              // Together or not at all — an unconvertible/absent unit makes the resolver read the
              // raw quantity as base units and match the wrong threshold.
              const breakArgs = unit && qty > 0 ? { p_quantity: qty, p_unit: unit } : {};
              const { data: priced } = await supabase.rpc('get_product_price_for_workspace', {
                p_workspace_id: q.workspace_id, p_product_id: current.product_id,
                p_company_id: q.customer_company_id ?? null, p_contact_id: q.customer_contact_id ?? null,
                p_audience: 'seller',
                // #374 Phase 4 — a quantity change must reprice the SAME variant, not the
                // product-wide row. Without this the line silently jumped to the base price.
                p_variant_key: variantKey(
                  (current as { selected_attributes?: Record<string, string> | null }).selected_attributes,
                ) ?? null,
                ...breakArgs,
              });
              const p: any = priced;
              // `suggested_sell` is the WHOLE answer — level discount, quantity break and the
              // category custom rules are all inside it since #347 phase 1.1. Multiplying another
              // factor onto it here is what made the same product cost different money on a quote
              // than on an order.
              const recomputed = p?.suggested_sell != null ? Number(p.suggested_sell) : null;
              if (recomputed != null) {
                // The engine price replaces any prior per-line discount. Only the payload is
                // written — the line total that follows from these two is derived in SQL.
                payload.unit_price = recomputed;
                payload.discounted_price = null;
                // Keep the pre-discount retail anchor in sync with the same resolver call, else the
                // "X% off retail" line breakdown goes stale after a qty change.
                if (p?.retail != null) payload.retail_price = Number(p.retail);
              }
            }
          } catch { /* non-fatal — keep the existing price */ }
        }
      }
    }

    // Once a real sell price lands (manual entry, market-check accept, or a
    // successful qty re-resolve) an unpriced "call for price" line becomes priced, so the
    // quote can be accepted. A resolver that still can't price it stays call_for_price.
    if (payload.unit_price != null) payload.pricing_status = 'priced';

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
        // No cost here at all: the requests inbox reads only name and sku, and
        // `/quotes/requests` is a customer-facing route (#368 follow-up).
        const { data: items, error: itemsError } = await supabase
          .from('quote_items')
          .select(`*, product:products(${QUOTE_PRODUCT_SELECT})`)
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
   * quote_requests may not exist for draft quotes that haven't been submitted
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

  /**
   * Incoming requests that nobody has turned into a quote yet (#337).
   *
   * `getQuoteRequests()` above reads the `quotes` table, so despite its name it can only ever show
   * work that already exists. A request from the website embed has no quote — that is the entire
   * point of it — so it was landing in `quote_requests` and being seen by nobody: leads accumulating
   * in a table with no reader, which is the business-level version of the silent zero.
   *
   * `quote_id is null` is the definition of "not yet handled". The contact is resolved separately
   * rather than through a nested select because `crm_contacts` and `quote_requests` have no
   * PostgREST relationship declared, and a nested select that cannot resolve fails the whole query.
   */
  async listUnquotedRequests(workspaceId: string): Promise<UnquotedRequest[]> {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('id, created_at, status, source, spec, notes, customer_contact_id, embed_key_id, generated_image_url')
      .eq('workspace_id', workspaceId)
      .is('quote_id', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const contactIds = [...new Set(rows.map((r) => r.customer_contact_id).filter(Boolean))] as string[];
    const contacts = new Map<string, { name: string | null; email: string | null }>();
    if (contactIds.length > 0) {
      const { data: cs } = await supabase
        .from('crm_contacts')
        .select('id, name, email')
        .in('id', contactIds);
      for (const c of cs ?? []) contacts.set(c.id, { name: c.name, email: c.email });
    }

    return rows.map((r) => {
      const contact = r.customer_contact_id ? contacts.get(r.customer_contact_id) : undefined;
      return {
        id: r.id,
        created_at: r.created_at,
        status: r.status ?? 'pending',
        source: r.source,
        notes: r.notes,
        contact_name: contact?.name ?? null,
        contact_email: contact?.email ?? null,
        // The spec is the whole value of an embed lead: it says what the visitor actually wanted,
        // including the parts the catalog could not satisfy.
        spec: (r.spec ?? {}) as Record<string, unknown>,
        from_embed: r.embed_key_id != null,
        generated_image_url: (r as { generated_image_url?: string | null }).generated_image_url ?? null,
      };
    });
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
   * The customer's decision on one extra.
   *
   * Goes through `set_quote_upsell_decision` rather than a direct UPDATE: the row also carries
   * `metadata.custom_price` and `metadata.quantity`, which is what `get_quote_totals` prices the
   * extra from. A customer holding UPDATE on that row could re-price their own upsell. The RPC
   * writes `customer_accepted` + `decided_at` and nothing else (#358 PQ-2).
   *
   * There is no `extras_total` to restamp any more: `get_quote_totals` derives it from the
   * accepted upsells every time it is asked, so removing an accepted extra can no longer leave an
   * overstated cached total behind (#358 PQ-6).
   */
  async updateUpsellAcceptance(
    quoteUpsellId: string,
    accepted: boolean,
  ): Promise<QuoteUpsell> {
    return this.setUpsellDecision(quoteUpsellId, accepted);
  }

  /** Reset an upsell decision (back to undecided). */
  async resetUpsellDecision(quoteUpsellId: string): Promise<QuoteUpsell> {
    return this.setUpsellDecision(quoteUpsellId, null);
  }

  private async setUpsellDecision(quoteUpsellId: string, accepted: boolean | null): Promise<QuoteUpsell> {
    const { error } = await (supabase as any).rpc('set_quote_upsell_decision', {
      p_quote_upsell_id: quoteUpsellId,
      p_accepted: accepted,
    });
    if (error) throw error;

    const { data, error: readErr } = await supabase
      .from('quote_upsells')
      .select('*, upsell:upsells(*)')
      .eq('id', quoteUpsellId)
      .single();
    if (readErr) throw readErr;
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
    // Products table doesn't have 'sku' column - it may be in metadata
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
    // Reject acceptance of a lapsed offer. The daily `expire_due_quotes` cron flips
    // 'quoted' → 'expired', but guard here too to close the up-to-24h window between
    // expiry and the next cron run, and to surface a clear message.
    const { data: q } = await supabase
      .from('quotes')
      .select('status, expires_at')
      .eq('id', quoteId)
      .single();
    if (
      (q as { status?: string } | null)?.status === 'expired' ||
      ((q as { expires_at?: string } | null)?.expires_at &&
        new Date((q as { expires_at: string }).expires_at).getTime() < Date.now())
    ) {
      return { success: false, error: 'This quote has expired. Please request an updated quote.' };
    }

    // A quote with unpriced ("call for price" / awaiting-supplier) lines
    // cannot be accepted — there is no sale price. Resolve every line first (manual,
    // market-check, or upstream RFQ) before acceptance.
    const { count: unpricedCount } = await supabase
      .from('quote_items')
      .select('id', { count: 'exact', head: true })
      .eq('quote_id', quoteId)
      .neq('pricing_status', 'priced');
    if ((unpricedCount ?? 0) > 0) {
      return {
        success: false,
        error: `Please price all ${unpricedCount} "call for price" line(s) before accepting the quote.`,
      };
    }

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

    // Acceptance may materialize an upstream purchase order + mirrored parent sales
    // order (resale tree) via the accept trigger. The supplier workspace is notified server-side
    // by the _notify_upstream_order_created DB trigger (on the mirrored sales-order insert) — no
    // client-side emit needed here.

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
  /** Derive an end-user (client) quote from this quote at +margin%. Returns the new quote id. */
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
      // An explicit projection, not `...rest`: `line_total` is a generated column (the insert
      // would be rejected) and spreading a whole row into a write is mass assignment.
      const rows = items.map((it: any) => ({
        quote_id: newQuote.id,
        product_id: it.product_id ?? null,
        quantity: it.quantity,
        notes: it.notes ?? null,
        added_from: it.added_from ?? 'manual',
        selected_size: it.selected_size ?? null,
        selected_color: it.selected_color ?? null,
        selected_attributes: it.selected_attributes ?? {},
        unit_price: it.unit_price ?? null,
        discounted_price: it.discounted_price ?? null,
        retail_price: it.retail_price ?? null,
        pricing_status: it.pricing_status ?? 'priced',
        price_source: it.price_source ?? null,
        custom_product_name: it.custom_product_name ?? null,
        custom_product_description: it.custom_product_description ?? null,
        custom_sku: it.custom_sku ?? null,
        custom_unit: it.custom_unit ?? null,
        custom_image_url: it.custom_image_url ?? null,
        room: it.room ?? null,
        room_id: it.room_id ?? null,
        dimensions: it.dimensions ?? null,
        installation_requirements: it.installation_requirements ?? null,
        delivery_date: it.delivery_date ?? null,
        product_configuration_id: it.product_configuration_id ?? null,
      }));
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

