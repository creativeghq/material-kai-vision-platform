import { SupabaseApiService } from '../base/ApiService';

export interface QuoteRequest {
  id: string;
  user_id: string;
  cart_id: string;
  workspace_id?: string;
  status: 'pending' | 'updated' | 'approved' | 'rejected';
  items_count: number;
  total_estimated?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequestWithItems extends QuoteRequest {
  items?: any[];
}

/**
 * Quote Request Service
 * Manages quote request operations through the quote-request-api Edge Function
 */
export class QuoteRequestService {
  private apiService: SupabaseApiService;

  constructor() {
    this.apiService = new SupabaseApiService();
  }

  /**
   * Submit a quote request
   */
  async submitRequest(
    cartId: string,
    workspaceId?: string,
    notes?: string
  ): Promise<QuoteRequest> {
    try {
      const response = await this.apiService.call<
        { cart_id: string; workspace_id?: string; notes?: string },
        { data: QuoteRequest }
      >(
        'quote-request-api',
        { cart_id: cartId, workspace_id: workspaceId, notes },
        { method: 'POST' }
      );

      return response as unknown as QuoteRequest;
    } catch (error) {
      console.error('Error submitting quote request:', error);
      throw error;
    }
  }

  /**
   * Get all quote requests (user's own or admin view)
   */
  async getRequests(
    limit: number = 50,
    offset: number = 0,
    isAdmin: boolean = false
  ): Promise<{ data: QuoteRequest[]; count: number }> {
    try {
      const response = await this.apiService.call<
        { limit: number; offset: number; admin: boolean },
        { data: QuoteRequest[]; count: number }
      >(
        'quote-request-api',
        { limit, offset, admin: isAdmin },
        { method: 'GET' }
      );

      return response as unknown as { data: QuoteRequest[]; count: number };
    } catch (error) {
      console.error('Error getting quote requests:', error);
      throw error;
    }
  }

  /**
   * Get a specific quote request
   */
  async getRequest(requestId: string): Promise<QuoteRequestWithItems> {
    try {
      const response = await this.apiService.call<
        { request_id: string },
        QuoteRequestWithItems
      >(
        'quote-request-api',
        { request_id: requestId },
        { method: 'GET' }
      );

      return response as unknown as QuoteRequestWithItems;
    } catch (error) {
      console.error('Error getting quote request:', error);
      throw error;
    }
  }

  /**
   * Update quote request status
   */
  async updateStatus(requestId: string, status: string): Promise<QuoteRequest> {
    try {
      const response = await this.apiService.call<
        { request_id: string; status: string },
        QuoteRequest
      >(
        'quote-request-api',
        { request_id: requestId, status },
        { method: 'PUT' }
      );

      return response as unknown as QuoteRequest;
    } catch (error) {
      console.error('Error updating quote request:', error);
      throw error;
    }
  }

  /**
   * Get quote request status
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      updated: 'Updated',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    return labels[status] || status;
  }

  /**
   * Check if quote request is pending
   */
  isPending(request: QuoteRequest): boolean {
    return request.status === 'pending';
  }

  /**
   * Check if quote request has been updated
   */
  isUpdated(request: QuoteRequest): boolean {
    return request.status === 'updated';
  }
}

export default QuoteRequestService;

