/**
 * QuoteDownloadButtons
 *
 * Provides two actions for a quote:
 *  1. "Open Preview" — opens /quotes/:id/preview in a new tab (HTML view)
 *  2. "Download PDF"  — captures each .quote-page with html2canvas → jsPDF
 *
 * The PDF generation targets the rendered QuoteDocument component directly in
 * the DOM, so the component must be mounted (even if visually hidden).
 */

import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { QuoteDocumentData } from '@/hooks/useQuoteDocument';
import { QuoteDocument } from './QuoteDocument';

interface QuoteDownloadButtonsProps {
  quoteId: string;
  quoteNumber?: string | null;
  /** Pre-fetched document data. If not provided, buttons are disabled. */
  data?: QuoteDocumentData | null;
  /** Called when the user clicks "Open Preview" — defaults to window.open */
  onPreview?: () => void;
  /** When true, applies glass/white-tinted styling for use on dark primary headers */
  headerMode?: boolean;
}

export const QuoteDownloadButtons: React.FC<QuoteDownloadButtonsProps> = ({
  quoteId,
  quoteNumber,
  data,
  onPreview,
  headerMode = false,
}) => {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);

  const handlePreview = () => {
    if (onPreview) {
      onPreview();
    } else {
      window.open(`/quotes/${quoteId}/preview`, '_blank');
    }
  };

  const handleDownloadPDF = async () => {
    if (!data) return;

    const container = documentRef.current;
    if (!container) return;

    const pages = container.querySelectorAll<HTMLElement>('.quote-page');
    if (pages.length === 0) {
      toast({ title: 'Error', description: 'No pages found to export.', variant: 'destructive' });
      return;
    }

    setGenerating(true);
    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage('a4', 'landscape');

        const canvas = await html2canvas(pages[i], {
          scale: 1,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        // A4 landscape: 297mm × 210mm
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      }

      const filename = `quote-${quoteNumber || quoteId.slice(0, 8)}.pdf`;
      pdf.save(filename);

      toast({ title: 'PDF downloaded', description: filename });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast({ title: 'PDF generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      {/* Hidden document renderer — mounted off-screen so html2canvas can capture it */}
      {data && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <QuoteDocument ref={documentRef} data={data} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Preview is always enabled — just opens a new tab */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreview}
          className={headerMode
            ? 'rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/20 hover:text-white'
            : 'rounded-full'}
        >
          <Eye className="h-4 w-4 mr-2" />
          Preview
        </Button>

        {/* Download PDF requires data to be loaded so the hidden document renders */}
        <Button
          size="sm"
          onClick={handleDownloadPDF}
          disabled={!data || generating}
          title={!data ? 'Loading quote data…' : undefined}
          className={headerMode
            ? 'rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/20 hover:text-white disabled:opacity-40'
            : 'rounded-full'}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </>
          )}
        </Button>
      </div>
    </>
  );
};
