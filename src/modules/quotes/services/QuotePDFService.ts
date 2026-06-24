import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

export interface PDFGenerationResult {
  success: boolean;
  quote_number?: string;
  pdf_url?: string;
  pdf_storage_path?: string;
  error?: string;
}

export interface PDFStatus {
  pdf_generation_status: string | null;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  quote_number: string | null;
}

class QuotePDFService {
  /**
   * Trigger PDF generation for a quote via the edge function
   */
  async generatePDF(quoteId: string, regenerate = false): Promise<PDFGenerationResult> {
    const { data, error } = await supabase.functions.invoke('generate-quote-pdf', {
      body: { quote_id: quoteId, regenerate },
    });

    if (error) {
      return { success: false, error: await edgeErrorMessage(error) };
    }

    return data as PDFGenerationResult;
  }

  /**
   * Get a fresh signed URL for an existing PDF
   */
  async refreshPDFUrl(quoteId: string): Promise<string | null> {
    const { data: quote } = await supabase
      .from('quotes')
      .select('pdf_storage_path')
      .eq('id', quoteId)
      .single();

    if (!quote?.pdf_storage_path) return null;

    const { data } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(quote.pdf_storage_path, 60 * 60); // 1 hour

    return data?.signedUrl || null;
  }

  /**
   * Check PDF generation status
   */
  async getGenerationStatus(quoteId: string): Promise<PDFStatus | null> {
    const { data } = await supabase
      .from('quotes')
      .select('pdf_generation_status, pdf_storage_path, pdf_generated_at, quote_number')
      .eq('id', quoteId)
      .single();

    return data as PDFStatus | null;
  }

  /**
   * Download PDF by opening a signed URL in a new tab
   */
  async downloadPDF(quoteId: string): Promise<boolean> {
    const url = await this.refreshPDFUrl(quoteId);
    if (url) {
      window.open(url, '_blank');
      return true;
    }
    return false;
  }

  /**
   * Save item prices and recalculate quote totals
   */
  async saveItemPrices(
    quoteId: string,
    items: { id: string; unit_price: number; discounted_price?: number | null; line_total: number }[],
    vatRate: number,
  ): Promise<{ success: boolean; error?: string }> {
    // Update each item's pricing
    for (const item of items) {
      const { error } = await supabase
        .from('quote_items')
        .update({
          unit_price: item.unit_price,
          discounted_price: item.discounted_price ?? null,
          line_total: item.line_total,
        })
        .eq('id', item.id);

      if (error) {
        return { success: false, error: `Failed to update item: ${error.message}` };
      }
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);

    // #227 — order-level paid-upfront (cash) discount: applied to the net subtotal before VAT
    // when the quote is flagged paid_upfront, using the workspace's active cash_payment rule.
    let cashPct = 0;
    const { data: quoteRow } = await supabase
      .from('quotes').select('workspace_id, paid_upfront').eq('id', quoteId).single();
    if (quoteRow?.paid_upfront && quoteRow?.workspace_id) {
      const { data: rule } = await supabase
        .from('pricing_custom_rules')
        .select('discount_pct')
        .eq('workspace_id', quoteRow.workspace_id)
        .eq('rule_type', 'cash_payment')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1);
      cashPct = rule && rule[0] ? Number(rule[0].discount_pct) || 0 : 0;
    }
    const netAfterCash = subtotal * (1 - cashPct / 100);
    const vatAmount = netAfterCash * (vatRate / 100);
    const grandTotal = netAfterCash + vatAmount;

    // Update quote totals
    const { error: quoteError } = await supabase
      .from('quotes')
      .update({
        subtotal: Math.round(subtotal * 100) / 100,
        vat_rate: vatRate,
        vat_amount: Math.round(vatAmount * 100) / 100,
        grand_total: Math.round(grandTotal * 100) / 100,
        cash_discount_pct: cashPct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    if (quoteError) {
      return { success: false, error: `Failed to update quote totals: ${quoteError.message}` };
    }

    return { success: true };
  }
}

export const quotePDFService = new QuotePDFService();
