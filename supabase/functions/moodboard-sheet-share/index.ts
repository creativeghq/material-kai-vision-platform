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

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { recordPageEvent } from '../_shared/document-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Return a fresh signed URL for a deliverable PDF, rebuilding it first if the
 * storage-retention sweep has purged the file (pdf_storage_path nulled). The
 * renderer accepts the service-role key (ownership verified when the row was
 * created), so a stale shared link transparently re-renders — no credit cost.
 * Best-effort: if regeneration fails the page still renders its non-PDF content.
 */
async function ensureDeliverablePdf(
  supabase: DbClient,
  regenBody: Record<string, unknown>,
  table: 'project_client_views' | 'moodboard_presentation_sheets',
  id: string,
  currentPath: string | null,
): Promise<string | null> {
  let path = currentPath;
  if (!path) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/generate-moodboard-sheet-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(regenBody),
      });
      const { data: fresh } = await supabase
        .from(table).select('pdf_storage_path').eq('id', id).maybeSingle();
      path = (fresh as { pdf_storage_path: string | null } | null)?.pdf_storage_path ?? null;
    } catch (_) {
      /* best-effort */
    }
  }
  if (!path) return null;
  const { data: signed } = await supabase.storage
    .from('pdf-documents').createSignedUrl(path, 60 * 60);
  return signed?.signedUrl ?? null;
}

Deno.serve(withApiLogging('moodboard-sheet-share', async (req: Request) => {
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
    .select('id, project_id, created_by, title, cover, sheet_ids, pdf_storage_path, public_share_enabled, share_expires_at, embed_vr, embed_lighting, embed_ffe, feedback_enabled, vr_world_id, quote_id, embed_room_plan, room_layout_id')
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
      // Only accept a sheet_id that actually belongs to THIS client view — an anonymous
      // commenter shouldn't be able to pin feedback to an arbitrary/other-tenant sheet id.
      const fbSheetId = (typeof feedback.sheet_id === 'string'
        && Array.isArray(view.sheet_ids)
        && view.sheet_ids.includes(feedback.sheet_id))
        ? feedback.sheet_id
        : null;
      const { error: fErr } = await supabase.from('client_view_feedback').insert({
        client_view_id: view.id,
        sheet_id: fbSheetId,
        author_name: typeof feedback.author_name === 'string' ? feedback.author_name.slice(0, 120) : null,
        session_id: typeof session_id === 'string' ? session_id : null,
        kind,
        status,
        body: typeof feedback.body === 'string' ? feedback.body.slice(0, 4000) : null,
      });
      if (fErr) return jsonResponse({ error: 'Could not save feedback' }, 500);
      // Flows — notify the deliverable owner that a client responded. Resolve the owning
      // workspace via the project so tenant-scoped flows match. Best-effort.
      try {
        const { data: proj } = await supabase
          .from('projects').select('workspace_id, name').eq('id', view.project_id).maybeSingle();
        const authorName = typeof feedback.author_name === 'string' ? feedback.author_name.slice(0, 120) : 'A client';
        const verb = status === 'approved' ? 'approved' : status === 'changes_requested' ? 'requested changes on' : 'commented on';
        await emitFlowEvent('client_view_feedback_received', {
          type: 'client_view_feedback_received',
          workspace_id: (proj as any)?.workspace_id ?? null,
          user_id: view.created_by,
          client_view_id: view.id,
          project_id: view.project_id,
          project_name: (proj as any)?.name ?? null,
          view_title: view.title,
          kind, status,
          author_name: authorName,
          comment: typeof feedback.body === 'string' ? feedback.body.slice(0, 300) : null,
          title: `${authorName} ${verb} "${view.title}"`,
          body: typeof feedback.body === 'string' && feedback.body.trim()
            ? `${authorName} ${verb} the deliverable: "${String(feedback.body).slice(0, 200)}"`
            : `${authorName} ${verb} the deliverable "${view.title}".`,
          action_url: `/projects/${view.project_id}?tab=client-view`,
        });
      } catch { /* best-effort — never fail the public feedback write on a flow emit */ }
      return jsonResponse({ success: true });
    }

    // Read path — delivery trail first (the source the project list reads),
    // then the legacy counter the client-view UI still renders.
    recordPageEvent(supabase, req, 'viewed', {
      entityType: 'client_view',
      entityId: view.id,
      ownerUserId: view.created_by ?? null,
      metadata: { surface: 'client_view', project_id: view.project_id },
    }).catch(() => {});
    supabase.rpc('increment_client_view_count', { p_view_id: view.id }).then(() => {}, () => {});

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

    const pdf_url = await ensureDeliverablePdf(
      supabase,
      { client_view_id: view.id, regenerate: true },
      'project_client_views',
      view.id,
      view.pdf_storage_path,
    );

    // ── Tenancy binding for the EMBEDDED artifacts (#365 AD-26) ──────────────────────────────
    //
    // The ids below come from the view row rather than the request, so a token holder cannot
    // inject one — but nothing checked that the linked quote / VR world / room plan belongs to the
    // same workspace as the view itself. These reads run on the SERVICE ROLE, so RLS is not
    // standing behind them: a client_view row that ends up pointing at another tenant's quote
    // hands that quote — with its prices — to whoever holds this token. Same shape as FE-16
    // (#351): a token scoped to one document serving a second.
    //
    // Resolve the view's workspace once and require every embedded artifact to match it.
    const { data: ownerProject } = await supabase
      .from('projects').select('workspace_id').eq('id', view.project_id).maybeSingle();
    const viewWorkspaceId = (ownerProject as { workspace_id: string } | null)?.workspace_id ?? null;

    /** An artifact is servable only if it is in the view's workspace. Unknown → withheld. */
    const belongsToView = (row: { workspace_id?: string | null } | null | undefined): boolean => {
      if (!row) return false;
      // An UNRESOLVED verdict withholds. If we could not establish the view's workspace, we
      // cannot establish that the artifact is in it, and serving on a maybe is how this class of
      // bug ships.
      if (!viewWorkspaceId) return false;
      return row.workspace_id === viewWorkspaceId;
    };

    let vr_world: any = null;
    if (view.embed_vr && view.vr_world_id) {
      const { data: w } = await supabase
        .from('vr_worlds')
        .select('id, status, workspace_id, splat_url_100k, splat_url_500k, splat_url_full, panorama_url, thumbnail_url')
        .eq('id', view.vr_world_id).maybeSingle();
      if (w && w.status === 'completed' && belongsToView(w)) {
        const { workspace_id: _ws, ...safe } = w as Record<string, unknown>;
        vr_world = safe;
      } else if (w && !belongsToView(w)) {
        console.error(`[moodboard-sheet-share] vr_world ${view.vr_world_id} is not in the view's workspace — withheld`);
      }
    }

    let ffe: any = null;
    if (view.embed_ffe && view.quote_id) {
      const { data: q } = await supabase
        .from('quotes')
        .select('currency, subtotal, vat_rate, vat_amount, grand_total, workspace_id')
        .eq('id', view.quote_id).maybeSingle();
      // A quote carries money. Serving one from another workspace is the worst version of this,
      // so the mismatch withholds the whole FFE block rather than any part of it.
      const quoteServable = !!q && belongsToView(q);
      if (q && !quoteServable) {
        console.error(`[moodboard-sheet-share] quote ${view.quote_id} is not in the view's workspace — withheld`);
      }
      const { data: items } = quoteServable
        ? await supabase
            .from('quote_items')
            .select('room, name, dimensions, quantity, unit_price, line_total, custom_product_name, products(name)')
            .eq('quote_id', view.quote_id)
            .order('added_at', { ascending: true })
        : { data: null };
      ffe = !quoteServable ? null : {
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

    // The room plan (#259 Ph4). Read through the RESOLVED view, so the client sees the same
    // footprints the designer arranged — the size comes from the product's measured model, and a
    // second copy of that resolution here would be free to disagree with the planner.
    //
    // Service role, so `embed_room_plan` is the access control: a plan attached but not toggled on
    // must not be reachable by holding the token.
    let room_plan: unknown = null;
    if (view.embed_room_plan && view.room_layout_id) {
      const { data: plan } = await supabase
        .from('room_layouts')
        .select('id, name, workspace_id, room_width_m, room_depth_m, room_height_m')
        .eq('id', view.room_layout_id)
        .maybeSingle();
      if (plan && !belongsToView(plan)) {
        console.error(`[moodboard-sheet-share] room_layout ${view.room_layout_id} is not in the view's workspace — withheld`);
      } else if (plan) {
        const { data: placed } = await supabase
          .from('room_layout_items_resolved')
          .select('id, product_name, x_m, y_m, rotation_deg, effective_width_m, effective_depth_m')
          .eq('layout_id', view.room_layout_id);
        const { data: faces } = await supabase
          .from('room_layout_surfaces_resolved')
          .select('surface, product_name, area_m2')
          .eq('layout_id', view.room_layout_id);
        room_plan = {
          name: plan.name,
          width_m: Number(plan.room_width_m),
          depth_m: Number(plan.room_depth_m),
          items: (placed || []).map((i: any) => ({
            id: i.id,
            name: i.product_name ?? 'Item',
            x_m: Number(i.x_m),
            y_m: Number(i.y_m),
            rotation_deg: Number(i.rotation_deg),
            width_m: Number(i.effective_width_m),
            depth_m: Number(i.effective_depth_m),
          })),
          // No prices. This is the client's copy of the arrangement; what it costs is the FF&E
          // section's job, and only when the designer turned that on.
          surfaces: (faces || []).map((f: any) => ({
            surface: f.surface,
            name: f.product_name ?? null,
            area_m2: Number(f.area_m2),
          })),
        };
      }
    }

    // WS4 #285 — the handover snag list. ONLY client_visible snags, and only the fields a client
    // needs: no assignee, no internal description, no severity triage. This runs on the service
    // role, so the `client_visible` filter here IS the access control — RLS is not in play.
    const { data: snagRows } = await supabase
      .from('project_snags')
      .select('id, title, status, room_id, photo_paths, resolved_at, project_rooms(name)')
      .eq('project_id', view.project_id)
      .eq('client_visible', true)
      .order('created_at', { ascending: true });

    const snags = (snagRows || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      room: s.project_rooms?.name ?? null,
      resolved: ['fixed', 'verified', 'wont_fix'].includes(s.status),
      photo_urls: (s.photo_paths || []).map(
        (p: string) => supabase.storage.from('generation-images').getPublicUrl(p).data.publicUrl,
      ),
    }));

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
        room_plan,
        snags,
      },
    });
  }

  // ---------- 2. SINGLE SHEET token ----------
  const { data: sheet, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, sheet_type, title, status, page_count, pdf_storage_path, share_expires_at, share_view_count, created_by')
    .eq('share_token', token)
    .maybeSingle();

  if (error || !sheet) {
    return jsonResponse({ sheet: null, pdf_url: null, expired: false });
  }

  const exp = sheet.share_expires_at ? new Date(sheet.share_expires_at).getTime() : 0;
  if (!exp || exp < Date.now()) {
    return jsonResponse({ sheet: null, pdf_url: null, expired: true });
  }

  // Delivery trail. This REPLACES a read-modify-write `share_view_count = x + 1`,
  // which lost every concurrent view: two clients opening the sheet in the same
  // moment both read N and both wrote N+1. The append-only trail cannot lose a
  // write, and dedupe/bot-filtering now happen once, in SQL.
  recordPageEvent(supabase, req, 'viewed', {
    entityType: 'moodboard_sheet',
    entityId: sheet.id,
    ownerUserId: sheet.created_by ?? null,
    metadata: { surface: 'sheet_share', sheet_type: sheet.sheet_type },
  }).catch(() => {});

  // Legacy counter kept in step for the existing sheet UI, now via an atomic
  // increment rather than read-modify-write. It is a CACHED COPY — the derived
  // answer is get_document_delivery(), and finance.document_view_count_drift
  // compares the two.
  supabase.rpc('bump_legacy_view_counter', {
    p_table: 'moodboard_presentation_sheets',
    p_id: sheet.id,
  }).then(() => {}, () => {});

  const pdf_url = await ensureDeliverablePdf(
    supabase,
    { sheet_id: sheet.id },
    'moodboard_presentation_sheets',
    sheet.id,
    sheet.pdf_storage_path,
  );

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
}));

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
