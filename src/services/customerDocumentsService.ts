import { supabase } from '@/integrations/supabase/client';

/** A customer-facing issued document (tax invoice or retail receipt). */
export interface CustomerInvoiceDoc {
  id: string;
  kind: 'invoice' | 'receipt';
  number: string;
  document_type: string | null;
  status: string;
  total: number;
  amount_due: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  pdf_url: string | null;
}

/** A payment receipt (απόδειξη είσπραξης) for money the customer paid. */
export interface CustomerReceiptDoc {
  id: string;
  number: string;
  amount: number;
  currency: string;
  method: string | null;
  paid_at: string | null;
  pdf_url: string | null;
}

/** A sales order placed by the customer (or the business they represent). */
export interface CustomerOrder {
  id: string;
  order_number: string | null;
  status: 'draft' | 'confirmed' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
  payment_status: 'unpaid' | 'partial' | 'paid';
  total: number;
  currency: string;
  created_at: string;
}

/** Per-currency account roll-up. `paid = billed − outstanding`. */
export interface CustomerAccountSummary {
  currency: string;
  billed: number;
  paid: number;
  outstanding: number;
  doc_count: number;
  order_count: number;
}

export interface CustomerOrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  net_value: number;
  vat_amount: number;
  line_total: number;
  quantity_delivered: number;
  sort_order: number;
}

export interface CustomerOrderDetail {
  order: CustomerOrder & { subtotal_net: number; vat_amount: number; notes: string | null };
  items: CustomerOrderItem[];
}

export interface MyDocumentsResult {
  linked: boolean;
  summary: CustomerAccountSummary[];
  orders: CustomerOrder[];
  invoices: CustomerInvoiceDoc[];
  receipts: CustomerReceiptDoc[];
}

export const customerDocumentsService = {
  /**
   * The signed-in customer's Client Portal payload: per-currency account summary,
   * sales orders, issued invoices / retail receipts, and payment receipts.
   * Goes through the `finance-customer-documents` edge function because the finance
   * tables are RLS-gated to workspace members (a customer is not one); the function
   * scopes strictly to records addressed to the caller's own linked CRM contacts.
   */
  async listMyDocuments(): Promise<MyDocumentsResult> {
    const { data, error } = await supabase.functions.invoke('finance-customer-documents', { body: { action: 'overview' } });
    if (error) throw error;
    return {
      linked: !!data?.linked,
      summary: (data?.summary ?? []) as CustomerAccountSummary[],
      orders: (data?.orders ?? []) as CustomerOrder[],
      invoices: (data?.invoices ?? []) as CustomerInvoiceDoc[],
      receipts: (data?.receipts ?? []) as CustomerReceiptDoc[],
    };
  },

  /** Line items for one of the caller's own orders (ownership enforced server-side). */
  async getOrderDetail(orderId: string): Promise<CustomerOrderDetail> {
    const { data, error } = await supabase.functions.invoke('finance-customer-documents', { body: { action: 'order_detail', order_id: orderId } });
    if (error) throw error;
    if (data?.ok === false || !data?.order) throw new Error(data?.error ?? 'Order not found');
    return { order: data.order as CustomerOrderDetail['order'], items: (data.items ?? []) as CustomerOrderItem[] };
  },
};
