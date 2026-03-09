/**
 * QuotePreviewPage  —  /quotes/:id/preview
 *
 * Full-screen, no-navbar page that renders the quote as A4 landscape pages.
 *
 * ?print=1  — auto-triggers window.print() once data + images are ready.
 *             Used by QuoteDownloadButtons to open a print dialog directly.
 */

import React, { useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useQuoteDocument } from '@/hooks/useQuoteDocument';
import { QuoteDocument } from '@/components/quotes/QuoteDocument';

export function QuotePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data, loading, error } = useQuoteDocument(id || '');
  const documentRef = useRef<HTMLDivElement>(null);
  const autoPrint = searchParams.get('print') === '1';

  // Auto-print when ?print=1 is set and data has loaded.
  // Wait for all <img> elements to finish loading so background images
  // are fully rendered before the print dialog opens.
  useEffect(() => {
    if (!autoPrint || loading || !data || !documentRef.current) return;

    const container = documentRef.current;
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));

    const doprint = () => setTimeout(() => window.print(), 200);

    const pending = images.filter(img => !img.complete);
    if (pending.length === 0) {
      doprint();
      return;
    }

    let remaining = pending.length;
    const onLoad = () => {
      remaining -= 1;
      if (remaining <= 0) doprint();
    };
    pending.forEach(img => {
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onLoad, { once: true });
    });
  }, [autoPrint, loading, data]);

  return (
    <>
      {/* ── Print styles ─────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
            background: #fff !important;
          }

          /* Hide the top bar */
          .preview-topbar {
            display: none !important;
          }

          /* Strip the grey background and centering from the outer wrapper */
          .preview-outer {
            background: none !important;
            min-height: unset !important;
          }

          .preview-inner {
            padding: 0 !important;
            align-items: unset !important;
          }

          /* Reset screen zoom so pages render at native 4961×3508 px
             and the browser scales them to fit A4 landscape */
          .preview-scaler {
            zoom: 1 !important;
            transform: none !important;
          }

          /* Each page fills exactly one printed sheet */
          .quote-page {
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
          }

          .quote-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }

        /* Screen-only gap between pages */
        @media screen {
          .quote-page + .quote-page {
            margin-top: 96px;
          }
        }
      `}</style>

      {/* ── Top bar (hidden during print) ────────────────────────────────────── */}
      <div
        className="preview-topbar"
        style={{
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
        }}
      >
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
          onClick={() => window.print()}
          disabled={!data || loading}
          size="sm"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </Button>
      </div>

      {/* ── Document area ────────────────────────────────────────────────────── */}
      <div className="preview-outer" style={{ minHeight: '100vh', backgroundColor: '#e5e7eb' }}>
        <div
          className="preview-inner"
          style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
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
            <div className="preview-scaler" style={{ zoom: 0.25 }}>
              <QuoteDocument ref={documentRef} data={data} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
