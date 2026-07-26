// generate-contract-pdf — renders a contract (title + terms + signature block) to a PDF and returns a
// signed URL. Closes the "a signed contract exists only as DB rows, nothing to download" gap.
//
// Auth: session JWT; the caller must be a member of the contract's workspace (userCanAccessWorkspace).
// The PDF is stored (overwritten) at pdf-documents/contract-output/{contract_id}.pdf (private bucket) and
// returned as a 7-day signed URL. Regenerated on demand — no stale persisted URL (invariant #8).
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PAGE_W = 595.28, PAGE_H = 841.89; // A4 portrait (pt)
const MARGIN = 56;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Word-wrap `text` to `maxWidth` at `size`, returning lines. Preserves blank lines between paragraphs. */
function wrapLines(text: string, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? '').replace(/\r/g, '').split('\n')) {
    if (para.trim() === '') { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

Deno.serve(withApiLogging('generate-contract-pdf', async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    await bootstrapForFunction();

    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const contractId = String(body?.contract_id ?? '').trim();
    if (!contractId) return json({ error: 'contract_id is required' }, 400);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: c } = await svc.from('contracts').select('*').eq('id', contractId).maybeSingle();
    if (!c) return json({ error: 'not found' }, 404);
    // Tenancy: the caller must belong to the contract's workspace. 404 (not 403) to avoid id enumeration.
    if (!(await userCanAccessWorkspace(svc, auth.userId, c.workspace_id))) return json({ error: 'not found' }, 404);

    const { data: sigs } = await svc.from('contract_signatures').select('*').eq('contract_id', contractId).order('signed_at', { ascending: true });

    // ── Render ────────────────────────────────────────────────────────────────
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    const contentW = PAGE_W - MARGIN * 2;
    const ink = rgb(0.1, 0.1, 0.1), muted = rgb(0.42, 0.42, 0.42);

    const ensureSpace = (needed: number) => {
      if (y - needed < MARGIN) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    };
    const drawText = (text: string, size: number, f = font, color = ink, gap = 4) => {
      for (const line of wrapLines(text, f, size, contentW)) {
        ensureSpace(size + gap);
        if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color });
        y -= size + gap;
      }
    };

    // Header
    drawText(String(c.title ?? 'Contract'), 20, bold, ink, 6);
    const meta: string[] = [];
    if (c.contract_type) meta.push(`Type: ${String(c.contract_type).replace(/_/g, ' ')}`);
    if (c.counterparty_name) meta.push(`Counterparty: ${c.counterparty_name}`);
    if (c.value != null) meta.push(`Value: ${c.value} ${c.currency || ''}`.trim());
    if (c.effective_date) meta.push(`Effective: ${c.effective_date}`);
    if (c.expiry_date) meta.push(`Expires: ${c.expiry_date}`);
    meta.push(`Status: ${c.status}`);
    y -= 4;
    drawText(meta.join('   ·   '), 9, font, muted, 4);
    y -= 10;
    // Divider
    ensureSpace(12);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) });
    y -= 16;

    // Terms
    if (c.body_markdown) {
      drawText(c.body_markdown, 10.5, font, ink, 4);
    } else {
      drawText('(No contract terms were recorded.)', 10.5, font, muted, 4);
    }

    // Signature block
    y -= 24;
    ensureSpace(80);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) });
    y -= 18;
    drawText('Signatures', 13, bold, ink, 6);
    if (sigs && sigs.length > 0) {
      for (const s of sigs) {
        const when = s.signed_at ? new Date(s.signed_at).toISOString().slice(0, 10) : '—';
        drawText(`${s.signer_name || 'Signer'}${s.signer_email ? ` <${s.signer_email}>` : ''}`, 11, bold, ink, 3);
        drawText(`Signed ${when}${s.ip ? ` · IP ${s.ip}` : ''}${s.signer_role ? ` · ${s.signer_role}` : ''}`, 9, font, muted, 8);
      }
    } else if (c.status === 'signed') {
      drawText('Signed (no signature record found).', 10, font, muted);
    } else {
      drawText('Not yet signed.', 10, font, muted);
    }

    const bytes = await pdf.save();

    // Store (overwrite) + return a fresh signed URL. Private bucket → never persist the URL.
    const path = `contract-output/${contractId}.pdf`;
    const up = await svc.storage.from('pdf-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw new HttpError(500, `Storage upload failed: ${up.error.message}`);
    const signed = await svc.storage.from('pdf-documents').createSignedUrl(path, 7 * 24 * 3600);
    if (signed.error || !signed.data?.signedUrl) throw new HttpError(500, `Could not sign the PDF URL: ${signed.error?.message ?? 'unknown'}`);

    return json({ success: true, url: signed.data.signedUrl, storage_path: path, page_count: pdf.getPageCount() });
}));
