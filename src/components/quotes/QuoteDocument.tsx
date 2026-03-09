/**
 * QuoteDocument — A4 landscape HTML renderer
 *
 * Renders a complete quote as a stack of A4 landscape "pages" (297mm × 210mm).
 * Each page has a full-bleed background image with content overlaid on top.
 * Used for both on-screen preview and PDF generation via html2canvas + jsPDF.
 *
 * Page structure:
 *  1. First page      — pure background image
 *  2. Details page    — background image + client/company info overlay
 *  3+. Items pages    — background image + items table (opaque rows)
 *  Last. Back page    — pure background image
 */

import React, { forwardRef } from 'react';
import { QuoteDocumentData, QuoteDocumentItem } from '@/hooks/useQuoteDocument';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 8;

const PAGE_STYLE: React.CSSProperties = {
  width: '297mm',
  height: '210mm',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  flexShrink: 0,
  fontFamily: '"Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
};

const BG_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const CONTENT_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
};

// ─── Colour palette ───────────────────────────────────────────────────────────

const C = {
  dark: '#1a1a2e',
  primary: '#3E192A',
  gray: '#6b7280',
  lightGray: '#d1d5db',
  black: '#111827',
  white: '#ffffff',
  rowAlt: '#f9fafb',
  headerBg: '#1a1a2e',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'EUR'): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  return `${sym}${amount.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const BgPage: React.FC<{ bgUrl: string | null; children?: React.ReactNode; className?: string }> = ({
  bgUrl,
  children,
  className,
}) => (
  <div style={PAGE_STYLE} className={`quote-page${className ? ` ${className}` : ''}`}>
    {bgUrl ? (
      <img src={bgUrl} alt="" style={BG_STYLE} crossOrigin="anonymous" />
    ) : (
      <div style={{ ...BG_STYLE, background: 'linear-gradient(135deg, #f3e8f0 0%, #fdf6f0 100%)' }} />
    )}
    {children && <div style={CONTENT_STYLE}>{children}</div>}
  </div>
);

// ─── Page 1: Cover (pure image) ───────────────────────────────────────────────

const CoverPage: React.FC<{ bgUrl: string | null }> = ({ bgUrl }) => (
  <BgPage bgUrl={bgUrl} />
);

// ─── Page 2: Client / Company Details ─────────────────────────────────────────

const DetailsPage: React.FC<{ data: QuoteDocumentData }> = ({ data }) => {
  const { client, template, quote_number, created_at, expires_at, notes } = data;

  const field = (label: string, value: string | null) =>
    value ? (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 7, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>
          {label}
        </div>
        <div style={{ fontSize: 9.5, color: C.black, fontWeight: 600 }}>{value}</div>
      </div>
    ) : null;

  const sectionLabel = (text: string) => (
    <div style={{
      fontSize: 7.5, fontWeight: 700, color: C.primary,
      textTransform: 'uppercase', letterSpacing: 1,
      borderBottom: `1px solid ${C.lightGray}`, paddingBottom: 4, marginBottom: 8,
    }}>
      {text}
    </div>
  );

  const addressLine = [client.city, client.postal_code].filter(Boolean).join(', ');

  return (
    <BgPage bgUrl={data.template.company_details_page_url}>
      {/* Content panel */}
      <div style={{
        position: 'absolute',
        top: '14mm', left: '14mm', right: '14mm', bottom: '14mm',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 300, color: C.primary, letterSpacing: -0.5 }}>QUOTE</div>
            {quote_number && (
              <div style={{ fontSize: 9, color: C.gray, marginTop: 2 }}>{quote_number}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 8, color: C.gray }}>
            <div>Date: {fmtDate(created_at)}</div>
            {expires_at && <div style={{ marginTop: 2 }}>Expires: {fmtDate(expires_at)}</div>}
          </div>
        </div>

        {/* Two-column details */}
        <div style={{ display: 'flex', gap: 16, flex: 1 }}>
          {/* Left: Client */}
          <div style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.88)',
            borderRadius: 6,
            padding: '10px 12px',
          }}>
            {sectionLabel('Client Details')}
            {field('Contact', client.contact_name)}
            {field('Company', client.company_name)}
            {field('Email', client.email)}
            {field('Phone', client.phone)}
            {(client.address || addressLine || client.country) && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 7, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>Address</div>
                {client.address && <div style={{ fontSize: 9.5, color: C.black, fontWeight: 600 }}>{client.address}</div>}
                {addressLine && <div style={{ fontSize: 9.5, color: C.black }}>{addressLine}</div>}
                {client.country && <div style={{ fontSize: 9.5, color: C.black }}>{client.country}</div>}
              </div>
            )}
            {field('VAT Number', client.vat_number)}
          </div>

          {/* Right: Our company */}
          <div style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.88)',
            borderRadius: 6,
            padding: '10px 12px',
          }}>
            {sectionLabel('From')}
            {field('Company', template.company_name || null)}
            {field('Address', template.company_address || null)}
            {field('Phone', template.company_phone || null)}
            {field('Email', template.company_email || null)}
            {field('VAT', template.company_vat || null)}

            {notes && (
              <>
                <div style={{ marginTop: 12 }}>{sectionLabel('Notes')}</div>
                <div style={{ fontSize: 8.5, color: C.black, lineHeight: 1.5, marginTop: 4 }}>
                  {notes}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </BgPage>
  );
};

// ─── Items pages ──────────────────────────────────────────────────────────────

const COL_WIDTHS = {
  num: '4%',
  product: '44%',
  qty: '9%',
  unitPrice: '20%',
  total: '21%',
};

const ItemsPage: React.FC<{
  data: QuoteDocumentData;
  pageItems: QuoteDocumentItem[];
  pageIndex: number;
  totalPages: number;
  showTotals: boolean;
}> = ({ data, pageItems, pageIndex, totalPages, showTotals }) => {
  const startIndex = pageIndex * ITEMS_PER_PAGE;

  return (
    <BgPage bgUrl={data.template.content_page_url}>
      <div style={{
        position: 'absolute',
        top: '15mm', left: '12mm', right: '12mm', bottom: '12mm',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Page title + pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.white, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
            QUOTE ITEMS
          </div>
          {totalPages > 1 && (
            <div style={{ fontSize: 8, color: C.white, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
              Page {pageIndex + 1} of {totalPages}
            </div>
          )}
        </div>

        {/* Table */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          flex: 1,
        }}>
          {/* Column widths */}
          <colgroup>
            <col style={{ width: COL_WIDTHS.num }} />
            <col style={{ width: COL_WIDTHS.product }} />
            <col style={{ width: COL_WIDTHS.qty }} />
            <col style={{ width: COL_WIDTHS.unitPrice }} />
            <col style={{ width: COL_WIDTHS.total }} />
          </colgroup>

          {/* Header */}
          <thead>
            <tr style={{ backgroundColor: C.headerBg }}>
              {['#', 'Product', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '5px 8px',
                    fontSize: 7.5,
                    fontWeight: 700,
                    color: C.white,
                    textAlign: i >= 2 ? 'right' : 'left',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          {/* Rows */}
          <tbody>
            {pageItems.map((item, i) => {
              const rowNum = startIndex + i + 1;
              const isAlt = i % 2 === 1;
              return (
                <tr key={item.id} style={{ backgroundColor: isAlt ? C.rowAlt : C.white }}>
                  {/* # */}
                  <td style={{ padding: '5px 8px', fontSize: 8, color: C.gray, verticalAlign: 'top' }}>
                    {rowNum}
                  </td>
                  {/* Product + description */}
                  <td style={{ padding: '5px 8px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: C.black, lineHeight: 1.3 }}>
                      {item.product_name}
                      {item.sku && (
                        <span style={{ fontSize: 7, fontWeight: 400, color: C.gray, marginLeft: 6 }}>
                          SKU: {item.sku}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: 7.5, color: C.gray, marginTop: 1.5, lineHeight: 1.35 }}>
                        {item.description.length > 120
                          ? item.description.slice(0, 120) + '…'
                          : item.description}
                      </div>
                    )}
                    {(item.selected_size || item.selected_color) && (
                      <div style={{ fontSize: 7, color: C.gray, marginTop: 1 }}>
                        {[item.selected_size, item.selected_color].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  {/* Qty */}
                  <td style={{ padding: '5px 8px', fontSize: 8, color: C.black, textAlign: 'right', verticalAlign: 'top' }}>
                    {item.quantity} {item.unit}
                  </td>
                  {/* Unit Price */}
                  <td style={{ padding: '5px 8px', fontSize: 8, color: C.black, textAlign: 'right', verticalAlign: 'top' }}>
                    {fmt(item.unit_price, data.currency)}
                  </td>
                  {/* Total */}
                  <td style={{ padding: '5px 8px', fontSize: 8, fontWeight: 700, color: C.black, textAlign: 'right', verticalAlign: 'top' }}>
                    {fmt(item.line_total, data.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals section — only on last items page */}
        {showTotals && (
          <div style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid rgba(255,255,255,0.5)`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderRadius: 6,
              padding: '8px 14px',
              minWidth: 180,
            }}>
              <TotalsBlock data={data} />
            </div>
          </div>
        )}
      </div>
    </BgPage>
  );
};

const TotalsBlock: React.FC<{ data: QuoteDocumentData }> = ({ data }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        <td style={{ fontSize: 8, color: C.gray, paddingBottom: 3 }}>Subtotal</td>
        <td style={{ fontSize: 8, color: C.black, textAlign: 'right', paddingBottom: 3 }}>
          {fmt(data.subtotal, data.currency)}
        </td>
      </tr>
      <tr>
        <td style={{ fontSize: 8, color: C.gray, paddingBottom: 5 }}>
          VAT ({data.vat_rate}%)
        </td>
        <td style={{ fontSize: 8, color: C.gray, textAlign: 'right', paddingBottom: 5 }}>
          {fmt(data.vat_amount, data.currency)}
        </td>
      </tr>
      <tr style={{ borderTop: `1px solid ${C.lightGray}` }}>
        <td style={{ fontSize: 10, fontWeight: 700, color: C.primary, paddingTop: 5 }}>
          GRAND TOTAL
        </td>
        <td style={{ fontSize: 10, fontWeight: 700, color: C.primary, textAlign: 'right', paddingTop: 5 }}>
          {fmt(data.grand_total, data.currency)}
        </td>
      </tr>
    </tbody>
  </table>
);

// ─── Page: Back cover (pure image) ────────────────────────────────────────────

const BackCoverPage: React.FC<{ bgUrl: string | null }> = ({ bgUrl }) => (
  <BgPage bgUrl={bgUrl} />
);

// ─── Main export ──────────────────────────────────────────────────────────────

interface QuoteDocumentProps {
  data: QuoteDocumentData;
  /** Extra wrapper class, e.g. for print mode */
  className?: string;
}

export const QuoteDocument = forwardRef<HTMLDivElement, QuoteDocumentProps>(
  ({ data, className }, ref) => {
    const { items, template } = data;

    // Split items into pages
    const itemPages: QuoteDocumentItem[][] = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      itemPages.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    // If no items, show one empty items page
    if (itemPages.length === 0) itemPages.push([]);

    return (
      <div
        ref={ref}
        className={className}
        style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'flex-start' }}
      >
        {/* Page 1: Cover */}
        <CoverPage bgUrl={template.first_page_url} />

        {/* Page 2: Client / Company details */}
        <DetailsPage data={data} />

        {/* Pages 3+: Items */}
        {itemPages.map((pageItems, idx) => (
          <ItemsPage
            key={idx}
            data={data}
            pageItems={pageItems}
            pageIndex={idx}
            totalPages={itemPages.length}
            showTotals={idx === itemPages.length - 1}
          />
        ))}

        {/* Last page: Back cover */}
        <BackCoverPage bgUrl={template.last_page_url} />
      </div>
    );
  }
);

QuoteDocument.displayName = 'QuoteDocument';
