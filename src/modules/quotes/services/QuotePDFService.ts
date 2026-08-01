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
   * Get a fresh signed URL for an existing PDF. If the stored PDF has been
   * purged by the storage-retention sweep (pdf_storage_path nulled +
   * pdf_generation_status='expired'), rebuild it on demand first — regeneration
   * is credit-free, so an old quote's PDF transparently comes back on open.
   */
  async refreshPDFUrl(quoteId: string): Promise<string | null> {
    let { data: quote } = await supabase
      .from('quotes')
      .select('pdf_storage_path, pdf_generation_status')
      .eq('id', quoteId)
      .single();

    if (!quote?.pdf_storage_path && quote?.pdf_generation_status === 'expired') {
      await this.generatePDF(quoteId, true);
      const { data: fresh } = await supabase
        .from('quotes')
        .select('pdf_storage_path, pdf_generation_status')
        .eq('id', quoteId)
        .single();
      quote = fresh;
    }

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
    // ONE statement, ONE transaction, and the totals come back DERIVED.
    //
    // This used to update quote_items in a loop and then compute subtotal / cash discount /
    // VAT / grand total in TypeScript. Two things were wrong with that (audit #307):
    //
    //  - finding 19: the first failing item `return`ed mid-loop, leaving earlier lines
    //    repriced, later lines stale, and the quotes totals row untouched. No transaction,
    //    no rollback, and the operator could not tell how far it got.
    //  - finding 17: this was one of THREE independent implementations of the same money
    //    chain and the only one that persisted. It rounded differently from the one the PDF
    //    renders with, so `priceAfterDiscount + vat` and `final` could disagree by a cent.
    //    It also resolved the cash-discount rule with a second copy of the query in
    //    financeService.getActiveCashDiscountPct, and folded in no extras at all.
    //
    // reprice_quote_items applies every line or none, then restamps the quote from
    // get_quote_totals() — the single SQL source. TypeScript no longer derives any of it.
    const { data, error } = await supabase.rpc('reprice_quote_items', {
      p_quote_id: quoteId,
      p_items: items.map((i) => ({
        id: i.id,
        unit_price: i.unit_price,
        discounted_price: i.discounted_price ?? null,
        line_total: i.line_total,
      })),
      p_vat_rate: vatRate,
    });

    if (error) {
      return { success: false, error: `Failed to save quote pricing: ${error.message}` };
    }
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return { success: false, error: 'Quote pricing saved nothing — the quote may have been deleted.' };
    }

    return { success: true };
  }
}

export const quotePDFService = new QuotePDFService();
