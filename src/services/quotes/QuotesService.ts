import { supabase } from '@/integrations/supabase/client';

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
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_id: string;
  quantity: number;
  notes?: string;
  added_from?: 'search' | 'agent' | '3d_generation' | 'manual' | 'product_page';
  added_at: string;
}

export interface QuoteWithItems extends Quote {
  items?: QuoteItem[];
}

export interface Product {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  metadata?: Record<string, any>;
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
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  timeline_step?: TimelineStep;
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
    // ✅ FIX (KAI-1M): Get current user_id for RLS policy
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        user_id: user.id, // ✅ Required for RLS policy
        name: data?.name,
        workspace_id: data?.workspace_id,
        notes: data?.notes,
        custom_request_text: data?.custom_request_text,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
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

    return {
      ...quote,
      items: items || [],
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
    }
  ): Promise<Quote> {
    const { data: quote, error } = await supabase
      .from('quotes')
      .update(data)
      .eq('id', quoteId)
      .select()
      .single();

    if (error) throw error;
    return quote;
  }

  /**
   * Delete a quote (only draft quotes can be deleted)
   */
  async deleteQuote(quoteId: string): Promise<void> {
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', quoteId)
      .eq('status', 'draft');

    if (error) throw error;
  }

  /**
   * Add item to quote
   */
  async addItem(data: {
    quote_id: string;
    product_id: string;
    quantity?: number;
    notes?: string;
    added_from?: QuoteItem['added_from'];
  }): Promise<QuoteItem> {
    const { data: item, error } = await supabase
      .from('quote_items')
      .insert({
        quote_id: data.quote_id,
        product_id: data.product_id,
        quantity: data.quantity || 1,
        notes: data.notes,
        added_from: data.added_from || 'manual',
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
    }
  ): Promise<QuoteItem> {
    const { data: item, error } = await supabase
      .from('quote_items')
      .update(data)
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
    // Update quote status
    await this.updateQuote(quoteId, {
      status: 'submitted',
      notes: notes,
    });

    // Create quote request
    const { error } = await supabase
      .from('quote_requests')
      .insert({
        quote_id: quoteId,
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
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      expires_at: quote.expires_at,
      days_until_expiration: daysUntilExpiration,
      is_expired: quote.status === 'expired' || daysUntilExpiration < 0,
    };
  }

  /**
   * Get all quote requests (ALL quotes for admin view)
   * ✅ FIX: Show all quotes, not just those with quote_requests entries
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
      })
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
   */
  async deleteQuoteRequest(quoteId: string): Promise<void> {
    // First delete the quote_request entry
    const { error: requestError } = await supabase
      .from('quote_requests')
      .delete()
      .eq('quote_id', quoteId);

    if (requestError) throw requestError;

    // Then delete the quote (this will cascade delete quote_items)
    const { error: quoteError } = await supabase
      .from('quotes')
      .delete()
      .eq('id', quoteId);

    if (quoteError) throw quoteError;
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
  async updateQuoteStatusTag(quoteId: string, statusTagId: string): Promise<Quote> {
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
  }): Promise<Upsell> {
    const { data: upsell, error } = await supabase
      .from('upsells')
      .insert({
        name: data.name,
        description: data.description,
        price: data.price,
        display_order: data.display_order || 0,
        is_active: true,
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
    }
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
    metadata?: { custom_price?: number; quantity?: number; measurement?: string }
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
    accepted: boolean
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
    }
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
   * Search products for adding to quotes
   */
  async searchProducts(query: string, limit: number = 10): Promise<Product[]> {
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

    // Search products by name or description
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, description, metadata')
      .eq('workspace_id', workspaceData.workspace_id)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data || [];
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
        error: `Please decide on all ${pendingUpsells.length} pending extra(s) before accepting the quote.`
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
      .select('*, timeline_step:timeline_steps(*)')
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
    }
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
    notes?: string
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
      })
      .select('*, timeline_step:timeline_steps(*)')
      .single();

    if (error) throw error;
    return data;
  }
}

export const quotesService = new QuotesService();

