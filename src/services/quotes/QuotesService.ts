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
  }): Promise<Quote> {
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        name: data?.name,
        workspace_id: data?.workspace_id,
        notes: data?.notes,
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
}

export const quotesService = new QuotesService();

