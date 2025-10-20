import { SupabaseApiService } from '../base/ApiService';

export interface Commission {
  id: string;
  moodboard_id: string;
  moodboard_creator_id: string;
  requester_id: string;
  quote_request_id: string;
  commission_percentage: number;
  commission_amount?: number;
  status: 'pending' | 'approved' | 'paid';
  created_at: string;
  updated_at: string;
}

export interface CommissionSummary {
  total_commission: number;
  pending_commission: number;
  approved_commission: number;
  paid_commission: number;
}

/**
 * Commission Service
 * Manages commission tracking through the moodboard-quote-api Edge Function
 */
export class CommissionService {
  private apiService: SupabaseApiService;

  constructor() {
    this.apiService = new SupabaseApiService();
  }

  /**
   * Get user's commissions
   */
  async getCommissions(
    limit: number = 50,
    offset: number = 0,
  ): Promise<{
    data: Commission[];
    count: number;
    totals: CommissionSummary;
  }> {
    try {
      const response = await this.apiService.call<
        { limit: number; offset: number },
        {
          data: Commission[];
          count: number;
          totals: CommissionSummary;
        }
      >(
        'moodboard-quote-api',
        { limit, offset },
        { method: 'GET' },
      );

      return response;
    } catch (error) {
      console.error('Error getting commissions:', error);
      throw error;
    }
  }

  /**
   * Calculate commission amount
   */
  calculateCommissionAmount(
    proposalTotal: number,
    commissionPercentage: number,
  ): number {
    return (proposalTotal * commissionPercentage) / 100;
  }

  /**
   * Get commission status label
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      approved: 'Approved',
      paid: 'Paid',
    };
    return labels[status] || status;
  }

  /**
   * Check if commission is pending
   */
  isPending(commission: Commission): boolean {
    return commission.status === 'pending';
  }

  /**
   * Check if commission is approved
   */
  isApproved(commission: Commission): boolean {
    return commission.status === 'approved';
  }

  /**
   * Check if commission is paid
   */
  isPaid(commission: Commission): boolean {
    return commission.status === 'paid';
  }

  /**
   * Format commission amount as currency
   */
  formatAmount(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  /**
   * Get commission summary
   */
  async getCommissionSummary(): Promise<CommissionSummary> {
    try {
      const result = await this.getCommissions(1, 0);
      return result.totals;
    } catch (error) {
      console.error('Error getting commission summary:', error);
      throw error;
    }
  }

  /**
   * Filter commissions by status
   */
  filterByStatus(commissions: Commission[], status: string): Commission[] {
    return commissions.filter(c => c.status === status);
  }

  /**
   * Sort commissions by date
   */
  sortByDate(commissions: Commission[], ascending: boolean = false): Commission[] {
    return [...commissions].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }

  /**
   * Sort commissions by amount
   */
  sortByAmount(commissions: Commission[], ascending: boolean = false): Commission[] {
    return [...commissions].sort((a, b) => {
      const amountA = a.commission_amount || 0;
      const amountB = b.commission_amount || 0;
      return ascending ? amountA - amountB : amountB - amountA;
    });
  }
}

export default CommissionService;

