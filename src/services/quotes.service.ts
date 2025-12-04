import { supabase } from '@/integrations/supabase/client';

export interface QuoteRequest {
  id: string;
  user_id: string;
  cart_id: string;
  workspace_id?: string;
  status: 'pending' | 'updated' | 'approved' | 'rejected';
  items_count?: number;
  total_estimated?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalItem {
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Proposal {
  id: string;
  quote_request_id: string;
  user_id: string;
  admin_id?: string;
  workspace_id?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  items?: ProposalItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  accepted_at?: string;
  quote_requests?: QuoteRequest;
}

/**
 * Quotes Service
 * Handles quote requests and proposals
 */
export const quotesService = {
  /**
   * Create a new quote request
   */
  async createQuoteRequest(data: {
    cart_id: string;
    workspace_id?: string;
    notes?: string;
  }): Promise<QuoteRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
      .from('quote_requests')
      .insert({
        user_id: user.id,
        cart_id: data.cart_id,
        workspace_id: data.workspace_id,
        notes: data.notes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  /**
   * Get all quote requests for the current user
   */
  async getQuoteRequests(): Promise<QuoteRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get a specific quote request
   */
  async getQuoteRequest(id: string): Promise<QuoteRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update quote request status
   */
  async updateQuoteRequestStatus(
    id: string,
    status: 'pending' | 'updated' | 'approved' | 'rejected'
  ): Promise<QuoteRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('quote_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get all proposals for the current user's quote requests
   */
  async getProposals(): Promise<Proposal[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        quote_requests (*)
      `)
      .eq('quote_requests.user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get a specific proposal
   */
  async getProposal(id: string): Promise<Proposal> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        quote_requests (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Verify user has access to this proposal
    if (data.quote_requests && data.quote_requests.user_id !== user.id) {
      throw new Error('Unauthorized');
    }

    return data;
  },

  /**
   * Accept or reject a proposal
   */
  async updateProposalStatus(
    id: string,
    status: 'accepted' | 'rejected'
  ): Promise<Proposal> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('proposals')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...(status === 'accepted' ? { accepted_at: new Date().toISOString() } : {})
      })
      .eq('id', id)
      .select(`
        *,
        quote_requests (*)
      `)
      .single();

    if (error) throw error;

    // Verify user has access to this proposal
    if (data.quote_requests && data.quote_requests.user_id !== user.id) {
      throw new Error('Unauthorized');
    }

    return data;
  },
};

