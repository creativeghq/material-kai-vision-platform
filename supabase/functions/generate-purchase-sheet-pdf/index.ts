/**
 * generate-purchase-sheet-pdf
 *
 * Renders a project's purchase items (internal doors, windows, etc.) into a
 * polished purchase specification PDF. Output modes, combinable:
 *   - 'schedule'  → A3-landscape architectural elevation schedule ("SCHEDULE OF
 *                   DOORS / WINDOWS") — dimensioned CAD elevation line-drawings in
 *                   a grid, each with a tag (D-1/W-1), set count + location, type,
 *                   material and glass. Deterministic line-art, no AI.
 *   - 'per_item'  → one A4-portrait spec page per item (image/render + spec table +
 *                   door swing symbol + finish swatches + PUR-00N block)
 *   - 'both'      → the elevation schedule, then a detail page per item
 *
 * Data source: `project_purchase_items` (fetched under RLS via the caller's JWT),
 * or inline `items` when called with the service-role key (smoke tests / server).
 *
 * Output: uploaded to the private `pdf-documents` bucket at
 *   project-purchase/{project_id}/purchase-{ts}.pdf
 * and returned as a 7-day signed URL.
 */
import { createClient } from '@supabase/supabase-js';
import { formatMoney } from '../_shared/money.ts';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { embedOpenSans } from '../_shared/fonts/open-sans.ts';
import { escapeHtml } from '../_shared/html.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { fetchImageGuardedOrNull } from '../_shared/fetch-image.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---- palette ----
const INK = rgb(0.12, 0.12, 0.13);
const GRAY = rgb(0.45, 0.45, 0.47);
const LIGHT = rgb(0.85, 0.85, 0.85);
const HAIR = rgb(0.2, 0.2, 0.2);
const ZEBRA = rgb(0.965, 0.965, 0.955);
const WHITE = rgb(1, 1, 1);

interface PurchaseItem {
  id?: string;
  item_type: string;            // 'door' | 'window' | 'other'
  name: string;
  category?: string | null;
  quantity?: number;
  unit_cost?: number | null;
  currency?: string | null;
  room_name?: string | null;
  design_image_url?: string | null;
  details?: Record<string, any> | null;
}

interface Body {
  project_id?: string;
  item_ids?: string[];
  items?: PurchaseItem[];
  project_name?: string;
  mode?: 'per_item' | 'schedule' | 'both' | 'order';
  /**
   * Print `unit_cost` (the SUPPLIER cost) on the per-item spec pages. Off by default:
   * the sheet is handed out as a specification and the endpoint returns a 7-day signed
   * link, so cost has to be asked for rather than arrive by accident (#361 `EG-16`).
   * Purchase-ORDER mode (`order_id`) is unaffected — a PO's subject IS the cost.
   */
  include_costs?: boolean;
  title?: string;
  // ---- purchase-order mode (send-to-supplier) ----
  // When set, renders a purchase ORDER (orders.order_type='purchase') + its
  // order_items as a PO document. With send=true it also emails the supplier,
  // marks the order placed (draft→confirmed) and emits a Flows event.
  order_id?: string;
  send?: boolean;
  to?: string;        // override recipient email
  message?: string;   // optional note included in the email body
}

Deno.serve(withApiLogging('generate-purchase-sheet-pdf', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.replace(/^Bearer /i, '').trim();
  if (!bearer) throw new HttpError(401, 'Missing Authorization bearer');
  const isService = bearer === SERVICE_ROLE_KEY;

  const body = (await req.json().catch(() => ({}))) as Body;
  const mode = body.mode || 'both';
  const includeCosts = body.include_costs === true;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Read items under the caller's RLS unless it's a service-role call.
  const reader = isService
    ? admin
    : createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  // ---- purchase-order mode ----
  if (body.order_id) {
    return await handlePurchaseOrder(body, admin, reader);
  }

  let items: PurchaseItem[] = [];
  let projectName = body.project_name || 'Project';

  if (Array.isArray(body.items) && body.items.length > 0) {
    if (!isService) throw new HttpError(403, 'Inline items require service-role auth');
    items = body.items;
  } else {
    if (!body.project_id) throw new HttpError(400, 'project_id (or inline items) is required');
    let q = reader
      .from('project_purchase_items')
      .select('id, item_type, name, category, quantity, unit_cost, currency, design_image_url, details, room_id, sort_order')
      .eq('project_id', body.project_id)
      .order('sort_order', { ascending: true });
    if (Array.isArray(body.item_ids) && body.item_ids.length > 0) q = q.in('id', body.item_ids);
    const { data, error } = await q;
    if (error) throw new HttpError(403, `Could not read purchase items: ${error.message}`);
    items = (data || []) as PurchaseItem[];

    // Resolve room names (best-effort) + project name via the same reader.
    const { data: proj } = await reader.from('projects').select('name').eq('id', body.project_id).maybeSingle();
    if (proj?.name) projectName = proj.name;
    const roomIds = [...new Set((data || []).map((r: any) => r.room_id).filter(Boolean))];
    if (roomIds.length) {
      const { data: rooms } = await reader.from('project_rooms').select('id, name').in('id', roomIds);
      const byId = new Map((rooms || []).map((r: any) => [r.id, r.name]));
      for (const it of items as any[]) it.room_name = it.room_id ? byId.get(it.room_id) ?? null : null;
    }
  }

  if (items.length === 0) throw new HttpError(400, 'No purchase items to render');

  const pdf = await PDFDocument.create();
  const { regular: font, bold } = await embedOpenSans(pdf);

  if (mode === 'schedule' || mode === 'both') {
    await drawSchedulePages(pdf, font, bold, items, projectName);
  }
  if (mode === 'order') {
    // One detailed architectural order / shop-drawing sheet per item (large
    // dimensioned elevation + full spec/order table). Tags run per type (W-1, D-1…).
    const counters: Record<string, number> = {};
    for (const it of items) {
      const prefix = it.item_type === 'window' ? 'W' : it.item_type === 'door' ? 'D' : 'X';
      counters[prefix] = (counters[prefix] || 0) + 1;
      await drawOrderSheet(pdf, font, bold, it, projectName, `${prefix}-${counters[prefix]}`, includeCosts);
    }
  }
  if (mode === 'per_item' || mode === 'both') {
    for (let i = 0; i < items.length; i++) {
      await drawItemPage(pdf, font, bold, items[i], i + 1, projectName, includeCosts);
    }
  }

  const bytes = await pdf.save();
  const pageCount = pdf.getPageCount();

  const ts = Date.now();
  const folder = body.project_id || 'adhoc';
  const path = `project-purchase/${folder}/purchase-${ts}.pdf`;
  const { error: upErr } = await admin.storage.from('pdf-documents').upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) throw new HttpError(500, `PDF upload failed: ${upErr.message}`);

  const { data: signed } = await admin.storage.from('pdf-documents').createSignedUrl(path, 60 * 60 * 24 * 7);

  return json({
    success: true,
    pdf_url: signed?.signedUrl ?? null,
    pdf_storage_path: path,
    page_count: pageCount,
    item_count: items.length,
    mode,
  });
}));

// =====================================================================
// Architectural elevation schedule (A3 landscape) — "SCHEDULE OF DOORS" /
// "SCHEDULE OF WINDOWS": a grid of dimensioned elevation line-drawings, each
// with a tag (D-1 / W-1), set count + location, type, material and glass.
// This is the construction/supplier sheet — deterministic CAD line-art, no AI.
// =====================================================================
const A3W = 1190.55, A3H = 841.89, SM = 30;
const SCOLS = 6;                       // cells per row, like a real schedule strip
const CELL_W = (A3W - 2 * SM) / SCOLS;
const ELEV_TOPDIM = 16;                // space above leaf for the width dimension
const ELEV_H = 220;                    // elevation drawing height
const CAP_H = 96;                      // caption block height
const ROW_H = ELEV_TOPDIM + ELEV_H + CAP_H + 16;

async function drawSchedulePages(
  pdf: PDFDocument,
  font: any,
  bold: any,
  items: PurchaseItem[],
  projectName: string,
) {
  const doors = items.filter((i) => i.item_type === 'door');
  const windows = items.filter((i) => i.item_type === 'window');
  const others = items.filter((i) => i.item_type !== 'door' && i.item_type !== 'window');
  const groups: { title: string; prefix: string; items: PurchaseItem[] }[] = [
    { title: 'SCHEDULE OF DOORS', prefix: 'D', items: doors },
    { title: 'SCHEDULE OF WINDOWS', prefix: 'W', items: windows },
    { title: 'SCHEDULE OF ITEMS', prefix: 'X', items: others },
  ].filter((g) => g.items.length > 0);

  let page = pdf.addPage([A3W, A3H]);
  let y = drawScheduleHeader(page, projectName, font, bold, true);

  for (const g of groups) {
    // Group title needs a title row + at least one cell row to start on this page.
    if (y - (30 + ROW_H) < SM) { page = pdf.addPage([A3W, A3H]); y = drawScheduleHeader(page, projectName, font, bold, false); }
    // Centered group title with rules either side (the reference's "SCHEDULE OF …" band).
    const tW = textW(bold, g.title, 13);
    const tcx = A3W / 2;
    page.drawText(g.title, { x: tcx - tW / 2, y: y - 14, size: 13, font: bold, color: INK });
    hr(page, SM, y - 18, tcx - tW / 2 - 14, 0.8);
    hr(page, tcx + tW / 2 + 14, y - 18, A3W - SM, 0.8);
    y -= 34;

    for (let i = 0; i < g.items.length; i += SCOLS) {
      if (y - ROW_H < SM) { page = pdf.addPage([A3W, A3H]); y = drawScheduleHeader(page, projectName, font, bold, false); }
      const rowItems = g.items.slice(i, i + SCOLS);
      rowItems.forEach((it, c) => {
        const cellX = SM + c * CELL_W;
        const tag = `${g.prefix}-${i + c + 1}`;
        drawElevationCell(page, font, bold, cellX, y, it, tag);
      });
      y -= ROW_H;
    }
  }
}

function drawScheduleHeader(page: any, projectName: string, font: any, bold: any, first: boolean): number {
  if (first) {
    page.drawText('DOOR & WINDOW SCHEDULE', { x: SM, y: A3H - SM - 6, size: 15, font: bold, color: INK });
    page.drawText(truncate(projectName, 90), { x: SM, y: A3H - SM - 24, size: 9, font, color: GRAY });
    hr(page, SM, A3H - SM - 32, A3W - SM, 1);
    return A3H - SM - 44;
  }
  hr(page, SM, A3H - SM, A3W - SM, 0.6, LIGHT);
  return A3H - SM - 12;
}

// One schedule cell: dimensioned elevation on top, caption block beneath.
function drawElevationCell(page: any, font: any, bold: any, cellX: number, topY: number, it: PurchaseItem, tag: string) {
  const cx = cellX + CELL_W / 2;
  const baseY = topY - ELEV_TOPDIM - ELEV_H;     // finish-floor line (bottom of the elevation)
  const maxW = CELL_W - 46;                       // leave room for the side height dimension
  const maxH = ELEV_H - 8;
  if (it.item_type === 'window') drawWindowElevation(page, font, cx, baseY, maxW, maxH, it);
  else if (it.item_type === 'door') drawDoorElevation(page, font, bold, cx, baseY, maxW, maxH, it);
  else drawOtherElevation(page, font, cx, baseY, maxW, maxH, it);
  drawCaption(page, font, bold, cellX, baseY - 12, it, tag);
}

// ---- elevation drawing primitives ----
function dashedLine(page: any, a: { x: number; y: number }, b: { x: number; y: number }, color = GRAY, thickness = 0.5, dash = 4) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(len / (dash * 2)));
  for (let i = 0; i < steps; i++) {
    const t0 = (i * 2 * dash) / len, t1 = Math.min(1, (i * 2 * dash + dash) / len);
    page.drawLine({ start: { x: a.x + dx * t0, y: a.y + dy * t0 }, end: { x: a.x + dx * t1, y: a.y + dy * t1 }, color, thickness });
  }
}
function dimH(page: any, font: any, x1: number, x2: number, y: number, label: string) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color: GRAY, thickness: 0.5 });
  page.drawLine({ start: { x: x1, y: y - 3 }, end: { x: x1, y: y + 3 }, color: GRAY, thickness: 0.5 });
  page.drawLine({ start: { x: x2, y: y - 3 }, end: { x: x2, y: y + 3 }, color: GRAY, thickness: 0.5 });
  const w = textW(font, label, 7);
  page.drawText(label, { x: (x1 + x2) / 2 - w / 2, y: y + 3, size: 7, font, color: INK });
}
function dimV(page: any, font: any, x: number, y1: number, y2: number, label: string) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, color: GRAY, thickness: 0.5 });
  page.drawLine({ start: { x: x - 3, y: y1 }, end: { x: x + 3, y: y1 }, color: GRAY, thickness: 0.5 });
  page.drawLine({ start: { x: x - 3, y: y2 }, end: { x: x + 3, y: y2 }, color: GRAY, thickness: 0.5 });
  // rotated 90° so it reads up the right edge
  page.drawText(label, { x: x + 8, y: (y1 + y2) / 2 - textW(font, label, 7) / 2, size: 7, font, color: INK, rotate: degrees(90) });
}
function fitLeaf(wmm: number, hmm: number, maxW: number, maxH: number) {
  const ratio = wmm / hmm;
  let h = maxH, w = h * ratio;
  if (w > maxW) { w = maxW; h = w / ratio; }
  return { w, h };
}
function doorLeafStyle(it: PurchaseItem): 'flush' | 'panel' | 'louvre' | 'glazed' {
  const d = it.details || {};
  const hint = `${d.leaf_style || ''} ${it.name || ''} ${d.finish || ''} ${d.frame || ''} ${it.category || ''}`.toLowerCase();
  if (/louv/.test(hint)) return 'louvre';
  if (/glaz|glass|alumin|sliding|\bpvc\b/.test(hint)) return 'glazed';
  if (/flush/.test(hint)) return 'flush';
  if (/panel/.test(hint)) return 'panel';
  return 'panel';
}
function windowGrid(it: PurchaseItem): { cols: number; rows: number } {
  const d = it.details || {};
  const clamp = (n: number) => Math.max(1, Math.min(5, n));
  const cols = Number(d.grid_cols) || (/(slid|casement)/.test(String(d.opening_type || '')) && Number(d.width_mm) > 1500 ? 3
    : d.width_mm ? clamp(Math.round(Number(d.width_mm) / 600)) : 2);
  const rows = Number(d.grid_rows) || (d.height_mm ? clamp(Math.round(Number(d.height_mm) / 700)) : 2);
  return { cols: clamp(cols), rows: clamp(rows) };
}

function drawDoorElevation(page: any, font: any, bold: any, cx: number, baseY: number, maxW: number, maxH: number, it: PurchaseItem) {
  const d = it.details || {};
  const wmm = Number(d.width_mm) || 900, hmm = Number(d.height_mm) || 2100;
  const { w, h } = fitLeaf(wmm, hmm, maxW, maxH);
  const x = cx - w / 2, y = baseY;
  const fo = 4;
  page.drawRectangle({ x: x - fo, y, width: w + 2 * fo, height: h + fo, borderColor: INK, borderWidth: 1.3 }); // casing
  page.drawRectangle({ x, y, width: w, height: h, borderColor: INK, borderWidth: 1 });                         // leaf
  const inset = Math.min(9, w * 0.12);
  const style = doorLeafStyle(it);
  if (style === 'panel') {
    const ix = x + inset, iw = w - 2 * inset;
    const midY = y + h * 0.46;
    page.drawRectangle({ x: ix, y: midY + 5, width: iw, height: (y + h - inset) - (midY + 5), borderColor: GRAY, borderWidth: 0.7 });
    page.drawRectangle({ x: ix, y: y + inset, width: iw, height: (midY - 5) - (y + inset), borderColor: GRAY, borderWidth: 0.7 });
  } else if (style === 'louvre') {
    const slats = Math.max(8, Math.floor(h / 10));
    for (let i = 1; i < slats; i++) { const ly = y + (h * i) / slats; dashedLine(page, { x: x + inset, y: ly }, { x: x + w - inset, y: ly }, GRAY, 0.5, 2); }
  } else if (style === 'glazed') {
    page.drawRectangle({ x: x + inset, y: y + h * 0.1, width: w - 2 * inset, height: h * 0.8, color: rgb(0.9, 0.93, 0.95), borderColor: GRAY, borderWidth: 0.6 });
  } else {
    page.drawRectangle({ x: x + inset, y: y + inset, width: w - 2 * inset, height: h - 2 * inset, borderColor: LIGHT, borderWidth: 0.5 });
  }
  // hinge side from handing; handle opposite. Swing triangle apex at hinge jamb (elevation convention).
  const leftHinge = String(d.handing || 'left').toLowerCase().startsWith('l');
  const hingeX = leftHinge ? x : x + w;
  const handleX = leftHinge ? x + w - inset - 3 : x + inset + 3;
  page.drawCircle({ x: handleX, y: y + h * 0.5, size: 1.6, color: INK });
  dashedLine(page, { x: leftHinge ? x + w : x, y }, { x: hingeX, y: y + h * 0.5 });
  dashedLine(page, { x: leftHinge ? x + w : x, y: y + h }, { x: hingeX, y: y + h * 0.5 });
  // dimensions + finish floor line
  dimH(page, font, x, x + w, y + h + fo + 9, String(wmm));
  dimV(page, font, x + w + fo + 12, y, y + h, String(hmm));
  drawFinishFloor(page, font, x - fo - 16, x + w + fo + 16, y);
}

function drawWindowElevation(page: any, font: any, cx: number, baseY: number, maxW: number, maxH: number, it: PurchaseItem) {
  const d = it.details || {};
  const wmm = Number(d.width_mm) || 1200, hmm = Number(d.height_mm) || 1400;
  const { w, h } = fitLeaf(wmm, hmm, maxW, maxH);
  const x = cx - w / 2, y = baseY;
  page.drawRectangle({ x, y, width: w, height: h, borderColor: INK, borderWidth: 1.4 });
  page.drawRectangle({ x: x + 3, y: y + 3, width: w - 6, height: h - 6, borderColor: INK, borderWidth: 0.7 });
  const { cols, rows } = windowGrid(it);
  for (let c = 1; c < cols; c++) { const mx = x + (w * c) / cols; page.drawLine({ start: { x: mx, y: y + 3 }, end: { x: mx, y: y + h - 3 }, color: INK, thickness: 0.7 }); }
  for (let r = 1; r < rows; r++) { const my = y + (h * r) / rows; page.drawLine({ start: { x: x + 3, y: my }, end: { x: x + w - 3, y: my }, color: INK, thickness: 0.7 }); }
  drawOpeningGlyph(page, x, y, w / cols, h / rows, String(d.opening_type || 'casement'));
  dimH(page, font, x, x + w, y + h + 9, String(wmm));
  dimV(page, font, x + w + 12, y, y + h, String(hmm));
  drawFinishFloor(page, font, x - 16, x + w + 16, y);
}

// Opening symbol drawn inside one pane (bottom-left), per architectural convention.
function drawOpeningGlyph(page: any, px: number, py: number, pw: number, ph: number, type: string) {
  const t = (type || '').toLowerCase();
  const ax = px + 4, ay = py + 4, bw = pw - 8, bh = ph - 8;
  if (t.includes('tilt')) { // tilt-turn: apex at bottom-centre (tilt) — two diagonals from top corners
    dashedLine(page, { x: ax, y: ay + bh }, { x: ax + bw / 2, y: ay }, GRAY, 0.6, 3);
    dashedLine(page, { x: ax + bw, y: ay + bh }, { x: ax + bw / 2, y: ay }, GRAY, 0.6, 3);
  } else if (t.includes('casement')) { // side-hung: apex at the hinge side mid
    dashedLine(page, { x: ax + bw, y: ay + bh }, { x: ax, y: ay + bh / 2 }, GRAY, 0.6, 3);
    dashedLine(page, { x: ax + bw, y: ay }, { x: ax, y: ay + bh / 2 }, GRAY, 0.6, 3);
  } else if (t.includes('slid')) { // sliding: horizontal arrows
    const my = ay + bh / 2;
    page.drawLine({ start: { x: ax + 3, y: my }, end: { x: ax + bw - 3, y: my }, color: GRAY, thickness: 0.8 });
  } // fixed: no glyph
}

function drawOtherElevation(page: any, font: any, cx: number, baseY: number, maxW: number, maxH: number, it: PurchaseItem) {
  const d = it.details || {};
  const wmm = Number(d.width_mm) || 1000, hmm = Number(d.height_mm) || 1000;
  const { w, h } = fitLeaf(wmm, hmm, maxW, maxH);
  const x = cx - w / 2, y = baseY;
  page.drawRectangle({ x, y, width: w, height: h, borderColor: INK, borderWidth: 1.1 });
  page.drawRectangle({ x: x + 6, y: y + 6, width: w - 12, height: h - 12, borderColor: LIGHT, borderWidth: 0.5 });
  if (d.width_mm) dimH(page, font, x, x + w, y + h + 9, String(wmm));
  if (d.height_mm) dimV(page, font, x + w + 12, y, y + h, String(hmm));
  drawFinishFloor(page, font, x - 16, x + w + 16, y);
}

function drawFinishFloor(page: any, font: any, x1: number, x2: number, y: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color: INK, thickness: 0.9 });
  page.drawText('FINISH FLOOR LINE', { x: x1, y: y - 8, size: 4.6, font, color: GRAY });
}

// Caption block under the elevation: tag + set/location + type + material + glass.
function drawCaption(page: any, font: any, bold: any, cellX: number, topY: number, it: PurchaseItem, tag: string) {
  const cx = cellX + CELL_W / 2;
  hr(page, cellX + 6, topY, cellX + CELL_W - 6, 0.9, INK);
  let yy = topY - 13;
  page.drawText(tag, { x: cx - textW(bold, tag, 12) / 2, y: yy, size: 12, font: bold, color: INK });
  yy -= 5;
  hr(page, cellX + 6, yy, cellX + CELL_W - 6, 0.5, INK);
  yy -= 11;
  for (const ln of captionLines(it)) {
    const t = truncate(ln, 38);
    const isType = ln === (it.name || '').toUpperCase();
    page.drawText(t, { x: cx - textW(isType ? bold : font, t, 6.1) / 2, y: yy, size: 6.1, font: isType ? bold : font, color: INK });
    yy -= 8.5;
  }
}
function captionLines(it: PurchaseItem): string[] {
  const d = it.details || {};
  const qty = Number(it.quantity ?? 1);
  const setLine = `${qty} SET${qty > 1 ? 'S' : ''}${it.room_name ? `; ${String(it.room_name).toUpperCase()}` : ''}`;
  const lines = [setLine, (it.name || '').toUpperCase()];
  if (it.item_type === 'door') {
    const m = [d.finish, d.frame].filter(Boolean).join(', ');
    if (m) lines.push(String(m).toUpperCase());
    if (d.glazing) lines.push(String(d.glazing).toUpperCase());
  } else if (it.item_type === 'window') {
    if (d.frame_type) lines.push(String(d.frame_type).toUpperCase());
    if (d.glazing) lines.push(String(d.glazing).toUpperCase());
  } else {
    const m = Object.values(d).filter((v) => v != null && v !== '').slice(0, 2).join(', ');
    if (m) lines.push(String(m).toUpperCase());
  }
  return lines;
}

// =====================================================================
// Single-item ORDER / shop-drawing sheet (A4 landscape) — one window or door:
// a large dimensioned architectural elevation on the left + a full spec/order
// table on the right + a drawing-number block. This is what you'd send a
// fabricator to ORDER one item.
// =====================================================================
async function drawOrderSheet(pdf: PDFDocument, font: any, bold: any, it: PurchaseItem, projectName: string, tag: string, includeCosts: boolean) {
  const W = 841.89, H = 595.28, M = 40;
  const page = pdf.addPage([W, H]);
  const typeWord = it.item_type === 'door' ? 'DOOR' : it.item_type === 'window' ? 'WINDOW' : 'ITEM';

  // ---- header ----
  page.drawText(`${typeWord} ORDER & SPECIFICATION`, { x: M, y: H - M, size: 16, font: bold, color: INK });
  page.drawText(truncate(projectName, 70), { x: M, y: H - M - 17, size: 9, font, color: GRAY });
  // tag box top-right
  const tbW = 96, tbH = 40, tbX = W - M - tbW, tbY = H - M - 24;
  page.drawRectangle({ x: tbX, y: tbY, width: tbW, height: tbH, borderColor: HAIR, borderWidth: 1 });
  page.drawText(tag, { x: tbX + tbW / 2 - textW(bold, tag, 20) / 2, y: tbY + 12, size: 20, font: bold, color: INK });
  hr(page, M, H - M - 30, W - M, 1);

  // ---- left: large elevation ----
  const elevColW = (W - 2 * M) * 0.46;
  const cx = M + elevColW / 2;
  const baseY = M + 64;                               // finish floor line
  const maxH = (H - M - 56) - baseY;                  // up to just under the header
  const maxW = elevColW - 70;                         // room for the side height dim
  if (it.item_type === 'door') drawDoorElevation(page, font, bold, cx, baseY, maxW, maxH, it);
  else if (it.item_type === 'window') drawWindowElevation(page, font, cx, baseY, maxW, maxH, it);
  else drawOtherElevation(page, font, cx, baseY, maxW, maxH, it);
  page.drawText('ELEVATION · SCALE NTS', { x: M, y: M + 30, size: 7, font, color: GRAY });

  // vertical divider between drawing and spec
  const divX = M + elevColW + 24;
  page.drawLine({ start: { x: divX, y: M }, end: { x: divX, y: H - M - 40 }, color: LIGHT, thickness: 0.6 });

  // ---- right: spec / order table ----
  const sx = divX + 24;
  const sw = W - M - sx;
  let sy = H - M - 52;
  page.drawText('SPECIFICATION', { x: sx, y: sy, size: 10, font: bold, color: INK });
  sy -= 22;
  const rows: [string, string][] = [
    ['Tag', tag],
    ['Type', it.name || '—'],
    ['Location', it.room_name || '—'],
    ...specRows(it, includeCosts),
  ];
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: sx, y: sy, size: 8, font, color: GRAY });
    const v = truncate(value, 40);
    page.drawText(v, { x: sx + 120, y: sy, size: 9.5, font: bold, color: INK });
    hr(page, sx, sy - 7, sx + sw, 0.3, LIGHT);
    sy -= 21;
    if (sy < M + 50) break;
  }

  // ---- footer: drawing-number block ----
  const code = `${typeWord.slice(0, 3)}-${tag}`;
  page.drawRectangle({ x: W - M - 130, y: M, width: 130, height: 30, borderColor: HAIR, borderWidth: 0.8 });
  page.drawText(code, { x: W - M - 120, y: M + 10, size: 12, font: bold, color: INK });
}

// =====================================================================
// Per-item spec page (A4 portrait)
// =====================================================================
async function drawItemPage(
  pdf: PDFDocument,
  font: any,
  bold: any,
  it: PurchaseItem,
  index: number,
  projectName: string,
  includeCosts: boolean,
) {
  const W = 595.28, H = 841.89, M = 42;
  const page = pdf.addPage([W, H]);
  const d = it.details || {};

  // Header
  page.drawText('PRODUCT PURCHASE SPECIFICATION', { x: M, y: H - M, size: 12, font: bold, color: INK });
  page.drawText(`${cap(it.item_type)} · ${truncate(projectName, 48)}`, { x: M, y: H - M - 15, size: 8.5, font, color: GRAY });
  hr(page, M, H - M - 24, W - M, 1);

  // Render image (left ~48%) — embed if present, else placeholder
  const imgX = M, imgTop = H - M - 40;
  const imgW = (W - 2 * M) * 0.46;
  const imgH = imgTop - (H * 0.42);
  page.drawRectangle({ x: imgX, y: imgTop - imgH, width: imgW, height: imgH, color: rgb(0.96, 0.96, 0.95), borderColor: LIGHT, borderWidth: 0.5 });
  if (it.design_image_url) {
    try {
      const bytes = await fetchBytes(it.design_image_url);
      if (bytes) {
        const img = await embedImage(pdf, bytes);
        if (img) {
          const s = img.scaleToFit(imgW - 12, imgH - 12);
          page.drawImage(img, { x: imgX + (imgW - s.width) / 2, y: imgTop - imgH + (imgH - s.height) / 2, width: s.width, height: s.height });
        }
      }
    } catch { /* leave placeholder */ }
  } else {
    page.drawText('design not generated yet', { x: imgX + 14, y: imgTop - imgH / 2, size: 8, font, color: GRAY });
  }

  // Spec table (right column)
  const specX = imgX + imgW + 26;
  const specW = W - M - specX;
  let sy = imgTop - 6;
  page.drawText(truncate(it.name, 40), { x: specX, y: sy, size: 12, font: bold, color: INK });
  sy -= 22;
  for (const [label, value] of specRows(it, includeCosts)) {
    page.drawText(label.toUpperCase(), { x: specX, y: sy, size: 8, font, color: GRAY });
    const v = truncate(value, 26);
    page.drawText(v, { x: specX + specW - textW(bold, v, 9), y: sy, size: 9, font: bold, color: INK });
    hr(page, specX, sy - 7, specX + specW, 0.3, LIGHT);
    sy -= 21;
    if (sy < H * 0.42) break;
  }

  // Lower band: swing symbol (doors) / opening note (windows) on the left, swatches on the right
  const bandY = H * 0.40;
  hr(page, M, bandY, W - M, 0.6);
  if (it.item_type === 'door') {
    drawSwing(page, font, bold, M + 60, bandY - 70, 64, String(d.handing || 'left'), String(d.opening || 'inward'));
  } else if (it.item_type === 'window') {
    drawWindowGlyph(page, font, M + 20, bandY - 110, 90, String(d.opening_type || 'tilt-turn'));
  }
  drawSwatches(page, font, W - M - 230, bandY - 60, swatchesFor(it));

  // Drawing-number block
  const code = `PUR-${String(index).padStart(3, '0')}`;
  page.drawRectangle({ x: W - M - 110, y: M, width: 110, height: 30, borderColor: HAIR, borderWidth: 0.8 });
  page.drawText(code, { x: W - M - 100, y: M + 10, size: 12, font: bold, color: INK });
}

// ---- per-item helpers ----
function specRows(it: PurchaseItem, includeCosts: boolean): [string, string][] {
  const d = it.details || {};
  const rows: [string, string][] = [];
  const push = (l: string, v: any, suffix = '') => { if (v != null && v !== '') rows.push([l, `${v}${suffix}`]); };
  if (it.item_type === 'door') {
    push('Width', d.width_mm, ' mm');
    push('Height', d.height_mm, ' mm');
    push('Thickness', d.thickness_mm, ' mm');
    push('Finish', d.finish);
    push('Opening', d.opening);
    push('Handing', d.handing);
    push('Hinge side', d.hinge_side);
    push('Frame', d.frame);
    push('Hardware', d.hardware);
  } else if (it.item_type === 'window') {
    push('Width', d.width_mm, ' mm');
    push('Height', d.height_mm, ' mm');
    push('Frame', d.frame_type);
    push('Glazing', d.glazing);
    push('Opening', d.opening_type);
    push('Finish', d.finish);
  } else {
    for (const [k, v] of Object.entries(d)) push(cap(k.replace(/_/g, ' ')), v);
  }
  push('Quantity', it.quantity ?? 1);
  // `unit_cost` is what WE pay the supplier, not what the customer pays. It was labelled
  // "Unit price" and printed by default, so an operator generating the default purchase
  // specification saw a figure that reads as customer-facing and could forward the 7-day link
  // as a spec sheet (#361 `EG-16`). Two changes: the label says what the number is, and the
  // number only appears when the caller asked for it.
  if (includeCosts && it.unit_cost != null) {
    rows.push(['Supplier cost', money(Number(it.unit_cost), it.currency || 'EUR')]);
  }
  return rows;
}

function keySpec(it: PurchaseItem): string {
  const d = it.details || {};
  if (it.item_type === 'door') {
    return [d.width_mm && d.height_mm ? `${d.width_mm}×${d.height_mm}` : null, d.finish, d.opening && d.handing ? `${d.handing}/${d.opening}` : (d.opening || d.handing)].filter(Boolean).join(' · ');
  }
  if (it.item_type === 'window') {
    return [d.width_mm && d.height_mm ? `${d.width_mm}×${d.height_mm}` : null, d.opening_type, d.glazing].filter(Boolean).join(' · ');
  }
  return Object.values(d).slice(0, 2).join(' · ');
}

// Door swing plan symbol: wall, leaf line, quarter-circle arc.
function drawSwing(page: any, font: any, bold: any, x: number, y: number, size: number, handing: string, opening: string) {
  const left = handing.toLowerCase().startsWith('l');
  const inward = opening.toLowerCase().startsWith('in');
  const hingeX = left ? x : x + size;          // hinge at the handing side
  const sx = left ? 1 : -1;                     // leaf extends away from hinge
  const sy = inward ? 1 : -1;                   // arc opens to inward/outward
  // wall stubs
  page.drawRectangle({ x: x - 14, y: y - 2, width: 14, height: 4, color: INK });
  page.drawRectangle({ x: x + size, y: y - 2, width: 14, height: 4, color: INK });
  // leaf
  page.drawLine({ start: { x: hingeX, y }, end: { x: hingeX, y: y + sy * size }, color: INK, thickness: 1.2 });
  // arc (sampled quarter circle from leaf tip to opposite jamb)
  const seg = 16;
  let prev = { x: hingeX, y: y + sy * size };
  for (let i = 1; i <= seg; i++) {
    const a = (Math.PI / 2) * (i / seg);
    const px = hingeX + sx * size * Math.sin(a);
    const py = y + sy * size * Math.cos(a);
    page.drawLine({ start: prev, end: { x: px, y: py }, color: GRAY, thickness: 0.6 });
    prev = { x: px, y: py };
  }
  page.drawText(`${left ? 'LEFT' : 'RIGHT'}-HAND ${inward ? 'INWARD' : 'OUTWARD'}`, { x: x - 14, y: y - 18, size: 7, font: bold, color: INK });
}

function drawWindowGlyph(page: any, font: any, x: number, y: number, size: number, openingType: string) {
  page.drawRectangle({ x, y, width: size, height: size * 1.2, borderColor: INK, borderWidth: 1 });
  // tilt-turn: diagonal to a bottom corner + top
  const t = (openingType || '').toLowerCase();
  if (t.includes('tilt')) {
    page.drawLine({ start: { x, y }, end: { x: x + size / 2, y: y + size * 1.2 }, color: GRAY, thickness: 0.6 });
    page.drawLine({ start: { x: x + size, y }, end: { x: x + size / 2, y: y + size * 1.2 }, color: GRAY, thickness: 0.6 });
  } else if (t.includes('casement')) {
    page.drawLine({ start: { x, y: y + size * 0.6 }, end: { x: x + size, y }, color: GRAY, thickness: 0.6 });
    page.drawLine({ start: { x, y: y + size * 0.6 }, end: { x: x + size, y: y + size * 1.2 }, color: GRAY, thickness: 0.6 });
  } else if (t.includes('slid')) {
    page.drawLine({ start: { x: x + 6, y: y + size * 0.6 }, end: { x: x + size - 6, y: y + size * 0.6 }, color: GRAY, thickness: 1 });
  }
  page.drawText((openingType || 'window').toUpperCase(), { x, y: y - 12, size: 7, font, color: INK });
}

function swatchesFor(it: PurchaseItem): { label: string; color: any; code: string }[] {
  const d = it.details || {};
  const candidates = [d.finish, d.frame, d.hardware, d.frame_type, d.glazing].filter(Boolean) as string[];
  const seen = new Set<string>();
  const out: { label: string; color: any; code: string }[] = [];
  let n = 1;
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: truncate(c, 14), color: finishColor(c), code: `F${String(n).padStart(3, '0')}` });
    n++;
    if (out.length >= 3) break;
  }
  return out;
}

function drawSwatches(page: any, font: any, x: number, y: number, swatches: { label: string; color: any; code: string }[]) {
  swatches.forEach((s, i) => {
    const sx = x + i * 78;
    page.drawRectangle({ x: sx, y, width: 56, height: 56, color: s.color, borderColor: LIGHT, borderWidth: 0.5 });
    page.drawText(s.label, { x: sx, y: y - 12, size: 7, font, color: INK });
    page.drawText(s.code, { x: sx, y: y - 21, size: 6.5, font, color: GRAY });
  });
}

function finishColor(s: string): any {
  const t = (s || '').toLowerCase();
  if (/oak|wood|walnut|timber|natural|veneer/.test(t)) return rgb(0.78, 0.66, 0.46);
  if (/matt black|black|anthracite|graphite|charcoal/.test(t)) return rgb(0.13, 0.13, 0.14);
  if (/white|ral 9016|ral9016|snow/.test(t)) return rgb(0.95, 0.95, 0.93);
  if (/grey|gray|silver|alu/.test(t)) return rgb(0.42, 0.43, 0.45);
  if (/brass|gold|bronze/.test(t)) return rgb(0.72, 0.6, 0.36);
  if (/glass|clear|glaz/.test(t)) return rgb(0.8, 0.86, 0.88);
  return rgb(0.7, 0.68, 0.64);
}

// =====================================================================
// shared utils
// =====================================================================
function hr(page: any, x1: number, y: number, x2: number, thickness = 1, color: any = HAIR) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color, thickness });
}
function textW(font: any, t: string, size: number): number { return font.widthOfTextAtSize(t || '', size); }
function truncate(s: string, n: number): string { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function cap(s: string): string { s = String(s ?? ''); return s ? s[0].toUpperCase() + s.slice(1) : s; }
const money = (n: number, cur: string) => formatMoney(n, cur);
/**
 * Image bytes for a stored `design_image_url`.
 *
 * Was `fetch(url)` + `res.arrayBuffer()`: no scheme check, no SSRF guard, redirects followed,
 * no content-type check and no size cap (#361 `EG-18`). It was the eighth site of that shape
 * and the only one that hand-rolled its own rather than calling the shared helper — which is
 * why fixing `fetchImageBytesFromUrl` did not close it. There is one guarded, bounded way to
 * fetch an image from a URL and this is a caller of it, not a ninth copy.
 */
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const img = await fetchImageGuardedOrNull(url);
  return img?.bytes ?? null;
}
async function embedImage(pdf: PDFDocument, bytes: Uint8Array): Promise<any | null> {
  try { return await pdf.embedJpg(bytes); } catch { /* try png */ }
  try { return await pdf.embedPng(bytes); } catch { return null; }
}
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// =====================================================================
// Purchase-order mode — render a purchase ORDER + optionally
// email it to the supplier and mark the order placed.
// =====================================================================
async function handlePurchaseOrder(body: Body, admin: any, reader: any): Promise<Response> {
  // Load the order under the caller's RLS (enforces workspace access).
  const { data: order, error: oErr } = await reader
    .from('orders')
    .select('id, workspace_id, order_type, order_number, status, currency, subtotal_net, vat_amount, total, notes, supplier_company_id, supplier_contact_id')
    .eq('id', body.order_id)
    .eq('order_type', 'purchase')
    .maybeSingle();
  if (oErr) throw new HttpError(403, `Could not read order: ${oErr.message}`);
  if (!order) throw new HttpError(404, 'Purchase order not found');

  const { data: lines, error: liErr } = await reader
    .from('order_items')
    .select('description, quantity, unit_cost, unit_price, line_total, sort_order')
    .eq('order_id', order.id)
    .order('sort_order', { ascending: true });
  if (liErr) throw new HttpError(403, `Could not read order lines: ${liErr.message}`);
  const items = lines || [];
  if (items.length === 0) throw new HttpError(400, 'Purchase order has no line items');

  // Supplier + buyer identity (service-role reads — these are needed to address the PO).
  let supplier: any = null;
  if (order.supplier_company_id) {
    const { data } = await admin.from('crm_companies').select('name, email, vat_number').eq('id', order.supplier_company_id).maybeSingle();
    supplier = data;
  }
  let contactEmail: string | null = null;
  let contactName: string | null = null;
  if (order.supplier_contact_id) {
    const { data } = await admin.from('crm_contacts').select('name, email').eq('id', order.supplier_contact_id).maybeSingle();
    contactEmail = data?.email ?? null;
    contactName = data?.name ?? null;
  }
  const { data: ws } = await admin.from('workspaces').select('name').eq('id', order.workspace_id).maybeSingle();
  // Unified branding: the buyer (us) identity comes from finance_settings — the SAME
  // source invoices/quotes/catalogs use — falling back to the workspace name.
  const { data: fsRow } = await admin.from('finance_settings')
    .select('business_name, business_logo_path, business_vat, business_address, business_street_number, business_postal_code, business_city')
    .eq('workspace_id', order.workspace_id).maybeSingle();
  const f = (fsRow ?? {}) as Record<string, string | null>;
  const buyerName = f.business_name || ws?.name || 'Our company';
  const buyerVat = f.business_vat || null;
  const buyerAddress = [
    [f.business_address, f.business_street_number].filter(Boolean).join(' '),
    [f.business_postal_code, f.business_city].filter(Boolean).join(', '),
  ].filter(Boolean).join(', ') || null;
  let buyerLogo: Uint8Array | null = null;
  if (f.business_logo_path) {
    try {
      const { data: lf } = await admin.storage.from('generation-images').download(f.business_logo_path);
      if (lf) buyerLogo = new Uint8Array(await lf.arrayBuffer());
    } catch { /* logo optional */ }
  }
  // Actor (who clicked send) — best-effort; null on service-role calls. Lets the
  // default `purchase_order.sent` flow notify the sender.
  let actorId: string | null = null;
  try { const { data: u } = await reader.auth.getUser(); actorId = u?.user?.id ?? null; } catch { /* service-role */ }

  const orderNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
  const currency = order.currency || 'EUR';

  // ---- render ----
  const pdf = await PDFDocument.create();
  const { regular: font, bold } = await embedOpenSans(pdf);
  await drawPurchaseOrderDoc(pdf, font, bold, {
    orderNumber, buyerName, buyerVat, buyerAddress, buyerLogo,
    supplierName: supplier?.name || contactName || 'Supplier',
    supplierVat: supplier?.vat_number || null,
    supplierEmail: contactEmail || supplier?.email || null,
    deliverNote: order.notes || null,
    message: body.message || null,
    currency,
    subtotal: Number(order.subtotal_net || 0),
    vat: Number(order.vat_amount || 0),
    total: Number(order.total || 0),
    // The header prints the STORED `subtotal_net` / `vat_amount` / `total`, so the lines must
    // print the stored `line_total` and nothing else. The fallback here re-derived
    // `quantity * unit_cost` whenever `line_total` was null or stale — a second derivation of a
    // money quantity, in the renderer, which is the one place forbidden to derive. After a
    // discount, currency or tax edit that produced a document whose lines did not add up to its
    // own total, with no error anywhere (#361 `EG-20`). A missing line total is a data defect:
    // fail, rather than print a plausible number onto a document sent to a supplier.
    lines: items.map((it: any) => {
      if (it.line_total === null || it.line_total === undefined) {
        throw new HttpError(
          422,
          `Order line "${it.description ?? '(unnamed)'}" has no stored line_total — reprice the order before sending it.`,
        );
      }
      return {
        description: it.description || '—',
        qty: Number(it.quantity || 0),
        unitCost: Number(it.unit_cost ?? it.unit_price ?? 0),
        lineTotal: Number(it.line_total),
      };
    }),
  });
  const bytes = await pdf.save();
  const pageCount = pdf.getPageCount();

  const ts = Date.now();
  const path = `purchase-order/${order.id}/po-${ts}.pdf`;
  const { error: upErr } = await admin.storage.from('pdf-documents').upload(path, bytes, {
    contentType: 'application/pdf', upsert: true,
  });
  if (upErr) throw new HttpError(500, `PDF upload failed: ${upErr.message}`);
  const { data: signed } = await admin.storage.from('pdf-documents').createSignedUrl(path, 60 * 60 * 24 * 7);

  let sent = false;
  let recipient: string | null = null;
  if (body.send) {
    recipient = (body.to || contactEmail || supplier?.email || '').trim() || null;
    if (!recipient) throw new HttpError(400, 'No supplier email on file — add a supplier contact/company email or pass `to`.');

    const subject = `Purchase Order ${orderNumber} — ${buyerName}`;
    const intro = body.message ? `<p>${escapeHtml(body.message)}</p>` : '';
    const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#1a1a1a">
      <p>Dear ${escapeHtml(supplier?.name || contactName || 'Supplier')},</p>
      <p>Please find attached our purchase order <strong>${escapeHtml(orderNumber)}</strong> from ${escapeHtml(buyerName)}.</p>
      ${intro}
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:2px 12px 2px 0;color:#666">Items</td><td><strong>${items.length}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Total</td><td><strong>${order.total?.toFixed ? order.total.toFixed(2) : order.total} ${escapeHtml(currency)}</strong></td></tr>
      </table>
      <p style="color:#666;font-size:13px">The full order detail is in the attached PDF.</p>
    </div>`;

    const { error: mailErr } = await admin.functions.invoke('email-api', {
      body: {
        action: 'send',
        to: recipient,
        subject,
        html,
        emailType: 'transactional',
        attachments: [{ filename: `purchase-order-${orderNumber}.pdf`, content: bytesToBase64(bytes) }],
        tags: { feature: 'purchase_orders', order_id: order.id },
        workspace_id: order.workspace_id,
        // Tenant business mail (PO sent to the tenant's supplier on the tenant's behalf) → must
        // send from the workspace's own BYOK Resend, never the shared platform domain.
        requireWorkspaceSender: true,
      },
    });
    if (mailErr) throw new HttpError(502, `Email send failed: ${mailErr.message ?? 'unknown'}`);
    sent = true;

    // Mark the PO placed (draft → confirmed) once it's actually been sent.
    if (order.status === 'draft') {
      await admin.from('orders').update({ status: 'confirmed' }).eq('id', order.id);
    }

    // Notify via Flows (no-op if no flow consumes it yet).
    const supName = supplier?.name || contactName || 'supplier';
    await emitFlowEvent('purchase_order.sent', {
      // notification fields (consumed by the default create_notification flow)
      user_id: actorId,
      title: `Purchase order ${orderNumber} sent`,
      body: `Sent to ${supName} · ${Number(order.total || 0).toFixed(2)} ${currency}`,
      action_url: `/finance/orders/${order.id}`,
      // domain fields
      order_id: order.id,
      order_number: orderNumber,
      supplier_id: order.supplier_company_id,
      supplier_name: supplier?.name || contactName || null,
      supplier_email: recipient,
      workspace_id: order.workspace_id,
      total: Number(order.total || 0),
      currency,
      item_count: items.length,
      buyer_name: buyerName,
    });
  }

  return json({
    success: true,
    pdf_url: signed?.signedUrl ?? null,
    pdf_storage_path: path,
    order_id: order.id,
    order_number: orderNumber,
    page_count: pageCount,
    sent,
    recipient,
  });
}

interface POLine { description: string; qty: number; unitCost: number; lineTotal: number; }
interface POCtx {
  orderNumber: string; buyerName: string; buyerVat: string | null; buyerAddress: string | null;
  buyerLogo: Uint8Array | null; supplierName: string; supplierVat: string | null;
  supplierEmail: string | null; deliverNote: string | null; message: string | null;
  currency: string; subtotal: number; vat: number; total: number; lines: POLine[];
}

async function drawPurchaseOrderDoc(pdf: PDFDocument, font: any, bold: any, ctx: POCtx) {
  const W = 595.28, H = 841.89, M = 42;
  // Was `${n.toFixed(2)} ${currency}` — ungrouped, code-suffixed — while the same PDF's other
  // money helper printed "€1,234.56". One document, two formats.
  const money = (n: number) => formatMoney(n, ctx.currency);
  const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
  // Our logo (top-right of the header) — from finance_settings.business_logo_path.
  let logoImg: any = null;
  if (ctx.buyerLogo) {
    try { logoImg = await pdf.embedPng(ctx.buyerLogo); }
    catch { try { logoImg = await pdf.embedJpg(ctx.buyerLogo); } catch { /* skip */ } }
  }
  const cols = [
    { key: 'idx', label: '#', w: 24, align: 'left' as const },
    { key: 'desc', label: 'DESCRIPTION', w: 271, align: 'left' as const },
    { key: 'qty', label: 'QTY', w: 50, align: 'right' as const },
    { key: 'unit', label: 'UNIT COST', w: 88, align: 'right' as const },
    { key: 'total', label: 'LINE TOTAL', w: 78, align: 'right' as const },
  ];
  const rowH = 20;

  let page = pdf.addPage([W, H]);
  const drawHeader = (p: any): number => {
    let y = H - M;
    if (logoImg) {
      const s = Math.min(120 / logoImg.width, 40 / logoImg.height);
      p.drawImage(logoImg, { x: W - M - logoImg.width * s, y: y - logoImg.height * s + 4, width: logoImg.width * s, height: logoImg.height * s });
    }
    p.drawText('PURCHASE ORDER', { x: M, y: y - 6, size: 20, font: bold, color: INK });
    y -= 24;
    p.drawText(`No. ${ctx.orderNumber}`, { x: M, y, size: 10, font, color: GRAY });
    y -= 18;
    // From (buyer) identity — name + VAT + address from finance_settings.
    p.drawText(`From: ${clip(ctx.buyerName, 60)}`, { x: M, y, size: 10, font: bold, color: INK });
    y -= 13;
    const fromSub: string[] = [];
    if (ctx.buyerVat) fromSub.push(`VAT ${ctx.buyerVat}`);
    if (ctx.buyerAddress) fromSub.push(ctx.buyerAddress);
    if (fromSub.length) { p.drawText(clip(fromSub.join('  ·  '), 82), { x: M, y, size: 9, font, color: GRAY }); y -= 14; }
    y -= 2;
    p.drawText(`To (Supplier): ${clip(ctx.supplierName, 50)}`, { x: M, y, size: 11, font: bold, color: INK });
    y -= 14;
    const sub: string[] = [];
    if (ctx.supplierVat) sub.push(`VAT ${ctx.supplierVat}`);
    if (ctx.supplierEmail) sub.push(ctx.supplierEmail);
    if (sub.length) { p.drawText(clip(sub.join('  ·  '), 70), { x: M, y, size: 9, font, color: GRAY }); y -= 14; }
    if (ctx.deliverNote) { p.drawText(clip(ctx.deliverNote, 80), { x: M, y, size: 9, font, color: GRAY }); y -= 14; }
    y -= 6;
    // table header row
    let x = M;
    p.drawRectangle({ x: M, y: y - rowH + 4, width: W - 2 * M, height: rowH, color: ZEBRA });
    for (const c of cols) {
      const tw = bold.widthOfTextAtSize(c.label, 8);
      p.drawText(c.label, { x: c.align === 'right' ? x + c.w - tw - 4 : x + 4, y: y - rowH + 10, size: 8, font: bold, color: HAIR });
      x += c.w;
    }
    return y - rowH;
  };

  let y = drawHeader(page);
  const drawRow = (cells: Record<string, string>, idx: number) => {
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 4, width: W - 2 * M, height: rowH, color: WHITE });
    let x = M;
    for (const c of cols) {
      const v = cells[c.key] ?? '';
      const tw = font.widthOfTextAtSize(v, 9);
      page.drawText(v, { x: c.align === 'right' ? x + c.w - tw - 4 : x + 4, y: y - rowH + 10, size: 9, font, color: INK });
      x += c.w;
    }
    y -= rowH;
  };

  ctx.lines.forEach((l, i) => {
    if (y < M + 110) { page = pdf.addPage([W, H]); y = drawHeader(page); }
    drawRow({ idx: String(i + 1), desc: clip(l.description, 62), qty: String(l.qty), unit: money(l.unitCost), total: money(l.lineTotal) }, i);
  });

  // totals block
  y -= 10;
  page.drawLine({ start: { x: W - M - 230, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.6, color: LIGHT });
  const totalsRow = (label: string, val: string, strong = false) => {
    const f = strong ? bold : font; const sz = strong ? 11 : 9;
    page.drawText(label, { x: W - M - 230, y, size: sz, font: f, color: strong ? INK : GRAY });
    const tw = f.widthOfTextAtSize(val, sz);
    page.drawText(val, { x: W - M - tw, y, size: sz, font: f, color: INK });
    y -= strong ? 18 : 15;
  };
  totalsRow('Subtotal (net)', money(ctx.subtotal));
  totalsRow('VAT', money(ctx.vat));
  totalsRow('TOTAL', money(ctx.total), true);

  if (ctx.message) {
    y -= 8;
    page.drawText('Notes', { x: M, y, size: 9, font: bold, color: GRAY }); y -= 14;
    page.drawText(clip(ctx.message, 95), { x: M, y, size: 9, font, color: INK });
  }
}

// escapeHtml imported from ../_shared/html.ts (identical behaviour, deduped).

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
