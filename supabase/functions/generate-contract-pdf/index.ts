// generate-contract-pdf — renders a contract (title + terms + signature block) to a PDF and returns a
// signed URL. Closes the "a signed contract exists only as DB rows, nothing to download" gap.
// Auth: session JWT; the caller must be a member of the contract's workspace (userCanAccessWorkspace).
// The PDF is stored (overwritten) at pdf-documents/contract-output/{contract_id}.pdf (private bucket) and
// returned as a 7-day signed URL. Regenerated on demand — no stale persisted URL (invariant #8).
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { contractContentHash } from '../_shared/contract-hash.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PAGE_W = 595.28, PAGE_H = 841.89; // A4 portrait (pt)
const MARGIN = 56;


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
      // Does this document still say what the signatory agreed to? The hash is taken over the
      // same canonical terms `contracts-api` hashed at signing time (#356 `RC-1`). Printing the
      // verdict is the point: before this, an edited contract re-rendered with the original
      // signature block and looked exactly like the signed original.
      const currentHash = await contractContentHash(c as unknown as Record<string, unknown>);
      for (const s of sigs) {
        const when = s.signed_at ? new Date(s.signed_at).toISOString().slice(0, 10) : '—';
        drawText(`${s.signer_name || 'Signer'}${s.signer_email ? ` <${s.signer_email}>` : ''}`, 11, bold, ink, 3);
        drawText(`Signed ${when}${s.ip ? ` · IP ${s.ip}` : ''}${s.signer_role ? ` · ${s.signer_role}` : ''}`, 9, font, muted, 3);
        const sigHash = (s as { signed_content_sha256?: string | null }).signed_content_sha256;
        if (!sigHash) {
          // Signatures taken before RC-1 shipped carry no binding and never will. Saying so is
          // honest; printing nothing would let an unverifiable document read as a verified one.
          drawText('Content binding: not recorded (signed before content binding was introduced)', 8.5, font, muted, 8);
        } else if (sigHash === currentHash) {
          drawText(`Content verified · sha256 ${sigHash.slice(0, 16)}…`, 8.5, font, muted, 8);
        } else {
          drawText(
            'WARNING: the terms above have CHANGED since this signature was given. '
            + `Signed content sha256 ${sigHash.slice(0, 16)}… · current ${currentHash.slice(0, 16)}…`,
            8.5, bold, rgb(0.7, 0.1, 0.1), 8,
          );
        }
      }
    } else if (c.status === 'signed') {
      drawText('Signed (no signature record found).', 10, font, muted);
    } else {
      drawText('Not yet signed.', 10, font, muted);
    }

    const bytes = await pdf.save();

    // WHERE this is written depends on whether it is evidence (#356 `RC-1`).
    //
    // It used to be one fixed path with `upsert: true` for every render, so regenerating a
    // signed contract destroyed the signed artifact — the only copy of what the counterparty
    // received — and anyone holding the earlier link silently got the new terms instead.
    //
    // A signed contract therefore gets an immutable object, written ONCE. If one already
    // exists, this returns it rather than rendering over it: re-reading a concluded agreement
    // must not be able to change it. A draft keeps the old overwrite behaviour, because a draft
    // is a working copy and nobody has agreed to it.
    const isSigned = c.status === 'signed';
    const existingSignedPath = (c as { signed_pdf_path?: string | null }).signed_pdf_path ?? null;

    let path: string;
    let immutable = false;

    if (isSigned && existingSignedPath) {
      path = existingSignedPath;
      immutable = true;
    } else if (isSigned) {
      // Content-addressed, so re-signing genuinely different terms cannot collide with this one.
      const stamp = await contractContentHash(c as unknown as Record<string, unknown>);
      path = `contract-output/${contractId}/signed-${stamp.slice(0, 16)}.pdf`;
      const up = await svc.storage.from('pdf-documents')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      // A collision means a concurrent render already wrote this exact content — same bytes,
      // same path, so the existing object is the correct answer and the loser simply uses it.
      if (up.error && !/exists/i.test(up.error.message)) {
        throw new HttpError(500, `Storage upload failed: ${up.error.message}`);
      }
      // Record it so this branch is taken from now on, and so build_storage_reference_set()
      // protects the object from storage-orphan-cleanup-cron. Failing to record it would leave
      // the evidence unreferenced and therefore reapable, so this is not best-effort.
      const { error: pathErr } = await svc.from('contracts')
        .update({ signed_pdf_path: path }).eq('id', contractId).is('signed_pdf_path', null);
      if (pathErr) throw new HttpError(500, `Could not record the signed PDF path: ${pathErr.message}`);
      immutable = true;
    } else {
      path = `contract-output/${contractId}/draft.pdf`;
      const up = await svc.storage.from('pdf-documents')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (up.error) throw new HttpError(500, `Storage upload failed: ${up.error.message}`);
    }

    // Private bucket → never persist the URL, always re-sign on read.
    const signed = await svc.storage.from('pdf-documents').createSignedUrl(path, 7 * 24 * 3600);
    if (signed.error || !signed.data?.signedUrl) throw new HttpError(500, `Could not sign the PDF URL: ${signed.error?.message ?? 'unknown'}`);

    return json({
      success: true, url: signed.data.signedUrl, storage_path: path,
      immutable, page_count: pdf.getPageCount(),
    });
}));
