import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  RGB,
} from 'pdf-lib';
import { embedOpenSans } from '../_shared/fonts/open-sans.ts';

// A3 landscape in points (1190.55 x 841.89)
export const PAGE_W = 1190.55;
export const PAGE_H = 841.89;

export const MARGIN = 40;
export const TITLE_BLOCK_H = 70;
export const CONTENT_H = PAGE_H - MARGIN * 2 - TITLE_BLOCK_H;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const CONTENT_TOP_Y = PAGE_H - MARGIN;

export const COLOR_DARK: RGB = rgb(0.1, 0.1, 0.18);
export const COLOR_GRAY: RGB = rgb(0.42, 0.42, 0.42);
export const COLOR_LIGHT_GRAY: RGB = rgb(0.85, 0.85, 0.85);
export const COLOR_BORDER: RGB = rgb(0.2, 0.2, 0.2);
export const COLOR_WHITE: RGB = rgb(1, 1, 1);
export const COLOR_BLACK: RGB = rgb(0, 0, 0);
export const COLOR_RED: RGB = rgb(0.85, 0.15, 0.15);
export const COLOR_BG: RGB = rgb(0.985, 0.985, 0.99);

export interface SheetFonts {
  regular: PDFFont;
  bold: PDFFont;
}

export async function loadFonts(pdfDoc: PDFDocument): Promise<SheetFonts> {
  const { regular, bold } = await embedOpenSans(pdfDoc);
  return { regular, bold };
}

export async function embedImageBytes(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      return await pdfDoc.embedPng(bytes);
    }
    return await pdfDoc.embedJpg(bytes);
  } catch (err) {
    console.warn('embedImageBytes failed', err);
    return null;
  }
}

export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn('fetchImageBytes failed', url, err);
    return null;
  }
}

export interface TitleBlockData {
  project_title: string;
  sheet_title: string;
  sheet_label: string;
  sheet_index?: number;
  total_sheets?: number;
  date_iso: string;
  client_name?: string;
  /**
   * Responsibility and issue metadata. A technical drawing that leaves the
   * office needs to say who produced it, who checked it, and which revision it
   * is — otherwise two versions of the same plan are indistinguishable on site.
   * All optional: a mood board has no use for them and renders exactly as before.
   */
  prepared_by?: string;
  checked_by?: string;
  revision?: string;
  // Studio branding (pulled from user_profiles by the PDF function)
  branding_logo_url?: string;
  branding_company_name?: string;
  branding_contact_line?: string;
}

/** Draws the bottom-of-page title block in the same shape every sheet uses. */
export function drawTitleBlock(
  page: PDFPage,
  fonts: SheetFonts,
  td: TitleBlockData,
): void {
  const tbY = MARGIN;
  const tbH = TITLE_BLOCK_H;
  const tbW = CONTENT_W;

  page.drawRectangle({
    x: MARGIN,
    y: tbY,
    width: tbW,
    height: tbH,
    borderColor: COLOR_BORDER,
    borderWidth: 0.8,
  });

  // 4 segments
  const colW = tbW / 4;
  for (let i = 1; i < 4; i++) {
    page.drawLine({
      start: { x: MARGIN + colW * i, y: tbY },
      end: { x: MARGIN + colW * i, y: tbY + tbH },
      color: COLOR_BORDER,
      thickness: 0.5,
    });
  }

  const labelSize = 6.5;
  const valueSize = 10;

  function cell(idx: number, label: string, value: string) {
    const cx = MARGIN + colW * idx + 8;
    page.drawText(label, {
      x: cx,
      y: tbY + tbH - 14,
      size: labelSize,
      font: fonts.regular,
      color: COLOR_GRAY,
    });
    page.drawText(value, {
      x: cx,
      y: tbY + tbH - 32,
      size: valueSize,
      font: fonts.bold,
      color: COLOR_DARK,
      maxWidth: colW - 16,
    });
  }

  cell(0, 'PROJECT', truncate(td.project_title, 28));
  cell(1, 'SHEET', truncate(td.sheet_title, 28));
  cell(2, 'TYPE', td.sheet_label);
  cell(
    3,
    'DATE',
    `${td.date_iso.slice(0, 10)}${
      td.sheet_index ? `   ${td.sheet_index}/${td.total_sheets ?? 1}` : ''
    }`,
  );

  if (td.client_name) {
    page.drawText(`CLIENT: ${td.client_name}`, {
      x: MARGIN + 8,
      y: tbY + tbH - 50,
      size: 8,
      font: fonts.regular,
      color: COLOR_GRAY,
      maxWidth: colW - 16,
    });
  }

  // Second row: responsibility + revision. Each is drawn only when set, so a
  // sheet that never fills them in shows no empty labels. Columns 1 and 2 are
  // free here (column 0 holds CLIENT, column 3 the studio branding strip).
  const subRow = (idx: number, label: string, value: string) => {
    page.drawText(`${label}: ${value}`, {
      x: MARGIN + colW * idx + 8,
      y: tbY + tbH - 50,
      size: 8,
      font: fonts.regular,
      color: COLOR_GRAY,
      maxWidth: colW - 16,
    });
  };
  if (td.prepared_by) subRow(1, 'PREPARED BY', truncate(td.prepared_by, 24));
  if (td.checked_by) subRow(2, 'CHECKED BY', truncate(td.checked_by, 24));
  if (td.revision) {
    page.drawText(`REV: ${truncate(td.revision, 12)}`, {
      x: MARGIN + 8,
      y: tbY + tbH - 60,
      size: 8,
      font: fonts.bold,
      color: COLOR_DARK,
      maxWidth: colW - 16,
    });
  }

  // Studio branding strip (right edge of title block) — company name + contact
  if (td.branding_company_name || td.branding_contact_line) {
    // Align to column 3 exactly like every other cell. The old
    // `MARGIN + tbW - colW - 8` landed 8pt LEFT of the divider, so the studio
    // name and contact line hung out of their cell into the neighbouring one —
    // invisible while that cell was empty, obvious once CHECKED BY filled it.
    const brandingX = MARGIN + colW * 3 + 8;
    page.drawText(td.branding_company_name || '', {
      x: brandingX,
      y: tbY + tbH - 50,
      size: 8,
      font: fonts.bold,
      color: COLOR_DARK,
      maxWidth: colW - 16,
    });
    if (td.branding_contact_line) {
      page.drawText(td.branding_contact_line, {
        x: brandingX,
        y: tbY + tbH - 60,
        size: 7,
        font: fonts.regular,
        color: COLOR_GRAY,
        maxWidth: colW - 16,
      });
    }
  }
}

/**
 * Draws the studio logo in the top-right corner of the page (above the title
 * block) when the sheet's owner has a `branding_logo_url` set. Skipped silently
 * if the image fetch / embed fails — branding is best-effort.
 */
export async function drawBrandingLogo(
  pdfDoc: PDFDocument,
  page: PDFPage,
  td: TitleBlockData,
): Promise<void> {
  if (!td.branding_logo_url) return;
  try {
    const bytes = await fetchImageBytes(td.branding_logo_url);
    if (!bytes) return;
    const img = await embedImageBytes(pdfDoc, bytes);
    if (!img) return;
    // 80×24pt slot in top-right corner, image scaled to fit
    const maxW = 100, maxH = 30;
    const dims = img.scaleToFit(maxW, maxH);
    page.drawImage(img, {
      x: PAGE_W - MARGIN - dims.width,
      y: PAGE_H - MARGIN - dims.height,
      width: dims.width,
      height: dims.height,
    });
  } catch {/* branding is best-effort */}
}

export function drawSheetHeader(
  page: PDFPage,
  fonts: SheetFonts,
  title: string,
  subtitle?: string,
): number {
  const headerY = PAGE_H - MARGIN - 8;
  page.drawText(title.toUpperCase(), {
    x: MARGIN,
    y: headerY - 18,
    size: 20,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  if (subtitle) {
    page.drawText(subtitle, {
      x: MARGIN,
      y: headerY - 36,
      size: 10,
      font: fonts.regular,
      color: COLOR_GRAY,
    });
  }
  page.drawLine({
    start: { x: MARGIN, y: headerY - 50 },
    end: { x: PAGE_W - MARGIN, y: headerY - 50 },
    color: COLOR_BORDER,
    thickness: 0.7,
  });
  return headerY - 60;
}

export function newSheetPage(pdfDoc: PDFDocument): PDFPage {
  return pdfDoc.addPage([PAGE_W, PAGE_H]);
}

export function truncate(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const tryLine = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(tryLine, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = tryLine;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Convert a #rrggbb string to pdf-lib RGB. Falls back to neutral gray on bad input. */
export function hexToRgb(hex: string): RGB {
  if (!hex) return rgb(0.7, 0.7, 0.7);
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return rgb(0.7, 0.7, 0.7);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return rgb(0.7, 0.7, 0.7);
  }
  return rgb(r, g, b);
}
