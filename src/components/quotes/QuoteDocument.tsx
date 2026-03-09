/**
 * QuoteDocument — high-resolution HTML renderer
 *
 * Pages render at 4961 × 3508 px (A3 landscape @ 300 DPI).
 * Each page has a full-bleed background image with content overlaid on top.
 * Used for both on-screen preview (via CSS zoom) and PDF via window.print().
 *
 * Page structure:
 *  1. Cover page      — background image + client info line at bottom
 *  2+. Items pages    — background image + transparent items table
 *  Last. Back page    — pure background image
 */

import React, { forwardRef } from 'react';
import { QuoteDocumentData, QuoteDocumentItem } from '@/hooks/useQuoteDocument';

// ─── Output dimensions ────────────────────────────────────────────────────────

/** Target page pixel dimensions — A3 landscape @ 300 DPI */
export const PAGE_PX_W = 4961;
export const PAGE_PX_H = 3508;

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 6;

const PAGE_STYLE: React.CSSProperties = {
  width: PAGE_PX_W,
  height: PAGE_PX_H,
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  flexShrink: 0,
  fontFamily: '"Roboto Slab", "Georgia", serif',
};

const BG_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'fill',
  display: 'block',
};

const CONTENT_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
};

// ─── Colour palette ───────────────────────────────────────────────────────────

const C = {
  primary: '#3E192A',
  gray: '#6b7280',
  lightGray: '#d1d5db',
  black: '#111827',
  white: '#ffffff',
  tableHeader: '#21201F',
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

// ─── Page 1: Cover — background image + client info line at bottom ─────────────

const CoverPage: React.FC<{ bgUrl: string | null; data: QuoteDocumentData }> = ({ bgUrl, data }) => {
  const { client, quote_number, created_at, expires_at } = data;

  const clientParts = [
    client.contact_name,
    client.company_name,
    client.email,
    client.phone,
  ].filter(Boolean);

  const metaParts = [
    quote_number && `Quote ${quote_number}`,
    `Date: ${fmtDate(created_at)}`,
    expires_at && `Expires: ${fmtDate(expires_at)}`,
  ].filter(Boolean);

  return (
    <BgPage bgUrl={bgUrl}>
      {/* Single client info line just before the bottom edge */}
      <div style={{
        position: 'absolute',
        bottom: 220,
        left: 234,
        right: 234,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Client name / company */}
        <div style={{
          fontSize: 38,
          color: C.white,
          fontWeight: 400,
          letterSpacing: 1,
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}>
          {clientParts.join('  ·  ')}
        </div>
        {/* Quote number + dates */}
        {metaParts.length > 0 && (
          <div style={{
            fontSize: 35,
            color: C.white,
            opacity: 0.85,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}>
            {metaParts.join('  ·  ')}
          </div>
        )}
      </div>
    </BgPage>
  );
};

// ─── Page 2: Intro (pure image) ───────────────────────────────────────────────

const IntroPage: React.FC<{ bgUrl: string | null }> = ({ bgUrl }) => (
  <BgPage bgUrl={bgUrl} />
);

// ─── Items pages ──────────────────────────────────────────────────────────────

const COL_WIDTHS = {
  num: '4%',
  product: '36%',
  qty: '8%',
  unitPrice: '16%',
  discPrice: '16%',
  total: '18%',
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
      {/*
        Inset: top 15mm → 251px, sides 12mm → 201px + 50px extra each side = 251px
        The extra 50px on each side keeps the table clear of the design's side panels.
      */}
      <div style={{
        position: 'absolute',
        top: 251, left: 351, right: 351, bottom: 351,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Pagination — only shown when multiple pages */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 52, color: C.white, textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              Page {pageIndex + 1} of {totalPages}
            </div>
          </div>
        )}

        {/* Table — transparent rows so background image shows through */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COL_WIDTHS.num }} />
            <col style={{ width: COL_WIDTHS.product }} />
            <col style={{ width: COL_WIDTHS.qty }} />
            <col style={{ width: COL_WIDTHS.unitPrice }} />
            <col style={{ width: COL_WIDTHS.discPrice }} />
            <col style={{ width: COL_WIDTHS.total }} />
          </colgroup>

          <thead>
            <tr style={{ backgroundColor: C.tableHeader }}>
              {['#', 'Product', 'Qty', 'Unit Price', 'Disc. Price', 'Total'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '40px 60px',
                    fontSize: 65,
                    fontWeight: 700,
                    color: C.white,
                    textAlign: i >= 2 ? 'right' : 'left' as React.CSSProperties['textAlign'],
                    letterSpacing: 4,
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageItems.map((item, i) => {
              const rowNum = startIndex + i + 1;
              return (
                <tr key={item.id} style={{ backgroundColor: 'transparent' }}>
                  {/* # */}
                  <td style={{ padding: '35px 60px', fontSize: 56, color: C.gray, verticalAlign: 'top' }}>
                    {rowNum}
                  </td>
                  {/* Product + description */}
                  <td style={{ padding: '35px 60px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 65, fontWeight: 700, color: C.black, lineHeight: 1.3 }}>
                      {item.product_name}
                      {item.sku && (
                        <span style={{ fontSize: 47, fontWeight: 400, color: C.gray, marginLeft: 40 }}>
                          SKU: {item.sku}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: 52, color: C.gray, marginTop: 16, lineHeight: 1.35 }}>
                        {item.description.length > 120
                          ? item.description.slice(0, 120) + '…'
                          : item.description}
                      </div>
                    )}
                    {(item.selected_size || item.selected_color) && (
                      <div style={{ fontSize: 47, color: C.gray, marginTop: 10 }}>
                        {[item.selected_size, item.selected_color].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  {/* Qty */}
                  <td style={{ padding: '35px 60px', fontSize: 65, color: C.black, textAlign: 'right', verticalAlign: 'top' }}>
                    {item.quantity} {item.unit}
                  </td>
                  {/* Unit Price */}
                  <td style={{ padding: '35px 60px', fontSize: 65, color: item.discounted_price != null ? C.gray : C.black, textAlign: 'right', verticalAlign: 'top' }}>
                    {item.discounted_price != null ? (
                      <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmt(item.unit_price, data.currency)}</span>
                    ) : fmt(item.unit_price, data.currency)}
                  </td>
                  {/* Disc. Price */}
                  <td style={{ padding: '35px 60px', fontSize: 65, color: item.discounted_price != null ? C.primary : C.gray, textAlign: 'right', verticalAlign: 'top', opacity: item.discounted_price != null ? 1 : 0.3 }}>
                    {item.discounted_price != null ? fmt(item.discounted_price, data.currency) : '—'}
                  </td>
                  {/* Total */}
                  <td style={{ padding: '35px 60px', fontSize: 65, fontWeight: 700, color: C.black, textAlign: 'right', verticalAlign: 'top' }}>
                    {fmt(item.line_total, data.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals — last items page only, transparent background */}
        {showTotals && (
          <div style={{
            marginTop: 80,
            paddingTop: 60,
            borderTop: `6px solid rgba(0,0,0,0.15)`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <div style={{ minWidth: 2400 }}>
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
        <td style={{ fontSize: 56, color: C.gray, paddingBottom: 30 }}>Subtotal</td>
        <td style={{ fontSize: 56, color: C.black, textAlign: 'right', paddingBottom: 30 }}>
          {fmt(data.subtotal, data.currency)}
        </td>
      </tr>
      <tr>
        <td style={{ fontSize: 56, color: C.gray, paddingBottom: 40 }}>VAT ({data.vat_rate}%)</td>
        <td style={{ fontSize: 56, color: C.gray, textAlign: 'right', paddingBottom: 40 }}>
          {fmt(data.vat_amount, data.currency)}
        </td>
      </tr>
      <tr style={{ borderTop: `6px solid ${C.lightGray}` }}>
        <td style={{ fontSize: 73, fontWeight: 700, color: C.primary, paddingTop: 40 }}>GRAND TOTAL</td>
        <td style={{ fontSize: 73, fontWeight: 700, color: C.primary, textAlign: 'right', paddingTop: 40 }}>
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

    const itemPages: QuoteDocumentItem[][] = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      itemPages.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    if (itemPages.length === 0) itemPages.push([]);

    return (
      <div
        ref={ref}
        className={className}
        style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'flex-start' }}
      >
        {/* Page 1: Cover with client info line */}
        <CoverPage bgUrl={template.first_page_url} data={data} />

        {/* Page 2: Intro (pure image, only rendered if configured) */}
        {template.intro_page_url && <IntroPage bgUrl={template.intro_page_url} />}

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
