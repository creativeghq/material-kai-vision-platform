import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  RGB,
} from 'pdf-lib';
import type { CatalogRow, CatalogSection, CatalogMaterial, OwnerBranding } from './types.ts';
import { fetchUrlBytes } from './data-fetcher.ts';
import { embedOpenSans } from '../_shared/fonts/open-sans.ts';

// A4 portrait
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const MARGIN_X = 50;
const MARGIN_TOP = 60;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const COLOR_DARK: RGB = rgb(0.10, 0.10, 0.18);
const COLOR_GRAY: RGB = rgb(0.42, 0.42, 0.42);
const COLOR_LIGHT_GRAY: RGB = rgb(0.85, 0.85, 0.85);
const COLOR_WHITE: RGB = rgb(1, 1, 1);
const COLOR_BLACK: RGB = rgb(0, 0, 0);
const COLOR_OVERLAY: RGB = rgb(0, 0, 0);

const ROWS_PER_PAGE = 4;

function hexToRgb(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

async function embedImageSafe(pdfDoc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdfDoc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdfDoc.embedJpg(bytes);
    try { return await pdfDoc.embedPng(bytes); } catch { /* fall through */ }
    try { return await pdfDoc.embedJpg(bytes); } catch { /* skip */ }
  } catch { /* skip */ }
  return null;
}

export async function buildCatalogPDF(args: {
  catalog: CatalogRow;
  coverImageBytes: Uint8Array | null;
  bgImageBytes: Uint8Array | null;
  backCoverImageBytes: Uint8Array | null;
  accentHex: string | null;
  branding: OwnerBranding;
}): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  const { catalog, coverImageBytes, bgImageBytes, backCoverImageBytes, accentHex, branding } = args;
  const pdfDoc = await PDFDocument.create();

  const { regular: fontRegular, bold: fontBold } = await embedOpenSans(pdfDoc);
  // Open Sans italic isn't embedded; use the regular face for the few italic captions.
  const fontItalic = fontRegular;

  const accent = hexToRgb(accentHex) || COLOR_DARK;

  const coverImage = await embedImageSafe(pdfDoc, coverImageBytes);
  const bgImage = await embedImageSafe(pdfDoc, bgImageBytes);
  const backCoverImage = await embedImageSafe(pdfDoc, backCoverImageBytes);

  let pageCount = 0;

  drawCoverPage(pdfDoc, catalog, coverImage, fontBold, fontRegular);
  pageCount++;

  const sections = (catalog.body_data?.sections || []) as CatalogSection[];
  for (let s = 0; s < sections.length; s++) {
    const section = sections[s];
    const materials = section.materials || [];
    const totalChunks = Math.max(1, Math.ceil(materials.length / ROWS_PER_PAGE));
    for (let chunk = 0; chunk < totalChunks; chunk++) {
      const start = chunk * ROWS_PER_PAGE;
      const slice = materials.slice(start, start + ROWS_PER_PAGE);
      await drawSectionPage(pdfDoc, {
        section,
        materials: slice,
        bgImage,
        accent,
        fontBold,
        fontRegular,
        fontItalic,
        showSectionHeader: chunk === 0,
        pageIndex: chunk,
        totalPages: totalChunks,
        catalogTitle: catalog.title,
        branding,
      });
      pageCount++;
    }
  }

  drawBackCoverPage(pdfDoc, catalog, backCoverImage, fontBold, fontRegular, branding);
  pageCount++;

  pdfDoc.setTitle(catalog.title || `Catalog ${catalog.id}`);
  pdfDoc.setSubject('Presentation Catalog');
  pdfDoc.setCreator('Material Kai');

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, pageCount };
}

function drawCoverPage(
  pdfDoc: PDFDocument,
  catalog: CatalogRow,
  coverImage: PDFImage | null,
  fontBold: PDFFont,
  fontRegular: PDFFont,
): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  if (coverImage) {
    page.drawImage(coverImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    page.drawRectangle({
      x: 0, y: 0, width: PAGE_W, height: PAGE_H,
      color: COLOR_OVERLAY, opacity: 0.25,
    });
  } else {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_DARK });
  }

  const cd = catalog.cover_data || {};
  const titleText = cd.title || catalog.title;
  const subtitleText = cd.subtitle || catalog.subtitle || '';
  const clientName = cd.client_name;
  const dateStr = cd.date ? formatDate(cd.date) : formatDate(new Date().toISOString());

  const titleSize = 36;
  const titleLines = wrapText(titleText, fontBold, titleSize, CONTENT_W);
  let y = PAGE_H * 0.55;
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN_X, y, size: titleSize, font: fontBold, color: COLOR_WHITE });
    y -= titleSize + 6;
  }

  if (subtitleText) {
    const subSize = 16;
    const subLines = wrapText(subtitleText, fontRegular, subSize, CONTENT_W);
    y -= 10;
    for (const line of subLines) {
      page.drawText(line, { x: MARGIN_X, y, size: subSize, font: fontRegular, color: COLOR_WHITE });
      y -= subSize + 4;
    }
  }

  if (clientName) {
    page.drawText(`Prepared for: ${clientName}`, {
      x: MARGIN_X, y: 100, size: 12, font: fontRegular, color: COLOR_WHITE,
    });
  }
  page.drawText(dateStr, {
    x: MARGIN_X, y: 80, size: 10, font: fontRegular, color: COLOR_WHITE,
  });
}

async function drawSectionPage(pdfDoc: PDFDocument, args: {
  section: CatalogSection;
  materials: CatalogMaterial[];
  bgImage: PDFImage | null;
  accent: RGB;
  fontBold: PDFFont;
  fontRegular: PDFFont;
  fontItalic: PDFFont;
  showSectionHeader: boolean;
  pageIndex: number;
  totalPages: number;
  catalogTitle: string;
  branding: OwnerBranding;
}): Promise<void> {
  const { section, materials, bgImage, accent, fontBold, fontRegular, fontItalic, showSectionHeader, pageIndex, totalPages, catalogTitle } = args;
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  if (bgImage) {
    page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_WHITE, opacity: 0.92 });
  }

  page.drawText(catalogTitle, {
    x: MARGIN_X, y: PAGE_H - 30, size: 9, font: fontRegular, color: COLOR_GRAY,
  });
  drawRightAligned(page, `Page ${pageIndex + 1} / ${totalPages}`, PAGE_W - MARGIN_X, PAGE_H - 30, 9, fontRegular, COLOR_GRAY);

  let y = PAGE_H - MARGIN_TOP;

  if (showSectionHeader) {
    page.drawRectangle({ x: MARGIN_X, y: y - 4, width: 32, height: 3, color: accent });
    y -= 18;
    page.drawText(section.title || 'Section', {
      x: MARGIN_X, y, size: 22, font: fontBold, color: COLOR_DARK,
    });
    y -= 28;
    if (section.intro) {
      const introLines = wrapText(section.intro, fontItalic, 11, CONTENT_W);
      for (const line of introLines.slice(0, 3)) {
        page.drawText(line, { x: MARGIN_X, y, size: 11, font: fontItalic, color: COLOR_GRAY });
        y -= 14;
      }
      y -= 4;
    }
    page.drawLine({
      start: { x: MARGIN_X, y: y - 4 }, end: { x: PAGE_W - MARGIN_X, y: y - 4 },
      thickness: 0.5, color: COLOR_LIGHT_GRAY,
    });
    y -= 18;
  } else {
    y -= 10;
    page.drawText(`${section.title} (continued)`, { x: MARGIN_X, y, size: 12, font: fontRegular, color: COLOR_GRAY });
    y -= 22;
  }

  const rowH = 150;
  const imgSize = 130;
  for (const mat of materials) {
    if (y - rowH < 60) break;

    const imgX = MARGIN_X;
    const imgY = y - imgSize;
    page.drawRectangle({
      x: imgX, y: imgY, width: imgSize, height: imgSize,
      color: rgb(0.96, 0.96, 0.96), borderColor: COLOR_LIGHT_GRAY, borderWidth: 0.5,
    });

    if (mat.image_url) {
      const bytes = await fetchUrlBytes(mat.image_url);
      const img = await embedImageSafe(pdfDoc, bytes);
      if (img) {
        const ratio = Math.min(imgSize / img.width, imgSize / img.height);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        page.drawImage(img, {
          x: imgX + (imgSize - drawW) / 2,
          y: imgY + (imgSize - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }
    } else {
      page.drawText('No image', { x: imgX + 38, y: imgY + imgSize / 2, size: 10, font: fontItalic, color: COLOR_GRAY });
    }

    const textX = imgX + imgSize + 16;
    const textW = CONTENT_W - imgSize - 16;
    let textY = y - 4;

    page.drawText(truncate(mat.name, fontBold, 14, textW), {
      x: textX, y: textY, size: 14, font: fontBold, color: COLOR_DARK,
    });
    textY -= 18;

    if (mat.description) {
      const lines = wrapText(mat.description, fontRegular, 10, textW);
      for (const line of lines.slice(0, 3)) {
        page.drawText(line, { x: textX, y: textY, size: 10, font: fontRegular, color: COLOR_BLACK });
        textY -= 13;
      }
    }

    if (mat.specs && Object.keys(mat.specs).length > 0) {
      const specsLine = Object.entries(mat.specs).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('  •  ');
      const truncated = truncate(specsLine, fontRegular, 9, textW);
      textY -= 4;
      page.drawText(truncated, { x: textX, y: textY, size: 9, font: fontRegular, color: COLOR_GRAY });
      textY -= 12;
    }

    if (mat.price != null) {
      const priceStr = formatCurrency(mat.price, mat.currency || 'EUR');
      page.drawText(priceStr, { x: textX, y: imgY + 6, size: 14, font: fontBold, color: accent });
    }

    if (mat.price_source && mat.price_source !== 'manual') {
      const tag = mat.price_source.replace(/_/g, ' ');
      drawRightAligned(page, tag, PAGE_W - MARGIN_X, imgY + 6, 8, fontItalic, COLOR_GRAY);
    }

    y -= rowH;
    page.drawLine({
      start: { x: MARGIN_X, y: y + 2 }, end: { x: PAGE_W - MARGIN_X, y: y + 2 },
      thickness: 0.25, color: COLOR_LIGHT_GRAY,
    });
    y -= 8;
  }
}

function drawBackCoverPage(
  pdfDoc: PDFDocument,
  catalog: CatalogRow,
  backCoverImage: PDFImage | null,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  branding: OwnerBranding,
): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  if (backCoverImage) {
    page.drawImage(backCoverImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_OVERLAY, opacity: 0.30 });
  } else {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_DARK });
  }

  const closing = catalog.back_cover_data?.closing_message || 'Thank you for your interest.';
  const contactLine = catalog.back_cover_data?.contact_line || branding.contact_line || branding.company_name || '';

  const closingLines = wrapText(closing, fontRegular, 14, CONTENT_W);
  let y = PAGE_H * 0.55;
  for (const line of closingLines) {
    page.drawText(line, { x: MARGIN_X, y, size: 14, font: fontRegular, color: COLOR_WHITE });
    y -= 20;
  }

  if (contactLine) {
    page.drawText(contactLine, { x: MARGIN_X, y: 90, size: 11, font: fontBold, color: COLOR_WHITE });
  }
  page.drawText(formatDate(new Date().toISOString()), {
    x: MARGIN_X, y: 70, size: 9, font: fontRegular, color: COLOR_WHITE,
  });
}

function drawRightAligned(page: PDFPage, text: string, rightX: number, y: number, size: number, font: PDFFont, color: RGB): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function truncate(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (!text) return '';
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + '...', fontSize) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '...';
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}
