import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Download, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { computeTotalsBreakdown, totalsRows } from '@/modules/quotes/utils/quoteTotals';

/**
 * /q/:token — public, unauthenticated viewer for a shared quote.
 *
 * Fetches a sanitized quote summary + a fresh signed PDF URL via the
 * `quote-public-share` edge function, which validates the token, enforces
 * `public_share_enabled`, and logs the view (and downloads) as
 * `quote_analytics_events` rows with view_context='public' so admins see
 * external engagement on /admin/quotes/:id → Analytics.
 */

interface PublicQuoteItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  selected_size: string | null;
  selected_color: string | null;
  room: string | null;
  dimensions: string | null;
  unit_price: number | null;
  discounted_price: number | null;
  line_total: number | null;
}

interface PublicQuote {
  id: string;
  name: string | null;
  quote_number: string | null;
  status: string;
  currency: string;
  subtotal: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  grand_total: number | null;
  extras_total: number | null;
  cash_discount_pct: number | null;
  prices_vat_inclusive: boolean | null;
  expires_at: string | null;
  created_at: string | null;
  client_name: string | null;
  items: PublicQuoteItem[];
}

interface QuoteSeller {
  name: string;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
}

const money = (v: number | null | undefined, currency: string) =>
  v == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [seller, setSeller] = useState<QuoteSeller | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Stable per-visit session id so repeated downloads from the same visit
  // are attributable to one session in the admin analytics.
  const sessionId = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoading(false); setNotFound(true); return; }
      try {
        const { data } = await supabase.functions.invoke('quote-public-share', {
          body: { token, session_id: sessionId.current },
        });
        if (cancelled) return;
        setQuote(data?.quote ?? null);
        setSeller(data?.seller ?? null);
        setPdfUrl(data?.pdf_url ?? null);
        setNotFound(!!data?.not_found || !data?.quote);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleDownload = async () => {
    if (!pdfUrl) return;
    // Log the public download (best-effort) then open the PDF.
    supabase.functions
      .invoke('quote-public-share', { body: { token, event: 'download', session_id: sessionId.current } })
      .catch(() => {});
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `quote-${quote?.quote_number || 'document'}.pdf`;
    a.target = '_blank';
    a.click();
  };

  const itemsTotal = useMemo(
    () => (quote?.items ?? []).reduce((s, it) => s + (it.line_total ?? 0), 0),
    [quote],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="dashboard-card p-8 text-center max-w-md space-y-2">
          <h2 className="text-base font-semibold">Quote unavailable</h2>
          <p className="text-sm text-muted-foreground">
            This link is invalid, has been turned off, or the quote no longer exists.
          </p>
        </Card>
      </div>
    );
  }

  const currency = quote.currency || 'EUR';
  // #227 — universal 5-line totals breakdown (Price / Discount / Price after Discount / VAT / Final).
  const breakdown = computeTotalsBreakdown({
    subtotal: quote.subtotal ?? itemsTotal,
    cashDiscountPct: quote.cash_discount_pct,
    vatAmount: quote.vat_amount,
    vatRate: quote.vat_rate,
    grandTotal: quote.grand_total,
  });
  const rows = totalsRows(breakdown, {
    extras: quote.extras_total ? [{ label: 'Extras', value: quote.extras_total }] : [],
  });

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Seller branding (white-label) */}
        {seller && (
          <div className="flex items-center gap-3 pb-1 border-b border-white/10">
            {seller.logo_url
              ? <img src={seller.logo_url} alt={seller.name} className="h-9 max-w-[160px] object-contain" />
              : <span className="text-base font-semibold">{seller.name}</span>}
            <div className="ml-auto text-right text-[11px] text-muted-foreground leading-tight">
              {seller.logo_url && <div className="font-medium text-foreground">{seller.name}</div>}
              {seller.website && <div>{seller.website}</div>}
              {seller.phone && <div>{seller.phone}</div>}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{quote.name || 'Quote'}</h1>
          {quote.quote_number && (
            <span className="text-[11px] font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">
              {quote.quote_number}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full ml-auto">
            {quote.status}
          </span>
        </div>

        {(quote.client_name || quote.created_at) && (
          <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
            {quote.client_name && <span>Prepared for {quote.client_name}</span>}
            {quote.created_at && <span>Created {new Date(quote.created_at).toLocaleDateString()}</span>}
            {quote.expires_at && <span>Valid until {new Date(quote.expires_at).toLocaleDateString()}</span>}
          </div>
        )}

        {/* Items */}
        <Card className="dashboard-card border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="text-left font-medium text-muted-foreground p-3">Item</th>
                  <th className="text-center font-medium text-muted-foreground p-3 w-16">Qty</th>
                  <th className="text-right font-medium text-muted-foreground p-3 w-28">Unit</th>
                  <th className="text-right font-medium text-muted-foreground p-3 w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((it, idx) => {
                  const effective = it.discounted_price ?? it.unit_price;
                  return (
                    <tr key={it.id} className={idx % 2 ? 'bg-white/[0.02]' : ''}>
                      <td className="p-3">
                        <div className="font-medium">{it.name}</div>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                          {it.sku && <span>{it.sku}</span>}
                          {it.room && <span>· {it.room}</span>}
                          {it.selected_size && <span>· {it.selected_size}</span>}
                          {it.selected_color && <span>· {it.selected_color}</span>}
                          {it.dimensions && <span>· {it.dimensions}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center">{it.quantity}</td>
                      <td className="p-3 text-right">{money(effective, currency)}</td>
                      <td className="p-3 text-right font-medium">{money(it.line_total, currency)}</td>
                    </tr>
                  );
                })}
                {quote.items.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No items on this quote.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Totals — universal 5-line breakdown (#227) */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            {rows.map((row, i) => row.kind === 'final' ? (
              <div key={i} className="flex justify-between border-t border-white/10 pt-2">
                <span className="font-semibold">{row.label}</span>
                <span className="font-bold text-base">{money(row.value, currency)}</span>
              </div>
            ) : (
              <div key={i} className={`flex justify-between ${row.kind === 'discount' ? 'text-primary' : 'text-muted-foreground'}`}>
                <span>{row.label}</span>
                <span>{row.negative ? '− ' : ''}{money(row.value, currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PDF actions */}
        {pdfUrl && (
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Button size="sm" className="gap-2 rounded-full" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 rounded-full" onClick={() => window.open(pdfUrl, '_blank')}>
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </Button>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground text-center pt-4">
          {seller ? `Prepared by ${seller.name}` : 'Shared from Material Kai'}
        </div>
      </div>
    </div>
  );
}
