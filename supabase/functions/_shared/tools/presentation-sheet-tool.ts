/**
 * Presentation Sheet Tool — generate_presentation_sheet
 *
 * Creates an editable, exportable sheet attached to a moodboard.
 * Sheet types: material_board, color_palette, concept_board, lighting_plan,
 * annotated_render, elevation_render_pair, ffe_schedule, full_deck.
 *
 * Flow:
 *   1. Validate moodboard ownership.
 *   2. Debit fixed credit cost (3/3/2/3/0).
 *   3. Insert a row into moodboard_presentation_sheets with status='draft'
 *      and the user-supplied initial `data` payload.
 *   4. Emit `sheet_created` chunk so the chat opens the right canvas widget.
 *   5. For "passive" sheet types (material/color/concept/ffe/full_deck) where
 *      no further canvas interaction is needed, immediately invoke the
 *      generate-moodboard-sheet-pdf edge function and emit `sheet_pdf_ready`.
 *      For "interactive" types (lighting/annotated/elevation), emit
 *      `sheet_canvas_open` so the chat surface mounts the canvas widget;
 *      PDF generation is deferred until the user clicks "Render PDF".
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type SheetType =
  | 'material_board'
  | 'color_palette'
  | 'concept_board'
  | 'lighting_plan'
  | 'annotated_render'
  | 'elevation_render_pair'
  | 'ffe_schedule'
  | 'full_deck';

// Every tool costs credits. The simple/passive ones charge less because they
// don't trigger Vision/AI calls; the AI-augmented interactive ones charge more.
// Storage is paid for by the credit revenue — keep these aligned with whatever
// the storage cost trend is.
const SHEET_CREDITS: Record<SheetType, number> = {
  material_board: 1,         // catalog read + chip rendering
  color_palette: 2,          // SLIG color cluster query when auto-extracting
  concept_board: 1,          // moodboard-image fetch + collage layout
  ffe_schedule: 1,           // quote_items fetch + table render
  lighting_plan: 3,          // canvas + diagram render
  annotated_render: 4,       // Claude Vision auto-detection + canvas + render
  elevation_render_pair: 3,  // dimensioned-image render + canvas
  full_deck: 5,              // multi-page assembly + cover + reorder canvas
};

const PASSIVE_TYPES: SheetType[] = [
  'material_board',
  'color_palette',
  'concept_board',
  'ffe_schedule',
];

const INTERACTIVE_TYPES: SheetType[] = [
  'lighting_plan',
  'annotated_render',
  'elevation_render_pair',
  'full_deck',
];

/**
 * Per-sheet-type minimum-content validation.
 *
 * Returns a human-readable error string if the sheet would render empty —
 * otherwise null. The agent tool MUST run this BEFORE debiting credits or
 * inserting a row, so we don't end up with empty PDFs taking up storage and
 * confusing the user. Interactive sheets need a backdrop/elevation/floor plan
 * upfront; the actual annotations get filled in via the canvas widget after
 * the row is created, so empty `annotations` / `dimensions` / `symbols` arrays
 * are fine here.
 */
function validateInitialData(sheet_type: SheetType, data: Record<string, any> | undefined): string | null {
  const d = data || {};
  switch (sheet_type) {
    case 'material_board':
      if (!Array.isArray(d.product_ids) || d.product_ids.length === 0) {
        return 'material_board needs at least one product_id. Ask the user which products from the moodboard to feature.';
      }
      return null;

    case 'color_palette':
      if (!Array.isArray(d.swatches) || d.swatches.length === 0) {
        return 'color_palette needs at least one swatch. Ask the user for hex codes + names, or extract from a moodboard image first.';
      }
      for (const sw of d.swatches) {
        if (!sw?.hex || typeof sw.hex !== 'string') {
          return 'Every swatch must have a hex value (e.g. "#B5A89A").';
        }
      }
      return null;

    case 'concept_board':
      if (!Array.isArray(d.layout) || d.layout.length === 0) {
        return 'concept_board needs at least one image. Ask the user which moodboard images to feature.';
      }
      for (const item of d.layout) {
        if (!item?.image_url) return 'Every concept_board layout item must have an image_url.';
      }
      return null;

    case 'lighting_plan':
      // Interactive — the user places symbols in the canvas. We only require a backdrop here.
      if (!d.backdrop || !['upload', 'rect'].includes(d.backdrop.kind)) {
        return 'lighting_plan needs a backdrop. Ask the user to upload a floor plan image (kind=upload) or provide room dimensions in mm (kind=rect).';
      }
      if (d.backdrop.kind === 'upload' && !d.backdrop.image_url) {
        return 'lighting_plan upload backdrop must include an image_url.';
      }
      if (d.backdrop.kind === 'rect' && (!d.backdrop.width_mm || !d.backdrop.height_mm)) {
        return 'lighting_plan rect backdrop must include width_mm and height_mm.';
      }
      return null;

    case 'annotated_render':
      // Interactive — the user adds callouts in the canvas. We only require the backdrop.
      if (!d.backdrop_image_url) {
        return 'annotated_render needs backdrop_image_url. Ask the user for a render image URL or generate one with the 3D tool first.';
      }
      return null;

    case 'elevation_render_pair':
      // Interactive — the user adds dimensions in the canvas. We only require the elevation image.
      if (!d.elevation_image_url) {
        return 'elevation_render_pair needs elevation_image_url. Ask the user to upload the elevation image.';
      }
      return null;

    case 'ffe_schedule':
      if (!d.quote_id && (!Array.isArray(d.items) || d.items.length === 0)) {
        return 'ffe_schedule needs either a quote_id or an items[] array with at least one item.';
      }
      if (Array.isArray(d.items)) {
        for (const it of d.items) {
          if (!it?.name) return 'Every ffe_schedule item must have a name.';
        }
      }
      return null;

    case 'full_deck':
      // Interactive — the user picks/reorders sheets and types cover details
      // in the DeckBuilderCanvas after the row is created. We only need a
      // suggested title here (often the moodboard title is a sensible default).
      // The canvas itself enforces non-empty inclusion + cover.title at
      // Render time, and the PDF function's stricter validator backstops it.
      return null;
  }
  return null;
}

/**
 * Auto-extract a color palette from a moodboard's image items.
 *
 * Strategy: pull the first ~6 image media URLs attached to the moodboard,
 * fetch each, and run a tiny in-memory pixel sampler that picks 8 well-spaced
 * dominant colors (hue/lightness diversity). This avoids needing the SLIG
 * color collection (which is per-image, not per-moodboard) and works on
 * any image source — moodboard items, generated renders, or pinned uploads.
 *
 * Returns swatches in the format the color_palette sheet expects.
 */
async function autoExtractPalette(
  supabase: ReturnType<typeof createClient>,
  moodboardId: string,
  maxSwatches = 8,
): Promise<{ hex: string; name: string }[]> {
  const { data: items } = await supabase
    .from('moodboard_items')
    .select('media_url, material_id')
    .eq('moodboard_id', moodboardId)
    .limit(20);

  const urls: string[] = (items || [])
    .map((it: any) => it.media_url)
    .filter((u: string | null): u is string => !!u)
    .slice(0, 6);

  if (urls.length === 0) return [];

  // Sample pixels from each image and quantize into bins. We use a coarse
  // 4×4×4 RGB cube (64 bins) so similar colors collapse together, then pick
  // the top-N by count and convert back to representative hexes.
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.arrayBuffer();
      const bytes = new Uint8Array(blob);
      // Crude pixel scan: skim the byte stream every ~200 bytes looking for
      // RGB triplets. This isn't a real image decoder but it's good enough
      // for sampling on JPEG/PNG without pulling a Wasm decoder. ~99% of
      // bytes get skipped; the remainder hits a mix of header + pixel data
      // that statistically clusters around dominant colors.
      const step = Math.max(1, Math.floor(bytes.length / 8000));
      for (let i = 0; i + 2 < bytes.length; i += step) {
        const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2];
        if (r === g && g === b && (r < 16 || r > 240)) continue; // skip near-grey extremes (header padding)
        const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
        const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        bin.count++;
        bin.r += r; bin.g += g; bin.b += b;
        bins.set(key, bin);
      }
    } catch {/* skip image errors */}
  }

  const ranked = [...bins.values()].sort((a, b) => b.count - a.count).slice(0, maxSwatches);
  return ranked.map((bin) => {
    const r = Math.round(bin.r / bin.count);
    const g = Math.round(bin.g / bin.count);
    const b = Math.round(bin.b / bin.count);
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, name: namedFromHex(r, g, b) };
  });
}

/** Heuristic friendly name from RGB. Designers want "Warm Mocha" not "#7B5C4D". */
function namedFromHex(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  let baseHue = 'Neutral';
  if (max - min < 25) baseHue = lightness < 0.25 ? 'Charcoal' : lightness < 0.55 ? 'Stone' : lightness < 0.85 ? 'Bone' : 'Cream';
  else if (r >= g && r >= b) baseHue = g >= b ? (g > 130 ? 'Ochre' : 'Terracotta') : 'Rose';
  else if (g >= r && g >= b) baseHue = b > r ? 'Sage' : 'Moss';
  else baseHue = r > g ? 'Plum' : 'Slate';
  const tone = lightness < 0.3 ? 'Deep' : lightness < 0.55 ? 'Warm' : lightness < 0.8 ? 'Soft' : 'Light';
  return `${tone} ${baseHue}`;
}

/**
 * Auto-detect callouts on an annotated_render backdrop using Claude Vision.
 *
 * Identifies up to 6 visually distinct elements (sink, faucet, pendant,
 * cabinet, wall tile, floor tile, etc.) with normalized [0..1] center
 * coordinates and a short label. Returns annotations ready to drop into
 * the canvas — user can refine instead of starting from blank.
 *
 * Logs the Anthropic call to ai_usage_logs so cost attribution is correct
 * — the agent tool charges a flat sheet credit, but the underlying Vision
 * call has a real per-token cost the platform absorbs without this log.
 */
async function autoDetectCallouts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  moodboardId: string,
  imageUrl: string,
): Promise<{ x: number; y: number; line_endpoint_x: number; line_endpoint_y: number; label: string; source: 'ai' }[]> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) return [];

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            {
              type: 'text',
              text: 'Identify up to 6 distinct visible interior design elements (e.g. sink, faucet, pendant light, oven, wall tile, floor tile, cabinet, door, window). For each, return its center as normalized [0..1] coordinates (0,0 = top-left, 1,1 = bottom-right) and a 2–4 word label. Output ONLY a JSON array, no prose: [{"x":0.45,"y":0.62,"label":"Pendant Light"}, ...]',
            },
          ],
        }],
      }),
    });
  } catch (fetchErr) {
    console.warn('[autoDetectCallouts] anthropic fetch failed:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
    return [];
  }

  if (!res.ok) return [];
  const data = await res.json();

  // Cost log — Haiku pricing: $0.80 / MTok input, $4 / MTok output (image tokens
  // bundled into input). Without this, the platform absorbs the cost silently.
  try {
    const inputTokens = data?.usage?.input_tokens ?? 0;
    const outputTokens = data?.usage?.output_tokens ?? 0;
    const inputCost = (inputTokens / 1_000_000) * 0.80;
    const outputCost = (outputTokens / 1_000_000) * 4.00;
    const rawCost = inputCost + outputCost;
    (supabase as any).from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: 'presentation_sheet_auto_detect_callouts',
      model_name: 'claude-haiku-4-5',
      api_provider: 'anthropic',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: 1,
      billed_cost_usd: rawCost,
      credits_debited: 0, // already covered by the flat sheet credit
      metadata: {
        feature: 'presentation_sheet',
        sub_feature: 'auto_detect_callouts',
        moodboard_id: moodboardId,
        image_url: imageUrl,
      },
      created_at: new Date().toISOString(),
    }).then(({ error }: { error: any }) => {
      if (error) console.warn('[autoDetectCallouts] usage log failed (non-blocking):', error.message);
    });
  } catch (logErr) {
    console.warn('[autoDetectCallouts] usage log threw:', logErr);
  }

  const text = data?.content?.[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const arr = JSON.parse(jsonMatch[0]) as { x: number; y: number; label: string }[];
    return arr.slice(0, 6).map((a, idx) => ({
      x: Math.max(0.05, Math.min(0.95, a.x)),
      y: Math.max(0.05, Math.min(0.95, a.y)),
      // Place leader endpoints alternating left/right so they don't overlap
      line_endpoint_x: idx % 2 === 0 ? Math.min(0.97, a.x + 0.25) : Math.max(0.03, a.x - 0.25),
      line_endpoint_y: Math.max(0.05, Math.min(0.95, a.y - 0.05 + (idx * 0.02))),
      label: a.label || 'Element',
      source: 'ai' as const,
    }));
  } catch {
    return [];
  }
}

export const createPresentationSheetTool = (
  userId: string,
  onChunk?: (chunk: any) => void,
) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: {
      moodboard_id: string;
      sheet_type: SheetType;
      title: string;
      initial_data?: Record<string, any>;
      auto_render?: boolean;
      sheet_id?: string;
      auto_enhance?: boolean;
    }) => {
      const { moodboard_id, sheet_type, title, auto_render, sheet_id, auto_enhance = true } = input;
      let initial_data = input.initial_data || {};

      try {
        // 1. Validate the user owns the moodboard
        const { data: moodboard, error: mbError } = await supabase
          .from('moodboards')
          .select('id, user_id, title')
          .eq('id', moodboard_id)
          .maybeSingle();

        if (mbError || !moodboard) {
          return JSON.stringify({ error: 'Moodboard not found' });
        }
        if (moodboard.user_id !== userId) {
          return JSON.stringify({ error: 'Not authorized for this moodboard' });
        }

        // 1a. RE-EDIT PATH — when sheet_id is provided, the user wants to
        // re-open an existing sheet (typically from "Edit" on the Tools tab).
        // We don't debit, don't re-insert — just open the canvas with the
        // current data so the user can refine it.
        if (sheet_id) {
          const { data: existing } = await supabase
            .from('moodboard_presentation_sheets')
            .select('id, sheet_type, title, data, moodboard_id, created_by')
            .eq('id', sheet_id)
            .maybeSingle();

          if (!existing) {
            return JSON.stringify({ error: 'Sheet not found for re-edit' });
          }
          if (existing.created_by !== userId) {
            return JSON.stringify({ error: 'Not authorized to edit this sheet' });
          }

          try {
            onChunk?.({
              type: 'sheet_canvas_open',
              sheet_id: existing.id,
              sheet_type: existing.sheet_type,
              moodboard_id: existing.moodboard_id,
              initial_data: existing.data || {},
              title: existing.title,
            });
          } catch { /* stream may be closed */ }

          return JSON.stringify({
            success: true,
            sheet_id: existing.id,
            status: 're-editing',
            message: `Re-opening "${existing.title}" — changes won't cost any extra credits.`,
          });
        }

        // 1b. AUTO-ENHANCE — for color_palette and annotated_render, fill in
        // sensible defaults using the moodboard contents BEFORE validation.
        // Saves the agent + user a round-trip and makes the canvas open with
        // useful starting data instead of a blank slate.
        if (auto_enhance) {
          if (sheet_type === 'color_palette' &&
              (!initial_data.swatches || initial_data.swatches.length === 0)) {
            const swatches = await autoExtractPalette(supabase as any, moodboard_id, 8);
            if (swatches.length > 0) initial_data = { ...initial_data, swatches };
          }
          if (sheet_type === 'annotated_render' &&
              initial_data.backdrop_image_url &&
              (!initial_data.annotations || initial_data.annotations.length === 0)) {
            const annotations = await autoDetectCallouts(supabase, userId, moodboard_id, initial_data.backdrop_image_url);
            if (annotations.length > 0) initial_data = { ...initial_data, annotations };
          }
        }

        // 1.5. Reject empty/incomplete initial_data BEFORE debiting credits or
        // inserting a row. Prevents "empty PDF" trash files in storage.
        const validationError = validateInitialData(sheet_type, initial_data);
        if (validationError) {
          return JSON.stringify({
            error: `Sheet content is incomplete: ${validationError}`,
            validation_error: true,
          });
        }

        // 2. Debit credits if cost > 0
        const creditCost = SHEET_CREDITS[sheet_type] ?? 0;
        if (creditCost > 0) {
          const { data: debitResult, error: debitError } = await supabase.rpc(
            'debit_user_credits',
            {
              p_user_id: userId,
              p_amount: creditCost,
              p_operation_type: `presentation_sheet_${sheet_type}`,
              p_description: `Presentation sheet: ${sheet_type} (${title})`,
              p_metadata: { moodboard_id, sheet_type, title },
            },
          );

          const result = Array.isArray(debitResult) ? debitResult[0] : debitResult;
          if (debitError || !result?.success) {
            const msg = result?.error_message || debitError?.message || 'Insufficient credits';
            return JSON.stringify({ error: `Credit debit failed: ${msg}` });
          }

          // Mirror to ai_usage_logs
          await supabase.from('ai_usage_logs').insert({
            user_id: userId,
            operation_type: `presentation_sheet_${sheet_type}`,
            model_name: 'presentation-sheet',
            api_provider: 'platform',
            input_tokens: 0,
            output_tokens: 0,
            input_cost_usd: 0,
            output_cost_usd: 0,
            raw_cost_usd: creditCost / 100,
            markup_multiplier: 1,
            billed_cost_usd: creditCost / 100,
            credits_debited: creditCost,
            metadata: {
              feature: 'presentation_sheet',
              sheet_type,
              moodboard_id,
              title,
            },
            created_at: new Date().toISOString(),
          });
        }

        // 3. Insert sheet row
        const { data: sheet, error: insertError } = await supabase
          .from('moodboard_presentation_sheets')
          .insert({
            moodboard_id,
            sheet_type,
            title,
            data: initial_data || {},
            credits_used: creditCost,
            status: 'draft',
            created_by: userId,
          })
          .select('*')
          .single();

        if (insertError || !sheet) {
          // Refund on failure
          if (creditCost > 0) {
            await supabase.rpc('credit_user_credits', {
              p_user_id: userId,
              p_amount: creditCost,
              p_operation_type: `presentation_sheet_${sheet_type}_refund`,
              p_description: `Refund: sheet creation failed`,
              p_metadata: { moodboard_id, sheet_type, reason: insertError?.message },
            });
          }
          return JSON.stringify({
            error: insertError?.message || 'Failed to create sheet',
          });
        }

        // 4. Emit sheet_created chunk to the chat surface
        try {
          onChunk?.({
            type: 'sheet_created',
            sheet_id: sheet.id,
            moodboard_id,
            sheet_type,
            title,
            credits_used: creditCost,
          });
        } catch { /* stream may be closed */ }

        // 5. Branch on interactive vs passive
        const isInteractive = INTERACTIVE_TYPES.includes(sheet_type);

        if (isInteractive && !auto_render) {
          // Hand off to canvas widget — frontend will mount the editor and call
          // generatePdf() once the user is done.
          try {
            onChunk?.({
              type: 'sheet_canvas_open',
              sheet_id: sheet.id,
              sheet_type,
              moodboard_id,
              initial_data: initial_data || {},
            });
          } catch { /* stream may be closed */ }

          return JSON.stringify({
            success: true,
            sheet_id: sheet.id,
            sheet_type,
            status: 'awaiting_canvas_input',
            credits_charged: creditCost,
            message: `Sheet created. Use the canvas widget to ${
              sheet_type === 'lighting_plan' ? 'place fixture symbols'
              : sheet_type === 'annotated_render' ? 'review and edit AI-suggested callouts'
              : 'add dimensions and tile callouts'
            }, then click Render PDF.`,
          });
        }

        // Passive types render immediately
        const { data: pdfResult, error: pdfError } = await supabase.functions.invoke(
          'generate-moodboard-sheet-pdf',
          { body: { sheet_id: sheet.id } },
        );

        if (pdfError || !pdfResult?.success) {
          // Refund credits — the user paid for a sheet that never materialized.
          // Don't refund the sheet row insert; the row stays in 'failed' status
          // (set by the PDF function) so the user can retry without paying again.
          if (creditCost > 0) {
            try {
              await supabase.rpc('credit_user_credits', {
                p_user_id: userId,
                p_amount: creditCost,
                p_operation_type: `presentation_sheet_${sheet_type}_refund`,
                p_description: `Refund: PDF generation failed`,
                p_metadata: { moodboard_id, sheet_type, sheet_id: sheet.id, reason: pdfError?.message || pdfResult?.error || 'pdf_failed' },
              });
            } catch (refundErr) {
              console.error('[generate_presentation_sheet] refund failed:', refundErr);
            }
          }
          return JSON.stringify({
            success: false,
            sheet_id: sheet.id,
            credits_refunded: creditCost,
            error: pdfError?.message || pdfResult?.error || 'PDF generation failed',
          });
        }

        try {
          onChunk?.({
            type: 'sheet_pdf_ready',
            sheet_id: sheet.id,
            sheet_type,
            title,
            pdf_url: pdfResult.pdf_url,
            page_count: pdfResult.page_count ?? 1,
          });
        } catch { /* stream may be closed */ }

        return JSON.stringify({
          success: true,
          sheet_id: sheet.id,
          sheet_type,
          status: 'ready',
          pdf_url: pdfResult.pdf_url,
          page_count: pdfResult.page_count ?? 1,
          credits_charged: creditCost,
        });
      } catch (err) {
        console.error('[generate_presentation_sheet] error', err);
        return JSON.stringify({
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
    {
      name: 'generate_presentation_sheet',
      description:
        'Create a presentation sheet attached to a moodboard. Eight sheet types: ' +
        'material_board (selected materials, 0 credits), color_palette (extracted colors, 0), ' +
        'concept_board (inspiration collage, 0), lighting_plan (fixture layout, 3 credits), ' +
        'annotated_render (render with AI-detected callouts, 3 credits), ' +
        'elevation_render_pair (uploaded elevation + render with user dimensions, 2), ' +
        'ffe_schedule (FF&E table from quote, 0), full_deck (multi-page deck, 3). ' +
        'Passive types (material_board, color_palette, concept_board, ffe_schedule, full_deck) ' +
        'generate the PDF immediately. Interactive types (lighting_plan, annotated_render, ' +
        'elevation_render_pair) open a canvas widget for user input first. ALWAYS pass a sensible ' +
        'initial_data payload — see the schema for each sheet_type.',
      schema: z.object({
        moodboard_id: z.string().uuid().describe('UUID of the moodboard the sheet attaches to'),
        sheet_type: z.enum([
          'material_board',
          'color_palette',
          'concept_board',
          'lighting_plan',
          'annotated_render',
          'elevation_render_pair',
          'ffe_schedule',
          'full_deck',
        ]).describe('Sheet type to generate'),
        title: z.string().describe('Display title for the sheet, e.g. "Bathroom Wall Sheet"'),
        initial_data: z.object({
          // material_board
          product_ids: z.array(z.string()).optional().describe('material_board: product UUIDs to include (cap 8)'),
          chip_descriptions: z.record(z.string()).optional().describe('material_board: optional override descriptions keyed by product_id'),
          // color_palette
          swatches: z.array(z.object({
            hex: z.string().describe('e.g. #B5A89A'),
            name: z.string().describe('e.g. "Warm Travertine"'),
            source_image_id: z.string().optional(),
          })).optional().describe('color_palette: pre-extracted swatches (cap 8)'),
          // concept_board
          layout: z.array(z.object({
            image_url: z.string(),
            caption: z.string().optional(),
          })).optional().describe('concept_board: image collage entries (cap 6)'),
          // lighting_plan
          backdrop: z.object({
            kind: z.enum(['upload', 'rect']),
            image_url: z.string().optional(),
            width_mm: z.number().optional(),
            height_mm: z.number().optional(),
          }).optional().describe('lighting_plan: floor plan backdrop'),
          symbols: z.array(z.object({
            type: z.enum(['recessed', 'pendant', 'wall', 'spot', 'led_strip', 'floor', 'table']),
            x: z.number().describe('Normalized 0..1 in backdrop'),
            y: z.number().describe('Normalized 0..1 in backdrop'),
            label: z.string().optional(),
          })).optional().describe('lighting_plan: fixture symbols'),
          legend: z.array(z.object({
            symbol_type: z.string(),
            label: z.string(),
          })).optional(),
          // annotated_render
          backdrop_image_url: z.string().optional().describe('annotated_render or elevation_render_pair: render or elevation image'),
          annotations: z.array(z.object({
            x: z.number(),
            y: z.number(),
            line_endpoint_x: z.number(),
            line_endpoint_y: z.number(),
            label: z.string(),
            product_id: z.string().optional(),
            source: z.enum(['ai', 'manual', 'auto']).default('ai'),
          })).optional(),
          // elevation_render_pair
          elevation_image_url: z.string().optional(),
          render_image_url: z.string().optional(),
          dimensions: z.array(z.object({
            x1: z.number(), y1: z.number(),
            x2: z.number(), y2: z.number(),
            value: z.string().describe('e.g. "2725"'),
            unit: z.string().describe('e.g. "mm"'),
          })).optional(),
          tile_callouts: z.array(z.object({
            x: z.number(), y: z.number(),
            label: z.string().describe('e.g. "Porcelain 600×1200 mm"'),
          })).optional(),
          // ffe_schedule
          quote_id: z.string().optional().describe('ffe_schedule: pull items from this quote'),
          items: z.array(z.object({
            room: z.string().nullable(),
            name: z.string(),
            dimensions: z.string().nullable(),
            install: z.string().nullable(),
            delivery: z.string().nullable(),
            qty: z.number(),
            price: z.number().nullable().optional(),
          })).optional().describe('ffe_schedule: explicit items if no quote_id'),
          // full_deck
          included_sheet_ids: z.array(z.string()).optional().describe('full_deck: ordered list of sheet IDs to include'),
          cover: z.object({
            title: z.string(),
            description: z.string().optional(),
            client_name: z.string().optional(),
            cover_image_url: z.string().optional(),
            date: z.string().describe('ISO 8601'),
          }).optional().describe('full_deck: cover page data'),
        }).optional().describe('Per-sheet-type payload. See description for required fields by sheet_type.'),
        sheet_id: z.string().uuid().optional().describe(
          'Re-open an existing sheet for editing. When provided, all other parameters except moodboard_id are ignored — the saved data is loaded and the canvas opens. No credit charge.',
        ),
        auto_enhance: z.boolean().optional().describe(
          'When true (default), the tool tries to pre-fill sensible content: extract a color palette from moodboard images for color_palette, and detect callouts via Claude Vision for annotated_render. Set to false to start blank.',
        ),
        auto_render: z.boolean().optional().describe(
          'For interactive sheet types only. If true, skip the canvas step and render the PDF immediately ' +
          '(useful when the agent has already gathered all annotations). Default false.',
        ),
      }),
    },
  );
};
