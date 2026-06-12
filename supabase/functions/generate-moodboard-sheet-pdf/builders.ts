import { PDFDocument, PDFImage, PDFPage, rgb } from 'pdf-lib';
import {
  CONTENT_TOP_Y,
  CONTENT_W,
  COLOR_BG,
  COLOR_BLACK,
  COLOR_BORDER,
  COLOR_DARK,
  COLOR_GRAY,
  COLOR_LIGHT_GRAY,
  COLOR_RED,
  COLOR_WHITE,
  MARGIN,
  PAGE_H,
  PAGE_W,
  TITLE_BLOCK_H,
  drawSheetHeader,
  drawTitleBlock,
  embedImageBytes,
  fetchImageBytes,
  hexToRgb,
  newSheetPage,
  truncate,
  wrapText,
  TitleBlockData,
  SheetFonts,
} from './layout.ts';
import type {
  AnnotationData,
  AreaBreakdownData,
  DimensionData,
  FfeItem,
  FixtureSymbolData,
  ProductChip,
  SheetRow,
  SwatchData,
} from './types.ts';

const SHEET_LABELS: Record<string, string> = {
  material_board: 'MATERIAL BOARD',
  color_palette: 'COLOR PALETTE',
  concept_board: 'CONCEPT BOARD',
  lighting_plan: 'LIGHTING PLAN',
  plumbing_plan: 'PLUMBING PLAN',
  annotated_render: 'ANNOTATED RENDER',
  elevation_render_pair: 'ELEVATION + RENDER',
  ffe_schedule: 'FF&E SCHEDULE',
  area_breakdown: 'AREA BREAKDOWN',
  full_deck: 'PRESENTATION DECK',
};

export function sheetLabel(t: string): string {
  return SHEET_LABELS[t] || t.toUpperCase();
}

// ============================================================
// 1. MATERIAL BOARD — chips grid, capped at 8.
// ============================================================
export async function buildMaterialBoard(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  chips: ProductChip[],
): Promise<void> {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, 'Selected materials');

  const visible = chips.slice(0, 8);
  const overflow = chips.length - visible.length;

  // 4 cols x 2 rows
  const gap = 18;
  const cols = 4;
  const rows = 2;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = (cy - MARGIN - 90 - gap * (rows - 1)) / rows;
  const imgH = cellH * 0.55;

  for (let i = 0; i < visible.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = cy - (r + 1) * cellH - r * gap;
    await drawProductChip(pdfDoc, page, fonts, visible[i], x, y, cellW, cellH, imgH);
  }

  if (overflow > 0) {
    page.drawText(`+ ${overflow} more material${overflow === 1 ? '' : 's'} on the moodboard`, {
      x: MARGIN,
      y: MARGIN + 80,
      size: 9,
      font: fonts.regular,
      color: COLOR_GRAY,
    });
  }

  drawTitleBlock(page, fonts, td);
}

async function drawProductChip(
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: SheetFonts,
  chip: ProductChip,
  x: number,
  y: number,
  w: number,
  h: number,
  imgH: number,
): Promise<void> {
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: COLOR_BORDER,
    borderWidth: 0.6,
    color: COLOR_WHITE,
  });

  if (chip.image_url) {
    const bytes = await fetchImageBytes(chip.image_url);
    const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
    if (img) {
      const dims = img.scaleToFit(w - 8, imgH - 8);
      page.drawImage(img, {
        x: x + (w - dims.width) / 2,
        y: y + h - imgH + (imgH - dims.height) / 2 - 4,
        width: dims.width,
        height: dims.height,
      });
    }
  }

  // text under image
  const textY = y + h - imgH - 8;
  page.drawText(truncate(chip.name, 32), {
    x: x + 8,
    y: textY,
    size: 9.5,
    font: fonts.bold,
    color: COLOR_DARK,
    maxWidth: w - 16,
  });

  if (chip.category) {
    page.drawText(truncate(chip.category, 30), {
      x: x + 8,
      y: textY - 12,
      size: 7.5,
      font: fonts.regular,
      color: COLOR_GRAY,
      maxWidth: w - 16,
    });
  }

  if (chip.description) {
    const lines = wrapText(chip.description, fonts.regular, 7.5, w - 16).slice(0, 4);
    let dy = textY - 26;
    for (const line of lines) {
      page.drawText(line, {
        x: x + 8,
        y: dy,
        size: 7.5,
        font: fonts.regular,
        color: COLOR_DARK,
      });
      dy -= 10;
    }
  }
}

// ============================================================
// 2. COLOR PALETTE — swatch row(s) with hex + name.
// ============================================================
export function buildColorPalette(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  swatches: SwatchData[],
): void {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, 'Color palette extracted from moodboard');

  const visible = swatches.slice(0, 8);
  if (visible.length === 0) {
    page.drawText('No colors extracted yet.', {
      x: MARGIN, y: cy - 30, size: 11, font: fonts.regular, color: COLOR_GRAY,
    });
    drawTitleBlock(page, fonts, td);
    return;
  }

  const cols = Math.min(visible.length, 4);
  const rows = Math.ceil(visible.length / cols);
  const gap = 20;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = (cy - MARGIN - 90 - gap * (rows - 1)) / rows;
  const swatchH = cellH * 0.75;

  visible.forEach((sw, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = cy - (r + 1) * cellH - r * gap;

    page.drawRectangle({
      x, y: y + cellH - swatchH, width: cellW, height: swatchH,
      color: hexToRgb(sw.hex),
      borderColor: COLOR_BORDER,
      borderWidth: 0.4,
    });
    page.drawText(sw.hex.toUpperCase(), {
      x: x + 4, y: y + cellH - swatchH - 14,
      size: 10, font: fonts.bold, color: COLOR_DARK,
    });
    page.drawText(truncate(sw.name || '', 32), {
      x: x + 4, y: y + cellH - swatchH - 28,
      size: 8.5, font: fonts.regular, color: COLOR_GRAY,
      maxWidth: cellW - 8,
    });
  });

  drawTitleBlock(page, fonts, td);
}

// ============================================================
// 3. CONCEPT BOARD — image collage with optional captions.
// ============================================================
export async function buildConceptBoard(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  layout: { image_url: string; caption?: string }[],
): Promise<void> {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, 'Inspiration & concept');

  const visible = layout.slice(0, 6);
  if (visible.length === 0) {
    page.drawText('No concept images selected.', {
      x: MARGIN, y: cy - 30, size: 11, font: fonts.regular, color: COLOR_GRAY,
    });
    drawTitleBlock(page, fonts, td);
    return;
  }

  // 3 cols x 2 rows
  const cols = 3;
  const rows = 2;
  const gap = 14;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = (cy - MARGIN - 90 - gap * (rows - 1)) / rows;

  for (let i = 0; i < visible.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = cy - (r + 1) * cellH - r * gap;

    page.drawRectangle({
      x, y, width: cellW, height: cellH,
      borderColor: COLOR_BORDER,
      borderWidth: 0.4,
      color: COLOR_BG,
    });

    const item = visible[i];
    const bytes = await fetchImageBytes(item.image_url);
    const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
    if (img) {
      const captionH = item.caption ? 18 : 0;
      const dims = img.scaleToFit(cellW - 6, cellH - 6 - captionH);
      page.drawImage(img, {
        x: x + (cellW - dims.width) / 2,
        y: y + captionH + (cellH - captionH - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    }
    if (item.caption) {
      page.drawText(truncate(item.caption, 50), {
        x: x + 6, y: y + 5,
        size: 8, font: fonts.regular, color: COLOR_DARK,
        maxWidth: cellW - 12,
      });
    }
  }

  drawTitleBlock(page, fonts, td);
}

// ============================================================
// 4. LIGHTING PLAN — backdrop + fixture symbols + legend.
//    PLUMBING PLAN reuses the exact same layout via buildSymbolPlan;
//    only the symbol glyphs (drawSymbol) and subtitle differ.
// ============================================================
type SymbolPlanPayload = {
  backdrop?: { kind: 'upload' | 'rect'; image_url?: string; width_mm?: number; height_mm?: number };
  symbols: FixtureSymbolData[];
  legend: { symbol_type: string; label: string }[];
};

type SymbolDrawer = (page: PDFPage, fonts: SheetFonts, type: string, cx: number, cy: number, label?: string) => void;

export async function buildLightingPlan(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  payload: SymbolPlanPayload,
): Promise<void> {
  return buildSymbolPlan(pdfDoc, fonts, td, payload, 'Fixture layout', drawFixtureSymbol);
}

export async function buildPlumbingPlan(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  payload: SymbolPlanPayload,
): Promise<void> {
  return buildSymbolPlan(pdfDoc, fonts, td, payload, 'Plumbing layout', drawPlumbingSymbol);
}

async function buildSymbolPlan(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  payload: SymbolPlanPayload,
  subtitle: string,
  drawSymbol: SymbolDrawer,
): Promise<void> {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, subtitle);

  // Plan area on left ~70%, legend on right.
  const planW = CONTENT_W * 0.7;
  const planH = cy - MARGIN - 90;
  const planX = MARGIN;
  const planY = cy - planH;
  page.drawRectangle({
    x: planX, y: planY, width: planW, height: planH,
    color: COLOR_WHITE, borderColor: COLOR_BORDER, borderWidth: 0.5,
  });

  // Backdrop
  let bdX = planX, bdY = planY, bdW = planW, bdH = planH;
  if (payload.backdrop?.kind === 'upload' && payload.backdrop.image_url) {
    const bytes = await fetchImageBytes(payload.backdrop.image_url);
    const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
    if (img) {
      const dims = img.scaleToFit(planW - 20, planH - 20);
      bdW = dims.width;
      bdH = dims.height;
      bdX = planX + (planW - bdW) / 2;
      bdY = planY + (planH - bdH) / 2;
      page.drawImage(img, { x: bdX, y: bdY, width: bdW, height: bdH });
    }
  } else if (payload.backdrop?.kind === 'rect') {
    // Generic room rectangle; symbols are normalized to [0,1] over this rect.
    const ratio = (payload.backdrop.width_mm && payload.backdrop.height_mm)
      ? payload.backdrop.width_mm / payload.backdrop.height_mm
      : 1.5;
    let w = planW - 60, h = w / ratio;
    if (h > planH - 60) { h = planH - 60; w = h * ratio; }
    bdW = w; bdH = h;
    bdX = planX + (planW - w) / 2;
    bdY = planY + (planH - h) / 2;
    page.drawRectangle({
      x: bdX, y: bdY, width: w, height: h,
      borderColor: COLOR_BORDER, borderWidth: 1.2,
    });
    if (payload.backdrop.width_mm && payload.backdrop.height_mm) {
      page.drawText(`${payload.backdrop.width_mm} × ${payload.backdrop.height_mm} mm`, {
        x: bdX + 4, y: bdY + h + 4,
        size: 8, font: fonts.regular, color: COLOR_GRAY,
      });
    }
  }

  // Fixture symbols (x,y are normalized 0..1 within backdrop)
  for (const s of payload.symbols || []) {
    const px = bdX + Math.max(0, Math.min(1, s.x)) * bdW;
    const py = bdY + (1 - Math.max(0, Math.min(1, s.y))) * bdH;
    drawSymbol(page, fonts, s.type, px, py, s.label);
  }

  // Legend on right
  const legendX = planX + planW + 16;
  const legendY = cy - 20;
  page.drawText('LEGEND', {
    x: legendX, y: legendY, size: 11, font: fonts.bold, color: COLOR_DARK,
  });
  let ly = legendY - 24;
  for (const item of (payload.legend || []).slice(0, 12)) {
    drawSymbol(page, fonts, item.symbol_type, legendX + 10, ly + 5);
    page.drawText(truncate(item.label, 28), {
      x: legendX + 32, y: ly,
      size: 9, font: fonts.regular, color: COLOR_DARK,
      maxWidth: CONTENT_W - planW - 50,
    });
    ly -= 22;
  }

  drawTitleBlock(page, fonts, td);
}

function drawFixtureSymbol(
  page: PDFPage,
  fonts: SheetFonts,
  type: string,
  cx: number,
  cy: number,
  label?: string,
): void {
  const r = 7;
  switch (type) {
    case 'recessed': // ⊕
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      page.drawLine({ start: { x: cx - r, y: cy }, end: { x: cx + r, y: cy }, color: COLOR_DARK, thickness: 0.7 });
      page.drawLine({ start: { x: cx, y: cy - r }, end: { x: cx, y: cy + r }, color: COLOR_DARK, thickness: 0.7 });
      break;
    case 'pendant': // ●
      page.drawCircle({ x: cx, y: cy, size: r, color: COLOR_DARK });
      break;
    case 'wall': // ◐
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      page.drawRectangle({ x: cx - r, y: cy - r, width: r, height: r * 2, color: COLOR_DARK });
      break;
    case 'spot': // ◇
      page.drawSquare({ x: cx - r * 0.7, y: cy - r * 0.7, size: r * 1.4, rotate: undefined as any, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      break;
    case 'led_strip': // ▬
      page.drawRectangle({ x: cx - r * 1.5, y: cy - 2, width: r * 3, height: 4, color: COLOR_DARK });
      break;
    case 'floor': // ⬡
    case 'table':
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1.5, color: COLOR_WHITE });
      break;
    default:
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1 });
  }
  if (label) {
    page.drawText(label, {
      x: cx + r + 3, y: cy - 3,
      size: 7, font: fonts.regular, color: COLOR_GRAY,
    });
  }
}

// Plumbing fixture glyphs — 2D architectural symbols drawn from pdf-lib
// primitives. Types must stay in sync with PLUMBING_FIXTURE_DEFS in
// FixtureSymbolCanvas.tsx so the canvas preview and the PDF agree.
function drawPlumbingSymbol(
  page: PDFPage,
  fonts: SheetFonts,
  type: string,
  cx: number,
  cy: number,
  label?: string,
): void {
  const r = 7;
  const code = (txt: string) =>
    page.drawText(txt, { x: cx - txt.length * 1.45, y: cy - 2.5, size: 5, font: fonts.bold, color: COLOR_DARK });
  switch (type) {
    case 'wc': // toilet — bowl over cistern
      page.drawRectangle({ x: cx - r * 0.7, y: cy - r, width: r * 1.4, height: r * 0.9, borderColor: COLOR_DARK, borderWidth: 0.9, color: COLOR_WHITE });
      page.drawCircle({ x: cx, y: cy + r * 0.35, size: r * 0.6, borderColor: COLOR_DARK, borderWidth: 0.9, color: COLOR_WHITE });
      break;
    case 'basin': // washbasin — circle + drain
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      page.drawCircle({ x: cx, y: cy, size: 1.4, color: COLOR_DARK });
      break;
    case 'bath': // bathtub — rounded rectangle + tap end
      page.drawRectangle({ x: cx - r * 1.4, y: cy - r * 0.8, width: r * 2.8, height: r * 1.6, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      page.drawCircle({ x: cx + r, y: cy, size: 1.4, color: COLOR_DARK });
      break;
    case 'shower': // shower tray — square + drain cross
      page.drawSquare({ x: cx - r, y: cy - r, size: r * 2, rotate: undefined as any, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      page.drawLine({ start: { x: cx - r * 0.5, y: cy - r * 0.5 }, end: { x: cx + r * 0.5, y: cy + r * 0.5 }, color: COLOR_DARK, thickness: 0.7 });
      page.drawLine({ start: { x: cx - r * 0.5, y: cy + r * 0.5 }, end: { x: cx + r * 0.5, y: cy - r * 0.5 }, color: COLOR_DARK, thickness: 0.7 });
      break;
    case 'floor_drain': // FD — small square + cross
      page.drawSquare({ x: cx - r * 0.6, y: cy - r * 0.6, size: r * 1.2, rotate: undefined as any, borderColor: COLOR_DARK, borderWidth: 0.9, color: COLOR_WHITE });
      page.drawLine({ start: { x: cx - r * 0.6, y: cy }, end: { x: cx + r * 0.6, y: cy }, color: COLOR_DARK, thickness: 0.6 });
      page.drawLine({ start: { x: cx, y: cy - r * 0.6 }, end: { x: cx, y: cy + r * 0.6 }, color: COLOR_DARK, thickness: 0.6 });
      break;
    case 'water_supply': // supply point — filled dot
      page.drawCircle({ x: cx, y: cy, size: r * 0.55, color: COLOR_DARK });
      break;
    case 'waste': // waste / soil pipe — circle + W
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      code('W');
      break;
    case 'water_heater': // boiler / water heater — circle + WH
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1.3, color: COLOR_WHITE });
      code('WH');
      break;
    case 'mixer': // tap / mixer — small triangle-ish marker
      page.drawCircle({ x: cx, y: cy, size: r * 0.7, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      page.drawCircle({ x: cx, y: cy, size: 1.2, color: COLOR_DARK });
      break;
    default:
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1 });
  }
  if (label) {
    page.drawText(label, {
      x: cx + r + 3, y: cy - 3,
      size: 7, font: fonts.regular, color: COLOR_GRAY,
    });
  }
}

// ============================================================
// 5. ANNOTATED RENDER — image + callout lines + side legend.
// ============================================================
export async function buildAnnotatedRender(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  payload: {
    backdrop_image_url: string;
    annotations: AnnotationData[];
    chips?: ProductChip[];
  },
): Promise<void> {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, 'Annotated render');

  // Render area left 65%, legend right 35%
  const renderW = CONTENT_W * 0.65;
  const renderH = cy - MARGIN - 90;
  const renderX = MARGIN;
  const renderY = cy - renderH;

  page.drawRectangle({
    x: renderX, y: renderY, width: renderW, height: renderH,
    color: COLOR_BG, borderColor: COLOR_BORDER, borderWidth: 0.5,
  });

  let bdX = renderX, bdY = renderY, bdW = renderW, bdH = renderH;
  if (payload.backdrop_image_url) {
    const bytes = await fetchImageBytes(payload.backdrop_image_url);
    const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
    if (img) {
      const dims = img.scaleToFit(renderW - 12, renderH - 12);
      bdW = dims.width;
      bdH = dims.height;
      bdX = renderX + (renderW - bdW) / 2;
      bdY = renderY + (renderH - bdH) / 2;
      page.drawImage(img, { x: bdX, y: bdY, width: bdW, height: bdH });
    }
  }

  // Callouts: x,y and line_endpoint normalized 0..1 within backdrop
  for (const a of payload.annotations || []) {
    const ax = bdX + Math.max(0, Math.min(1, a.x)) * bdW;
    const ay = bdY + (1 - Math.max(0, Math.min(1, a.y))) * bdH;
    const ex = bdX + Math.max(0, Math.min(1, a.line_endpoint_x)) * bdW;
    const ey = bdY + (1 - Math.max(0, Math.min(1, a.line_endpoint_y))) * bdH;

    // Anchor dot
    page.drawCircle({ x: ax, y: ay, size: 3.2, color: COLOR_RED });
    // Line
    page.drawLine({
      start: { x: ax, y: ay }, end: { x: ex, y: ey },
      color: COLOR_DARK, thickness: 0.7,
    });
    // Label box
    const labelText = truncate(a.label || '', 36);
    const labelW = fonts.regular.widthOfTextAtSize(labelText, 8) + 10;
    const labelH = 14;
    const lx = ex + 3;
    const ly = ey - labelH / 2;
    page.drawRectangle({
      x: lx, y: ly, width: labelW, height: labelH,
      color: COLOR_WHITE, borderColor: COLOR_BORDER, borderWidth: 0.4,
    });
    page.drawText(labelText, {
      x: lx + 5, y: ly + 4, size: 8, font: fonts.regular, color: COLOR_DARK,
    });
  }

  // Right legend with up to 8 chips
  const legendX = renderX + renderW + 16;
  let ly = cy - 12;
  page.drawText('MATERIAL SELECTION', {
    x: legendX, y: ly, size: 10, font: fonts.bold, color: COLOR_DARK,
  });
  ly -= 18;
  const chips = (payload.chips || []).slice(0, 8);
  for (const chip of chips) {
    await drawLegendChip(pdfDoc, page, fonts, chip, legendX, ly, CONTENT_W - renderW - 20);
    ly -= 64;
  }

  drawTitleBlock(page, fonts, td);
}

async function drawLegendChip(
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: SheetFonts,
  chip: ProductChip,
  x: number,
  topY: number,
  maxW: number,
): Promise<void> {
  const swatchSize = 50;
  if (chip.image_url) {
    const bytes = await fetchImageBytes(chip.image_url);
    const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
    if (img) {
      const d = img.scaleToFit(swatchSize, swatchSize);
      page.drawImage(img, { x, y: topY - swatchSize, width: d.width, height: d.height });
    }
  } else if (chip.hex) {
    page.drawRectangle({
      x, y: topY - swatchSize, width: swatchSize, height: swatchSize,
      color: hexToRgb(chip.hex),
      borderColor: COLOR_BORDER, borderWidth: 0.3,
    });
  }
  const tx = x + swatchSize + 8;
  const tw = maxW - swatchSize - 8;
  page.drawText(truncate(chip.name, 28), {
    x: tx, y: topY - 12, size: 9, font: fonts.bold, color: COLOR_DARK, maxWidth: tw,
  });
  if (chip.description) {
    const lines = wrapText(chip.description, fonts.regular, 7, tw).slice(0, 4);
    let dy = topY - 24;
    for (const line of lines) {
      page.drawText(line, { x: tx, y: dy, size: 7, font: fonts.regular, color: COLOR_GRAY });
      dy -= 9;
    }
  }
}

// ============================================================
// 6. ELEVATION + RENDER PAIR — uploaded elevation w/ user dims, render below.
// ============================================================
export async function buildElevationRenderPair(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  payload: {
    elevation_image_url: string;
    render_image_url?: string;
    dimensions: DimensionData[];
    tile_callouts?: { x: number; y: number; label: string }[];
  },
): Promise<void> {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, 'Elevation + render');

  // Top half = elevation w/ dimensions, bottom half = render
  const halfH = (cy - MARGIN - 90) / 2 - 8;

  // ELEVATION
  await drawAnnotatedImageBlock(
    pdfDoc, page, fonts,
    payload.elevation_image_url,
    MARGIN, cy - halfH, CONTENT_W, halfH,
    'ELEVATION', payload.dimensions, payload.tile_callouts,
  );

  // RENDER
  const renderTop = cy - halfH - 16;
  if (payload.render_image_url) {
    await drawAnnotatedImageBlock(
      pdfDoc, page, fonts,
      payload.render_image_url,
      MARGIN, renderTop - halfH, CONTENT_W, halfH,
      'RENDER', [], [],
    );
  } else {
    page.drawRectangle({
      x: MARGIN, y: renderTop - halfH, width: CONTENT_W, height: halfH,
      color: COLOR_BG, borderColor: COLOR_BORDER, borderWidth: 0.4,
    });
    page.drawText('No render attached', {
      x: MARGIN + 12, y: renderTop - 20,
      size: 9, font: fonts.regular, color: COLOR_GRAY,
    });
  }

  drawTitleBlock(page, fonts, td);
}

async function drawAnnotatedImageBlock(
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: SheetFonts,
  imageUrl: string,
  x: number, y: number, w: number, h: number,
  label: string,
  dimensions: DimensionData[],
  tileCallouts?: { x: number; y: number; label: string }[],
): Promise<void> {
  page.drawRectangle({
    x, y, width: w, height: h,
    color: COLOR_BG, borderColor: COLOR_BORDER, borderWidth: 0.4,
  });
  page.drawText(label, {
    x: x + 6, y: y + h - 12,
    size: 8, font: fonts.bold, color: COLOR_GRAY,
  });

  let bdX = x + 8, bdY = y + 8, bdW = w - 16, bdH = h - 24;
  const bytes = imageUrl ? await fetchImageBytes(imageUrl) : null;
  const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
  if (img) {
    const d = img.scaleToFit(bdW, bdH);
    bdW = d.width; bdH = d.height;
    bdX = x + (w - bdW) / 2;
    bdY = y + (h - bdH) / 2 - 4;
    page.drawImage(img, { x: bdX, y: bdY, width: bdW, height: bdH });
  }

  // Dimensions: x1,y1,x2,y2 are normalized 0..1 within image
  for (const d of dimensions || []) {
    const sx = bdX + Math.max(0, Math.min(1, d.x1)) * bdW;
    const sy = bdY + (1 - Math.max(0, Math.min(1, d.y1))) * bdH;
    const ex = bdX + Math.max(0, Math.min(1, d.x2)) * bdW;
    const ey = bdY + (1 - Math.max(0, Math.min(1, d.y2))) * bdH;
    page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, color: COLOR_RED, thickness: 0.7 });
    // tick marks
    drawTick(page, sx, sy);
    drawTick(page, ex, ey);
    // value
    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;
    const text = `${d.value}${d.unit ? ' ' + d.unit : ''}`;
    page.drawText(text, {
      x: midX + 3, y: midY + 3,
      size: 7.5, font: fonts.bold, color: COLOR_DARK,
    });
  }

  // Tile callouts (point + label)
  for (const t of tileCallouts || []) {
    const px = bdX + Math.max(0, Math.min(1, t.x)) * bdW;
    const py = bdY + (1 - Math.max(0, Math.min(1, t.y))) * bdH;
    page.drawCircle({ x: px, y: py, size: 3, color: COLOR_RED });
    page.drawText(truncate(t.label, 30), {
      x: px + 6, y: py - 3,
      size: 7, font: fonts.regular, color: COLOR_DARK,
    });
  }
}

function drawTick(page: PDFPage, x: number, y: number) {
  page.drawLine({
    start: { x: x - 3, y: y - 3 }, end: { x: x + 3, y: y + 3 },
    color: COLOR_RED, thickness: 0.7,
  });
}

// ============================================================
// 7. FF&E SCHEDULE — table of items.
// ============================================================
export function buildFfeSchedule(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  items: FfeItem[],
): void {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, 'Furniture, Fixtures & Equipment Schedule');

  if (items.length === 0) {
    page.drawText('No FF&E items.', {
      x: MARGIN, y: cy - 30, size: 11, font: fonts.regular, color: COLOR_GRAY,
    });
    drawTitleBlock(page, fonts, td);
    return;
  }

  const colDefs = [
    { label: '#', width: 24 },
    { label: 'Room', width: 90 },
    { label: 'Item', width: 220 },
    { label: 'Dimensions', width: 130 },
    { label: 'Install', width: 130 },
    { label: 'Delivery', width: 90 },
    { label: 'Qty', width: 40 },
    { label: 'Price', width: 80 },
  ];
  const totalW = colDefs.reduce((s, c) => s + c.width, 0);
  const scale = CONTENT_W / totalW;
  colDefs.forEach((c) => (c.width *= scale));

  // header
  let y = cy - 16;
  let cx = MARGIN;
  page.drawRectangle({
    x: MARGIN, y: y - 6, width: CONTENT_W, height: 22,
    color: rgb(0.92, 0.92, 0.94),
  });
  for (const col of colDefs) {
    page.drawText(col.label, {
      x: cx + 4, y, size: 9, font: fonts.bold, color: COLOR_DARK,
    });
    cx += col.width;
  }
  y -= 24;

  const rowH = 22;
  const maxRows = Math.floor((y - MARGIN - 90) / rowH);
  const visible = items.slice(0, maxRows);

  visible.forEach((it, i) => {
    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN, y: y - 5, width: CONTENT_W, height: rowH,
        color: rgb(0.97, 0.97, 0.99),
      });
    }
    cx = MARGIN;
    const cells = [
      String(i + 1),
      it.room || '—',
      it.name,
      it.dimensions || '—',
      it.install || '—',
      it.delivery || '—',
      String(it.qty),
      it.price != null ? `€${it.price.toFixed(2)}` : '—',
    ];
    for (let c = 0; c < cells.length; c++) {
      page.drawText(truncate(cells[c], Math.floor(colDefs[c].width / 5)), {
        x: cx + 4, y, size: 8.5, font: fonts.regular, color: COLOR_DARK,
        maxWidth: colDefs[c].width - 8,
      });
      cx += colDefs[c].width;
    }
    y -= rowH;
  });

  if (items.length > visible.length) {
    page.drawText(`+ ${items.length - visible.length} more items continued on next sheet`, {
      x: MARGIN, y: MARGIN + 80,
      size: 9, font: fonts.regular, color: COLOR_GRAY,
    });
  }

  drawTitleBlock(page, fonts, td);
}

// ============================================================
// 7b. AREA BREAKDOWN — single composited design board.
//     Hero render + dimensioned plan + elevation + finishes column +
//     fitting/accessory columns + notes + color palette strip.
// ============================================================
export async function buildAreaBreakdown(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  data: AreaBreakdownData,
): Promise<void> {
  const page = newSheetPage(pdfDoc);
  const cy = drawSheetHeader(page, fonts, td.sheet_title, data.subtitle || 'Design breakdown');

  const bottomY = MARGIN + TITLE_BLOCK_H + 14;
  const availH = cy - bottomY;
  const gap = 12;

  // ---- TOP ZONE: hero (left ~58%) + plan/elevation stacked (right) ----
  const topH = availH * 0.54;
  const topY = cy - topH; // y of the zone's bottom edge
  const heroW = CONTENT_W * 0.58;
  const rightX = MARGIN + heroW + gap;
  const rightW = CONTENT_W - heroW - gap;

  await drawImageFramed(pdfDoc, page, data.hero_image_url, MARGIN, topY, heroW, topH);

  const rHalf = (topH - gap) / 2;
  await drawLabeledImage(pdfDoc, page, fonts, 'DIMENSIONS & LAYOUT',
    data.plan_image_url, rightX, topY + rHalf + gap, rightW, rHalf);
  await drawLabeledImage(pdfDoc, page, fonts, 'ELEVATION (FRONT VIEW)',
    data.elevation_image_url, rightX, topY, rightW, rHalf);

  // ---- BOTTOM ZONE: finishes + fitting columns + notes ----
  const palette = (data.palette || []).slice(0, 8);
  const paletteH = palette.length ? 42 : 0;
  const colsTop = topY - gap;
  const colsBottom = bottomY + (paletteH ? paletteH + gap : 0);

  const finishes = data.finishes || [];
  const fittingCols = (data.fitting_columns || []).slice(0, 3);
  const notes = data.notes || [];

  type Col = { title: string; kind: 'finishes' | 'fittings' | 'notes'; payload: any };
  const cols: Col[] = [];
  if (finishes.length) cols.push({ title: 'Material & Finishes', kind: 'finishes', payload: finishes });
  for (const fc of fittingCols) cols.push({ title: fc.title, kind: 'fittings', payload: fc.items || [] });
  if (notes.length) cols.push({ title: 'Notes', kind: 'notes', payload: notes });

  const nCols = Math.max(1, cols.length);
  const colGap = 14;
  const colW = (CONTENT_W - colGap * (nCols - 1)) / nCols;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const cx = MARGIN + i * (colW + colGap);
    let by = drawColumnHeader(page, fonts, col.title, cx, colsTop, colW);

    if (col.kind === 'finishes') {
      for (const f of col.payload as AreaFinishLike[]) {
        if (by < colsBottom + 18) break;
        const sw = 16;
        if (f.image_url) {
          const bytes = await fetchImageBytes(f.image_url);
          const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
          if (img) {
            const d = img.scaleToFit(sw, sw);
            page.drawImage(img, { x: cx, y: by - sw, width: d.width, height: d.height });
          }
        } else {
          page.drawRectangle({
            x: cx, y: by - sw, width: sw, height: sw,
            color: hexToRgb(f.hex || '#cccccc'),
            borderColor: COLOR_BORDER, borderWidth: 0.3,
          });
        }
        page.drawText(truncate(f.label, 22), {
          x: cx + sw + 5, y: by - 5, size: 7.5, font: fonts.bold,
          color: COLOR_DARK, maxWidth: colW - sw - 8,
        });
        if (f.spec) {
          page.drawText(truncate(f.spec, 30), {
            x: cx + sw + 5, y: by - 14, size: 6.5, font: fonts.regular,
            color: COLOR_GRAY, maxWidth: colW - sw - 8,
          });
        }
        by -= (sw + 8);
      }
    } else if (col.kind === 'fittings') {
      for (const it of col.payload as { label: string; note?: string }[]) {
        if (by < colsBottom + 10) break;
        page.drawCircle({ x: cx + 2, y: by - 4, size: 1.4, color: COLOR_DARK });
        page.drawText(truncate(it.label, 30), {
          x: cx + 9, y: by - 6, size: 7.5, font: fonts.regular,
          color: COLOR_DARK, maxWidth: colW - 12,
        });
        by -= 11;
        if (it.note) {
          page.drawText(truncate(it.note, 34), {
            x: cx + 9, y: by - 2, size: 6.5, font: fonts.regular,
            color: COLOR_GRAY, maxWidth: colW - 12,
          });
          by -= 9;
        }
        by -= 2;
      }
    } else {
      for (const n of col.payload as string[]) {
        if (by < colsBottom + 10) break;
        const lines = wrapText(n, fonts.regular, 7.5, colW - 12).slice(0, 4);
        page.drawCircle({ x: cx + 2, y: by - 4, size: 1.4, color: COLOR_DARK });
        let ly = by;
        for (const line of lines) {
          page.drawText(line, { x: cx + 9, y: ly - 6, size: 7.5, font: fonts.regular, color: COLOR_DARK });
          ly -= 10;
        }
        by = ly - 4;
      }
    }
  }

  // ---- PALETTE STRIP (bottom) ----
  if (palette.length) {
    const pGap = 8;
    const pW = (CONTENT_W - pGap * (palette.length - 1)) / palette.length;
    const py = bottomY;
    palette.forEach((p, i) => {
      const px = MARGIN + i * (pW + pGap);
      page.drawRectangle({
        x: px, y: py, width: pW, height: 20,
        color: hexToRgb(p.hex), borderColor: COLOR_BORDER, borderWidth: 0.3,
      });
      page.drawText(truncate(p.name || p.hex, 16), {
        x: px + 2, y: py + 24, size: 6.5, font: fonts.regular,
        color: COLOR_GRAY, maxWidth: pW,
      });
    });
  }

  drawTitleBlock(page, fonts, td);
}

type AreaFinishLike = { label: string; spec?: string; hex?: string; image_url?: string };

/** Frame + contain-fit an image into a box; draws an empty frame if no image. */
async function drawImageFramed(
  pdfDoc: PDFDocument,
  page: PDFPage,
  url: string | undefined,
  x: number, y: number, w: number, h: number,
): Promise<void> {
  page.drawRectangle({
    x, y, width: w, height: h,
    color: COLOR_BG, borderColor: COLOR_BORDER, borderWidth: 0.5,
  });
  if (!url) return;
  const bytes = await fetchImageBytes(url);
  const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
  if (!img) return;
  const d = img.scaleToFit(w - 4, h - 4);
  page.drawImage(img, {
    x: x + (w - d.width) / 2,
    y: y + (h - d.height) / 2,
    width: d.width, height: d.height,
  });
}

/** Small label above a framed image (used for the plan + elevation panels). */
async function drawLabeledImage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: SheetFonts,
  label: string,
  url: string | undefined,
  x: number, y: number, w: number, h: number,
): Promise<void> {
  const labelH = 13;
  page.drawText(label, {
    x: x + 1, y: y + h - 9, size: 7, font: fonts.bold, color: COLOR_GRAY,
  });
  await drawImageFramed(pdfDoc, page, url, x, y, w, h - labelH);
}

/** Column header (title + underline). Returns the y at which the body starts. */
function drawColumnHeader(
  page: PDFPage,
  fonts: SheetFonts,
  title: string,
  x: number,
  topY: number,
  w: number,
): number {
  page.drawText(title.toUpperCase(), {
    x, y: topY - 9, size: 8.5, font: fonts.bold, color: COLOR_DARK, maxWidth: w,
  });
  page.drawLine({
    start: { x, y: topY - 14 }, end: { x: x + w, y: topY - 14 },
    color: COLOR_BORDER, thickness: 0.5,
  });
  return topY - 26;
}

// ============================================================
// 8. FULL DECK — cover page + included sheets in order.
// ============================================================
export async function buildFullDeckCover(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  cover: { title: string; description?: string; client_name?: string; cover_image_url?: string; date: string },
): Promise<void> {
  const page = newSheetPage(pdfDoc);

  // Optional full-bleed cover image
  if (cover.cover_image_url) {
    const bytes = await fetchImageBytes(cover.cover_image_url);
    const img = bytes ? await embedImageBytes(pdfDoc, bytes) : null;
    if (img) {
      const d = img.scaleToFit(PAGE_W, PAGE_H);
      page.drawImage(img, {
        x: (PAGE_W - d.width) / 2,
        y: (PAGE_H - d.height) / 2,
        width: d.width,
        height: d.height,
        opacity: 0.45,
      });
    }
  }

  // Centered title block
  page.drawText(cover.title.toUpperCase(), {
    x: MARGIN, y: PAGE_H / 2 + 40,
    size: 36, font: fonts.bold, color: COLOR_DARK,
    maxWidth: PAGE_W - MARGIN * 2,
  });
  if (cover.description) {
    const lines = wrapText(cover.description, fonts.regular, 14, PAGE_W - MARGIN * 2).slice(0, 3);
    let y = PAGE_H / 2;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 14, font: fonts.regular, color: COLOR_GRAY });
      y -= 18;
    }
  }
  if (cover.client_name) {
    page.drawText(`PREPARED FOR: ${cover.client_name.toUpperCase()}`, {
      x: MARGIN, y: PAGE_H / 2 - 80, size: 11, font: fonts.bold, color: COLOR_DARK,
    });
  }
  page.drawText(cover.date.slice(0, 10), {
    x: MARGIN, y: PAGE_H / 2 - 100, size: 11, font: fonts.regular, color: COLOR_GRAY,
  });

  drawTitleBlock(page, fonts, td);
}

/** Render a sub-sheet inline by dispatching on its sheet_type. */
export async function buildSheetForDeck(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  parentTd: TitleBlockData,
  sheet: SheetRow,
  index: number,
  total: number,
  resolveChips: (productIds: string[]) => Promise<ProductChip[]>,
  resolveFfe: (quoteId: string) => Promise<FfeItem[]>,
): Promise<void> {
  const td: TitleBlockData = {
    ...parentTd,
    sheet_title: sheet.title,
    sheet_label: sheetLabel(sheet.sheet_type),
    sheet_index: index,
    total_sheets: total,
  };

  switch (sheet.sheet_type) {
    case 'material_board': {
      const ids: string[] = sheet.data.product_ids || [];
      const chips = await resolveChips(ids);
      // merge custom descriptions
      if (sheet.data.chip_descriptions) {
        for (const chip of chips) {
          if (sheet.data.chip_descriptions[chip.product_id]) {
            chip.description = sheet.data.chip_descriptions[chip.product_id];
          }
        }
      }
      await buildMaterialBoard(pdfDoc, fonts, td, chips);
      break;
    }
    case 'color_palette':
      buildColorPalette(pdfDoc, fonts, td, sheet.data.swatches || []);
      break;
    case 'concept_board':
      await buildConceptBoard(pdfDoc, fonts, td, sheet.data.layout || []);
      break;
    case 'lighting_plan':
      await buildLightingPlan(pdfDoc, fonts, td, {
        backdrop: sheet.data.backdrop,
        symbols: sheet.data.symbols || [],
        legend: sheet.data.legend || [],
      });
      break;
    case 'plumbing_plan':
      await buildPlumbingPlan(pdfDoc, fonts, td, {
        backdrop: sheet.data.backdrop,
        symbols: sheet.data.symbols || [],
        legend: sheet.data.legend || [],
      });
      break;
    case 'annotated_render': {
      const ids: string[] = (sheet.data.annotations || [])
        .map((a: AnnotationData) => a.product_id)
        .filter((x: string | undefined): x is string => !!x);
      const chips = await resolveChips(ids);
      await buildAnnotatedRender(pdfDoc, fonts, td, {
        backdrop_image_url: sheet.data.backdrop_image_url,
        annotations: sheet.data.annotations || [],
        chips,
      });
      break;
    }
    case 'elevation_render_pair':
      await buildElevationRenderPair(pdfDoc, fonts, td, {
        elevation_image_url: sheet.data.elevation_image_url,
        render_image_url: sheet.data.render_image_url,
        dimensions: sheet.data.dimensions || [],
        tile_callouts: sheet.data.tile_callouts || [],
      });
      break;
    case 'ffe_schedule': {
      let items: FfeItem[] = sheet.data.items || [];
      if (sheet.data.quote_id && items.length === 0) {
        items = await resolveFfe(sheet.data.quote_id);
      }
      buildFfeSchedule(pdfDoc, fonts, td, items);
      break;
    }
    case 'area_breakdown':
      await buildAreaBreakdown(pdfDoc, fonts, td, sheet.data as AreaBreakdownData);
      break;
    default:
      // Unknown sub-sheet type — emit a placeholder page
      const page = newSheetPage(pdfDoc);
      page.drawText(`Unsupported sub-sheet type: ${sheet.sheet_type}`, {
        x: MARGIN, y: PAGE_H / 2,
        size: 14, font: fonts.regular, color: COLOR_GRAY,
      });
      drawTitleBlock(page, fonts, td);
  }
}
