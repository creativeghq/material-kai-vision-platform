/**
 * Public share lookup for presentation artifacts. Handles BOTH:
 *   1. A single moodboard presentation sheet  → { sheet, pdf_url, expired }
 *   2. A project Client View deliverable       → { client_view }  (+ feedback write)
 *
 * One function, two token namespaces (random uuids, no collision). The client
 * view path was folded in here rather than living in its own function — see the
 * merge-functions rule.
 *
 * POST /functions/v1/moodboard-sheet-share
 *   { token }                                  → sheet OR client_view payload
 *   { token, feedback, session_id }            → write client feedback
 *
 * Anonymous-friendly: the gateway accepts the project anon key in
 * Authorization: Bearer, then the service role is used internally to bypass RLS.
 */

import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { token, session_id, feedback } = await req.json().catch(() => ({}));

  if (!token || typeof token !== 'string' || token.length < 32) {
    return jsonResponse({ error: 'Invalid token' }, 400);
  }

  // ---------- 1. CLIENT VIEW token? ----------
  const { data: view } = await supabase
    .from('project_client_views')
    .select('id, project_id, title, cover, sheet_ids, pdf_storage_path, ' +
      'public_share_enabled, share_expires_at, embed_vr, embed_lighting, embed_ffe, ' +
      'feedback_enabled, vr_world_id, quote_id')
    .eq('public_share_token', token)
    .maybeSingle();

  if (view) {
    if (!view.public_share_enabled) return jsonResponse({ client_view: null, not_found: true });
    if (view.share_expires_at && new Date(view.share_expires_at).getTime() < Date.now()) {
      return jsonResponse({ client_view: null, not_found: true });
    }

    // Feedback write path
    if (feedback && typeof feedback === 'object') {
      if (!view.feedback_enabled) return jsonResponse({ error: 'Feedback disabled' }, 403);
      const kind = ['comment', 'approval', 'change_request'].includes(feedback.kind) ? feedback.kind : 'comment';
      const status = ['approved', 'changes_requested'].includes(feedback.status) ? feedback.status : null;
      const { error: fErr } = await supabase.from('client_view_feedback').insert({
        client_view_id: view.id,
        sheet_id: feedback.sheet_id ?? null,
        author_name: typeof feedback.author_name === 'string' ? feedback.author_name.slice(0, 120) : null,
        session_id: typeof session_id === 'string' ? session_id : null,
        kind,
        status,
        body: typeof feedback.body === 'string' ? feedback.body.slice(0, 4000) : null,
      });
      if (fErr) return jsonResponse({ error: 'Could not save feedback' }, 500);
      return jsonResponse({ success: true });
    }

    // Read path
    supabase.rpc('increment_client_view_count', { p_view_id: view.id }).then(() => {}).catch(() => {});

    const { data: project } = await supabase
      .from('projects').select('name').eq('id', view.project_id).maybeSingle();

    const sheetIds: string[] = Array.isArray(view.sheet_ids) ? view.sheet_ids : [];
    let sheets: { id: string; sheet_type: string; title: string }[] = [];
    let lightingImageUrl: string | null = null;
    if (sheetIds.length > 0) {
      const { data: rows } = await supabase
        .from('moodboard_presentation_sheets')
        .select('id, sheet_type, title, data')
        .in('id', sheetIds);
      const byId = new Map((rows || []).map((r: any) => [r.id, r]));
      const ordered = sheetIds.map((id) => byId.get(id)).filter(Boolean) as any[];
      sheets = ordered.map((r) => ({ id: r.id, sheet_type: r.sheet_type, title: r.title }));
      lightingImageUrl = deriveLightingImage(ordered) || (view.cover?.cover_image_url ?? null);
    }

    let pdf_url: string | null = null;
    if (view.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from('pdf-documents').createSignedUrl(view.pdf_storage_path, 60 * 60);
      pdf_url = signed?.signedUrl ?? null;
    }

    let vr_world: any = null;
    if (view.embed_vr && view.vr_world_id) {
      const { data: w } = await supabase
        .from('vr_worlds')
        .select('id, status, splat_url_100k, splat_url_500k, splat_url_full, panorama_url, thumbnail_url')
        .eq('id', view.vr_world_id).maybeSingle();
      if (w && w.status === 'completed') vr_world = w;
    }

    let ffe: any = null;
    if (view.embed_ffe && view.quote_id) {
      const { data: q } = await supabase
        .from('quotes')
        .select('currency, subtotal, vat_rate, vat_amount, grand_total')
        .eq('id', view.quote_id).maybeSingle();
      const { data: items } = await supabase
        .from('quote_items')
        .select('room, name, dimensions, quantity, unit_price, line_total, custom_product_name, products(name)')
        .eq('quote_id', view.quote_id)
        .order('added_at', { ascending: true });
      ffe = {
        currency: q?.currency || 'EUR',
        subtotal: q?.subtotal != null ? Number(q.subtotal) : null,
        vat_rate: q?.vat_rate != null ? Number(q.vat_rate) : null,
        vat_amount: q?.vat_amount != null ? Number(q.vat_amount) : null,
        grand_total: q?.grand_total != null ? Number(q.grand_total) : null,
        items: (items || []).map((it: any) => ({
          room: it.room ?? null,
          name: it.products?.name || it.custom_product_name || it.name || 'Item',
          dimensions: it.dimensions ?? null,
          quantity: it.quantity ?? 1,
          unit_price: it.unit_price != null ? Number(it.unit_price) : null,
          line_total: it.line_total != null ? Number(it.line_total) : null,
        })),
      };
    }

    return jsonResponse({
      not_found: false,
      client_view: {
        id: view.id,
        title: view.title,
        project_name: project?.name ?? null,
        cover: view.cover ?? {},
        sheets,
        pdf_url,
        embed_vr: view.embed_vr,
        embed_lighting: view.embed_lighting,
        embed_ffe: view.embed_ffe,
        feedback_enabled: view.feedback_enabled,
        vr_world,
        ffe,
        lighting_image_url: view.embed_lighting ? lightingImageUrl : null,
      },
    });
  }

  // ---------- 2. SINGLE SHEET token ----------
  const { data: sheet, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, sheet_type, title, status, page_count, pdf_storage_path, share_expires_at, share_view_count')
    .eq('share_token', token)
    .maybeSingle();

  if (error || !sheet) {
    return jsonResponse({ sheet: null, pdf_url: null, expired: false });
  }

  const exp = sheet.share_expires_at ? new Date(sheet.share_expires_at).getTime() : 0;
  if (!exp || exp < Date.now()) {
    return jsonResponse({ sheet: null, pdf_url: null, expired: true });
  }

  supabase
    .from('moodboard_presentation_sheets')
    .update({ share_view_count: (sheet.share_view_count ?? 0) + 1 })
    .eq('id', sheet.id)
    .then(() => {});

  let pdf_url: string | null = null;
  if (sheet.pdf_storage_path) {
    const { data: signed } = await supabase.storage
      .from('pdf-documents').createSignedUrl(sheet.pdf_storage_path, 60 * 60);
    pdf_url = signed?.signedUrl ?? null;
  }

  return jsonResponse({
    sheet: {
      id: sheet.id,
      sheet_type: sheet.sheet_type,
      title: sheet.title,
      status: sheet.status,
      page_count: sheet.page_count,
    },
    pdf_url,
    expired: false,
  });
});

/** Pick a representative image for the client view's CSS lighting-mood preview. */
function deriveLightingImage(orderedSheets: any[]): string | null {
  for (const s of orderedSheets) {
    const d = s?.data || {};
    if (d.hero_image_url) return d.hero_image_url;
    if (d.backdrop_image_url) return d.backdrop_image_url;
    if (d.render_image_url) return d.render_image_url;
    if (Array.isArray(d.layout) && d.layout[0]?.image_url) return d.layout[0].image_url;
  }
  return null;
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
