/**
 * Shared branded-document renderer — the ONE design every generated PDF uses.
 *
 * Renders a normalized `BrandedDoc` (quote, catalog, proforma, …) as:
 *   cover → optional client/company page → items (list-table OR grid) → optional
 *   totals → optional back cover, all under the workspace's branded template images
 *   and "FROM" identity (see branding.ts).
 *
 * The list-table + totals design is ported verbatim from generate-quote-pdf so quotes
 * render identically; catalogs adopt the same design and add a `grid` (card) layout.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, RGB } from 'pdf-lib';
import { embedOpenSans } from '../fonts/open-sans.ts';

// ── Page geometry ────────────────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 60;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

// ── Colors ───────────────────────────────────────────────────────────────────
const COLOR_DARK: RGB = rgb(0.1, 0.1, 0.18);
const COLOR_GRAY: RGB = rgb(0.42, 0.42, 0.42);
const COLOR_LIGHT_GRAY: RGB = rgb(0.75, 0.75, 0.75);
const COLOR_ROW_ALT: RGB = rgb(0.97, 0.97, 0.98);
const COLOR_WHITE: RGB = rgb(1, 1, 1);
const COLOR_BLACK: RGB = rgb(0, 0, 0);
const COLOR_OVERLAY: RGB = rgb(0, 0, 0);

// ── Table geometry (list layout) ───────────────────────────────────────────────
const TABLE_MARGIN_LEFT = 40;
const TABLE_MARGIN_RIGHT = 40;
const TABLE_W = PAGE_W - TABLE_MARGIN_LEFT - TABLE_MARGIN_RIGHT; // 515.28
const TABLE_Y_START = PAGE_H - 120;
const HEADER_ROW_H = 28;
const DATA_ROW_H = 36;
const LIST_ROWS_PER_PAGE = 15;
const IMG_CELL = 30;

// The list column set (identical to the quote PDF). Catalog items map onto it.
type ColumnKey = 'index' | 'thumb' | 'name' | 'room' | 'sku' | 'size_color' | 'qty' | 'unit' | 'price' | 'total';
interface ColumnSpec { key: ColumnKey; label: string; width: number; }
const LIST_COLUMNS: ColumnSpec[] = [
  { key: 'index', label: '#', width: 20 },
  { key: 'thumb', label: '', width: 34 },
  { key: 'name', label: 'Product', width: 98 },
  { key: 'room', label: 'Room', width: 52 },
  { key: 'sku', label: 'SKU', width: 48 },
  { key: 'size_color', label: 'Size / Color', width: 52 },
  { key: 'qty', label: 'Qty', width: 28 },
  { key: 'unit', label: 'Unit', width: 30 },
  { key: 'price', label: 'Price', width: 64 },
  { key: 'total', label: 'Total', width: 89 },
];

// ── Model ──────────────────────────────────────────────────────────────────────
export interface BrandedDocItem {
  image_url?: string | null;   // resolved to bytes via assets.itemImages[key]
  image_key?: string | null;   // key into assets.itemImages
  name: string;
  description?: string | null;
  sku?: string | null;
  room?: string | null;
  size_color?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  discounted_price?: number | null;
  line_total?: number | null;
  pricing_status?: string;
  specs?: Record<string, unknown> | null;
  installation_requirements?: string | null;
  delivery_date?: string | null;
}
export interface BrandedDocSection {
  title?: string | null;
  intro?: string | null;
  items: BrandedDocItem[];
}
export interface BrandedTotals {
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  grand_total: number;
  cash_discount_pct?: number;
  currency: string;
}
export interface BrandedClient {
  contact_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  vat_number?: string | null;
}
export interface BrandedCompany {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  vat?: string | null;
}
export interface BrandedDoc {
  doc_label: string;                 // 'QUOTE' | 'CATALOG' | 'PROFORMA'
  number?: string | null;
  subtitle?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  currency: string;
  layout: 'list' | 'grid';
  company: BrandedCompany;
  client?: BrandedClient | null;
  show_client_page?: boolean;        // render the client/company details page
  notes?: string | null;
  sections: BrandedDocSection[];
  totals?: BrandedTotals | null;     // rendered only when present
  closing_message?: string | null;   // back cover
}
export interface BrandedAssets {
  coverBytes?: Uint8Array | null;
  contentBgBytes?: Uint8Array | null;
  backCoverBytes?: Uint8Array | null;
  logoBytes?: Uint8Array | null;
  itemImages?: Record<string, Uint8Array>;
}

// ── Entry point ─────────────────────────────────────────────────────────────────
export async function renderBrandedDocument(doc: BrandedDoc, assets: BrandedAssets = {}): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: fontBold } = await embedOpenSans(pdfDoc);

  const coverImage = await embedImage(pdfDoc, assets.coverBytes ?? null);
  const bgImage = await embedImage(pdfDoc, assets.contentBgBytes ?? null);
  const backImage = await embedImage(pdfDoc, assets.backCoverBytes ?? null);
  const logoImage = await embedImage(pdfDoc, assets.logoBytes ?? null);

  const itemImages: Record<string, PDFImage> = {};
  for (const [k, bytes] of Object.entries(assets.itemImages ?? {})) {
    const img = await embedImage(pdfDoc, bytes);
    if (img) itemImages[k] = img;
  }

  let pageCount = 0;

  // Cover
  drawCover(pdfDoc, doc, coverImage, logoImage, font, fontBold);
  pageCount++;

  // Client / company details page
  if (doc.show_client_page) {
    drawClientPage(pdfDoc, doc, font, fontBold);
    pageCount++;
  }

  // Items
  const allItems = doc.sections.flatMap((s) => s.items);
  if (doc.layout === 'grid') {
    pageCount += await drawGridPages(pdfDoc, doc, bgImage, itemImages, font, fontBold);
  } else {
    pageCount += await drawListPages(pdfDoc, doc, bgImage, itemImages, font, fontBold);
  }
  void allItems;

  // Back cover
  if (backImage) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page.drawImage(backImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    if (doc.closing_message) {
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_OVERLAY, opacity: 0.3 });
      const lines = wrapText(doc.closing_message, font, 14, CONTENT_W);
      let y = PAGE_H * 0.5;
      for (const line of lines) { page.drawText(line, { x: MARGIN_LEFT, y, size: 14, font, color: COLOR_WHITE }); y -= 20; }
    }
    pageCount++;
  }

  pdfDoc.setTitle(`${doc.doc_label} ${doc.number ?? ''}`.trim());
  pdfDoc.setCreator('Material Kai');
  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, pageCount };
}

// ── Cover ────────────────────────────────────────────────────────────────────
function drawCover(pdfDoc: PDFDocument, doc: BrandedDoc, coverImage: PDFImage | null, logoImage: PDFImage | null, font: PDFFont, fontBold: PDFFont): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  if (coverImage) {
    page.drawImage(coverImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    if (logoImage) {
      const scale = Math.min(150 / logoImage.width, 80 / logoImage.height);
      const w = logoImage.width * scale, h = logoImage.height * scale;
      page.drawImage(logoImage, { x: (PAGE_W - w) / 2, y: PAGE_H - h - 60, width: w, height: h });
    }
  } else {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_DARK });
    // Text cover (no template image): title + meta.
    const titleSize = 34;
    const titleLines = wrapText(doc.doc_label + (doc.number ? `  ${doc.number}` : ''), fontBold, titleSize, CONTENT_W);
    let y = PAGE_H * 0.58;
    for (const line of titleLines) { page.drawText(line, { x: MARGIN_LEFT, y, size: titleSize, font: fontBold, color: COLOR_WHITE }); y -= titleSize + 6; }
    if (doc.subtitle) {
      for (const line of wrapText(doc.subtitle, font, 16, CONTENT_W)) { page.drawText(line, { x: MARGIN_LEFT, y, size: 16, font, color: COLOR_WHITE }); y -= 20; }
    }
    if (doc.client?.company_name || doc.client?.contact_name) {
      page.drawText(`Prepared for: ${doc.client.company_name || doc.client.contact_name}`, { x: MARGIN_LEFT, y: 110, size: 12, font, color: COLOR_WHITE });
    }
    page.drawText(formatDate(doc.created_at), { x: MARGIN_LEFT, y: 90, size: 10, font, color: COLOR_WHITE });
  }
}

// ── Client / company details page (ported from quote) ─────────────────────────
function drawClientPage(pdfDoc: PDFDocument, doc: BrandedDoc, font: PDFFont, fontBold: PDFFont): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  page.drawText(doc.doc_label, { x: MARGIN_LEFT, y, size: 28, font: fontBold, color: COLOR_DARK });
  y -= 30;
  if (doc.number) page.drawText(doc.number, { x: MARGIN_LEFT, y, size: 14, font: fontBold, color: COLOR_GRAY });

  const dateY = PAGE_H - MARGIN_TOP;
  const dateX = PAGE_W - MARGIN_RIGHT;
  drawRightAligned(page, `Date: ${formatDate(doc.created_at)}`, dateX, dateY, 10, font, COLOR_GRAY);
  if (doc.expires_at) drawRightAligned(page, `Expires: ${formatDate(doc.expires_at)}`, dateX, dateY - 16, 10, font, COLOR_GRAY);

  y -= 20;
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_W - MARGIN_RIGHT, y }, thickness: 1, color: COLOR_LIGHT_GRAY });

  y -= 35;
  const colLeftX = MARGIN_LEFT;
  const colRightX = MARGIN_LEFT + CONTENT_W / 2 + 15;
  const client = doc.client ?? {};

  let leftY = y;
  leftY = sectionHeader(page, 'CLIENT DETAILS', colLeftX, leftY, fontBold);
  leftY = labelValue(page, 'Contact', client.contact_name ?? null, colLeftX, leftY, font, fontBold);
  leftY = labelValue(page, 'Email', client.email ?? null, colLeftX, leftY, font, fontBold);
  leftY = labelValue(page, 'Phone', client.phone ?? null, colLeftX, leftY, font, fontBold);
  if (client.address || client.city || client.postal_code || client.country) {
    leftY -= 8;
    page.drawText('Address', { x: colLeftX, y: leftY, size: 8, font, color: COLOR_GRAY });
    leftY -= 14;
    if (client.address) { page.drawText(client.address, { x: colLeftX, y: leftY, size: 10, font: fontBold, color: COLOR_BLACK }); leftY -= 14; }
    const cityLine = [client.city, client.postal_code].filter(Boolean).join(', ');
    if (cityLine) { page.drawText(cityLine, { x: colLeftX, y: leftY, size: 10, font: fontBold, color: COLOR_BLACK }); leftY -= 14; }
    if (client.country) { page.drawText(client.country, { x: colLeftX, y: leftY, size: 10, font: fontBold, color: COLOR_BLACK }); leftY -= 14; }
  }

  let rightY = y;
  rightY = sectionHeader(page, 'COMPANY DETAILS', colRightX, rightY, fontBold);
  rightY = labelValue(page, 'Company', client.company_name ?? null, colRightX, rightY, font, fontBold);
  rightY = labelValue(page, 'VAT Number', client.vat_number ?? null, colRightX, rightY, font, fontBold);

  rightY -= 30;
  const co = doc.company;
  rightY = sectionHeader(page, 'FROM', colRightX, rightY, fontBold);
  rightY = labelValue(page, 'Company', co.name ?? null, colRightX, rightY, font, fontBold);
  if (co.address) rightY = labelValue(page, 'Address', co.address, colRightX, rightY, font, fontBold);
  if (co.phone) rightY = labelValue(page, 'Phone', co.phone, colRightX, rightY, font, fontBold);
  if (co.email) rightY = labelValue(page, 'Email', co.email, colRightX, rightY, font, fontBold);
  if (co.vat) rightY = labelValue(page, 'VAT', co.vat, colRightX, rightY, font, fontBold);

  if (doc.notes) {
    const notesY = Math.min(leftY, rightY) - 40;
    page.drawLine({ start: { x: MARGIN_LEFT, y: notesY + 15 }, end: { x: PAGE_W - MARGIN_RIGHT, y: notesY + 15 }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
    sectionHeader(page, 'NOTES', MARGIN_LEFT, notesY, fontBold);
    let noteY = notesY - 18;
    for (const line of wrapText(doc.notes, font, 10, CONTENT_W)) { page.drawText(line, { x: MARGIN_LEFT, y: noteY, size: 10, font, color: COLOR_BLACK }); noteY -= 14; }
  }
}

// ── List (table) layout ───────────────────────────────────────────────────────
async function drawListPages(pdfDoc: PDFDocument, doc: BrandedDoc, bgImage: PDFImage | null, itemImages: Record<string, PDFImage>, font: PDFFont, fontBold: PDFFont): Promise<number> {
  // Flatten sections into labeled rows: a section-title row then its items.
  type Row = { kind: 'section'; title: string } | { kind: 'item'; item: BrandedDocItem; num: number };
  const rows: Row[] = [];
  let n = 0;
  const multiSection = doc.sections.length > 1 || (doc.sections[0]?.title && doc.sections.length >= 1 && doc.doc_label !== 'QUOTE');
  for (const s of doc.sections) {
    if (multiSection && s.title) rows.push({ kind: 'section', title: s.title });
    for (const it of s.items) { n++; rows.push({ kind: 'item', item: it, num: n }); }
  }

  const showPriceCols = !!doc.totals || doc.sections.some((s) => s.items.some((it) => it.unit_price != null || it.line_total != null));
  const columns = showPriceCols ? LIST_COLUMNS : LIST_COLUMNS.filter((c) => c.key !== 'price' && c.key !== 'total' && c.key !== 'qty' && c.key !== 'unit');
  // Re-flow widths of a reduced column set to fill TABLE_W.
  const usedW = columns.reduce((a, c) => a + c.width, 0);
  const scale = TABLE_W / usedW;
  const cols = columns.map((c) => ({ ...c, width: c.width * scale }));

  const perPage = LIST_ROWS_PER_PAGE;
  let pages = 0;
  let idx = 0;
  while (idx < rows.length || pages === 0) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages++;
    if (bgImage) page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    page.drawText(`${doc.doc_label} ITEMS`, { x: TABLE_MARGIN_LEFT, y: PAGE_H - 50, size: 18, font: fontBold, color: bgImage ? COLOR_WHITE : COLOR_DARK });

    let y = TABLE_Y_START;
    drawTableHeader(page, y, cols, fontBold);
    y -= HEADER_ROW_H;

    let drawn = 0;
    let alt = 0;
    while (idx < rows.length && drawn < perPage) {
      const row = rows[idx];
      if (row.kind === 'section') {
        page.drawRectangle({ x: TABLE_MARGIN_LEFT, y: y - DATA_ROW_H, width: TABLE_W, height: DATA_ROW_H, color: COLOR_DARK, opacity: 0.85 });
        page.drawText(row.title, { x: TABLE_MARGIN_LEFT + 6, y: y - DATA_ROW_H / 2 - 3, size: 9, font: fontBold, color: COLOR_WHITE });
        y -= DATA_ROW_H; idx++; drawn++; alt = 0;
        continue;
      }
      drawTableRow(page, y, row.num, row.item, alt % 2 === 1, cols, doc.currency, font, fontBold, itemImages[row.item.image_key ?? ''] ?? null);
      y -= DATA_ROW_H; idx++; drawn++; alt++;
    }

    page.drawLine({ start: { x: TABLE_MARGIN_LEFT, y }, end: { x: TABLE_MARGIN_LEFT + TABLE_W, y }, thickness: 0.5, color: COLOR_LIGHT_GRAY });

    if (idx >= rows.length && doc.totals) drawTotals(page, doc.totals, y, font, fontBold);
    if (idx >= rows.length) break;
  }
  return pages;
}

function drawTableHeader(page: PDFPage, y: number, cols: ColumnSpec[], fontBold: PDFFont): void {
  page.drawRectangle({ x: TABLE_MARGIN_LEFT, y: y - HEADER_ROW_H, width: TABLE_W, height: HEADER_ROW_H, color: COLOR_DARK });
  let x = TABLE_MARGIN_LEFT;
  for (const col of cols) { page.drawText(col.label, { x: x + 6, y: y - 18, size: 8, font: fontBold, color: COLOR_WHITE }); x += col.width; }
}

function drawTableRow(page: PDFPage, y: number, rowNum: number, item: BrandedDocItem, isAlt: boolean, cols: ColumnSpec[], currency: string, font: PDFFont, fontBold: PDFFont, thumb: PDFImage | null): void {
  page.drawRectangle({ x: TABLE_MARGIN_LEFT, y: y - DATA_ROW_H, width: TABLE_W, height: DATA_ROW_H, color: isAlt ? COLOR_ROW_ALT : COLOR_WHITE, opacity: isAlt ? 1 : 0.92 });
  const textY = y - DATA_ROW_H / 2 - 3;
  const fontSize = 7;
  let x = TABLE_MARGIN_LEFT;
  const unpriced = (item.pricing_status ?? 'priced') !== 'priced';
  for (const col of cols) {
    const w = col.width;
    switch (col.key) {
      case 'index': page.drawText(String(rowNum), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_GRAY }); break;
      case 'thumb': if (thumb) { const s = Math.min(IMG_CELL / thumb.width, IMG_CELL / thumb.height); const iw = thumb.width * s, ih = thumb.height * s; page.drawImage(thumb, { x: x + (w - iw) / 2, y: y - DATA_ROW_H / 2 - ih / 2, width: iw, height: ih }); } break;
      case 'name': page.drawText(truncateText(item.name || '-', font, fontSize, w - 8), { x: x + 4, y: textY, size: fontSize, font: fontBold, color: COLOR_BLACK }); break;
      case 'room': page.drawText(truncateText(item.room || '-', font, fontSize, w - 8), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_BLACK }); break;
      case 'sku': page.drawText(truncateText(item.sku || '-', font, fontSize, w - 8), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_GRAY }); break;
      case 'size_color': page.drawText(truncateText(item.size_color || '-', font, fontSize, w - 8), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_BLACK }); break;
      case 'qty': page.drawText(String(item.quantity ?? 1), { x: x + 4, y: textY, size: fontSize, font, color: COLOR_BLACK }); break;
      case 'unit': page.drawText(item.unit || 'pcs', { x: x + 4, y: textY, size: fontSize, font, color: COLOR_GRAY }); break;
      case 'price': {
        const right = x + w - 4;
        if (unpriced) { drawRightAligned(page, 'Call for price', right, textY, fontSize - 1, font, COLOR_GRAY); break; }
        if (item.discounted_price != null && item.unit_price != null) {
          const orig = formatCurrency(item.unit_price, currency);
          drawRightAligned(page, orig, right, textY + 4, fontSize - 1, font, COLOR_GRAY);
          const ow = font.widthOfTextAtSize(orig, fontSize - 1);
          page.drawLine({ start: { x: right - ow, y: textY + 7 }, end: { x: right, y: textY + 7 }, thickness: 0.4, color: COLOR_GRAY });
          drawRightAligned(page, formatCurrency(item.discounted_price, currency), right, textY - 7, fontSize, fontBold, COLOR_BLACK);
        } else {
          drawRightAligned(page, item.unit_price != null ? formatCurrency(item.unit_price, currency) : '-', right, textY, fontSize, font, COLOR_BLACK);
        }
        break;
      }
      case 'total': {
        const right = x + w - 4;
        drawRightAligned(page, unpriced ? '—' : (item.line_total != null ? formatCurrency(item.line_total, currency) : '-'), right, textY, fontSize, fontBold, COLOR_BLACK);
        break;
      }
    }
    x += w;
  }
}

function drawTotals(page: PDFPage, totals: BrandedTotals, y: number, font: PDFFont, fontBold: PDFFont): void {
  const rightEdge = TABLE_MARGIN_LEFT + TABLE_W - 6;
  const labelX = rightEdge - 180;
  y -= 20;
  page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: rightEdge, y: y + 8 }, thickness: 1, color: COLOR_DARK });

  const cashPct = totals.cash_discount_pct ?? 0;
  const price = totals.subtotal;
  const discount = Math.round(price * cashPct / 100 * 100) / 100;

  page.drawText('Price', { x: labelX, y, size: 10, font, color: COLOR_BLACK });
  drawRightAligned(page, formatCurrency(price, totals.currency), rightEdge, y, 10, font, COLOR_BLACK);
  y -= 18;
  if (discount > 0) {
    page.drawText('Discount', { x: labelX, y, size: 10, font, color: COLOR_GRAY });
    drawRightAligned(page, `- ${formatCurrency(discount, totals.currency)}`, rightEdge, y, 10, font, COLOR_GRAY);
    y -= 18;
    page.drawText('Price after Discount', { x: labelX, y, size: 10, font, color: COLOR_BLACK });
    drawRightAligned(page, formatCurrency(price - discount, totals.currency), rightEdge, y, 10, font, COLOR_BLACK);
    y -= 18;
  }
  page.drawText(`VAT (${totals.vat_rate}%)`, { x: labelX, y, size: 10, font, color: COLOR_GRAY });
  drawRightAligned(page, formatCurrency(totals.vat_amount, totals.currency), rightEdge, y, 10, font, COLOR_GRAY);
  y -= 22;
  page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: rightEdge, y: y + 8 }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
  page.drawText('FINAL', { x: labelX, y, size: 12, font: fontBold, color: COLOR_DARK });
  drawRightAligned(page, formatCurrency(totals.grand_total, totals.currency), rightEdge, y, 12, fontBold, COLOR_DARK);
}

// ── Grid (card) layout — catalog-style rich cards ───────────────────────────────
async function drawGridPages(pdfDoc: PDFDocument, doc: BrandedDoc, bgImage: PDFImage | null, itemImages: Record<string, PDFImage>, font: PDFFont, fontBold: PDFFont): Promise<number> {
  const ROWS_PER_PAGE = 4;
  const rowH = 150, imgSize = 130;
  let pages = 0;
  for (const section of doc.sections) {
    const materials = section.items;
    const chunks = Math.max(1, Math.ceil(materials.length / ROWS_PER_PAGE));
    for (let chunk = 0; chunk < chunks; chunk++) {
      const slice = materials.slice(chunk * ROWS_PER_PAGE, chunk * ROWS_PER_PAGE + ROWS_PER_PAGE);
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pages++;
      if (bgImage) { page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H }); page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_WHITE, opacity: 0.92 }); }
      let y = PAGE_H - MARGIN_TOP;
      if (chunk === 0 && section.title) {
        page.drawRectangle({ x: MARGIN_LEFT, y: y - 4, width: 32, height: 3, color: COLOR_DARK });
        y -= 18;
        page.drawText(section.title, { x: MARGIN_LEFT, y, size: 22, font: fontBold, color: COLOR_DARK });
        y -= 28;
        if (section.intro) { for (const line of wrapText(section.intro, font, 11, CONTENT_W).slice(0, 3)) { page.drawText(line, { x: MARGIN_LEFT, y, size: 11, font, color: COLOR_GRAY }); y -= 14; } y -= 4; }
        page.drawLine({ start: { x: MARGIN_LEFT, y: y - 4 }, end: { x: PAGE_W - MARGIN_RIGHT, y: y - 4 }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
        y -= 18;
      } else if (section.title) {
        y -= 10; page.drawText(`${section.title} (continued)`, { x: MARGIN_LEFT, y, size: 12, font, color: COLOR_GRAY }); y -= 22;
      }
      for (const mat of slice) {
        if (y - rowH < 60) break;
        const imgX = MARGIN_LEFT, imgY = y - imgSize;
        page.drawRectangle({ x: imgX, y: imgY, width: imgSize, height: imgSize, color: rgb(0.96, 0.96, 0.96), borderColor: COLOR_LIGHT_GRAY, borderWidth: 0.5 });
        const thumb = itemImages[mat.image_key ?? ''] ?? null;
        if (thumb) { const r = Math.min(imgSize / thumb.width, imgSize / thumb.height); const dw = thumb.width * r, dh = thumb.height * r; page.drawImage(thumb, { x: imgX + (imgSize - dw) / 2, y: imgY + (imgSize - dh) / 2, width: dw, height: dh }); }
        else page.drawText('No image', { x: imgX + 38, y: imgY + imgSize / 2, size: 10, font, color: COLOR_GRAY });
        const textX = imgX + imgSize + 16, textW = CONTENT_W - imgSize - 16;
        let ty = y - 4;
        page.drawText(truncateText(mat.name, fontBold, 14, textW), { x: textX, y: ty, size: 14, font: fontBold, color: COLOR_DARK }); ty -= 18;
        if (mat.description) { for (const line of wrapText(mat.description, font, 10, textW).slice(0, 3)) { page.drawText(line, { x: textX, y: ty, size: 10, font, color: COLOR_BLACK }); ty -= 13; } }
        if (mat.specs && Object.keys(mat.specs).length > 0) { const sl = Object.entries(mat.specs).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('  •  '); ty -= 4; page.drawText(truncateText(sl, font, 9, textW), { x: textX, y: ty, size: 9, font, color: COLOR_GRAY }); ty -= 12; }
        if (mat.unit_price != null) page.drawText(formatCurrency(mat.unit_price, doc.currency), { x: textX, y: imgY + 6, size: 14, font: fontBold, color: COLOR_DARK });
        y -= rowH;
        page.drawLine({ start: { x: MARGIN_LEFT, y: y + 2 }, end: { x: PAGE_W - MARGIN_RIGHT, y: y + 2 }, thickness: 0.25, color: COLOR_LIGHT_GRAY });
        y -= 8;
      }
    }
  }
  // Totals on their own page (grid mode) when present.
  if (doc.totals) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages++;
    if (bgImage) page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    drawTotals(page, doc.totals, PAGE_H - 140, font, fontBold);
  }
  return pages;
}

// ── Shared helpers ──────────────────────────────────────────────────────────────
async function embedImage(pdfDoc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdfDoc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdfDoc.embedJpg(bytes);
    try { return await pdfDoc.embedPng(bytes); } catch { /* */ }
    try { return await pdfDoc.embedJpg(bytes); } catch { /* */ }
  } catch { /* */ }
  return null;
}

function drawRightAligned(page: PDFPage, text: string, rightX: number, y: number, size: number, font: PDFFont, color: RGB): void {
  page.drawText(text, { x: rightX - font.widthOfTextAtSize(text, size), y, size, font, color });
}
function sectionHeader(page: PDFPage, title: string, x: number, y: number, fontBold: PDFFont): number {
  page.drawText(title, { x, y, size: 10, font: fontBold, color: COLOR_DARK });
  return y - 22;
}
function labelValue(page: PDFPage, label: string, value: string | null, x: number, y: number, font: PDFFont, fontBold: PDFFont): number {
  page.drawText(label, { x, y, size: 8, font, color: COLOR_GRAY });
  y -= 14;
  page.drawText(value || 'N/A', { x, y, size: 10, font: fontBold, color: COLOR_BLACK });
  return y - 18;
}
function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (!text) return '';
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + '...', fontSize) > maxWidth) t = t.slice(0, -1);
  return t + '...';
}
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(/[ \t]+/).filter(Boolean);
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth && cur) { lines.push(cur); cur = word; } else cur = test;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}
function formatDate(iso?: string | null): string {
  if (!iso) return formatDateObj(new Date());
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : formatDateObj(d);
}
function formatDateObj(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function formatCurrency(amount: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}
