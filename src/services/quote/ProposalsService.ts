import { SupabaseApiService } from '../base/ApiService';

export interface ProposalItem {
  product_id: string;
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
  items: ProposalItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  accepted_at?: string;
}

/**
 * Proposals Service
 * Manages proposal operations through the proposals-api Edge Function
 */
export class ProposalsService {
  private apiService: SupabaseApiService;

  constructor() {
    this.apiService = new SupabaseApiService();
  }

  /**
   * Create a new proposal (admin only)
   */
  async createProposal(
    quoteRequestId: string,
    items: ProposalItem[],
    subtotal: number,
    tax: number = 0,
    discount: number = 0,
    notes?: string,
  ): Promise<Proposal> {
    try {
      const response = await this.apiService.call<
        {
          quote_request_id: string;
          items: ProposalItem[];
          subtotal: number;
          tax: number;
          discount: number;
          notes?: string;
        },
        { data: Proposal }
      >(
        'proposals-api',
        {
          quote_request_id: quoteRequestId,
          items,
          subtotal,
          tax,
          discount,
          notes,
        },
        { method: 'POST' },
      );

      return response as unknown as Proposal;
    } catch (error) {
      console.error('Error creating proposal:', error);
      throw error;
    }
  }

  /**
   * Get all proposals
   */
  async getProposals(
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: Proposal[]; count: number }> {
    try {
      const response = await this.apiService.call<
        { limit: number; offset: number },
        { data: Proposal[]; count: number }
      >('proposals-api', { limit, offset }, { method: 'GET' });

      return response as { data: Proposal[]; count: number };
    } catch (error) {
      console.error('Error getting proposals:', error);
      throw error;
    }
  }

  /**
   * Get a specific proposal
   */
  async getProposal(proposalId: string): Promise<Proposal> {
    try {
      const response = await this.apiService.call<
        { proposal_id: string },
        Proposal
      >('proposals-api', { proposal_id: proposalId }, { method: 'GET' });

      return response as Proposal;
    } catch (error) {
      console.error('Error getting proposal:', error);
      throw error;
    }
  }

  /**
   * Update proposal pricing
   */
  async updatePricing(
    proposalId: string,
    subtotal?: number,
    tax?: number,
    discount?: number,
    notes?: string,
  ): Promise<Proposal> {
    try {
      const response = await this.apiService.call<
        {
          proposal_id: string;
          subtotal?: number;
          tax?: number;
          discount?: number;
          notes?: string;
        },
        Proposal
      >(
        'proposals-api',
        {
          proposal_id: proposalId,
          subtotal,
          tax,
          discount,
          notes,
        },
        { method: 'PUT' },
      );

      return response as Proposal;
    } catch (error) {
      console.error('Error updating proposal:', error);
      throw error;
    }
  }

  /**
   * Send proposal to user
   */
  async sendProposal(proposalId: string): Promise<Proposal> {
    try {
      const response = await this.apiService.call<
        { proposal_id: string },
        Proposal
      >('proposals-api', { proposal_id: proposalId }, { method: 'PUT' });

      return response as Proposal;
    } catch (error) {
      console.error('Error sending proposal:', error);
      throw error;
    }
  }

  /**
   * Accept proposal (user)
   */
  async acceptProposal(proposalId: string): Promise<Proposal> {
    try {
      const response = await this.apiService.call<
        { proposal_id: string },
        Proposal
      >('proposals-api', { proposal_id: proposalId }, { method: 'PUT' });

      return response as Proposal;
    } catch (error) {
      console.error('Error accepting proposal:', error);
      throw error;
    }
  }

  /**
   * Calculate total
   */
  calculateTotal(
    subtotal: number,
    tax: number = 0,
    discount: number = 0,
  ): number {
    return subtotal + tax - discount;
  }

  /**
   * Get status label
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Draft',
      sent: 'Sent',
      accepted: 'Accepted',
      rejected: 'Rejected',
    };
    return labels[status] || status;
  }

  /**
   * Check if proposal is draft
   */
  isDraft(proposal: Proposal): boolean {
    return proposal.status === 'draft';
  }

  /**
   * Check if proposal is sent
   */
  isSent(proposal: Proposal): boolean {
    return proposal.status === 'sent';
  }

  /**
   * Check if proposal is accepted
   */
  isAccepted(proposal: Proposal): boolean {
    return proposal.status === 'accepted';
  }
}

export default ProposalsService;
