/**
 * QuotePreviewPage  —  /quotes/:id/preview
 *
 * Full-screen, no-navbar page that renders the quote as A4 landscape pages.
 * Can be shared with clients or used internally before downloading the PDF.
 *
 * Also hosts the "Download PDF" action so users can trigger it directly
 * from this preview without needing to go back to the builder.
 */

import React, { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuoteDocument } from '@/hooks/useQuoteDocument';
import { QuoteDocument } from '@/components/quotes/QuoteDocument';

export function QuotePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useQuoteDocument(id || '');
  const { toast } = useToast();
  const documentRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    const container = documentRef.current;
    if (!container || !data) return;

    const pages = container.querySelectorAll<HTMLElement>('.quote-page');
    if (!pages.length) return;

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
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      }

      const filename = `quote-${data.quote_number || id?.slice(0, 8) || 'document'}.pdf`;
      pdf.save(filename);
      toast({ title: 'PDF downloaded', description: filename });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e5e7eb' }}>
      {/* Top bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/quotes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          {data && (
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
              {data.name || data.quote_number || 'Quote Preview'}
            </span>
          )}
        </div>

        <Button
          onClick={handleDownloadPDF}
          disabled={!data || generating}
          size="sm"
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

      {/* Document area */}
      <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', marginTop: 60 }}>
            <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
            <span>Loading quote…</span>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 60, padding: '16px 24px',
            backgroundColor: '#fef2f2', color: '#b91c1c',
            borderRadius: 8, fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Page gap between each A4 page for visual separation */}
            <style>{`
              .quote-page + .quote-page {
                margin-top: 24px;
              }
            `}</style>

            <QuoteDocument ref={documentRef} data={data} />
          </>
        )}
      </div>
    </div>
  );
}
