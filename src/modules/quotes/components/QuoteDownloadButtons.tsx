/** QuoteDownloadButtons — Preview and Download both show the server-rendered quote PDF. */

import React, { useState } from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { quotePDFService } from '../services/QuotePDFService';
import { trackQuoteDownload } from '@/services/quoteAnalyticsService';

interface QuoteDownloadButtonsProps {
  quoteId: string;
  quoteNumber?: string | null;
  /** Called when the user clicks "Preview" — defaults to opening the preview page. */
  onPreview?: () => void;
  /** Who is downloading — used for analytics attribution. */
  viewContext?: 'customer' | 'admin';
}

export const QuoteDownloadButtons: React.FC<QuoteDownloadButtonsProps> = ({
  quoteId,
  quoteNumber,
  onPreview,
  viewContext = 'customer',
}) => {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const handlePreview = () => {
    if (onPreview) {
      onPreview();
    } else {
      window.open(`/quotes/${quoteId}/preview`, '_blank');
    }
  };

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      const result = await quotePDFService.savePDF(quoteId, quoteNumber);
      if (!result.success) {
        toast({ title: 'PDF download failed', description: result.error, variant: 'destructive' });
        return;
      }
      trackQuoteDownload(quoteId, 'server_pdf', viewContext);
      toast({ title: 'PDF downloaded', description: result.filename });
    } catch (err) {
      toast({
        title: 'PDF download failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handlePreview}>
        <Eye className="h-4 w-4 mr-2" />
        Preview
      </Button>

      <Button size="sm" onClick={handleDownloadPDF} disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Preparing…
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </>
        )}
      </Button>
    </div>
  );
};
