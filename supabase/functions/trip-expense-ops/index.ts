/**
 * trip-expense-ops
 *
 * Consolidated server-side operations for sales-team Trip Cards that need the
 * service role (receipts live in the private pdf-documents bucket, and finance —
 * a different user than the rep — must be able to read them). Three actions:
 *
 *   - upload_receipt : { item_id, filename, content_type, data_base64 }
 *                      → uploads to pdf-documents/trip-expenses/{report}/{item}-{ts}.{ext},
 *                        stamps receipt_* columns on the line, returns a 7d signed URL.
 *   - sign_receipt   : { item_id } → fresh 7d signed URL for an existing receipt.
 *   - generate_pdf   : { report_id } → renders the report to A4 PDF, returns a signed URL.
 *
 * Access is enforced by reading the row under the CALLER's JWT (RLS): the line/report
 * is only visible to its owner or a workspace finance manager. Uploads additionally
 * require the caller to be the owner while the card is draft, or a finance manager.
 */
import { createClient } from '@supabase/supabase-js';
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

const INK = rgb(0.12, 0.12, 0.13);
const GRAY = rgb(0.45, 0.45, 0.47);
const LIGHT = rgb(0.85, 0.85, 0.85);
const HAIR = rgb(0.2, 0.2, 0.2);
const ZEBRA = rgb(0.965, 0.965, 0.955);
const GREEN = rgb(0.16, 0.55, 0.34);
const RED = rgb(0.78, 0.22, 0.22);
const AMBER = rgb(0.82, 0.6, 0.12);
const SIGNED_TTL = 60 * 60 * 24 * 7;

interface Body {
  action?: 'upload_receipt' | 'sign_receipt' | 'generate_pdf';
  item_id?: string;
  report_id?: string;
  filename?: string;
  content_type?: string;
  data_base64?: string;
}

Deno.serve(withApiLogging('trip-expense-ops', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) throw new HttpError(401, 'Missing Authorization bearer');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const reader = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await reader.auth.getUser();
  const uid = who?.user?.id;
  if (!uid) throw new HttpError(401, 'Invalid session');

  const body = (await req.json().catch(() => ({}))) as Body;

  switch (body.action) {
    case 'upload_receipt': return uploadReceipt(body, reader, admin, uid);
    case 'sign_receipt':   return signReceipt(body, reader, admin);
    case 'generate_pdf':   return generatePdf(body, reader, admin);
    default: throw new HttpError(400, 'Unknown action');
  }
}));

// ---------------------------------------------------------------------------

async function uploadReceipt(body: Body, reader: any, admin: any, uid: string): Promise<Response> {
  if (!body.item_id || !body.data_base64) throw new HttpError(400, 'item_id and data_base64 required');

  // RLS read confirms the caller can see this line at all (owner or finance).
  const { data: item } = await reader.from('trip_expense_items').select('id, report_id').eq('id', body.item_id).maybeSingle();
  if (!item) throw new HttpError(403, 'Expense line not found or not accessible');

  const { data: report } = await reader.from('trip_expense_reports')
    .select('id, user_id, status, workspace_id').eq('id', item.report_id).maybeSingle();
  if (!report) throw new HttpError(403, 'Trip card not accessible');

  const isOwnerDraft = report.user_id === uid && report.status === 'draft';
  let allowed = isOwnerDraft;
  if (!allowed) {
    const { data: fin } = await reader.rpc('is_workspace_finance_manager', { p_workspace_id: report.workspace_id });
    allowed = fin === true;
  }
  if (!allowed) throw new HttpError(403, 'You cannot attach a receipt to this line');

  const bytes = b64ToBytes(body.data_base64);
  const ext = extFor(body.filename, body.content_type);
  const path = `trip-expenses/${item.report_id}/${item.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage.from('pdf-documents').upload(path, bytes, {
    contentType: body.content_type || 'application/octet-stream', upsert: true,
  });
  if (upErr) throw new HttpError(500, `Upload failed: ${upErr.message}`);

  const { error: updErr } = await admin.from('trip_expense_items').update({
    receipt_bucket: 'pdf-documents', receipt_path: path,
    receipt_name: body.filename || null, receipt_mime: body.content_type || null,
  }).eq('id', item.id);
  if (updErr) throw new HttpError(500, `Could not save receipt reference: ${updErr.message}`);

  const { data: signed } = await admin.storage.from('pdf-documents').createSignedUrl(path, SIGNED_TTL);
  return json({ success: true, receipt_path: path, signed_url: signed?.signedUrl ?? null });
}

async function signReceipt(body: Body, reader: any, admin: any): Promise<Response> {
  if (!body.item_id) throw new HttpError(400, 'item_id required');
  const { data: item } = await reader.from('trip_expense_items')
    .select('receipt_bucket, receipt_path').eq('id', body.item_id).maybeSingle();
  if (!item || !item.receipt_path) return json({ success: true, signed_url: null });
  const { data: signed } = await admin.storage.from(item.receipt_bucket || 'pdf-documents')
    .createSignedUrl(item.receipt_path, SIGNED_TTL);
  return json({ success: true, signed_url: signed?.signedUrl ?? null });
}

async function generatePdf(body: Body, reader: any, admin: any): Promise<Response> {
  if (!body.report_id) throw new HttpError(400, 'report_id required');
  const { data: report } = await reader.from('trip_expense_reports').select('*').eq('id', body.report_id).maybeSingle();
  if (!report) throw new HttpError(403, 'Trip card not found or not accessible');
  const { data: items } = await reader.from('trip_expense_items').select('*')
    .eq('report_id', body.report_id).order('expense_date', { ascending: true }).order('sort_order', { ascending: true });

  // Company identity from finance_settings — the same source every other document uses.
  const { data: fsRow } = await admin.from('finance_settings')
    .select('business_name, business_logo_path')
    .eq('workspace_id', report.workspace_id).maybeSingle();
  const fsF = (fsRow ?? {}) as Record<string, string | null>;
  let companyLogo: Uint8Array | null = null;
  if (fsF.business_logo_path) {
    try {
      const { data: lf } = await admin.storage.from('generation-images').download(fsF.business_logo_path);
      if (lf) companyLogo = new Uint8Array(await lf.arrayBuffer());
    } catch { /* logo optional */ }
  }

  const pdf = await PDFDocument.create();
  const { regular: font, bold } = await embedOpenSans(pdf);
  await drawReport(pdf, font, bold, report, items || [], { name: fsF.business_name || null, logo: companyLogo });
  const bytes = await pdf.save();

  const path = `trip-expenses/${report.id}/report-${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage.from('pdf-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new HttpError(500, `PDF upload failed: ${upErr.message}`);
  const { data: signed } = await admin.storage.from('pdf-documents').createSignedUrl(path, SIGNED_TTL);
  return json({ success: true, pdf_url: signed?.signedUrl ?? null, pdf_storage_path: path, page_count: pdf.getPageCount() });
}

// ---------------------------------------------------------------------------
// PDF layout (A4 portrait)
// ---------------------------------------------------------------------------
async function drawReport(
  pdf: PDFDocument, font: any, bold: any, r: any, items: any[],
  company?: { name: string | null; logo: Uint8Array | null },
) {
  const W = 595.28, H = 841.89, M = 42;
  const cur = r.currency || 'EUR';
  // Employer identity (finance_settings) on the report header.
  let logoImg: any = null;
  if (company?.logo) {
    try { logoImg = await pdf.embedPng(company.logo); }
    catch { try { logoImg = await pdf.embedJpg(company.logo); } catch { /* skip */ } }
  }
  const cols = [
    { key: 'date', label: 'DATE', w: 62, align: 'left' as const },
    { key: 'cat', label: 'CATEGORY', w: 78, align: 'left' as const },
    { key: 'desc', label: 'DESCRIPTION', w: 150, align: 'left' as const },
    { key: 'vendor', label: 'VENDOR', w: 86, align: 'left' as const },
    { key: 'amount', label: 'AMOUNT', w: 64, align: 'right' as const },
    { key: 'status', label: 'STATUS', w: 71, align: 'left' as const },
  ];
  const rowH = 20;

  let page = pdf.addPage([W, H]);
  let y = header(page);
  let rowsLeft = Math.floor((y - M - 140) / rowH);

  function header(p: any): number {
    const heading = r.card_type === 'monthly' ? 'MONTHLY EXPENSE REPORT'
      : r.card_type === 'other' ? 'EXPENSE REPORT' : 'TRIP EXPENSE REPORT';
    p.drawText(heading, { x: M, y: H - M, size: 14, font: bold, color: INK });
    // Company identity, top-right: logo when set, else the business name.
    if (logoImg) {
      const s = Math.min(100 / logoImg.width, 32 / logoImg.height);
      p.drawImage(logoImg, { x: W - M - logoImg.width * s, y: H - M - logoImg.height * s + 10, width: logoImg.width * s, height: logoImg.height * s });
    } else if (company?.name) {
      p.drawText(truncate(company.name, 34), { x: W - M - textW(bold, truncate(company.name, 34), 10), y: H - M, size: 10, font: bold, color: GRAY });
    }
    const sub = [r.destination, r.purpose].filter(Boolean).join(' · ');
    p.drawText(truncate(r.title + (sub ? ' — ' + sub : ''), 78), { x: M, y: H - M - 16, size: 9, font, color: GRAY });
    const dates = [r.trip_start, r.trip_end].filter(Boolean).join('  →  ') || '—';
    p.drawText(`Dates: ${dates}    Status: ${statusLabel(r.status)}`, { x: M, y: H - M - 30, size: 8.5, font, color: GRAY });
    hr(p, M, H - M - 40, W - M, 1);
    let cx = M;
    const hy = H - M - 58;
    for (const c of cols) {
      p.drawText(c.label, { x: c.align === 'right' ? cx + c.w - textW(bold, c.label, 7.5) : cx, y: hy, size: 7.5, font: bold, color: GRAY });
      cx += c.w;
    }
    hr(p, M, hy - 6, W - M, 0.8);
    return hy - 6 - rowH;
  }

  items.forEach((it, i) => {
    if (rowsLeft <= 0) { page = pdf.addPage([W, H]); y = header(page); rowsLeft = Math.floor((y - M - 140) / rowH); }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH, color: ZEBRA });
    const cells: Record<string, string> = {
      date: it.expense_date || '—',
      cat: cap(it.category || 'other'),
      desc: truncate(it.description || '—', 28),
      vendor: truncate(it.vendor || '—', 16),
      amount: money(Number(it.amount || 0), it.currency || cur),
      status: cap(it.approval_status || 'pending'),
    };
    let cx = M;
    for (const c of cols) {
      const txt = cells[c.key];
      const color = c.key === 'status'
        ? (it.approval_status === 'approved' ? GREEN : it.approval_status === 'rejected' ? RED : AMBER)
        : INK;
      const tx = c.align === 'right' ? cx + c.w - textW(font, txt, 8.5) : cx;
      page.drawText(txt, { x: tx, y, size: 8.5, font, color });
      cx += c.w;
    }
    hr(page, M, y - 6, W - M, 0.3, LIGHT);
    y -= rowH;
    rowsLeft--;
  });

  // Totals box
  y -= 14;
  const boxX = W - M - 220;
  const lines: [string, string, any][] = [
    ['Total', money(Number(r.total_amount || 0), cur), INK],
    ['Approved', money(Number(r.approved_amount || 0), cur), GREEN],
    ['Rejected', money(Number(r.rejected_amount || 0), cur), RED],
    ['Pending', money(Number(r.pending_amount || 0), cur), AMBER],
  ];
  for (const [label, val, color] of lines) {
    page.drawText(label, { x: boxX, y, size: 9, font, color: GRAY });
    page.drawText(val, { x: W - M - textW(bold, val, 9), y, size: 9, font: bold, color });
    y -= 16;
  }

  if (r.review_notes) {
    y -= 8;
    page.drawText('Reviewer notes', { x: M, y, size: 8, font: bold, color: GRAY });
    y -= 12;
    for (const ln of wrap(r.review_notes, 95).slice(0, 6)) { page.drawText(ln, { x: M, y, size: 8.5, font, color: INK }); y -= 12; }
  }
  page.drawText(`Generated ${new Date().toISOString().slice(0, 10)}`, { x: M, y: M - 6, size: 7, font, color: GRAY });
}

// ---- helpers ----
function statusLabel(s: string): string {
  return ({ draft: 'Draft', submitted: 'Under review', partially_approved: 'Partially approved', approved: 'Approved', rejected: 'Rejected', reimbursed: 'Reimbursed' } as Record<string, string>)[s] || s;
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function extFor(filename?: string, ct?: string): string {
  const fromName = filename && filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  if (fromName) return fromName.replace(/[^a-z0-9]/g, '') || 'bin';
  if (ct?.includes('pdf')) return 'pdf';
  if (ct?.includes('png')) return 'png';
  if (ct?.includes('jpeg') || ct?.includes('jpg')) return 'jpg';
  if (ct?.includes('webp')) return 'webp';
  return 'bin';
}
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
function wrap(s: string, n: number): string[] {
  const words = String(s ?? '').split(/\s+/); const lines: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { if (cur) lines.push(cur); cur = w; } else { cur = (cur + ' ' + w).trim(); } }
  if (cur) lines.push(cur);
  return lines;
}
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
