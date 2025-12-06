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
  total_items: number;
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
   * Get all quote requests (submitted quotes)
   */
  async getQuoteRequests(): Promise<QuoteWithItems[]> {
    // Get all submitted quotes with their quote_requests
    const { data: quoteRequests, error: requestsError } = await supabase
      .from('quote_requests')
      .select('quote_id')
      .order('created_at', { ascending: false });

    if (requestsError) throw requestsError;

    if (!quoteRequests || quoteRequests.length === 0) {
      return [];
    }

    const quoteIds = quoteRequests
      .map(qr => qr.quote_id)
      .filter((id): id is string => id !== null);

    if (quoteIds.length === 0) {
      return [];
    }

    // Get quotes with items
    const quotes = await Promise.all(
      quoteIds.map(id => this.getQuote(id))
    );

    return quotes;
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
}

export const quotesService = new QuotesService();

