/**
 * Shared branded-document renderer — the ONE design every generated PDF uses.
 *
 * Renders a normalized `BrandedDoc` (quote, catalog, proforma, …) as:
 *   cover → optional client/company page → items (list-table OR grid) → optional
 *   totals → optional back cover, under the workspace's branded template images.
 *
 * PAGE SIZE + ORIENTATION FOLLOW THE TEMPLATE COVER IMAGE: the page is sized to the
 * cover image's aspect ratio (portrait vs landscape), so a full-page template renders
 * with no distortion and the whole layout adapts. Falls back to A4 portrait when no
 * cover dimensions are known — in which case the geometry is identical to the old A4.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, RGB } from 'pdf-lib';
import { embedOpenSans } from '../fonts/open-sans.ts';

// ── Colors (immutable) ─────────────────────────────────────────────────────────
// Neutral greys + black only — no accent hue, so the table sits on any template.
const COLOR_DARK: RGB = rgb(0.13, 0.13, 0.13);
const COLOR_GRAY: RGB = rgb(0.42, 0.42, 0.42);
const COLOR_LIGHT_GRAY: RGB = rgb(0.75, 0.75, 0.75);
const COLOR_ROW_ALT: RGB = rgb(0.96, 0.96, 0.96);
const COLOR_WHITE: RGB = rgb(1, 1, 1);
const COLOR_BLACK: RGB = rgb(0, 0, 0);
const COLOR_OVERLAY: RGB = rgb(0, 0, 0);

const A4_LONG = 841.89;
const A4_SHORT = 595.28;
const CELL_PAD = 6; // horizontal padding, shared by header + data so columns line up

// The list column set. Widths are relative and re-scaled to the actual table width.
// `align` is used for BOTH the header label and the cell, so they never drift apart.
type ColumnKey = 'index' | 'thumb' | 'name' | 'room' | 'sku' | 'size_color' | 'qty' | 'unit' | 'price' | 'total';
type Align = 'left' | 'right' | 'center';
interface ColumnSpec { key: ColumnKey; label: string; width: number; align: Align; }
const LIST_COLUMNS: ColumnSpec[] = [
  { key: 'index', label: '#', width: 20, align: 'left' },
  { key: 'thumb', label: '', width: 34, align: 'center' },
  { key: 'name', label: 'Product', width: 110, align: 'left' },
  { key: 'room', label: 'Room', width: 52, align: 'left' },
  { key: 'sku', label: 'SKU', width: 58, align: 'left' },
  { key: 'size_color', label: 'Size / Color', width: 58, align: 'left' },
  { key: 'qty', label: 'Qty', width: 34, align: 'right' },
  { key: 'unit', label: 'Unit', width: 38, align: 'left' },
  { key: 'price', label: 'Price', width: 66, align: 'right' },
  { key: 'total', label: 'Total', width: 80, align: 'right' },
];

// ── Geometry derived from the page size ─────────────────────────────────────────
interface Geom {
  PAGE_W: number; PAGE_H: number;
  MARGIN: number; MARGIN_TOP: number; CONTENT_W: number;
  TABLE_MARGIN: number; TABLE_W: number; TABLE_Y_START: number;
  HEADER_ROW_H: number; DATA_ROW_H: number; ROWS_PER_PAGE: number; IMG_CELL: number;
}

/** Page dimensions (points) from the cover image px, preserving aspect + orientation. */
function pageFromCover(coverW?: number | null, coverH?: number | null): { w: number; h: number } {
  if (!coverW || !coverH || coverW <= 0 || coverH <= 0) return { w: A4_SHORT, h: A4_LONG };
  if (coverW >= coverH) return { w: A4_LONG, h: round2(A4_LONG * coverH / coverW) }; // landscape
  return { h: A4_LONG, w: round2(A4_LONG * coverW / coverH) };                        // portrait
}

/**
 * All layout constants scaled to the page. The table is inset generously from every
 * edge so it lands inside the template's "safe area" (clear of the design's border /
 * side bands), with a comfortable bottom gap so the totals never spill onto the frame.
 */
function computeGeom(PAGE_W: number, PAGE_H: number): Geom {
  const MARGIN = Math.round(PAGE_W * 0.084);
  // ~7.5% side inset (≈63pt on landscape, ≈45pt on A4) so the table clears the frame.
  const TABLE_MARGIN = Math.round(PAGE_W * 0.075);
  const TABLE_W = PAGE_W - 2 * TABLE_MARGIN;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  // Start the table below the template's top band; bottom gap reserved via BOTTOM_GAP.
  const TABLE_Y_START = PAGE_H - Math.round(PAGE_H * 0.15);
  const BOTTOM_GAP = Math.round(PAGE_H * 0.16); // room for totals + template footer
  const HEADER_ROW_H = 26;
  const DATA_ROW_H = 30;
  const ROWS_PER_PAGE = Math.max(4, Math.floor((TABLE_Y_START - HEADER_ROW_H - BOTTOM_GAP) / DATA_ROW_H));
  return { PAGE_W, PAGE_H, MARGIN, MARGIN_TOP: 60, CONTENT_W, TABLE_MARGIN, TABLE_W, TABLE_Y_START, HEADER_ROW_H, DATA_ROW_H, ROWS_PER_PAGE, IMG_CELL: 26 };
}

/** A cell value counts as "present" when it's non-empty and not a bare placeholder. */
function cellPresent(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s !== '-';
}

/**
 * Dynamic column set for THIS doc: only render columns that actually carry data, so the
 * table adapts to the source (a plain price list has no Room/Size, an image catalog has
 * thumbnails, etc.) instead of showing a wall of empty "-" columns. Widths are then
 * re-scaled to fill the table width, so the surviving columns spread out and align.
 */
function listColumns(g: Geom, items: BrandedDocItem[], showPriceCols: boolean, hasThumbs: boolean): ColumnSpec[] {
  const keep = (k: ColumnKey): boolean => {
    switch (k) {
      case 'index':
      case 'name': return true;                                   // always
      case 'thumb': return hasThumbs;                             // only when images exist
      case 'room': return items.some((it) => cellPresent(it.room));
      case 'sku': return items.some((it) => cellPresent(it.sku));
      case 'size_color': return items.some((it) => cellPresent(it.size_color));
      case 'qty': case 'unit': case 'price': case 'total': return showPriceCols;
    }
  };
  const cols = LIST_COLUMNS.filter((c) => keep(c.key));
  const used = cols.reduce((a, c) => a + c.width, 0);
  const scale = g.TABLE_W / used;
  return cols.map((c) => ({ ...c, width: c.width * scale }));
}

// ── Model ──────────────────────────────────────────────────────────────────────
export interface BrandedDocItem {
  image_url?: string | null;
  image_key?: string | null;
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
export interface BrandedDocSection { title?: string | null; intro?: string | null; items: BrandedDocItem[]; }
export interface BrandedTotals { subtotal: number; vat_rate: number; vat_amount: number; grand_total: number; cash_discount_pct?: number; currency: string; }
export interface BrandedClient { contact_name?: string | null; company_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; city?: string | null; postal_code?: string | null; country?: string | null; vat_number?: string | null; }
export interface BrandedCompany { name?: string | null; address?: string | null; phone?: string | null; email?: string | null; vat?: string | null; }
export interface BrandedDoc {
  doc_label: string;
  number?: string | null;
  subtitle?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  currency: string;
  layout: 'list' | 'grid';
  company: BrandedCompany;
  client?: BrandedClient | null;
  show_client_page?: boolean;
  notes?: string | null;
  sections: BrandedDocSection[];
  totals?: BrandedTotals | null;
  closing_message?: string | null;
  cover_optional?: boolean;
  /** Cover image pixel dimensions — the page is sized to this aspect/orientation. */
  page_width?: number | null;
  page_height?: number | null;
}
export interface BrandedAssets {
  coverBytes?: Uint8Array | null;
  introBytes?: Uint8Array | null;   // optional page 2 — no page when absent
  contentBgBytes?: Uint8Array | null;
  backCoverBytes?: Uint8Array | null;
  logoBytes?: Uint8Array | null;
  itemImages?: Record<string, Uint8Array>;
}

// ── Entry point ─────────────────────────────────────────────────────────────────
export async function renderBrandedDocument(doc: BrandedDoc, assets: BrandedAssets = {}): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: fontBold } = await embedOpenSans(pdfDoc);

  const { w: PAGE_W, h: PAGE_H } = pageFromCover(doc.page_width, doc.page_height);
  const g = computeGeom(PAGE_W, PAGE_H);

  const coverImage = await embedImage(pdfDoc, assets.coverBytes ?? null);
  const introImage = await embedImage(pdfDoc, assets.introBytes ?? null);
  const bgImage = await embedImage(pdfDoc, assets.contentBgBytes ?? null);
  const backImage = await embedImage(pdfDoc, assets.backCoverBytes ?? null);
  const logoImage = await embedImage(pdfDoc, assets.logoBytes ?? null);

  const itemImages: Record<string, PDFImage> = {};
  for (const [k, bytes] of Object.entries(assets.itemImages ?? {})) {
    const img = await embedImage(pdfDoc, bytes);
    if (img) itemImages[k] = img;
  }

  let pageCount = 0;

  if (coverImage || !doc.cover_optional) {
    drawCover(pdfDoc, g, doc, coverImage, logoImage, font, fontBold);
    pageCount++;
  }
  // Introduction — optional full-page image (page 2). No page when not uploaded.
  if (introImage) {
    const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]);
    page.drawImage(introImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });
    pageCount++;
  }
  if (doc.show_client_page) {
    drawClientPage(pdfDoc, g, doc, font, fontBold);
    pageCount++;
  }
  pageCount += doc.layout === 'grid'
    ? drawGridPages(pdfDoc, g, doc, bgImage, itemImages, font, fontBold)
    : drawListPages(pdfDoc, g, doc, bgImage, itemImages, font, fontBold);

  if (backImage) {
    const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]);
    page.drawImage(backImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });
    if (doc.closing_message) {
      page.drawRectangle({ x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H, color: COLOR_OVERLAY, opacity: 0.3 });
      let y = g.PAGE_H * 0.5;
      for (const line of wrapText(doc.closing_message, font, 14, g.CONTENT_W)) { page.drawText(line, { x: g.MARGIN, y, size: 14, font, color: COLOR_WHITE }); y -= 20; }
    }
    pageCount++;
  }

  pdfDoc.setTitle(`${doc.doc_label} ${doc.number ?? ''}`.trim());
  pdfDoc.setCreator('Material Kai');
  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, pageCount };
}

// ── Cover ────────────────────────────────────────────────────────────────────
function drawCover(pdfDoc: PDFDocument, g: Geom, doc: BrandedDoc, coverImage: PDFImage | null, logoImage: PDFImage | null, font: PDFFont, fontBold: PDFFont): void {
  const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]);
  if (coverImage) {
    page.drawImage(coverImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });
    if (logoImage) {
      const scale = Math.min(150 / logoImage.width, 80 / logoImage.height);
      const w = logoImage.width * scale, h = logoImage.height * scale;
      page.drawImage(logoImage, { x: (g.PAGE_W - w) / 2, y: g.PAGE_H - h - 60, width: w, height: h });
    }
  } else {
    page.drawRectangle({ x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H, color: COLOR_DARK });
    const titleSize = 34;
    let y = g.PAGE_H * 0.58;
    for (const line of wrapText(doc.doc_label + (doc.number ? `  ${doc.number}` : ''), fontBold, titleSize, g.CONTENT_W)) { page.drawText(line, { x: g.MARGIN, y, size: titleSize, font: fontBold, color: COLOR_WHITE }); y -= titleSize + 6; }
    if (doc.subtitle) for (const line of wrapText(doc.subtitle, font, 16, g.CONTENT_W)) { page.drawText(line, { x: g.MARGIN, y, size: 16, font, color: COLOR_WHITE }); y -= 20; }
    if (doc.client?.company_name || doc.client?.contact_name) page.drawText(`Prepared for: ${doc.client.company_name || doc.client.contact_name}`, { x: g.MARGIN, y: 110, size: 12, font, color: COLOR_WHITE });
    page.drawText(formatDate(doc.created_at), { x: g.MARGIN, y: 90, size: 10, font, color: COLOR_WHITE });
  }
}

// ── Client / company details page ─────────────────────────────────────────────
function drawClientPage(pdfDoc: PDFDocument, g: Geom, doc: BrandedDoc, font: PDFFont, fontBold: PDFFont): void {
  const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]);
  let y = g.PAGE_H - g.MARGIN_TOP;
  page.drawText(doc.doc_label, { x: g.MARGIN, y, size: 28, font: fontBold, color: COLOR_DARK });
  y -= 30;
  if (doc.number) page.drawText(doc.number, { x: g.MARGIN, y, size: 14, font: fontBold, color: COLOR_GRAY });

  const dateX = g.PAGE_W - g.MARGIN;
  drawRightAligned(page, `Date: ${formatDate(doc.created_at)}`, dateX, g.PAGE_H - g.MARGIN_TOP, 10, font, COLOR_GRAY);
  if (doc.expires_at) drawRightAligned(page, `Expires: ${formatDate(doc.expires_at)}`, dateX, g.PAGE_H - g.MARGIN_TOP - 16, 10, font, COLOR_GRAY);

  y -= 20;
  page.drawLine({ start: { x: g.MARGIN, y }, end: { x: g.PAGE_W - g.MARGIN, y }, thickness: 1, color: COLOR_LIGHT_GRAY });

  y -= 35;
  const colLeftX = g.MARGIN;
  const colRightX = g.MARGIN + g.CONTENT_W / 2 + 15;
  const client = doc.client ?? {};

  let leftY = y;
  leftY = sectionHeader(page, 'CLIENT DETAILS', colLeftX, leftY, fontBold);
  leftY = labelValue(page, 'Contact', client.contact_name ?? null, colLeftX, leftY, font, fontBold);
  leftY = labelValue(page, 'Email', client.email ?? null, colLeftX, leftY, font, fontBold);
  leftY = labelValue(page, 'Phone', client.phone ?? null, colLeftX, leftY, font, fontBold);
  if (client.address || client.city || client.postal_code || client.country) {
    leftY -= 8;
    page.drawText('Address', { x: colLeftX, y: leftY, size: 8, font, color: COLOR_GRAY }); leftY -= 14;
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
    page.drawLine({ start: { x: g.MARGIN, y: notesY + 15 }, end: { x: g.PAGE_W - g.MARGIN, y: notesY + 15 }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
    sectionHeader(page, 'NOTES', g.MARGIN, notesY, fontBold);
    let noteY = notesY - 18;
    for (const line of wrapText(doc.notes, font, 10, g.CONTENT_W)) { page.drawText(line, { x: g.MARGIN, y: noteY, size: 10, font, color: COLOR_BLACK }); noteY -= 14; }
  }
}

// ── List (table) layout ───────────────────────────────────────────────────────
function drawListPages(pdfDoc: PDFDocument, g: Geom, doc: BrandedDoc, bgImage: PDFImage | null, itemImages: Record<string, PDFImage>, font: PDFFont, fontBold: PDFFont): number {
  type Row = { kind: 'section'; title: string } | { kind: 'item'; item: BrandedDocItem; num: number };
  const rows: Row[] = [];
  let n = 0;
  for (const s of doc.sections) {
    if (s.title) rows.push({ kind: 'section', title: s.title });
    for (const it of s.items) { n++; rows.push({ kind: 'item', item: it, num: n }); }
  }

  const allItems = doc.sections.flatMap((s) => s.items);
  const showPriceCols = !!doc.totals || allItems.some((it) => it.unit_price != null || it.line_total != null);
  const hasThumbs = allItems.some((it) => !!itemImages[it.image_key ?? '']);
  const cols = listColumns(g, allItems, showPriceCols, hasThumbs);

  let pages = 0, idx = 0;
  while (idx < rows.length || pages === 0) {
    const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]);
    pages++;
    if (bgImage) page.drawImage(bgImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });

    let y = g.TABLE_Y_START;
    drawTableHeader(page, g, y, cols, fontBold);
    y -= g.HEADER_ROW_H;

    let drawn = 0, alt = 0;
    while (idx < rows.length && drawn < g.ROWS_PER_PAGE) {
      const row = rows[idx];
      if (row.kind === 'section') {
        page.drawRectangle({ x: g.TABLE_MARGIN, y: y - g.DATA_ROW_H, width: g.TABLE_W, height: g.DATA_ROW_H, color: COLOR_DARK, opacity: 0.85 });
        page.drawText(row.title, { x: g.TABLE_MARGIN + 6, y: y - g.DATA_ROW_H / 2 - 3, size: 9, font: fontBold, color: COLOR_WHITE });
        y -= g.DATA_ROW_H; idx++; drawn++; alt = 0;
        continue;
      }
      drawTableRow(page, g, y, row.num, row.item, alt % 2 === 1, cols, doc.currency, font, fontBold, itemImages[row.item.image_key ?? ''] ?? null);
      y -= g.DATA_ROW_H; idx++; drawn++; alt++;
    }

    page.drawLine({ start: { x: g.TABLE_MARGIN, y }, end: { x: g.TABLE_MARGIN + g.TABLE_W, y }, thickness: 0.5, color: COLOR_LIGHT_GRAY });

    if (idx >= rows.length) {
      if (doc.totals) { drawTotals(page, g, doc.totals, y, font, fontBold); y -= 110; }
      const ffeItems = doc.sections.flatMap((s) => s.items).filter((it) => it.installation_requirements || it.delivery_date);
      if (ffeItems.length > 0) {
        if (y < 140) {
          const ffePage = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++;
          if (bgImage) ffePage.drawImage(bgImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });
          drawFFENotes(ffePage, g, ffeItems, g.PAGE_H - 80, font, fontBold);
        } else drawFFENotes(page, g, ffeItems, y, font, fontBold);
      }
      break;
    }
  }
  return pages;
}

function drawTableHeader(page: PDFPage, g: Geom, y: number, cols: ColumnSpec[], fontBold: PDFFont): void {
  page.drawRectangle({ x: g.TABLE_MARGIN, y: y - g.HEADER_ROW_H, width: g.TABLE_W, height: g.HEADER_ROW_H, color: COLOR_DARK });
  const ty = y - g.HEADER_ROW_H / 2 - 3;
  let x = g.TABLE_MARGIN;
  for (const col of cols) { if (col.label) drawInCell(page, col.label, x, col.width, ty, 8, fontBold, COLOR_WHITE, col.align); x += col.width; }
}

/** Draw text inside a column cell honoring its alignment (left/right/center). */
function drawInCell(page: PDFPage, text: string, x: number, w: number, y: number, size: number, font: PDFFont, color: RGB, align: Align): void {
  const tw = font.widthOfTextAtSize(text, size);
  const tx = align === 'right' ? x + w - CELL_PAD - tw : align === 'center' ? x + (w - tw) / 2 : x + CELL_PAD;
  page.drawText(text, { x: tx, y, size, font, color });
}

function drawTableRow(page: PDFPage, g: Geom, y: number, rowNum: number, item: BrandedDocItem, isAlt: boolean, cols: ColumnSpec[], currency: string, font: PDFFont, fontBold: PDFFont, thumb: PDFImage | null): void {
  page.drawRectangle({ x: g.TABLE_MARGIN, y: y - g.DATA_ROW_H, width: g.TABLE_W, height: g.DATA_ROW_H, color: isAlt ? COLOR_ROW_ALT : COLOR_WHITE, opacity: isAlt ? 1 : 0.9 });
  const textY = y - g.DATA_ROW_H / 2 - 3;
  const fs = 7;
  const pad = 2 * CELL_PAD;
  let x = g.TABLE_MARGIN;
  const unpriced = (item.pricing_status ?? 'priced') !== 'priced';
  for (const col of cols) {
    const w = col.width;
    switch (col.key) {
      case 'index': drawInCell(page, String(rowNum), x, w, textY, fs, font, COLOR_GRAY, col.align); break;
      case 'thumb': if (thumb) { const s = Math.min(g.IMG_CELL / thumb.width, g.IMG_CELL / thumb.height); const iw = thumb.width * s, ih = thumb.height * s; page.drawImage(thumb, { x: x + (w - iw) / 2, y: y - g.DATA_ROW_H / 2 - ih / 2, width: iw, height: ih }); } break;
      case 'name': drawInCell(page, truncateText(item.name || '-', fontBold, fs, w - pad), x, w, textY, fs, fontBold, COLOR_BLACK, col.align); break;
      case 'room': drawInCell(page, truncateText(item.room || '-', font, fs, w - pad), x, w, textY, fs, font, COLOR_BLACK, col.align); break;
      case 'sku': drawInCell(page, truncateText(item.sku || '-', font, fs, w - pad), x, w, textY, fs, font, COLOR_GRAY, col.align); break;
      case 'size_color': drawInCell(page, truncateText(item.size_color || '-', font, fs, w - pad), x, w, textY, fs, font, COLOR_BLACK, col.align); break;
      case 'qty': drawInCell(page, formatQty(item.quantity), x, w, textY, fs, font, COLOR_BLACK, col.align); break;
      case 'unit': drawInCell(page, truncateText(item.unit || 'pcs', font, fs, w - pad), x, w, textY, fs, font, COLOR_GRAY, col.align); break;
      case 'price': {
        const right = x + w - CELL_PAD;
        if (unpriced) { drawRightAligned(page, 'Call for price', right, textY, fs - 1, font, COLOR_GRAY); break; }
        if (item.discounted_price != null && item.unit_price != null) {
          const orig = formatCurrency(item.unit_price, currency);
          drawRightAligned(page, orig, right, textY + 4, fs - 1, font, COLOR_GRAY);
          const ow = font.widthOfTextAtSize(orig, fs - 1);
          page.drawLine({ start: { x: right - ow, y: textY + 7 }, end: { x: right, y: textY + 7 }, thickness: 0.4, color: COLOR_GRAY });
          drawRightAligned(page, formatCurrency(item.discounted_price, currency), right, textY - 7, fs, fontBold, COLOR_BLACK);
        } else {
          drawRightAligned(page, item.unit_price != null ? formatCurrency(item.unit_price, currency) : '-', right, textY, fs, font, COLOR_BLACK);
        }
        break;
      }
      case 'total': drawRightAligned(page, unpriced ? '—' : (item.line_total != null ? formatCurrency(item.line_total, currency) : '-'), x + w - CELL_PAD, textY, fs, fontBold, COLOR_BLACK); break;
    }
    x += w;
  }
}

/** Quantity without float noise: 28.98 → "28.98", 6.0000001 → "6", 174 → "174". */
function formatQty(q: number | null | undefined): string {
  if (q == null) return '1';
  return String(Math.round(q * 1000) / 1000);
}

function drawTotals(page: PDFPage, g: Geom, totals: BrandedTotals, y: number, font: PDFFont, fontBold: PDFFont): void {
  const rightEdge = g.TABLE_MARGIN + g.TABLE_W - 6;
  const labelX = rightEdge - 180;
  y -= 20;
  page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: rightEdge, y: y + 8 }, thickness: 1, color: COLOR_DARK });
  const cashPct = totals.cash_discount_pct ?? 0;
  const price = totals.subtotal;
  const discount = round2(price * cashPct / 100);
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

function drawFFENotes(page: PDFPage, g: Geom, items: BrandedDocItem[], startY: number, font: PDFFont, fontBold: PDFFont): void {
  let y = startY;
  page.drawLine({ start: { x: g.TABLE_MARGIN, y: y + 10 }, end: { x: g.TABLE_MARGIN + g.TABLE_W, y: y + 10 }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
  page.drawText('SPECIFICATIONS & DELIVERY', { x: g.TABLE_MARGIN, y, size: 10, font: fontBold, color: COLOR_DARK });
  y -= 18;
  for (const item of items) {
    if (y < 60) break;
    page.drawText(truncateText(item.name, fontBold, 8, g.TABLE_W - 20), { x: g.TABLE_MARGIN, y, size: 8, font: fontBold, color: COLOR_BLACK }); y -= 14;
    if (item.installation_requirements) {
      page.drawText('Installation:', { x: g.TABLE_MARGIN + 8, y, size: 7, font: fontBold, color: COLOR_GRAY });
      for (const line of wrapText(item.installation_requirements, font, 7, g.TABLE_W - 80)) { page.drawText(line, { x: g.TABLE_MARGIN + 70, y, size: 7, font, color: COLOR_BLACK }); y -= 11; }
    }
    if (item.delivery_date) {
      page.drawText('Delivery:', { x: g.TABLE_MARGIN + 8, y, size: 7, font: fontBold, color: COLOR_GRAY });
      page.drawText(formatDate(item.delivery_date), { x: g.TABLE_MARGIN + 70, y, size: 7, font, color: COLOR_BLACK }); y -= 11;
    }
    y -= 6;
  }
}

// ── Grid (card) layout ──────────────────────────────────────────────────────────
function drawGridPages(pdfDoc: PDFDocument, g: Geom, doc: BrandedDoc, bgImage: PDFImage | null, itemImages: Record<string, PDFImage>, font: PDFFont, fontBold: PDFFont): number {
  const rowH = 150, imgSize = 130;
  let pages = 0;
  for (const section of doc.sections) {
    const materials = section.items;
    const chunks = Math.max(1, Math.ceil(materials.length / 4));
    for (let chunk = 0; chunk < chunks; chunk++) {
      const slice = materials.slice(chunk * 4, chunk * 4 + 4);
      const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++;
      if (bgImage) { page.drawImage(bgImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H }); page.drawRectangle({ x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H, color: COLOR_WHITE, opacity: 0.92 }); }
      let y = g.PAGE_H - g.MARGIN_TOP;
      if (chunk === 0 && section.title) {
        page.drawRectangle({ x: g.MARGIN, y: y - 4, width: 32, height: 3, color: COLOR_DARK }); y -= 18;
        page.drawText(section.title, { x: g.MARGIN, y, size: 22, font: fontBold, color: COLOR_DARK }); y -= 28;
        if (section.intro) { for (const line of wrapText(section.intro, font, 11, g.CONTENT_W).slice(0, 3)) { page.drawText(line, { x: g.MARGIN, y, size: 11, font, color: COLOR_GRAY }); y -= 14; } y -= 4; }
        page.drawLine({ start: { x: g.MARGIN, y: y - 4 }, end: { x: g.PAGE_W - g.MARGIN, y: y - 4 }, thickness: 0.5, color: COLOR_LIGHT_GRAY }); y -= 18;
      } else if (section.title) { y -= 10; page.drawText(`${section.title} (continued)`, { x: g.MARGIN, y, size: 12, font, color: COLOR_GRAY }); y -= 22; }
      for (const mat of slice) {
        if (y - rowH < 60) break;
        const imgX = g.MARGIN, imgY = y - imgSize;
        page.drawRectangle({ x: imgX, y: imgY, width: imgSize, height: imgSize, color: rgb(0.96, 0.96, 0.96), borderColor: COLOR_LIGHT_GRAY, borderWidth: 0.5 });
        const thumb = itemImages[mat.image_key ?? ''] ?? null;
        if (thumb) { const r = Math.min(imgSize / thumb.width, imgSize / thumb.height); const dw = thumb.width * r, dh = thumb.height * r; page.drawImage(thumb, { x: imgX + (imgSize - dw) / 2, y: imgY + (imgSize - dh) / 2, width: dw, height: dh }); }
        else page.drawText('No image', { x: imgX + 38, y: imgY + imgSize / 2, size: 10, font, color: COLOR_GRAY });
        const textX = imgX + imgSize + 16, textW = g.CONTENT_W - imgSize - 16;
        let ty = y - 4;
        page.drawText(truncateText(mat.name, fontBold, 14, textW), { x: textX, y: ty, size: 14, font: fontBold, color: COLOR_DARK }); ty -= 18;
        if (mat.description) for (const line of wrapText(mat.description, font, 10, textW).slice(0, 3)) { page.drawText(line, { x: textX, y: ty, size: 10, font, color: COLOR_BLACK }); ty -= 13; }
        if (mat.specs && Object.keys(mat.specs).length > 0) { const sl = Object.entries(mat.specs).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('  •  '); ty -= 4; page.drawText(truncateText(sl, font, 9, textW), { x: textX, y: ty, size: 9, font, color: COLOR_GRAY }); ty -= 12; }
        if (mat.unit_price != null) page.drawText(formatCurrency(mat.unit_price, doc.currency), { x: textX, y: imgY + 6, size: 14, font: fontBold, color: COLOR_DARK });
        y -= rowH;
        page.drawLine({ start: { x: g.MARGIN, y: y + 2 }, end: { x: g.PAGE_W - g.MARGIN, y: y + 2 }, thickness: 0.25, color: COLOR_LIGHT_GRAY }); y -= 8;
      }
    }
  }
  if (doc.totals) {
    const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++;
    if (bgImage) page.drawImage(bgImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });
    drawTotals(page, g, doc.totals, g.PAGE_H - 140, font, fontBold);
  }
  return pages;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
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
  page.drawText(label, { x, y, size: 8, font, color: COLOR_GRAY }); y -= 14;
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
    let cur = '';
    for (const word of para.split(/[ \t]+/).filter(Boolean)) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth && cur) { lines.push(cur); cur = word; } else cur = test;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}
function formatDate(iso?: string | null): string {
  if (!iso) return fmtDate(new Date());
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : fmtDate(d);
}
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function formatCurrency(amount: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
