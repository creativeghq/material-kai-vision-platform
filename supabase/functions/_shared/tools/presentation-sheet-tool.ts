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

const SHEET_CREDITS: Record<SheetType, number> = {
  material_board: 0,
  color_palette: 0,
  concept_board: 0,
  ffe_schedule: 0,
  lighting_plan: 3,
  annotated_render: 3,
  elevation_render_pair: 2,
  full_deck: 3,
};

const PASSIVE_TYPES: SheetType[] = [
  'material_board',
  'color_palette',
  'concept_board',
  'ffe_schedule',
  'full_deck',
];

const INTERACTIVE_TYPES: SheetType[] = [
  'lighting_plan',
  'annotated_render',
  'elevation_render_pair',
];

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
    }) => {
      const { moodboard_id, sheet_type, title, initial_data, auto_render } = input;

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
            total_cost_usd: creditCost / 100,
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
            await supabase.rpc('debit_user_credits', {
              p_user_id: userId,
              p_amount: -creditCost,
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
          return JSON.stringify({
            success: false,
            sheet_id: sheet.id,
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
        auto_render: z.boolean().optional().describe(
          'For interactive sheet types only. If true, skip the canvas step and render the PDF immediately ' +
          '(useful when the agent has already gathered all annotations). Default false.',
        ),
      }),
    },
  );
};
