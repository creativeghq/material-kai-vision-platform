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
  FixtureRunData,
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
  electrical_plan: 'ELECTRICAL PLAN',
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
  /** Pipe / cable runs joining symbols. Drawn under the symbols. */
  runs?: FixtureRunData[];
  /**
   * Catalog products linked to symbols, already workspace-scoped by the caller.
   * Drives the SCHEDULE block — the quantity take-off the plan implies.
   */
  chips?: ProductChip[];
};

/**
 * Run styling, keyed by kind. Must mirror the *_RUN_DEFS palettes in
 * FixtureSymbolCanvas.tsx — a kind missing here renders as an anonymous grey
 * line, which on a services drawing reads as a different service entirely.
 */
const RUN_STYLES: Record<string, { rgb: [number, number, number]; dash?: number[] }> = {
  lighting_circuit:  { rgb: [0.96, 0.62, 0.04] },
  socket_circuit:    { rgb: [0.23, 0.51, 0.96] },
  dedicated_circuit: { rgb: [0.94, 0.27, 0.27], dash: [4, 2] },
  switch_leg:        { rgb: [0.65, 0.55, 0.98], dash: [2, 2] },
  cold_supply:       { rgb: [0.23, 0.51, 0.96] },
  hot_supply:        { rgb: [0.94, 0.27, 0.27] },
  waste:             { rgb: [0.47, 0.44, 0.42], dash: [5, 3] },
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

export async function buildElectricalPlan(
  pdfDoc: PDFDocument,
  fonts: SheetFonts,
  td: TitleBlockData,
  payload: SymbolPlanPayload,
): Promise<void> {
  return buildSymbolPlan(pdfDoc, fonts, td, payload, 'Electrical layout', drawElectricalSymbol);
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

  // Project a normalized point into page space. y is flipped because PDF origin
  // is bottom-left while the canvas measures from the top.
  const toPage = (p: { x: number; y: number }) => ({
    x: bdX + Math.max(0, Math.min(1, p.x)) * bdW,
    y: bdY + (1 - Math.max(0, Math.min(1, p.y))) * bdH,
  });

  // Runs FIRST, so symbols sit on top of their pipework rather than under it.
  const symbolById = new Map((payload.symbols || []).map((s) => [s.id, s]));
  for (const run of payload.runs || []) {
    const a = symbolById.get(run.from);
    const b = symbolById.get(run.to);
    // An orphaned run (endpoint deleted) is skipped rather than drawn to nowhere.
    if (!a || !b) continue;
    const style = RUN_STYLES[run.kind] ?? { rgb: [0.58, 0.64, 0.72] as [number, number, number] };
    const color = rgb(style.rgb[0], style.rgb[1], style.rgb[2]);
    const pts = [a, ...(run.vertices ?? []), b].map(toPage);
    for (let i = 1; i < pts.length; i++) {
      page.drawLine({
        start: pts[i - 1],
        end: pts[i],
        color,
        thickness: 1.1,
        ...(style.dash ? { dashArray: style.dash } : {}),
      });
    }
  }

  // Fixture symbols (x,y are normalized 0..1 within backdrop)
  for (const s of payload.symbols || []) {
    const p = toPage(s);
    drawSymbol(page, fonts, s.type, p.x, p.y, s.label);
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

  // Run key — a services drawing is unreadable without one: three coloured lines
  // with no key is just decoration. Only kinds actually drawn get a row.
  const usedKinds = [...new Set((payload.runs || []).map((r) => r.kind))];
  if (usedKinds.length > 0) {
    ly -= 8;
    page.drawText('SERVICES', {
      x: legendX, y: ly, size: 11, font: fonts.bold, color: COLOR_DARK,
    });
    ly -= 18;
    for (const kind of usedKinds.slice(0, 8)) {
      const style = RUN_STYLES[kind] ?? { rgb: [0.58, 0.64, 0.72] as [number, number, number] };
      page.drawLine({
        start: { x: legendX, y: ly + 3 },
        end: { x: legendX + 18, y: ly + 3 },
        color: rgb(style.rgb[0], style.rgb[1], style.rgb[2]),
        thickness: 1.4,
        ...(style.dash ? { dashArray: style.dash } : {}),
      });
      page.drawText(truncate(kind.replace(/_/g, ' '), 24), {
        x: legendX + 24, y: ly, size: 9, font: fonts.regular, color: COLOR_DARK,
      });
      ly -= 15;
    }
  }

  // CHECKS — voltage drop per run, but ONLY where the backdrop carries a scale
  // and the user supplied current and cable size. A rect backdrop has exact
  // dimensions; an uploaded image has none, and a drop computed from a guessed
  // length would be a confident wrong number on a document someone builds from.
  const bd = payload.backdrop;
  const scaled = bd?.kind === 'rect' && !!bd.width_mm && !!bd.height_mm;
  if (scaled && (payload.runs || []).some((r) => r.props?.current_a && r.props?.csa_mm2)) {
    const rows: string[] = [];
    for (const run of payload.runs || []) {
      const a = symbolById.get(run.from);
      const b = symbolById.get(run.to);
      const cur = run.props?.current_a;
      const csa = run.props?.csa_mm2;
      if (!a || !b || !cur || !csa) continue;
      const pts = [a, ...(run.vertices ?? []), b];
      let mm = 0;
      for (let i = 1; i < pts.length; i++) {
        mm += Math.hypot(
          (pts[i].x - pts[i - 1].x) * bd!.width_mm!,
          (pts[i].y - pts[i - 1].y) * bd!.height_mm!,
        );
      }
      const phases = run.props?.phases === 3 ? 3 : 1;
      const nominal = phases === 3 ? 400 : 230;
      const dropV = ((phases === 3 ? Math.sqrt(3) : 2) * 0.0225 * (mm / 1000) * cur) / csa;
      const pct = (dropV / nominal) * 100;
      const isLighting = run.kind === 'lighting_circuit' || run.kind === 'switch_leg';
      const limit = isLighting ? 3 : 5;
      rows.push(`${run.kind.replace(/_/g, ' ')}: ${pct.toFixed(1)}% / ${limit}% ${pct <= limit ? 'OK' : 'OVER'}`);
    }
    if (rows.length > 0) {
      ly -= 8;
      page.drawText('CHECKS', { x: legendX, y: ly, size: 11, font: fonts.bold, color: COLOR_DARK });
      ly -= 16;
      for (const row of rows.slice(0, 8)) {
        page.drawText(truncate(row, 34), {
          x: legendX, y: ly, size: 8, font: fonts.regular, color: COLOR_DARK,
        });
        ly -= 12;
      }
      // A verdict with no stated basis is just a word. Say what it was judged
      // against, and that it is not an engineer's sign-off.
      page.drawText('Voltage drop, copper @70C. Conventional 3%/5%', {
        x: legendX, y: ly, size: 6, font: fonts.regular, color: COLOR_GRAY,
      });
      ly -= 9;
      page.drawText('limits — not a substitute for design sign-off.', {
        x: legendX, y: ly, size: 6, font: fonts.regular, color: COLOR_GRAY,
      });
      ly -= 12;
    }
  }

  // SCHEDULE — the quantity take-off implied by the plan. Counting symbols per
  // linked product is the whole reason a symbol carries a product_id: the plan
  // stops being a picture and becomes something you can order from.
  const chips = payload.chips ?? [];
  if (chips.length > 0) {
    const counts = new Map<string, number>();
    for (const s of payload.symbols || []) {
      if (s.product_id) counts.set(s.product_id, (counts.get(s.product_id) ?? 0) + 1);
    }
    // Only chips that are actually placed, most-used first so the big-ticket
    // lines are visible even if the column runs out of room.
    const rows = chips
      .map((c) => ({ chip: c, qty: counts.get(c.product_id) ?? 0 }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    if (rows.length > 0) {
      ly -= 10;
      page.drawText('SCHEDULE', {
        x: legendX, y: ly, size: 11, font: fonts.bold, color: COLOR_DARK,
      });
      ly -= 18;
      const shown = rows.slice(0, 14);
      for (const { chip, qty } of shown) {
        page.drawText(`${qty}×`, {
          x: legendX, y: ly, size: 9, font: fonts.bold, color: COLOR_DARK,
        });
        page.drawText(truncate(chip.name, 26), {
          x: legendX + 22, y: ly,
          size: 9, font: fonts.regular, color: COLOR_DARK,
          maxWidth: CONTENT_W - planW - 40,
        });
        ly -= 15;
      }
      // Never let a truncated schedule read as a complete one — an omitted line
      // is a missing order, so say so on the drawing itself.
      if (rows.length > shown.length) {
        page.drawText(`+ ${rows.length - shown.length} more not shown`, {
          x: legendX, y: ly, size: 7, font: fonts.regular, color: COLOR_GRAY,
        });
        ly -= 13;
      }
      const unlinked = (payload.symbols || []).filter((s) => !s.product_id).length;
      if (unlinked > 0) {
        page.drawText(`${unlinked} symbol${unlinked === 1 ? '' : 's'} not linked to a product`, {
          x: legendX, y: ly, size: 7, font: fonts.regular, color: COLOR_GRAY,
        });
      }
    }
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

// Electrical glyphs — IEC 60617-style 2D symbols from pdf-lib primitives.
// Types must stay in sync with ELECTRICAL_FIXTURE_DEFS in FixtureSymbolCanvas.tsx
// so the canvas preview and the rendered PDF agree.
function drawElectricalSymbol(
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
  // Socket outlet: half-disc sitting on a baseline, with `ticks` stems for
  // single vs double. The white rectangle masks the lower half of the circle.
  const socket = (ticks: number) => {
    page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
    page.drawRectangle({ x: cx - r - 1, y: cy - r - 1, width: r * 2 + 2, height: r + 1, color: COLOR_WHITE });
    page.drawLine({ start: { x: cx - r, y: cy }, end: { x: cx + r, y: cy }, color: COLOR_DARK, thickness: 1 });
    for (let i = 0; i < ticks; i++) {
      const ox = ticks === 1 ? 0 : (i === 0 ? -r * 0.4 : r * 0.4);
      page.drawLine({ start: { x: cx + ox, y: cy }, end: { x: cx + ox, y: cy - r * 0.8 }, color: COLOR_DARK, thickness: 1 });
    }
  };
  // Switch: filled node with `levers` diagonal arms.
  const switchSym = (levers: number) => {
    page.drawCircle({ x: cx, y: cy - r * 0.4, size: 2, color: COLOR_DARK });
    for (let i = 0; i < levers; i++) {
      const dy = i === 0 ? r * 1.1 : r * 0.6;
      page.drawLine({
        start: { x: cx, y: cy - r * 0.4 },
        end: { x: cx + r * 0.9, y: cy - r * 0.4 + dy },
        color: COLOR_DARK, thickness: 1,
      });
    }
  };
  switch (type) {
    case 'socket':
      socket(1);
      break;
    case 'socket_double':
      socket(2);
      break;
    case 'switch_1way':
      switchSym(1);
      break;
    case 'switch_2way':
      switchSym(2);
      break;
    case 'dimmer': // switch + filled control block
      switchSym(1);
      page.drawRectangle({ x: cx - r, y: cy - r, width: r * 0.8, height: r * 0.8, color: COLOR_DARK });
      break;
    case 'distribution_board': // hatched rectangle + DB
      page.drawRectangle({ x: cx - r * 1.4, y: cy - r * 0.9, width: r * 2.8, height: r * 1.8, borderColor: COLOR_DARK, borderWidth: 1.2, color: COLOR_WHITE });
      for (let i = 1; i <= 3; i++) {
        const lx = cx - r * 1.4 + (r * 2.8 * i) / 4;
        page.drawLine({ start: { x: lx, y: cy - r * 0.9 }, end: { x: lx, y: cy + r * 0.9 }, color: COLOR_DARK, thickness: 0.4 });
      }
      break;
    case 'data_outlet': // square + D
      page.drawSquare({ x: cx - r * 0.8, y: cy - r * 0.8, size: r * 1.6, rotate: undefined as any, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      code('D');
      break;
    case 'tv_outlet': // square + TV
      page.drawSquare({ x: cx - r * 0.9, y: cy - r * 0.9, size: r * 1.8, rotate: undefined as any, borderColor: COLOR_DARK, borderWidth: 1, color: COLOR_WHITE });
      code('TV');
      break;
    case 'dedicated_point': // circle + saltire — a dedicated/fixed appliance point
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_DARK, borderWidth: 1.2, color: COLOR_WHITE });
      page.drawLine({ start: { x: cx - r * 0.6, y: cy - r * 0.6 }, end: { x: cx + r * 0.6, y: cy + r * 0.6 }, color: COLOR_DARK, thickness: 0.8 });
      page.drawLine({ start: { x: cx - r * 0.6, y: cy + r * 0.6 }, end: { x: cx + r * 0.6, y: cy - r * 0.6 }, color: COLOR_DARK, thickness: 0.8 });
      break;
    case 'junction_box': // square + cross
      page.drawSquare({ x: cx - r * 0.7, y: cy - r * 0.7, size: r * 1.4, rotate: undefined as any, borderColor: COLOR_DARK, borderWidth: 0.9, color: COLOR_WHITE });
      page.drawLine({ start: { x: cx - r * 0.7, y: cy }, end: { x: cx + r * 0.7, y: cy }, color: COLOR_DARK, thickness: 0.6 });
      page.drawLine({ start: { x: cx, y: cy - r * 0.7 }, end: { x: cx, y: cy + r * 0.7 }, color: COLOR_DARK, thickness: 0.6 });
      break;
    case 'earth_point': // stem + three diminishing bars
      page.drawLine({ start: { x: cx, y: cy + r }, end: { x: cx, y: cy }, color: COLOR_DARK, thickness: 1 });
      [1.0, 0.6, 0.3].forEach((w, i) => {
        const by = cy - i * 2.6;
        page.drawLine({ start: { x: cx - r * w, y: by }, end: { x: cx + r * w, y: by }, color: COLOR_DARK, thickness: 1 });
      });
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
  /** Workspace branded cover (Profile → Keys → Document templates). Used full-bleed when
   *  the deck has no custom cover image, so the deliverable matches quotes/catalogs. */
  brandCoverBytes?: Uint8Array | null,
): Promise<void> {
  const page = newSheetPage(pdfDoc);

  // Cover artwork: a user-picked photo is a backdrop (dimmed so the title reads); the
  // workspace's branded template cover is a designed page, so it renders full strength.
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
  } else if (brandCoverBytes) {
    const img = await embedImageBytes(pdfDoc, brandCoverBytes);
    if (img) {
      const d = img.scaleToFit(PAGE_W, PAGE_H);
      page.drawImage(img, {
        x: (PAGE_W - d.width) / 2,
        y: (PAGE_H - d.height) / 2,
        width: d.width,
        height: d.height,
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
    // Responsibility belongs to the SHEET, not the deck it was bound into.
    // Inheriting the parent's (usually empty) values would strip a plan of its
    // author and revision the moment it was included in a presentation.
    ...(sheet.data?.title_block?.prepared_by ? { prepared_by: sheet.data.title_block.prepared_by } : {}),
    ...(sheet.data?.title_block?.checked_by ? { checked_by: sheet.data.title_block.checked_by } : {}),
    ...(sheet.data?.title_block?.revision ? { revision: sheet.data.title_block.revision } : {}),
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
    case 'plumbing_plan':
    case 'electrical_plan': {
      const symbols: FixtureSymbolData[] = sheet.data.symbols || [];
      // resolveChips is the caller's workspace-scoped fetcher — same guard as
      // material_board, so a stray product_id cannot pull in another tenant's row.
      const ids = [...new Set(
        symbols.map((s) => s.product_id).filter((x): x is string => !!x),
      )];
      const payload = {
        backdrop: sheet.data.backdrop,
        symbols,
        legend: sheet.data.legend || [],
        runs: sheet.data.runs || [],
        chips: ids.length ? await resolveChips(ids) : [],
      };
      if (sheet.sheet_type === 'lighting_plan') await buildLightingPlan(pdfDoc, fonts, td, payload);
      else if (sheet.sheet_type === 'plumbing_plan') await buildPlumbingPlan(pdfDoc, fonts, td, payload);
      else await buildElectricalPlan(pdfDoc, fonts, td, payload);
      break;
    }
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
