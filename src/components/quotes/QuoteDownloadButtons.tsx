/**
 * QuoteDownloadButtons
 *
 * Two actions:
 *  1. "Preview"         — opens /quotes/:id/preview in a new tab
 *  2. "Download PDF"    — opens /quotes/:id/preview?print=1 in a new tab,
 *                         which auto-triggers window.print() once images load.
 *                         The user then uses the browser's Save as PDF option.
 *
 * Uses the browser's native print pipeline instead of html2canvas so that
 * fonts (Roboto Slab, Open Sans) and images render exactly as on-screen.
 */

import React from 'react';
import { Download, Eye } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { QuoteDocumentData } from '@/hooks/useQuoteDocument';

interface QuoteDownloadButtonsProps {
  quoteId: string;
  quoteNumber?: string | null;
  /** Pre-fetched document data — used only to know if data is ready. */
  data?: QuoteDocumentData | null;
  /** Called when the user clicks "Preview" — defaults to window.open */
  onPreview?: () => void;
  /** When true, applies glass/white-tinted styling for use on dark primary headers */
  headerMode?: boolean;
}

export const QuoteDownloadButtons: React.FC<QuoteDownloadButtonsProps> = ({
  quoteId,
  data,
  onPreview,
  headerMode = false,
}) => {
  const handlePreview = () => {
    if (onPreview) {
      onPreview();
    } else {
      window.open(`/quotes/${quoteId}/preview`, '_blank');
    }
  };

  const handleDownloadPDF = () => {
    window.open(`/quotes/${quoteId}/preview?print=1`, '_blank');
  };

  const btnBase = headerMode
    ? 'rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/20 hover:text-white'
    : 'rounded-full';

  const btnPrimary = headerMode
    ? 'rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/20 hover:text-white disabled:opacity-40'
    : 'rounded-full';

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Button variant="outline" size="sm" onClick={handlePreview} className={btnBase}>
        <Eye className="h-4 w-4 mr-2" />
        Preview
      </Button>

      <Button
        size="sm"
        onClick={handleDownloadPDF}
        disabled={!data}
        title={!data ? 'Loading quote data…' : undefined}
        className={btnPrimary}
      >
        <Download className="h-4 w-4 mr-2" />
        Download PDF
      </Button>
    </div>
  );
};
