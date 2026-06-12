// Redeploy 2026-06-02: ensure the client-view + area_breakdown code actually
// lands (prior CI run no-op'd this function under parallel deploy).
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Type, Cache-Control, Connection',
  'Access-Control-Max-Age': '86400',
};

// Authenticate the caller. We accept either:
//   - The service role key (server-to-server from agent-chat / presentation-sheet-tool),
//     in which case ownership is verified upstream when the row is inserted.
//   - A user JWT, in which case the row's `created_by` MUST equal the JWT user.
// This closes a previously-open hole where the function blindly trusted any
// sheet_id, allowing a logged-in user to re-render someone else's sheet by
// passing the UUID. Sheet UUIDs leak through DB exports / shared screenshots
// / the React-Query cache, so "guessing is impractical" wasn't actually true.
async function authenticate(req: Request): Promise<{ success: boolean; userId?: string; isService?: boolean; error?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { success: false, error: 'Missing Authorization header' };

  // Service-role key path (internal callers)
  if (token === supabaseServiceKey) return { success: true, isService: true };

  // User JWT path — validate via the auth API
  try {
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data?.user?.id) return { success: false, error: 'Invalid JWT' };
    return { success: true, userId: data.user.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Auth verification failed' };
  }
}
import {
  fetchClientName,
  fetchMoodboard,
  fetchOwnerBranding,
  fetchProductChips,
  fetchQuoteFfeItems,
  fetchSheet,
  fetchSheets,
} from './data-fetcher.ts';
import {
  buildAnnotatedRender,
  buildAreaBreakdown,
  buildColorPalette,
  buildConceptBoard,
  buildElevationRenderPair,
  buildFfeSchedule,
  buildFullDeckCover,
  buildLightingPlan,
  buildPlumbingPlan,
  buildMaterialBoard,
  buildSheetForDeck,
  sheetLabel,
} from './builders.ts';
import { loadFonts } from './layout.ts';
import type {
  AnnotationData,
  SheetPdfRequest,
  SheetPdfResponse,
  TitleBlockData,
} from './types.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(withApiLogging('generate-moodboard-sheet-pdf', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const auth = await authenticate(req);
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let sheetId = '';

  try {
    const body: SheetPdfRequest = await req.json();

    // Project-level Client View deck — assembled from sheets across any of the
    // project's moodboards. Same builders, project scope. (Folded in here rather
    // than a separate function — see the merge-functions rule.)
    if (body.client_view_id) {
      return await buildClientViewPdf(supabase, auth, body.client_view_id, !!body.regenerate);
    }

    sheetId = body.sheet_id || '';
    if (!sheetId) {
      return jsonResponse({ success: false, error: 'Missing sheet_id or client_view_id' }, 400);
    }

    const sheet = await fetchSheet(supabase, sheetId);

    // Ownership check on user-JWT path. Service-role calls bypass this
    // because the upstream tool already verified moodboard ownership before
    // inserting the row.
    if (!auth.isService && auth.userId && sheet.created_by !== auth.userId) {
      return jsonResponse({ success: false, error: 'Not authorized for this sheet' }, 403);
    }

    await supabase
      .from('moodboard_presentation_sheets')
      .update({ status: 'generating' })
      .eq('id', sheetId);

    const moodboard = await fetchMoodboard(supabase, sheet.moodboard_id);
    const branding = sheet.created_by ? await fetchOwnerBranding(supabase, sheet.created_by) : undefined;
    const clientName = branding?.client_fallback_name;

    // Refuse to render an empty/no-content PDF. Same content rules as the
    // agent tool's validator. Marks the row as failed and returns 422 instead
    // of uploading a trash file to storage. Required content per type:
    //   material_board       — at least one product_id
    //   color_palette        — at least one swatch with hex
    //   concept_board        — at least one image in layout
    //   ffe_schedule         — quote_id or items[]
    //   full_deck            — included_sheet_ids[] + cover.title
    //   lighting_plan        — backdrop AND at least one symbol (canvas filled in)
    //   annotated_render     — backdrop_image_url AND at least one annotation
    //   elevation_render_pair— elevation_image_url AND at least one dimension OR tile_callout
    const contentError = validatePdfContent(sheet.sheet_type, sheet.data);
    if (contentError) {
      await supabase
        .from('moodboard_presentation_sheets')
        .update({ status: 'failed', error_message: contentError })
        .eq('id', sheetId);
      return jsonResponse({ success: false, error: contentError }, 422);
    }

    const pdfDoc = await PDFDocument.create();
    const fonts = await loadFonts(pdfDoc);

    const td: TitleBlockData = {
      project_title: moodboard.title,
      sheet_title: sheet.title,
      sheet_label: sheetLabel(sheet.sheet_type),
      date_iso: new Date().toISOString(),
      client_name: sheet.data?.cover?.client_name || clientName,
      branding_logo_url: branding?.logo_url,
      branding_company_name: branding?.company_name,
      branding_contact_line: branding?.contact_line,
    };

    let pageCount = 1;

    switch (sheet.sheet_type) {
      case 'material_board': {
        const ids: string[] = sheet.data.product_ids || [];
        const chips = await fetchProductChips(supabase, ids);
        if (sheet.data.chip_descriptions) {
          for (const chip of chips) {
            const custom = sheet.data.chip_descriptions[chip.product_id];
            if (custom) chip.description = custom;
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
        const ids = (sheet.data.annotations || [])
          .map((a: AnnotationData) => a.product_id)
          .filter((x: string | undefined): x is string => !!x);
        const chips = await fetchProductChips(supabase, ids);
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
        let items = sheet.data.items || [];
        if (sheet.data.quote_id && items.length === 0) {
          items = await fetchQuoteFfeItems(supabase, sheet.data.quote_id);
        }
        buildFfeSchedule(pdfDoc, fonts, td, items);
        break;
      }
      case 'area_breakdown':
        await buildAreaBreakdown(pdfDoc, fonts, td, sheet.data || {});
        break;
      case 'full_deck': {
        const includedIds: string[] = sheet.data.included_sheet_ids || [];
        const subSheets = await fetchSheets(supabase, includedIds);
        // Maintain user-specified order
        subSheets.sort((a, b) => includedIds.indexOf(a.id) - includedIds.indexOf(b.id));

        const cover = sheet.data.cover || {
          title: moodboard.title,
          description: moodboard.description || '',
          date: new Date().toISOString(),
        };
        await buildFullDeckCover(pdfDoc, fonts, td, cover);

        for (let i = 0; i < subSheets.length; i++) {
          await buildSheetForDeck(
            pdfDoc, fonts,
            { ...td, sheet_label: sheetLabel(subSheets[i].sheet_type) },
            subSheets[i],
            i + 2,
            subSheets.length + 1,
            (ids) => fetchProductChips(supabase, ids),
            (qid) => fetchQuoteFfeItems(supabase, qid),
          );
        }
        pageCount = subSheets.length + 1;
        break;
      }
      default:
        return jsonResponse({ success: false, error: `Unknown sheet_type: ${sheet.sheet_type}` }, 400);
    }

    pdfDoc.setTitle(`${moodboard.title} — ${sheet.title}`);
    pdfDoc.setSubject(sheetLabel(sheet.sheet_type));
    pdfDoc.setCreator('Material Kai');

    const pdfBytes = await pdfDoc.save();
    const storagePath = `moodboard-output/${sheet.moodboard_id}/sheet-${sheetId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('pdf-documents')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signed } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    await supabase
      .from('moodboard_presentation_sheets')
      .update({
        status: 'ready',
        pdf_storage_path: storagePath,
        pdf_url: signed?.signedUrl ?? null,
        pdf_generated_at: new Date().toISOString(),
        page_count: pageCount,
      })
      .eq('id', sheetId);

    // Track every render in ai_usage_logs — credit cost is 0 because the
    // creation already debited via the agent tool. This row gives admins
    // visibility on TOTAL render volume (initial + retry + duplicate-then-render
    // + live preview) so per-tool usage breakdown is accurate. The Operations
    // Dashboard groups ai_usage_logs by operation_type, so these will surface
    // automatically as "presentation_sheet_<type>_render".
    if (sheet.created_by) {
      supabase.from('ai_usage_logs').insert({
        user_id: sheet.created_by,
        operation_type: `presentation_sheet_${sheet.sheet_type}_render`,
        model_name: 'presentation-sheet-pdf',
        api_provider: 'platform',
        input_tokens: 0,
        output_tokens: 0,
        input_cost_usd: 0,
        output_cost_usd: 0,
        raw_cost_usd: 0,
        markup_multiplier: 1,
        billed_cost_usd: 0,
        credits_debited: 0,
        metadata: {
          feature: 'presentation_sheet',
          event: 'render',
          sheet_id: sheetId,
          sheet_type: sheet.sheet_type,
          moodboard_id: sheet.moodboard_id,
          page_count: pageCount,
        },
        created_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn('[render-log] insert failed (non-blocking):', error);
      });
    }

    const response: SheetPdfResponse = {
      success: true,
      pdf_url: signed?.signedUrl,
      pdf_storage_path: storagePath,
      page_count: pageCount,
    };
    return jsonResponse(response);
  } catch (err) {
    console.error('Sheet PDF generation error:', err);
    if (sheetId) {
      await supabase
        .from('moodboard_presentation_sheets')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', sheetId);
    }
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : 'PDF generation failed' },
      500,
    );
  }
}));

function jsonResponse(body: SheetPdfResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Render a project-level Client View into a single deck PDF. Reuses the exact
 * same builders as a moodboard full_deck (cover + each sheet in order), but the
 * sheet set spans every moodboard in the project. Mirrors the quote PDF flow:
 * pdf-documents storage, pdf_storage_path/pdf_generation_status columns, 7-day
 * signed URL, AFTER DELETE trigger cleanup.
 */
async function buildClientViewPdf(
  supabase: ReturnType<typeof createClient>,
  auth: { isService?: boolean; userId?: string },
  viewId: string,
  regenerate: boolean,
): Promise<Response> {
  try {
    const { data: view, error: viewErr } = await supabase
      .from('project_client_views')
      .select('id, project_id, created_by, title, sheet_ids, cover, pdf_storage_path, pdf_generation_status')
      .eq('id', viewId)
      .single();
    if (viewErr || !view) return jsonResponse({ success: false, error: 'Client view not found' }, 404);

    const { data: project } = await supabase
      .from('projects')
      .select('id, name, user_id')
      .eq('id', view.project_id)
      .single();

    if (!auth.isService && auth.userId) {
      const owns = view.created_by === auth.userId || project?.user_id === auth.userId;
      if (!owns) return jsonResponse({ success: false, error: 'Not authorized for this client view' }, 403);
    }

    if (!regenerate && view.pdf_storage_path && view.pdf_generation_status === 'completed') {
      const { data: signed } = await supabase.storage
        .from('pdf-documents')
        .createSignedUrl(view.pdf_storage_path, 60 * 60 * 24 * 7);
      return jsonResponse({ success: true, pdf_url: signed?.signedUrl, pdf_storage_path: view.pdf_storage_path });
    }

    await supabase.from('project_client_views').update({ pdf_generation_status: 'generating' }).eq('id', viewId);

    const sheetIds: string[] = Array.isArray(view.sheet_ids) ? view.sheet_ids : [];
    const sheets = await fetchSheets(supabase, sheetIds);
    sheets.sort((a, b) => sheetIds.indexOf(a.id) - sheetIds.indexOf(b.id));

    const ownerId = view.created_by || project?.user_id;
    const branding = ownerId ? await fetchOwnerBranding(supabase, ownerId) : undefined;

    const cover = (view.cover && Object.keys(view.cover).length > 0)
      ? { ...view.cover }
      : { title: view.title || project?.name || 'Client Presentation', date: new Date().toISOString() };
    if (!cover.date) cover.date = new Date().toISOString();
    if (!cover.title) cover.title = view.title || project?.name || 'Client Presentation';

    const pdfDoc = await PDFDocument.create();
    const fonts = await loadFonts(pdfDoc);

    const td: TitleBlockData = {
      project_title: project?.name || cover.title,
      sheet_title: cover.title,
      sheet_label: 'PRESENTATION DECK',
      date_iso: cover.date,
      client_name: cover.client_name || branding?.client_fallback_name,
      branding_logo_url: branding?.logo_url,
      branding_company_name: branding?.company_name,
      branding_contact_line: branding?.contact_line,
    };

    await buildFullDeckCover(pdfDoc, fonts, td, cover);
    for (let i = 0; i < sheets.length; i++) {
      await buildSheetForDeck(
        pdfDoc, fonts,
        { ...td, sheet_label: sheetLabel(sheets[i].sheet_type) },
        sheets[i], i + 2, sheets.length + 1,
        (ids) => fetchProductChips(supabase, ids),
        (qid) => fetchQuoteFfeItems(supabase, qid),
      );
    }
    const pageCount = sheets.length + 1;

    pdfDoc.setTitle(`${project?.name || ''} — ${cover.title}`);
    pdfDoc.setSubject('Client Presentation');
    pdfDoc.setCreator('Material Kai');

    const pdfBytes = await pdfDoc.save();
    const storagePath = `client-view-output/${view.project_id}/cv-${viewId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('pdf-documents')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signed } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    await supabase.from('project_client_views').update({
      pdf_storage_path: storagePath,
      pdf_generated_at: new Date().toISOString(),
      pdf_generation_status: 'completed',
      page_count: pageCount,
      error_message: null,
    }).eq('id', viewId);

    return jsonResponse({ success: true, pdf_url: signed?.signedUrl, pdf_storage_path: storagePath, page_count: pageCount });
  } catch (err) {
    console.error('Client view PDF error:', err);
    await supabase.from('project_client_views').update({
      pdf_generation_status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
    }).eq('id', viewId);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'PDF generation failed' }, 500);
  }
}

/**
 * Final pre-render content guard. Stricter than the agent-tool validator
 * because by render time the user has gone through the canvas — interactive
 * sheets must have non-empty annotations / dimensions / symbols, not just
 * the backdrop. Returns null if the sheet has enough content to render a
 * meaningful PDF, otherwise a human-readable reason that gets stored in
 * `error_message`.
 */
function validatePdfContent(sheet_type: string, data: Record<string, any> | undefined): string | null {
  const d = data || {};
  switch (sheet_type) {
    case 'material_board':
      if (!Array.isArray(d.product_ids) || d.product_ids.length === 0) {
        return 'No products selected — material_board needs at least one product_id.';
      }
      return null;
    case 'color_palette':
      if (!Array.isArray(d.swatches) || d.swatches.length === 0) {
        return 'No swatches — color_palette needs at least one {hex,name}.';
      }
      return null;
    case 'concept_board':
      if (!Array.isArray(d.layout) || d.layout.length === 0) {
        return 'No images — concept_board needs at least one entry in layout[].';
      }
      return null;
    case 'lighting_plan':
      if (!d.backdrop || !['upload', 'rect'].includes(d.backdrop.kind)) {
        return 'Missing backdrop — lighting_plan needs an uploaded floor plan or room dimensions.';
      }
      if (!Array.isArray(d.symbols) || d.symbols.length === 0) {
        return 'No fixture symbols placed — drop at least one symbol on the canvas before rendering.';
      }
      return null;
    case 'plumbing_plan':
      if (!d.backdrop || !['upload', 'rect'].includes(d.backdrop.kind)) {
        return 'Missing backdrop — plumbing_plan needs an uploaded floor plan or room dimensions.';
      }
      if (!Array.isArray(d.symbols) || d.symbols.length === 0) {
        return 'No plumbing symbols placed — drop at least one symbol on the canvas before rendering.';
      }
      return null;
    case 'annotated_render':
      if (!d.backdrop_image_url) return 'Missing backdrop_image_url for annotated_render.';
      if (!Array.isArray(d.annotations) || d.annotations.length === 0) {
        return 'No callouts placed — annotated_render needs at least one annotation.';
      }
      return null;
    case 'elevation_render_pair':
      if (!d.elevation_image_url) return 'Missing elevation_image_url for elevation_render_pair.';
      {
        const hasDims = Array.isArray(d.dimensions) && d.dimensions.length > 0;
        const hasTiles = Array.isArray(d.tile_callouts) && d.tile_callouts.length > 0;
        if (!hasDims && !hasTiles) {
          return 'No dimensions or tile callouts — elevation_render_pair needs at least one of either.';
        }
      }
      return null;
    case 'ffe_schedule': {
      const hasQuote = typeof d.quote_id === 'string' && d.quote_id.length > 0;
      const hasItems = Array.isArray(d.items) && d.items.length > 0;
      if (!hasQuote && !hasItems) return 'Missing quote_id or items[] for ffe_schedule.';
      return null;
    }
    case 'area_breakdown':
      if (!d.hero_image_url
        && !d.plan_image_url
        && !d.elevation_image_url
        && !(Array.isArray(d.finishes) && d.finishes.length)) {
        return 'area_breakdown needs at least a hero_image_url (or a plan/elevation image, or finishes).';
      }
      return null;
    case 'full_deck':
      if (!Array.isArray(d.included_sheet_ids) || d.included_sheet_ids.length === 0) {
        return 'No sheets selected — full_deck needs at least one entry in included_sheet_ids[].';
      }
      if (!d.cover || typeof d.cover.title !== 'string' || !d.cover.title) {
        return 'Missing cover.title for full_deck.';
      }
      return null;
  }
  return null;
}
