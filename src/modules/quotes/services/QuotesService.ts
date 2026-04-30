import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { ADMIN_ROLES, isAdmin as isAdminRole } from '@/auth/roles';

// =====================================================
// INTERFACES
// =====================================================

export interface Quote {
  id: string;
  user_id: string;
  workspace_id?: string;
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
    notes?: string;
    custom_request_text?: string;
  }): Promise<Quote> {
    // user_id is required by the RLS policy on quotes
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        user_id: user.id, // required for RLS policy
        name: data?.name,
        workspace_id: data?.workspace_id,
        notes: data?.notes,
        custom_request_text: data?.custom_request_text,
        status: 'draft',
      })
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

    if (data.status === 'accepted') {
      flowEventService.emit('quote_approved', {
        quote_id: quote.id,
        user_id: quote.user_id,
      });
      // Notify workspace admins
      if (quote.workspace_id) {
        supabase
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', quote.workspace_id)
          .in('role', ADMIN_ROLES)
          .then(({ data: admins }) => {
            if (admins?.length) {
              supabase.from('user_notifications').insert(
                admins.map((m) => ({
                  user_id: m.user_id,
                  type: 'quote_accepted',
                  title: `Quote ${quote.quote_number || quote.id.slice(0, 8)} accepted`,
                  body: 'A client has accepted the quote.',
                  action_url: `/admin/quotes/${quote.id}`,
                  is_read: false,
                  metadata: { quote_id: quote.id },
                })),
              ).then(() => {});
            }
          });
      }
    } else if (data.status === 'rejected') {
      flowEventService.emit('quote_rejected', {
        quote_id: quote.id,
        user_id: quote.user_id,
      });
      // Notify workspace admins
      if (quote.workspace_id) {
        supabase
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', quote.workspace_id)
          .in('role', ADMIN_ROLES)
          .then(({ data: admins }) => {
            if (admins?.length) {
              supabase.from('user_notifications').insert(
                admins.map((m) => ({
                  user_id: m.user_id,
                  type: 'quote_rejected',
                  title: `Quote ${quote.quote_number || quote.id.slice(0, 8)} declined`,
                  body: 'A client has declined the quote.',
                  action_url: `/admin/quotes/${quote.id}`,
                  is_read: false,
                  metadata: { quote_id: quote.id },
                })),
              ).then(() => {});
            }
          });
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
    room?: string;
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

    const { data: item, error } = await supabase
      .from('quote_items')
      .insert({
        quote_id: data.quote_id,
        product_id: data.product_id,
        quantity: data.quantity || 1,
        notes: data.notes,
        added_from: data.added_from || 'manual',
        selected_size: data.selected_size,
        selected_color: data.selected_color,
        room: data.room || null,
        dimensions: data.dimensions || null,
        installation_requirements: data.installation_requirements || null,
        delivery_date: data.delivery_date || null,
        custom_unit: customUnit,
      })
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
        line_total: unitPrice != null ? unitPrice * qty : null,
        selected_size: data.selected_size || null,
        selected_color: data.selected_color || null,
        notes: data.notes || null,
        added_from: 'manual',
        room: data.room || null,
        dimensions: data.dimensions || null,
        installation_requirements: data.installation_requirements || null,
        delivery_date: data.delivery_date || null,
      })
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
      room?: string;
      dimensions?: string;
      installation_requirements?: string;
      delivery_date?: string | null;
      // Audit trail for admin price-lookup commits
      price_source?: string | null;
      price_lookup_call_id?: string | null;
    },
  ): Promise<QuoteItem> {
    // Recalculate line_total when pricing or quantity changes
    const payload: Record<string, any> = { ...data };
    if (data.unit_price !== undefined || data.discounted_price !== undefined || data.quantity !== undefined) {
      // Fetch current item to get missing values for recalculation
      const { data: current } = await supabase
        .from('quote_items')
        .select('unit_price, discounted_price, quantity')
        .eq('id', itemId)
        .single();
      if (current) {
        const qty = data.quantity ?? current.quantity ?? 1;
        const effectivePrice = data.discounted_price !== undefined
          ? data.discounted_price
          : (current.discounted_price ?? (data.unit_price !== undefined ? data.unit_price : current.unit_price));
        payload.line_total = effectivePrice != null ? Number(effectivePrice) * qty : null;
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
}

export const quotesService = new QuotesService();

