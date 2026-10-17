/** QuotePreviewPage — /quotes/:id/preview. Shows the same server PDF that Download saves. */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { quotePDFService } from '../services/QuotePDFService';
import { trackQuoteDownload, trackQuotePreview } from '@/services/quoteAnalyticsService';

export function QuotePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const result = await quotePDFService.generatePDF(id);
    if (result.success && result.pdf_url) {
      setPdfUrl(result.pdf_url);
      setQuoteNumber(result.quote_number ?? null);
    } else {
      setError(result.error || 'The quote PDF could not be generated.');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) trackQuotePreview(id, 'preview');
    void load();
  }, [id, load]);

  const handleDownload = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const result = await quotePDFService.savePDF(id, quoteNumber);
      if (result.success) {
        trackQuoteDownload(id, 'server_pdf', 'preview');
      } else {
        toast({ title: 'PDF download failed', description: result.error, variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={id ? `/quotes/${id}` : '/quotes'}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <span className="truncate text-sm font-semibold">{quoteNumber || 'Quote preview'}</span>
        </div>
        <Button size="sm" onClick={handleDownload} disabled={!pdfUrl || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Download PDF
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-sunken">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Preparing the quote PDF…
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        )}
        {!loading && !error && pdfUrl && (
          <iframe title="Quote PDF" src={pdfUrl} className="h-full w-full border-0" />
        )}
      </div>
    </div>
  );
}
