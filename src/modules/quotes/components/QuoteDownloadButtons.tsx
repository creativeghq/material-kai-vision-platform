/**
 * QuoteDownloadButtons
 *
 * Two actions:
 *  1. "Preview"      — opens /quotes/:id/preview in a new tab
 *  2. "Download PDF" — captures each .quote-page with html2canvas → jsPDF (A3 landscape)
 *
 * The hidden QuoteDocument is rendered off-screen at full resolution (4961×3508 px,
 * no zoom) so html2canvas sees the exact same pixels as the print-ready document.
 * We await document.fonts.ready before capture so Roboto Slab renders correctly.
 */

import React, { useRef, useState } from 'react';
// Dynamically imported on button click to avoid bundling ~613KB on page load
// import html2canvas from 'html2canvas';
// import jsPDF from 'jspdf';
import { Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { QuoteDocumentData } from '../hooks/useQuoteDocument';
import { QuoteDocument } from './QuoteDocument';

interface QuoteDownloadButtonsProps {
  quoteId: string;
  quoteNumber?: string | null;
  /** Pre-fetched document data. If not provided, buttons are disabled. */
  data?: QuoteDocumentData | null;
  /** Called when the user clicks "Preview" — defaults to window.open */
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
      // Dynamically import PDF libs — only loaded when user clicks Download
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      // Wait for all web fonts (Roboto Slab, Open Sans) to be ready before capture
      await document.fonts.ready;

      // Also wait for all images inside the document container to finish loading
      const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
      await Promise.all(
        images
          .filter(img => !img.complete)
          .map(img => new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })),
      );

      // A3 landscape: 420 × 297 mm
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3',
        compress: true,
      });

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage('a3', 'landscape');

        const canvas = await html2canvas(pages[i], {
          scale: 1,           // pages are already at 4961×3508 px — no upscaling needed
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.93);
        pdf.addImage(imgData, 'JPEG', 0, 0, 420, 297);
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

  const btnBase = 'rounded-full';
  const btnPrimary = 'rounded-full';

  return (
    <>
      {/* Hidden full-resolution renderer — no zoom, off-screen */}
      {data && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: '-99999px',
            top: 0,
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <QuoteDocument ref={documentRef} data={data} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="outline" size="sm" onClick={handlePreview} className={btnBase}>
          <Eye className="h-4 w-4 mr-2" />
          Preview
        </Button>

        <Button
          size="sm"
          onClick={handleDownloadPDF}
          disabled={!data || generating}
          title={!data ? 'Loading quote data…' : undefined}
          className={btnPrimary}
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
