/**
 * generate-purchase-sheet-pdf
 *
 * Renders a project's purchase items (internal doors, windows, etc.) into a
 * polished purchase specification PDF. Two output modes, combinable:
 *   - 'per_item'  → one A4-portrait spec page per item (render + spec table +
 *                   door swing symbol + finish swatches + PUR-00N block)
 *   - 'schedule'  → an A4-landscape combined schedule table across all items
 *   - 'both'      → schedule page(s) first, then a detail page per item
 *
 * Data source: `project_purchase_items` (fetched under RLS via the caller's JWT),
 * or inline `items` when called with the service-role key (smoke tests / server).
 *
 * Output: uploaded to the private `pdf-documents` bucket at
 *   project-purchase/{project_id}/purchase-{ts}.pdf
 * and returned as a 7-day signed URL.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedOpenSans } from '../_shared/fonts/open-sans.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

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
  mode?: 'per_item' | 'schedule' | 'both';
  title?: string;
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Read items under the caller's RLS unless it's a service-role call.
  const reader = isService
    ? admin
    : createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });

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
  if (mode === 'per_item' || mode === 'both') {
    for (let i = 0; i < items.length; i++) {
      await drawItemPage(pdf, font, bold, items[i], i + 1, projectName);
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
// Combined schedule (A4 landscape table)
// =====================================================================
async function drawSchedulePages(
  pdf: PDFDocument,
  font: any,
  bold: any,
  items: PurchaseItem[],
  projectName: string,
) {
  const W = 841.89, H = 595.28, M = 40;
  const cols = [
    { key: 'idx', label: '#', w: 26, align: 'left' as const },
    { key: 'type', label: 'TYPE', w: 70, align: 'left' as const },
    { key: 'name', label: 'ITEM', w: 200, align: 'left' as const },
    { key: 'room', label: 'ROOM', w: 110, align: 'left' as const },
    { key: 'spec', label: 'KEY SPEC', w: 175, align: 'left' as const },
    { key: 'qty', label: 'QTY', w: 40, align: 'right' as const },
    { key: 'unit', label: 'UNIT', w: 65, align: 'right' as const },
    { key: 'total', label: 'TOTAL', w: 70, align: 'right' as const },
  ];
  const rowH = 22;
  const perPage = Math.floor((H - M - 120) / rowH);
  let grand = 0;
  const currency = items.find((i) => i.currency)?.currency || 'EUR';

  let page = newPage();
  let y = drawScheduleHeader(page);
  let rowsOnPage = 0;

  function newPage() {
    return pdf.addPage([W, H]);
  }
  function drawScheduleHeader(p: any): number {
    p.drawText('PROJECT PURCHASE SCHEDULE', { x: M, y: H - M - 4, size: 14, font: bold, color: INK });
    p.drawText(truncate(projectName, 70), { x: M, y: H - M - 22, size: 9, font, color: GRAY });
    hr(p, M, H - M - 32, W - M);
    // column header
    let cx = M;
    const hy = H - M - 52;
    for (const c of cols) {
      p.drawText(c.label, { x: c.align === 'right' ? cx + c.w - textW(bold, c.label, 7.5) : cx, y: hy, size: 7.5, font: bold, color: GRAY });
      cx += c.w;
    }
    hr(p, M, hy - 6, W - M, 0.8);
    return hy - 6 - rowH;
  }

  items.forEach((it, i) => {
    if (rowsOnPage >= perPage) {
      page = newPage();
      y = drawScheduleHeader(page);
      rowsOnPage = 0;
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH, color: ZEBRA });
    const qty = Number(it.quantity ?? 1);
    const unit = it.unit_cost != null ? Number(it.unit_cost) : null;
    const line = unit != null ? unit * qty : null;
    if (line != null) grand += line;
    const cells: Record<string, string> = {
      idx: String(i + 1),
      type: cap(it.item_type),
      name: truncate(it.name, 34),
      room: truncate(it.room_name || '—', 18),
      spec: truncate(keySpec(it), 30),
      qty: String(qty),
      unit: unit != null ? money(unit, currency) : '—',
      total: line != null ? money(line, currency) : '—',
    };
    let cx = M;
    for (const c of cols) {
      const txt = cells[c.key];
      const tx = c.align === 'right' ? cx + c.w - textW(font, txt, 8.5) : cx;
      page.drawText(txt, { x: tx, y: y, size: 8.5, font, color: INK });
      cx += c.w;
    }
    hr(page, M, y - 6, W - M, 0.3, LIGHT);
    y -= rowH;
    rowsOnPage++;
  });

  // totals
  const totLabel = 'TOTAL';
  page.drawText(totLabel, { x: W - M - 70 - textW(bold, totLabel, 10) - 10, y: y - 6, size: 10, font: bold, color: INK });
  page.drawText(money(grand, currency), { x: W - M - textW(bold, money(grand, currency), 10), y: y - 6, size: 10, font: bold, color: INK });
  hr(page, W - M - 200, y + 14, W - M, 0.8);
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
  for (const [label, value] of specRows(it)) {
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
function specRows(it: PurchaseItem): [string, string][] {
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
  if (it.unit_cost != null) rows.push(['Unit price', money(Number(it.unit_cost), it.currency || 'EUR')]);
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
function money(n: number, cur: string): string {
  const sym = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'USD' ? '$' : (cur ? cur + ' ' : '');
  return `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}
async function embedImage(pdf: PDFDocument, bytes: Uint8Array): Promise<any | null> {
  try { return await pdf.embedJpg(bytes); } catch { /* try png */ }
  try { return await pdf.embedPng(bytes); } catch { return null; }
}
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
