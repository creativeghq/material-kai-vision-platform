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
 * cover dimensions are known.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, RGB } from 'pdf-lib';
import { embedOpenSans } from '../fonts/open-sans.ts';
import { round2 } from '../money.ts';

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
// Column ORDER mirrors a supplier proforma line: Code · Description · Unit · Qty ·
// Price · Discount% · Discount · VAT% · Net. Discount/VAT columns are dynamic (only
// rendered when the data carries them) so a plain price list stays lean.
type ColumnKey = 'index' | 'thumb' | 'sku' | 'name' | 'room' | 'size_color' | 'unit' | 'qty' | 'price' | 'disc_pct' | 'disc_val' | 'vat_pct' | 'total';
type Align = 'left' | 'right' | 'center';
interface ColumnSpec { key: ColumnKey; label: string; width: number; align: Align; }
const LIST_COLUMNS: ColumnSpec[] = [
  { key: 'index', label: '#', width: 20, align: 'left' },
  { key: 'thumb', label: '', width: 30, align: 'center' },
  { key: 'sku', label: 'Code', width: 58, align: 'left' },
  { key: 'name', label: 'Description', width: 120, align: 'left' },
  { key: 'room', label: 'Room', width: 50, align: 'left' },
  { key: 'size_color', label: 'Size / Color', width: 55, align: 'left' },
  { key: 'unit', label: 'Unit', width: 40, align: 'left' },
  { key: 'qty', label: 'Qty', width: 38, align: 'right' },
  { key: 'price', label: 'Price', width: 52, align: 'right' },
  { key: 'disc_pct', label: 'Disc %', width: 34, align: 'right' },
  { key: 'disc_val', label: 'Discount', width: 54, align: 'right' },
  { key: 'vat_pct', label: 'VAT %', width: 34, align: 'right' },
  { key: 'total', label: 'Net', width: 60, align: 'right' },
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
      case 'disc_pct': case 'disc_val': return showPriceCols && items.some((it) => (it.discount_value ?? 0) > 0 || (it.discount_pct ?? 0) > 0);
      case 'vat_pct': return showPriceCols && items.some((it) => (it.vat_pct ?? 0) > 0);
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
  discount_pct?: number | null;
  discount_value?: number | null;
  vat_pct?: number | null;
  line_total?: number | null;   // NET line value (after discount)
  pricing_status?: string;
  specs?: Record<string, unknown> | null;
  installation_requirements?: string | null;
  delivery_date?: string | null;
}
export interface BrandedDocSection { title?: string | null; intro?: string | null; items: BrandedDocItem[]; }
/** One labelled block of key/value specification rows (e.g. "Performance"). */
export interface BrandedSpecTable { title: string; rows: Array<{ label: string; value: string }>; }
export interface BrandedTotals {
  subtotal: number;               // NET subtotal (after line discounts) — legacy field
  vat_rate: number;
  vat_amount: number;
  grand_total: number;
  cash_discount_pct?: number;
  gross_subtotal?: number;        // value BEFORE discount (Σ price×qty) — proforma breakdown
  discount_total?: number;        // Σ line discounts
  currency: string;
}
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
  /**
   * Optional technical-specification tables, rendered on their own pages after the
   * item pages. Purely additive — a document that supplies none renders exactly as
   * before, so quotes/invoices are unaffected.
   */
  spec_tables?: BrandedSpecTable[] | null;
  /** Heading for the specification pages. Defaults to "Technical specification". */
  spec_title?: string | null;
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

  pageCount += drawSpecPages(pdfDoc, g, doc, bgImage, font, fontBold);

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
    drawPageBackground(page, g, bgImage);

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
          drawPageBackground(ffePage, g, bgImage);
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
      case 'price':
        if (unpriced) drawInCell(page, 'Call for price', x, w, textY, fs - 1, font, COLOR_GRAY, col.align);
        else drawInCell(page, item.unit_price != null ? formatCurrency(item.unit_price, currency) : '-', x, w, textY, fs, font, COLOR_BLACK, col.align);
        break;
      case 'disc_pct': drawInCell(page, (item.discount_pct ?? 0) > 0 ? `${formatQty(item.discount_pct)}%` : '-', x, w, textY, fs, font, COLOR_GRAY, col.align); break;
      case 'disc_val': drawInCell(page, (item.discount_value ?? 0) > 0 ? formatCurrency(item.discount_value as number, currency) : '-', x, w, textY, fs, font, COLOR_GRAY, col.align); break;
      case 'vat_pct': drawInCell(page, (item.vat_pct ?? 0) > 0 ? `${formatQty(item.vat_pct)}%` : '-', x, w, textY, fs, font, COLOR_GRAY, col.align); break;
      case 'total': drawInCell(page, unpriced ? '—' : (item.line_total != null ? formatCurrency(item.line_total, currency) : '-'), x, w, textY, fs, fontBold, COLOR_BLACK, col.align); break;
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
  const labelX = rightEdge - 200;
  const cur = totals.currency;
  const line = (label: string, value: string, bold = false, gray = false) => {
    page.drawText(label, { x: labelX, y, size: bold ? 12 : 10, font: bold ? fontBold : font, color: gray ? COLOR_GRAY : (bold ? COLOR_DARK : COLOR_BLACK) });
    drawRightAligned(page, value, rightEdge, y, bold ? 12 : 10, bold ? fontBold : font, gray ? COLOR_GRAY : (bold ? COLOR_DARK : COLOR_BLACK));
    y -= bold ? 0 : 18;
  };
  y -= 20;
  page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: rightEdge, y: y + 8 }, thickness: 1, color: COLOR_DARK });

  // Detailed proforma breakdown when the line-level discount data is present:
  //   Value before discount → Discount → Net value → VAT → Total payable.
  const hasDiscount = (totals.discount_total ?? 0) > 0 && totals.gross_subtotal != null;
  if (hasDiscount) {
    line('Value before discount', formatCurrency(totals.gross_subtotal as number, cur));
    line('Discount', `- ${formatCurrency(totals.discount_total as number, cur)}`, false, true);
    line('Net value', formatCurrency(totals.subtotal, cur));
  } else {
    // Plain-net presentation. This branch used to RE-DERIVE the discount here —
    // `round2(totals.subtotal * cash_discount_pct / 100)` and then `subtotal - discount` — which
    // is a second derivation of a money quantity in TypeScript, on a document that goes to a
    // customer. CLAUDE.md's rule is one derivation per money quantity: SQL derives, TypeScript
    // formats. A percentage applied here cannot see line-level rounding, per-line discounts, or
    // anything the invoice itself did, so the PDF could print a discount the ledger disagrees
    // with — and it would look completely plausible. (#365 AD-19)
    //
    // The branch above prints a discount when the DERIVED fields are present. When they are not,
    // there is no discount to print: showing nothing is correct, showing a computed one is not.
    line('Price', formatCurrency(totals.subtotal, cur));
  }
  line(`VAT (${totals.vat_rate}%)`, formatCurrency(totals.vat_amount, cur), false, true);
  y -= 4;
  page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: rightEdge, y: y + 8 }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
  line(hasDiscount ? 'Total payable' : 'FINAL', formatCurrency(totals.grand_total, cur), true);
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
    // Paginate by the height actually available, NOT by a fixed 4 cards per page.
    // Page size follows the workspace's cover template, so it is not always portrait
    // A4: on the 842x541 landscape default cover only two cards fit, and the old
    // `slice(chunk * 4, ...)` + `break` silently dropped cards 3 and 4 of every
    // section — no error, no warning, and page_count still reported success.
    let idx = 0;
    let firstPage = true;
    do {
      const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++;
      drawPageBackground(page, g, bgImage);
      let y = g.PAGE_H - g.MARGIN_TOP;
      if (firstPage && section.title) {
        y = drawHeadingWithRule(page, g, section.title, y, fontBold); y -= 28;
        if (section.intro) { for (const line of wrapText(section.intro, font, 11, g.CONTENT_W).slice(0, 3)) { page.drawText(line, { x: g.MARGIN, y, size: 11, font, color: COLOR_GRAY }); y -= 14; } y -= 4; }
        page.drawLine({ start: { x: g.MARGIN, y: y - 4 }, end: { x: g.PAGE_W - g.MARGIN, y: y - 4 }, thickness: 0.5, color: COLOR_LIGHT_GRAY }); y -= 18;
      } else if (section.title) { y -= 10; page.drawText(`${section.title} (continued)`, { x: g.MARGIN, y, size: 12, font, color: COLOR_GRAY }); y -= 22; }
      let drawn = 0;
      while (idx < materials.length) {
        // Always place at least one card per page — otherwise a page too short for a
        // card would add pages forever instead of dropping content.
        if (drawn > 0 && y - rowH < 60) break;
        const mat = materials[idx];
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
        idx++; drawn++;
      }
      firstPage = false;
    } while (idx < materials.length);
  }
  if (doc.totals) {
    const page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++;
    drawPageBackground(page, g, bgImage);
    drawTotals(page, g, doc.totals, g.PAGE_H - 140, font, fontBold);
  }
  return pages;
}

// ── Specification tables ────────────────────────────────────────────────────────
// Two newspaper-style columns of label/value rows. Values wrap, so a long feature
// list keeps its own row height; a group that runs past the bottom continues in the
// next column (or on the next page) under a "(cont.)" heading rather than being cut.
function drawSpecPages(pdfDoc: PDFDocument, g: Geom, doc: BrandedDoc, bgImage: PDFImage | null, font: PDFFont, fontBold: PDFFont): number {
  const tables = (doc.spec_tables ?? []).filter((t) => t && t.rows && t.rows.length > 0);
  if (tables.length === 0) return 0;

  const GUTTER = 30;
  const COL_W = (g.CONTENT_W - GUTTER) / 2;
  const LABEL_W = COL_W * 0.46;
  const VALUE_W = COL_W - LABEL_W - 6;
  const LINE_H = 11, ROW_PAD = 5, GROUP_GAP = 15, BOTTOM = 56;
  const FS = 8.5;

  let pages = 0;
  let page: PDFPage = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++;
  let colTop = 0, y = 0, col = 0;
  let first = true;

  const startPage = () => {
    drawPageBackground(page, g, bgImage);
    let hy = g.PAGE_H - g.MARGIN_TOP;
    const heading = doc.spec_title || 'Technical specification';
    if (first) {
      hy = drawHeadingWithRule(page, g, heading, hy, fontBold); hy -= 24;
      first = false;
    } else {
      page.drawText(`${heading} (continued)`, { x: g.MARGIN, y: hy, size: 12, font, color: COLOR_GRAY }); hy -= 18;
    }
    page.drawLine({ start: { x: g.MARGIN, y: hy }, end: { x: g.PAGE_W - g.MARGIN, y: hy }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
    colTop = hy - 20;
    y = colTop;
    col = 0;
  };

  /** Move to the next column, or a new page when both are used up. */
  const nextColumn = () => {
    col++;
    if (col > 1) { page = pdfDoc.addPage([g.PAGE_W, g.PAGE_H]); pages++; startPage(); }
    else y = colTop;
  };

  const colX = () => g.MARGIN + col * (COL_W + GUTTER);

  const drawGroupTitle = (title: string) => {
    const x = colX();
    page.drawText(title.toUpperCase(), { x, y, size: 8, font: fontBold, color: COLOR_DARK });
    y -= 5;
    page.drawLine({ start: { x, y }, end: { x: x + COL_W, y }, thickness: 0.5, color: COLOR_DARK });
    y -= 12;
  };

  /** Height a whole group needs, so a short one is never split across a column break. */
  const groupHeight = (t: BrandedSpecTable) => {
    let h = 17; // heading + rule + spacing
    for (const row of t.rows) {
      const lines = wrapText(String(row.value ?? ''), font, FS, VALUE_W);
      h += Math.max(LINE_H, lines.length * LINE_H) + ROW_PAD;
    }
    return h;
  };

  startPage();

  for (const table of tables) {
    // Keep a group whole where it can be: if it does not fit in what is left of this
    // column but would fit in an empty one, move first. Only a group taller than a
    // full column is allowed to split — and it continues, it never gets dropped.
    const gh = groupHeight(table);
    const columnCapacity = colTop - BOTTOM;
    if (y - gh < BOTTOM && gh <= columnCapacity) nextColumn();
    // A group needs its heading plus at least one row, else start it in the next column.
    else if (y - (17 + LINE_H + ROW_PAD) < BOTTOM) nextColumn();
    drawGroupTitle(table.title);

    let rowIdx = 0;
    for (const row of table.rows) {
      const valueLines = wrapText(String(row.value ?? ''), font, FS, VALUE_W);
      const rowH = Math.max(LINE_H, valueLines.length * LINE_H) + ROW_PAD;
      if (y - rowH < BOTTOM) {
        nextColumn();
        drawGroupTitle(`${table.title} (cont.)`);
      }
      const x = colX();
      if (rowIdx % 2 === 1) {
        page.drawRectangle({ x: x - 3, y: y - rowH + LINE_H - 2, width: COL_W + 6, height: rowH, color: COLOR_ROW_ALT });
      }
      page.drawText(truncateText(String(row.label ?? ''), font, FS, LABEL_W), { x, y, size: FS, font, color: COLOR_GRAY });
      let vy = y;
      for (const line of valueLines) {
        page.drawText(line, { x: x + LABEL_W + 6, y: vy, size: FS, font: fontBold, color: COLOR_BLACK });
        vy -= LINE_H;
      }
      y -= rowH;
      rowIdx++;
    }
    y -= GROUP_GAP;
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
/**
 * Paint the workspace's content-page artwork behind a page.
 *
 * NO veil. The grid and spec paths used to follow the image with a full-page white
 * rectangle at 0.92 opacity, which washed the artwork out to almost nothing — the
 * template a workspace had uploaded arrived on the page as a faint ghost of itself.
 * The list path never did it, so the same document could veil one page and not the
 * next. One helper now, so a layout cannot reintroduce it on its own.
 *
 * Legibility belongs to the elements that need it — table row bands, the back-cover
 * scrim — not to a sheet thrown over the whole design.
 */
function drawPageBackground(page: PDFPage, g: Geom, bgImage: PDFImage | null): void {
  if (!bgImage) return;
  page.drawImage(bgImage, { x: 0, y: 0, width: g.PAGE_W, height: g.PAGE_H });
}

const HEADING_SIZE = 22;
const HEADING_RULE_W = 32;
const HEADING_RULE_H = 3;
/** Clearance between the accent rule and the tallest glyph below it. */
const HEADING_RULE_GAP = 4;

/**
 * Accent rule ABOVE a section heading. `y` is the TOP of the block; returns the
 * heading's baseline so the caller keeps its own spacing below.
 *
 * drawText positions the BASELINE, not the top of the text. Both call sites used to
 * put the rule a flat 14pt above that baseline — but Open Sans caps reach ~15.8pt at
 * 22pt, so the 3pt bar was drawn straight THROUGH the top of the first letters. It
 * read as a strikethrough on "Monoblock Air Conditioner" and "Technical specification".
 *
 * Measured off the font's own ascender rather than a cap-height guess, because a Greek
 * capital carrying a tonos climbs above cap height and would clip the rule again.
 */
function drawHeadingWithRule(page: PDFPage, g: Geom, title: string, y: number, fontBold: PDFFont): number {
  const ruleY = y - HEADING_RULE_H;
  page.drawRectangle({ x: g.MARGIN, y: ruleY, width: HEADING_RULE_W, height: HEADING_RULE_H, color: COLOR_DARK });
  const ascent = fontBold.heightAtSize(HEADING_SIZE, { descender: false });
  const baseline = ruleY - HEADING_RULE_GAP - ascent;
  page.drawText(title, { x: g.MARGIN, y: baseline, size: HEADING_SIZE, font: fontBold, color: COLOR_DARK });
  return baseline;
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
