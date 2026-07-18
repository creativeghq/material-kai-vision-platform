import React from 'react';
import { Download, FileText, ExternalLink, ClipboardList, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { buildPageUrl } from '@/config/capabilities';

export interface QuoteCanvasData {
  quote_id: string;
  quote_number?: string | null;
  name?: string;
  currency?: string;
  subtotal?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  grand_total?: number | null;
  item_count?: number | null;
  pdf_url?: string | null;
  pdf_error?: string | null;
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

function money(v: number | null | undefined, currency?: string): string {
  if (v == null) return '—';
  const sym = CURRENCY_SYMBOL[currency || 'EUR'] || '';
  return `${sym}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Canvas artifact for an agent-created quote. Renders the REAL branded PDF (the
 * exact quote design) in an iframe plus a totals summary and links back into the
 * Quotes module, where the quote is a first-class, editable record.
 */
export function QuoteCanvasCard({ data }: { data: QuoteCanvasData }) {
  const {
    quote_id, quote_number, name, currency, subtotal, vat_rate, vat_amount, grand_total,
    item_count, pdf_url, pdf_error,
  } = data;

  const handleDownload = () => {
    if (!pdf_url) return;
    const a = document.createElement('a');
    a.href = pdf_url;
    a.download = `quote-${quote_number || quote_id.slice(0, 8)}.pdf`;
    a.target = '_blank';
    a.click();
  };

  return (
    <Card className="p-4 space-y-3 dashboard-card">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{name || 'Quote'}</span>
        {quote_number && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">
            {quote_number}
          </span>
        )}
        {item_count != null && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {item_count} item{item_count === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* PDF preview — the exact branded quote design */}
      {pdf_url ? (
        <div className="rounded-lg overflow-hidden border border-white/15 bg-black/20" style={{ aspectRatio: '1 / 1.414' }}>
          <iframe src={`${pdf_url}#toolbar=0&navpanes=0`} className="w-full h-full" title={name || 'Quote'} />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">Quote saved — PDF not generated yet</p>
            {pdf_error && <p className="mt-1 opacity-80">{pdf_error}</p>}
            <p className="mt-1">Open it in the Quotes module to render the PDF.</p>
          </div>
        </div>
      )}

      {/* Totals summary */}
      {(subtotal != null || grand_total != null) && (
        <div className="text-xs space-y-1 rounded-lg bg-white/5 p-3">
          {subtotal != null && (
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{money(subtotal, currency)}</span>
            </div>
          )}
          {vat_amount != null && (
            <div className="flex justify-between text-muted-foreground">
              <span>VAT{vat_rate != null ? ` (${vat_rate}%)` : ''}</span><span>{money(vat_amount, currency)}</span>
            </div>
          )}
          {grand_total != null && (
            <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-white/10">
              <span>Total</span><span>{money(grand_total, currency)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {pdf_url && (
          <>
            <Button size="sm" variant="outline" className="gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={() => window.open(pdf_url, '_blank')}>
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="gap-2 ml-auto"
          onClick={() => window.open(buildPageUrl('quote', quote_id) ?? `/quotes/${quote_id}`, '_blank')}
        >
          <ClipboardList className="h-4 w-4" />
          Open in Quotes
        </Button>
      </div>
    </Card>
  );
}
