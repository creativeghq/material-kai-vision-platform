import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { fetchCatalog, fetchTemplate, fetchOwnerBranding, fetchStorageFile } from './data-fetcher.ts';
import { buildCatalogPDF } from './pdf-builder.ts';
import type { CatalogPDFRequest, CatalogPDFResponse } from './types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function authenticate(req: Request): Promise<{ ok: boolean; userId?: string; isService?: boolean; error?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, error: 'Missing Authorization header' };
  if (token === supabaseServiceKey) return { ok: true, isService: true };

  try {
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, error: 'Invalid JWT' };
    return { ok: true, userId: data.user.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Auth failed' };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const auth = await authenticate(req);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let catalogId = '';

  try {
    const body: CatalogPDFRequest = await req.json();
    catalogId = body.catalog_id;
    if (!catalogId) return jsonResponse({ success: false, error: 'Missing catalog_id' }, 400);

    const catalog = await fetchCatalog(supabase, catalogId);

    if (!auth.isService && auth.userId && catalog.owner_user_id !== auth.userId) {
      return jsonResponse({ success: false, error: 'Not authorized for this catalog' }, 403);
    }

    const totalMaterials = (catalog.body_data?.sections || []).reduce(
      (acc, s) => acc + (s.materials?.length || 0), 0,
    );
    if (totalMaterials === 0) {
      await supabase.from('presentation_catalogs')
        .update({ status: 'failed', status_message: 'No materials in catalog body' })
        .eq('id', catalogId);
      return jsonResponse({ success: false, error: 'Catalog has no materials' }, 422);
    }

    await supabase.from('presentation_catalogs')
      .update({ status: 'generating', status_message: null })
      .eq('id', catalogId);

    const template = await fetchTemplate(supabase, catalog.template_id);
    const branding = await fetchOwnerBranding(supabase, catalog.owner_user_id);

    const [coverBytes, bgBytes, backBytes] = await Promise.all([
      fetchStorageFile(supabase, 'quote-templates', template.cover_image_path),
      template.content_background_path
        ? fetchStorageFile(supabase, 'quote-templates', template.content_background_path)
        : Promise.resolve(null),
      fetchStorageFile(supabase, 'quote-templates', template.back_cover_image_path),
    ]);

    const { pdfBytes, pageCount } = await buildCatalogPDF({
      catalog,
      coverImageBytes: coverBytes,
      bgImageBytes: bgBytes,
      backCoverImageBytes: backBytes,
      accentHex: template.accent_color_hex,
      branding,
    });

    // Clear any previous output for this catalog before writing the new one, so
    // a rebuild deletes the prior PDF instead of accumulating timestamped files
    // under catalog-output/{catalogId}/ (2026-05-31 storage reorg).
    try {
      const { data: existing } = await supabase.storage
        .from('pdf-documents')
        .list(`catalog-output/${catalogId}`);
      if (existing && existing.length > 0) {
        await supabase.storage
          .from('pdf-documents')
          .remove(existing.map((f) => `catalog-output/${catalogId}/${f.name}`));
      }
    } catch (_) {
      // Best-effort: a failed cleanup should not block regeneration. The orphan
      // cron's grace sweep + the presentation_catalogs delete trigger backstop it.
    }

    const storagePath = `catalog-output/${catalogId}/catalog-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('pdf-documents')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    await supabase.from('presentation_catalogs')
      .update({
        status: catalog.status === 'published' ? 'published' : 'ready',
        status_message: null,
        pdf_storage_path: storagePath,
        pdf_url: signed?.signedUrl ?? null,
        pdf_generated_at: new Date().toISOString(),
        page_count: pageCount,
      })
      .eq('id', catalogId);

    return jsonResponse({
      success: true,
      pdf_url: signed?.signedUrl,
      pdf_storage_path: storagePath,
      page_count: pageCount,
    });
  } catch (err) {
    console.error('[generate-catalog-pdf] error:', err);
    if (catalogId) {
      await supabase.from('presentation_catalogs')
        .update({ status: 'failed', status_message: err instanceof Error ? err.message : String(err) })
        .eq('id', catalogId);
    }
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : 'PDF generation failed',
    }, 500);
  }
});

function jsonResponse(body: CatalogPDFResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
