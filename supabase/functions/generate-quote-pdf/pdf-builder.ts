import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  RGB,
} from 'pdf-lib';
import { QuoteData, TemplateConfig } from './types.ts';
import { embedOpenSans } from '../_shared/fonts/open-sans.ts';

// A4 dimensions in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;

// Layout constants
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 60;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

// Colors
const COLOR_DARK: RGB = rgb(0.1, 0.1, 0.18); // #1a1a2e
const COLOR_GRAY: RGB = rgb(0.42, 0.42, 0.42);
const COLOR_LIGHT_GRAY: RGB = rgb(0.75, 0.75, 0.75);
const COLOR_ROW_ALT: RGB = rgb(0.97, 0.97, 0.98); // #f8f9fa
const COLOR_WHITE: RGB = rgb(1, 1, 1);
const COLOR_BLACK: RGB = rgb(0, 0, 0);

// Table layout
const TABLE_MARGIN_LEFT = 40;
const TABLE_MARGIN_RIGHT = 40;
const TABLE_W = PAGE_W - TABLE_MARGIN_LEFT - TABLE_MARGIN_RIGHT;
const TABLE_Y_START = PAGE_H - 120;
const HEADER_ROW_H = 28;
// Taller rows leave room for a thumbnail column (fewer rows per page as a result).
const DATA_ROW_H = 36;
const ROWS_PER_PAGE = 15;

// Column definitions (proportional widths totaling TABLE_W ≈ 515). Index-sensitive:
// drawTableRow references these by position, so keep the order in sync.
const COLUMNS = [
  { label: '#', width: 20 },
  { label: '', width: 34 }, // thumbnail
  { label: 'Product', width: 98 },
  { label: 'Room', width: 52 },
  { label: 'SKU', width: 48 },
  { label: 'Size / Color', width: 52 },
  { label: 'Qty', width: 28 },
  { label: 'Unit', width: 30 },
  { label: 'Price', width: 64 },
  { label: 'Total', width: 89 },
];
const IMG_CELL = 30; // rendered thumbnail box (px) inside the 34pt column

/**
 * Build the complete Quote PDF document
 */
export async function buildQuotePDF(
  quoteData: QuoteData,
  templateConfig: TemplateConfig,
  coverBytes: Uint8Array | null,
  bgBytes: Uint8Array | null,
  backcoverBytes: Uint8Array | null,
  logoBytes: Uint8Array | null = null,
  itemImageBytes: Record<string, Uint8Array> = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Embed fonts
  const { regular: fontRegular, bold: fontBold } = await embedOpenSans(pdfDoc);

  // Embed images (each is optional — a missing template background just skips
  // that visual rather than failing PDF generation).
  const coverImage = await embedImage(pdfDoc, coverBytes);
  const bgImage = await embedImage(pdfDoc, bgBytes);
  const backcoverImage = await embedImage(pdfDoc, backcoverBytes);
  const logoImage = await embedImage(pdfDoc, logoBytes);

  // Embed per-item thumbnails (defensive — a bad/undecodable image is skipped).
  const itemImages: Record<string, PDFImage> = {};
  for (const [itemId, bytes] of Object.entries(itemImageBytes)) {
    const img = await embedImage(pdfDoc, bytes);
    if (img) itemImages[itemId] = img;
  }

  // Page 1: Cover (skipped if no cover template uploaded). The seller's logo is
  // overlaid on the cover for the white-label flow (#177).
  if (coverImage) {
    const coverPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    coverPage.drawImage(coverImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    if (logoImage) {
      const maxW = 150, maxH = 80;
      const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height);
      const w = logoImage.width * scale, h = logoImage.height * scale;
      coverPage.drawImage(logoImage, { x: (PAGE_W - w) / 2, y: PAGE_H - h - 60, width: w, height: h });
    }
  }

  // Page 2: Client Details
  addClientDetailsPage(pdfDoc, quoteData, templateConfig, fontRegular, fontBold);

  // Pages 3+: Items Table
  addItemsPages(pdfDoc, quoteData, bgImage, fontRegular, fontBold, itemImages);

  // Last Page: Back Cover (skipped if no back-cover template uploaded)
  if (backcoverImage) addFullPageImage(pdfDoc, backcoverImage);

  // Set metadata
  pdfDoc.setTitle(`Quote ${quoteData.quote_number || quoteData.id}`);
  pdfDoc.setSubject('Material Quote');
  pdfDoc.setCreator('Material Kai');

  return pdfDoc.save();
}

// =====================================================
// IMAGE HELPERS
// =====================================================

async function embedImage(
  pdfDoc: PDFDocument,
  bytes: Uint8Array | null
): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      return await pdfDoc.embedPng(bytes);
    }
    return await pdfDoc.embedJpg(bytes);
  } catch {
    // Unsupported/corrupt image (e.g. webp) — skip rather than fail the PDF.
    return null;
  }
}

function addFullPageImage(pdfDoc: PDFDocument, image: PDFImage): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
}

// =====================================================
// CLIENT DETAILS PAGE
// =====================================================

function addClientDetailsPage(
  pdfDoc: PDFDocument,
  quote: QuoteData,
  config: TemplateConfig,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  // Header: QUOTE title
  page.drawText('QUOTE', {
    x: MARGIN_LEFT,
    y,
    size: 28,
    font: fontBold,
    color: COLOR_DARK,
  });

  // Quote number below title
  y -= 30;
  if (quote.quote_number) {
    page.drawText(quote.quote_number, {
      x: MARGIN_LEFT,
      y,
      size: 14,
      font: fontBold,
      color: COLOR_GRAY,
    });
  }

  // Right-aligned dates
  const dateY = PAGE_H - MARGIN_TOP;
  const dateX = PAGE_W - MARGIN_RIGHT;

  drawRightAligned(page, `Date: ${formatDate(quote.created_at)}`, dateX, dateY, 10, font, COLOR_GRAY);
  if (quote.expires_at) {
    drawRightAligned(page, `Expires: ${formatDate(quote.expires_at)}`, dateX, dateY - 16, 10, font, COLOR_GRAY);
  }

  // Separator line
  y -= 20;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_W - MARGIN_RIGHT, y },
    thickness: 1,
    color: COLOR_LIGHT_GRAY,
  });

  // Two-column layout
  y -= 35;
  const colLeftX = MARGIN_LEFT;
  const colRightX = MARGIN_LEFT + CONTENT_W / 2 + 15;
  const { client } = quote;

  // Left column: Client Details
  let leftY = y;
  leftY = drawSectionHeader(page, 'CLIENT DETAILS', colLeftX, leftY, fontBold);
  leftY = drawLabelValue(page, 'Contact', client.contact_name, colLeftX, leftY, font, fontBold);
  leftY = drawLabelValue(page, 'Email', client.email, colLeftX, leftY, font, fontBold);
  leftY = drawLabelValue(page, 'Phone', client.phone, colLeftX, leftY, font, fontBold);

  // Address block
  if (client.address || client.city || client.postal_code || client.country) {
    leftY -= 8;
    page.drawText('Address', { x: colLeftX, y: leftY, size: 8, font, color: COLOR_GRAY });
    leftY -= 14;
    if (client.address) {
      page.drawText(client.address, { x: colLeftX, y: leftY, size: 10, font: fontBold, color: COLOR_BLACK });
      leftY -= 14;
    }
    const cityLine = [client.city, client.postal_code].filter(Boolean).join(', ');
    if (cityLine) {
      page.drawText(cityLine, { x: colLeftX, y: leftY, size: 10, font: fontBold, color: COLOR_BLACK });
      leftY -= 14;
    }
    if (client.country) {
      page.drawText(client.country, { x: colLeftX, y: leftY, size: 10, font: fontBold, color: COLOR_BLACK });
      leftY -= 14;
    }
  }

  // Right column: Company / Billing Details
  let rightY = y;
  rightY = drawSectionHeader(page, 'COMPANY DETAILS', colRightX, rightY, fontBold);
  rightY = drawLabelValue(page, 'Company', client.company_name, colRightX, rightY, font, fontBold);
  rightY = drawLabelValue(page, 'VAT Number', client.vat_number, colRightX, rightY, font, fontBold);

  // Our company details (from config)
  rightY -= 30;
  rightY = drawSectionHeader(page, 'FROM', colRightX, rightY, fontBold);
  rightY = drawLabelValue(page, 'Company', config.company_name || null, colRightX, rightY, font, fontBold);
  if (config.company_address) {
    rightY = drawLabelValue(page, 'Address', config.company_address, colRightX, rightY, font, fontBold);
  }
  if (config.company_phone) {
    rightY = drawLabelValue(page, 'Phone', config.company_phone, colRightX, rightY, font, fontBold);
  }
  if (config.company_email) {
    rightY = drawLabelValue(page, 'Email', config.company_email, colRightX, rightY, font, fontBold);
  }
  if (config.company_vat) {
    rightY = drawLabelValue(page, 'VAT', config.company_vat, colRightX, rightY, font, fontBold);
  }

  // Quote notes at the bottom
  if (quote.notes) {
    const notesY = Math.min(leftY, rightY) - 40;
    page.drawLine({
      start: { x: MARGIN_LEFT, y: notesY + 15 },
      end: { x: PAGE_W - MARGIN_RIGHT, y: notesY + 15 },
      thickness: 0.5,
      color: COLOR_LIGHT_GRAY,
    });
    drawSectionHeader(page, 'NOTES', MARGIN_LEFT, notesY, fontBold);
    const noteLines = wrapText(quote.notes, font, 10, CONTENT_W);
    let noteY = notesY - 18;
    for (const line of noteLines) {
      page.drawText(line, { x: MARGIN_LEFT, y: noteY, size: 10, font, color: COLOR_BLACK });
      noteY -= 14;
    }
  }
}

// =====================================================
// ITEMS TABLE PAGES
// =====================================================

function addItemsPages(
  pdfDoc: PDFDocument,
  quote: QuoteData,
  bgImage: PDFImage | null,
  font: PDFFont,
  fontBold: PDFFont,
  itemImages: Record<string, PDFImage> = {}
): void {
  const { items } = quote;
  const totalPages = Math.ceil(items.length / ROWS_PER_PAGE);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    // Draw background image (optional — plain page when no template uploaded)
    if (bgImage) page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

    // Page title area
    page.drawText('QUOTE ITEMS', {
      x: TABLE_MARGIN_LEFT,
      y: PAGE_H - 50,
      size: 18,
      font: fontBold,
      color: COLOR_WHITE,
    });

    // Page indicator
    if (totalPages > 1) {
      drawRightAligned(
        page,
        `Page ${pageIdx + 1} of ${totalPages}`,
        PAGE_W - TABLE_MARGIN_RIGHT,
        PAGE_H - 50,
        10,
        font,
        COLOR_WHITE
      );
    }

    // Draw table header
    let y = TABLE_Y_START;
    drawTableHeader(page, y, fontBold);
    y -= HEADER_ROW_H;

    // Draw rows for this page
    const startIdx = pageIdx * ROWS_PER_PAGE;
    const pageItems = items.slice(startIdx, startIdx + ROWS_PER_PAGE);

    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const rowNum = startIdx + i + 1;
      const isAlt = i % 2 === 1;

      drawTableRow(page, y, rowNum, item, isAlt, font, fontBold, itemImages[item.id] || null);
      y -= DATA_ROW_H;
    }

    // Bottom border for last row
    page.drawLine({
      start: { x: TABLE_MARGIN_LEFT, y },
      end: { x: TABLE_MARGIN_LEFT + TABLE_W, y },
      thickness: 0.5,
      color: COLOR_LIGHT_GRAY,
    });

    // Totals on the last items page
    if (pageIdx === totalPages - 1) {
      drawTotals(page, quote, y, font, fontBold);

      // FF&E notes section (installation requirements + delivery dates)
      const ffeItems = items.filter(
        item => item.installation_requirements || item.delivery_date
      );
      if (ffeItems.length > 0) {
        let ffeY = y - 100; // Below totals
        if (ffeY < 120) {
          // Not enough space — add new page
          const ffePage = pdfDoc.addPage([PAGE_W, PAGE_H]);
          if (bgImage) ffePage.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
          ffeY = PAGE_H - 80;
          drawFFENotes(ffePage, ffeItems, ffeY, font, fontBold);
        } else {
          drawFFENotes(page, ffeItems, ffeY, font, fontBold);
        }
      }
    }
  }
}

function drawTableHeader(page: PDFPage, y: number, fontBold: PDFFont): void {
  // Header background
  page.drawRectangle({
    x: TABLE_MARGIN_LEFT,
    y: y - HEADER_ROW_H,
    width: TABLE_W,
    height: HEADER_ROW_H,
    color: COLOR_DARK,
  });

  let x = TABLE_MARGIN_LEFT;
  for (const col of COLUMNS) {
    page.drawText(col.label, {
      x: x + 6,
      y: y - 18,
      size: 8,
      font: fontBold,
      color: COLOR_WHITE,
    });
    x += col.width;
  }
}

function drawTableRow(
  page: PDFPage,
  y: number,
  rowNum: number,
  item: QuoteData['items'][0],
  isAlt: boolean,
  font: PDFFont,
  fontBold: PDFFont,
  thumb: PDFImage | null
): void {
  // Row background
  page.drawRectangle({
    x: TABLE_MARGIN_LEFT,
    y: y - DATA_ROW_H,
    width: TABLE_W,
    height: DATA_ROW_H,
    color: isAlt ? COLOR_ROW_ALT : COLOR_WHITE,
    opacity: isAlt ? 1 : 0.92, // white rows slightly translucent over the bg image
  });

  // Text baseline — vertically centered in the taller row.
  const textY = y - DATA_ROW_H / 2 - 3;
  let x = TABLE_MARGIN_LEFT;
  const fontSize = 7;

  // [0] # column
  page.drawText(String(rowNum), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_GRAY });
  x += COLUMNS[0].width;

  // [1] Thumbnail — contain-fit inside the cell, vertically centered.
  if (thumb) {
    const scale = Math.min(IMG_CELL / thumb.width, IMG_CELL / thumb.height);
    const w = thumb.width * scale, h = thumb.height * scale;
    page.drawImage(thumb, {
      x: x + (COLUMNS[1].width - w) / 2,
      y: y - DATA_ROW_H / 2 - h / 2,
      width: w,
      height: h,
    });
  }
  x += COLUMNS[1].width;

  // [2] Product name + dimensions (truncate if needed)
  const fullProductName = item.dimensions
    ? `${item.product_name}, ${item.dimensions}`
    : item.product_name;
  const productName = truncateText(fullProductName, font, fontSize, COLUMNS[2].width - 10);
  page.drawText(productName, { x: x + 4, y: textY, size: fontSize, font: fontBold, color: COLOR_BLACK });
  x += COLUMNS[2].width;

  // [3] Room
  const roomText = truncateText(item.room || '-', font, fontSize, COLUMNS[3].width - 10);
  page.drawText(roomText, { x: x + 4, y: textY, size: fontSize, font, color: COLOR_BLACK });
  x += COLUMNS[3].width;

  // [4] SKU
  const skuText = truncateText(item.sku || '-', font, fontSize, COLUMNS[4].width - 10);
  page.drawText(skuText, { x: x + 4, y: textY, size: fontSize, font, color: COLOR_GRAY });
  x += COLUMNS[4].width;

  // [5] Size / Color
  const sizeColor = [item.selected_size, item.selected_color].filter(Boolean).join(' / ') || '-';
  const sizeColorTrunc = truncateText(sizeColor, font, fontSize, COLUMNS[5].width - 10);
  page.drawText(sizeColorTrunc, { x: x + 4, y: textY, size: fontSize, font, color: COLOR_BLACK });
  x += COLUMNS[5].width;

  // [6] Qty
  page.drawText(String(item.quantity), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_BLACK });
  x += COLUMNS[6].width;

  // [7] Unit
  page.drawText(item.unit || 'pcs', { x: x + 4, y: textY, size: fontSize, font, color: COLOR_GRAY });
  x += COLUMNS[7].width;

  // [8] Price — single column: strikethrough original + actual when discounted
  const priceColRight = x + COLUMNS[8].width - 4;
  if (item.discounted_price != null) {
    const origStr = formatCurrency(item.unit_price);
    const origSize = fontSize - 1;
    drawRightAligned(page, origStr, priceColRight, textY + 4, origSize, font, COLOR_GRAY);
    const origWidth = font.widthOfTextAtSize(origStr, origSize);
    page.drawLine({
      start: { x: priceColRight - origWidth, y: textY + 7 },
      end: { x: priceColRight, y: textY + 7 },
      thickness: 0.4,
      color: COLOR_GRAY,
    });
    const discStr = formatCurrency(item.discounted_price);
    drawRightAligned(page, discStr, priceColRight, textY - 7, fontSize, fontBold, COLOR_BLACK);
  } else {
    const priceStr = formatCurrency(item.unit_price);
    drawRightAligned(page, priceStr, priceColRight, textY, fontSize, font, COLOR_BLACK);
  }
  x += COLUMNS[8].width;

  // [9] Line Total (right-aligned, bold)
  const totalStr = formatCurrency(item.line_total);
  drawRightAligned(page, totalStr, x + COLUMNS[9].width - 4, textY, fontSize, fontBold, COLOR_BLACK);
}

function drawTotals(
  page: PDFPage,
  quote: QuoteData,
  y: number,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const rightEdge = TABLE_MARGIN_LEFT + TABLE_W - 6;
  const labelX = rightEdge - 180;

  y -= 20;

  // Separator
  page.drawLine({
    start: { x: labelX, y: y + 8 },
    end: { x: rightEdge, y: y + 8 },
    thickness: 1,
    color: COLOR_DARK,
  });

  // #227 — universal 5-line breakdown: Price / Discount / Price after Discount / VAT / Final.
  const cashPct = quote.cash_discount_pct ?? 0;
  const price = quote.subtotal;
  const discount = Math.round(price * cashPct / 100 * 100) / 100;

  // Price
  page.drawText('Price', { x: labelX, y, size: 10, font, color: COLOR_BLACK });
  drawRightAligned(page, formatCurrency(price, quote.currency), rightEdge, y, 10, font, COLOR_BLACK);
  y -= 18;

  // Discount + Price after Discount (only when an order-level discount applies)
  if (discount > 0) {
    page.drawText('Discount', { x: labelX, y, size: 10, font, color: COLOR_GRAY });
    drawRightAligned(page, `- ${formatCurrency(discount, quote.currency)}`, rightEdge, y, 10, font, COLOR_GRAY);
    y -= 18;
    page.drawText('Price after Discount', { x: labelX, y, size: 10, font, color: COLOR_BLACK });
    drawRightAligned(page, formatCurrency(price - discount, quote.currency), rightEdge, y, 10, font, COLOR_BLACK);
    y -= 18;
  }

  // VAT
  page.drawText(`VAT (${quote.vat_rate}%)`, { x: labelX, y, size: 10, font, color: COLOR_GRAY });
  drawRightAligned(page, formatCurrency(quote.vat_amount, quote.currency), rightEdge, y, 10, font, COLOR_GRAY);
  y -= 22;

  // Final separator
  page.drawLine({
    start: { x: labelX, y: y + 8 },
    end: { x: rightEdge, y: y + 8 },
    thickness: 0.5,
    color: COLOR_LIGHT_GRAY,
  });

  // Final
  page.drawText('FINAL', { x: labelX, y, size: 12, font: fontBold, color: COLOR_DARK });
  drawRightAligned(page, formatCurrency(quote.grand_total, quote.currency), rightEdge, y, 12, fontBold, COLOR_DARK);
}

function drawFFENotes(
  page: PDFPage,
  items: QuoteData['items'],
  startY: number,
  font: PDFFont,
  fontBold: PDFFont
): void {
  let y = startY;

  // Section header
  page.drawLine({
    start: { x: TABLE_MARGIN_LEFT, y: y + 10 },
    end: { x: TABLE_MARGIN_LEFT + TABLE_W, y: y + 10 },
    thickness: 0.5,
    color: COLOR_LIGHT_GRAY,
  });

  page.drawText('SPECIFICATIONS & DELIVERY', {
    x: TABLE_MARGIN_LEFT,
    y,
    size: 10,
    font: fontBold,
    color: COLOR_DARK,
  });
  y -= 18;

  for (const item of items) {
    if (y < 60) break; // Safety margin

    // Product name as sub-header
    const itemLabel = item.dimensions
      ? `${item.product_name}, ${item.dimensions}`
      : item.product_name;
    page.drawText(truncateText(itemLabel, fontBold, 8, TABLE_W - 20), {
      x: TABLE_MARGIN_LEFT,
      y,
      size: 8,
      font: fontBold,
      color: COLOR_BLACK,
    });
    y -= 14;

    if (item.installation_requirements) {
      page.drawText('Installation:', {
        x: TABLE_MARGIN_LEFT + 8,
        y,
        size: 7,
        font: fontBold,
        color: COLOR_GRAY,
      });
      const installLines = wrapText(item.installation_requirements, font, 7, TABLE_W - 80);
      for (const line of installLines) {
        page.drawText(line, { x: TABLE_MARGIN_LEFT + 70, y, size: 7, font, color: COLOR_BLACK });
        y -= 11;
      }
    }

    if (item.delivery_date) {
      page.drawText('Delivery:', {
        x: TABLE_MARGIN_LEFT + 8,
        y,
        size: 7,
        font: fontBold,
        color: COLOR_GRAY,
      });
      page.drawText(formatDate(item.delivery_date), {
        x: TABLE_MARGIN_LEFT + 70,
        y,
        size: 7,
        font,
        color: COLOR_BLACK,
      });
      y -= 11;
    }

    y -= 6; // Space between items
  }
}

// =====================================================
// TEXT HELPERS
// =====================================================

function drawRightAligned(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB
): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - textWidth, y, size, font, color });
}

function drawSectionHeader(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  fontBold: PDFFont
): number {
  page.drawText(title, { x, y, size: 10, font: fontBold, color: COLOR_DARK });
  return y - 22;
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string | null,
  x: number,
  y: number,
  font: PDFFont,
  fontBold: PDFFont
): number {
  page.drawText(label, { x, y, size: 8, font, color: COLOR_GRAY });
  y -= 14;
  page.drawText(value || 'N/A', { x, y, size: 10, font: fontBold, color: COLOR_BLACK });
  y -= 18;
  return y;
}

function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCurrency(amount: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '\u20AC' : currency === 'USD' ? '$' : currency;
  return `${symbol}${amount.toFixed(2)}`;
}
