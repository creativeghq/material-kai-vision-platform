import { supabase } from '@/lib/supabase';

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
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/quote-requests`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create quote request');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Get all quote requests for the current user
   */
  async getQuoteRequests(): Promise<QuoteRequest[]> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/quote-requests`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch quote requests');
    }

    const result = await response.json();
    return result.data || [];
  },

  /**
   * Get a specific quote request
   */
  async getQuoteRequest(id: string): Promise<QuoteRequest> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/quote-requests/${id}`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch quote request');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Update quote request status
   */
  async updateQuoteRequestStatus(
    id: string,
    status: 'pending' | 'updated' | 'approved' | 'rejected'
  ): Promise<QuoteRequest> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/quote-requests/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update quote request');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Get all proposals for the current user's quote requests
   */
  async getProposals(): Promise<Proposal[]> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/proposals`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch proposals');
    }

    const result = await response.json();
    return result.data || [];
  },

  /**
   * Get a specific proposal
   */
  async getProposal(id: string): Promise<Proposal> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/proposals/${id}`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch proposal');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Accept or reject a proposal
   */
  async updateProposalStatus(
    id: string,
    status: 'accepted' | 'rejected'
  ): Promise<Proposal> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes-api/proposals/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update proposal');
    }

    const result = await response.json();
    return result.data;
  },
};

