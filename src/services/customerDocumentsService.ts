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

export interface MyDocumentsResult {
  linked: boolean;
  invoices: CustomerInvoiceDoc[];
  receipts: CustomerReceiptDoc[];
}

export const customerDocumentsService = {
  /**
   * List the signed-in customer's own invoices / retail receipts / payment receipts.
   * Goes through the `finance-customer-documents` edge function because the invoices
   * table is RLS-gated to workspace members (a customer is not one); the function
   * scopes strictly to documents addressed to the caller's own linked CRM contacts.
   */
  async listMyDocuments(): Promise<MyDocumentsResult> {
    const { data, error } = await supabase.functions.invoke('finance-customer-documents', { body: {} });
    if (error) throw error;
    return {
      linked: !!data?.linked,
      invoices: (data?.invoices ?? []) as CustomerInvoiceDoc[],
      receipts: (data?.receipts ?? []) as CustomerReceiptDoc[],
    };
  },
};
