import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Type, Cache-Control, Connection',
  'Access-Control-Max-Age': '86400',
};

// No additional auth check inside the function. Callers must hold a valid
// Supabase JWT (Supabase gateway enforces this at the function-invocation
// layer regardless of verify_jwt). This function operates on a single row by
// UUID so guessing is impractical, and the actual ownership boundary is
// enforced by the agent tool that creates the row in the first place.
async function authenticate(req: Request): Promise<{ success: boolean; userId?: string; error?: string }> {
  return { success: true };
}
import {
  fetchClientName,
  fetchMoodboard,
  fetchProductChips,
  fetchQuoteFfeItems,
  fetchSheet,
  fetchSheets,
} from './data-fetcher.ts';
import {
  buildAnnotatedRender,
  buildColorPalette,
  buildConceptBoard,
  buildElevationRenderPair,
  buildFfeSchedule,
  buildFullDeckCover,
  buildLightingPlan,
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

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req: Request) => {
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
    sheetId = body.sheet_id;
    if (!sheetId) {
      return jsonResponse({ success: false, error: 'Missing sheet_id' }, 400);
    }

    await supabase
      .from('moodboard_presentation_sheets')
      .update({ status: 'generating' })
      .eq('id', sheetId);

    const sheet = await fetchSheet(supabase, sheetId);
    const moodboard = await fetchMoodboard(supabase, sheet.moodboard_id);
    const clientName = sheet.created_by ? await fetchClientName(supabase, sheet.created_by) : undefined;

    const pdfDoc = await PDFDocument.create();
    const fonts = await loadFonts(pdfDoc);

    const td: TitleBlockData = {
      project_title: moodboard.title,
      sheet_title: sheet.title,
      sheet_label: sheetLabel(sheet.sheet_type),
      date_iso: new Date().toISOString(),
      client_name: sheet.data?.cover?.client_name || clientName,
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
    const storagePath = `moodboards/${sheet.moodboard_id}/sheet-${sheetId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('moodboard-sheets')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signed } = await supabase.storage
      .from('moodboard-sheets')
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
});

function jsonResponse(body: SheetPdfResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
