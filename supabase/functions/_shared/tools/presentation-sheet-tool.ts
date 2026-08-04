/**
 * Presentation Sheet Tool — generate_presentation_sheet
 *
 * Thin agent-facing wrapper. The actual create pipeline (ownership, auto-enhance,
 * credit debit, insert, render-or-canvas) lives in the `generate-moodboard-sheet-pdf`
 * edge function (action:'create') so the SAME path serves both the agent AND the
 * SheetWizardModal — no duplicated credit/auto-extract logic. This tool only:
 *   - handles the re-edit shortcut (sheet_id → re-open the canvas, no charge),
 *   - calls the edge function to create, and
 *   - translates the response into chat chunks (sheet_created / sheet_canvas_open
 *     / sheet_pdf_ready) so AgentHub mounts the right widget.
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
  | 'plumbing_plan'
  | 'annotated_render'
  | 'elevation_render_pair'
  | 'ffe_schedule'
  | 'area_breakdown'
  | 'full_deck';

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
      const { moodboard_id, sheet_type, title, auto_render, sheet_id, auto_enhance } = input;
      const initial_data = input.initial_data || {};

      try {
        // RE-EDIT — sheet_id provided: re-open the canvas with saved data. No
        // debit, no insert. (Ownership verified on the existing row.)
        if (sheet_id) {
          const { data: existing } = await supabase
            .from('moodboard_presentation_sheets')
            .select('id, sheet_type, title, data, moodboard_id, created_by')
            .eq('id', sheet_id)
            .maybeSingle();
          if (!existing) return JSON.stringify({ error: 'Sheet not found for re-edit' });
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

        // CREATE — delegate to the unified edge function (credits + auto-enhance +
        // insert + render all live there). This service-role invoke authenticates
        // as the service key; the user is passed explicitly as user_id.
        const { data: createRes, error: createErr } = await supabase.functions.invoke(
          'generate-moodboard-sheet-pdf',
          {
            body: {
              action: 'create',
              user_id: userId,
              moodboard_id,
              sheet_type,
              title,
              initial_data,
              auto_enhance,
              auto_render,
            },
          },
        );

        if (createErr || !createRes?.success) {
          return JSON.stringify({
            error: createRes?.error || createErr?.message || 'Failed to create sheet',
            ...(createRes?.validation_error ? { validation_error: true } : {}),
          });
        }

        try {
          onChunk?.({
            type: 'sheet_created',
            sheet_id: createRes.sheet_id,
            moodboard_id,
            sheet_type,
            title,
            credits_used: createRes.credits_charged ?? 0,
          });
        } catch { /* stream may be closed */ }

        // Interactive → mount the canvas widget; PDF deferred to "Render PDF".
        if (createRes.is_interactive) {
          try {
            onChunk?.({
              type: 'sheet_canvas_open',
              sheet_id: createRes.sheet_id,
              sheet_type,
              moodboard_id,
              initial_data: createRes.initial_data || {},
            });
          } catch { /* stream may be closed */ }
          return JSON.stringify({
            success: true,
            sheet_id: createRes.sheet_id,
            sheet_type,
            status: 'awaiting_canvas_input',
            credits_charged: createRes.credits_charged,
            message: `Sheet created. Finish it in the canvas widget, then click Render PDF.`,
          });
        }

        // Passive → rendered already; show the PDF.
        try {
          onChunk?.({
            type: 'sheet_pdf_ready',
            sheet_id: createRes.sheet_id,
            sheet_type,
            title,
            pdf_url: createRes.pdf_url,
            page_count: createRes.page_count ?? 1,
          });
        } catch { /* stream may be closed */ }
        return JSON.stringify({
          success: true,
          sheet_id: createRes.sheet_id,
          sheet_type,
          status: 'ready',
          pdf_url: createRes.pdf_url,
          page_count: createRes.page_count ?? 1,
          credits_charged: createRes.credits_charged,
        });
      } catch (err) {
        console.error('[generate_presentation_sheet] error', err);
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'generate_presentation_sheet',
      description:
        'Create a presentation sheet attached to a moodboard. Sheet types (credit cost): ' +
        'material_board (selected materials, 1 credit), color_palette (extracted colors, 2), ' +
        'concept_board (inspiration collage, 1), lighting_plan (fixture layout, 3), ' +
        'plumbing_plan (top-down plumbing fixture layout — WC/basin/bath/shower/floor drain/supply/waste/water heater — 3), ' +
        'electrical_plan (top-down electrical layout — sockets/switches/dimmer/distribution board/data/TV/dedicated points/junction/earth — 3), ' +
        'annotated_render (render with AI-detected callouts, 4), ' +
        'elevation_render_pair (uploaded elevation + render with user dimensions, 3), ' +
        'ffe_schedule (FF&E table from quote, 1), ' +
        'area_breakdown (single composited board: hero render + dimensioned plan + elevation + ' +
        'finishes + fitting columns + palette, 2), full_deck (multi-page deck with cover + reorder canvas, 5). ' +
        'Passive types (material_board, color_palette, concept_board, ffe_schedule, area_breakdown) ' +
        'generate the PDF immediately. Interactive types (lighting_plan, plumbing_plan, electrical_plan, annotated_render, ' +
        'elevation_render_pair, full_deck) open a canvas widget for user input first. ALWAYS pass a sensible ' +
        'initial_data payload — see the schema for each sheet_type.',
      schema: z.object({
        moodboard_id: z.string().uuid().describe('UUID of the moodboard the sheet attaches to'),
        sheet_type: z.enum([
          'material_board',
          'color_palette',
          'concept_board',
          'lighting_plan',
          'plumbing_plan',
          'electrical_plan',
          'annotated_render',
          'elevation_render_pair',
          'ffe_schedule',
          'area_breakdown',
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
          }).optional().describe('lighting_plan / plumbing_plan / electrical_plan: floor plan backdrop'),
          symbols: z.array(z.object({
            type: z.enum([
              // lighting_plan
              'recessed', 'pendant', 'wall', 'spot', 'led_strip', 'floor', 'table',
              // plumbing_plan
              'wc', 'basin', 'bath', 'shower', 'floor_drain', 'water_supply', 'waste', 'water_heater', 'mixer',
              // electrical_plan
              'socket', 'socket_double', 'switch_1way', 'switch_2way', 'dimmer', 'distribution_board',
              'data_outlet', 'tv_outlet', 'dedicated_point', 'junction_box', 'earth_point',
            ]),
            x: z.number().describe('Normalized 0..1 in backdrop'),
            y: z.number().describe('Normalized 0..1 in backdrop'),
            label: z.string().optional(),
            product_id: z.string().uuid().optional()
              .describe('Catalog product this fixture is. Drives the SCHEDULE (quantity take-off) on the sheet.'),
          })).optional().describe('lighting_plan / plumbing_plan / electrical_plan: fixture symbols'),
          runs: z.array(z.object({
            id: z.string(),
            kind: z.string().describe(
              'electrical: lighting_circuit | socket_circuit | dedicated_circuit | switch_leg; ' +
              'plumbing: cold_supply | hot_supply | waste',
            ),
            from: z.string().describe('id of the symbol the run starts at'),
            to: z.string().describe('id of the symbol the run ends at'),
            vertices: z.array(z.object({ x: z.number(), y: z.number() })).optional()
              .describe('Intermediate corners so a run follows walls instead of cutting through them'),
            label: z.string().optional(),
            props: z.object({
              current_a: z.number().optional(),
              csa_mm2: z.number().optional(),
              phases: z.union([z.literal(1), z.literal(3)]).optional(),
            }).optional().describe(
              'Electrical parameters. Only set these when the user actually specified them — ' +
              'they drive a voltage-drop verdict printed on the sheet, and a guessed cable size ' +
              'produces an authoritative-looking check of something nobody chose.',
            ),
          })).optional().describe(
            'Pipe / cable runs joining symbols. Requires symbols to carry ids. ' +
            'Drawn on the plan and keyed in a SERVICES block.',
          ),
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
          // area_breakdown — single composited design board
          subtitle: z.string().optional().describe('area_breakdown: e.g. "Modern Bathroom Design"'),
          hero_image_url: z.string().optional().describe('area_breakdown: main room render'),
          plan_image_url: z.string().optional().describe('area_breakdown: dimensioned plan / layout image'),
          elevation_image_url: z.string().optional().describe('area_breakdown: elevation / front-view image'),
          finishes: z.array(z.object({
            label: z.string().describe('e.g. "Wall Tile"'),
            spec: z.string().optional().describe('e.g. "Matt Stone Finish — Light Grey"'),
            hex: z.string().optional().describe('swatch color #rrggbb when no image'),
            image_url: z.string().optional(),
          })).optional().describe('area_breakdown: Material & Finishes column'),
          fitting_columns: z.array(z.object({
            title: z.string().describe('e.g. "Sanitary Ware & Fittings"'),
            items: z.array(z.object({
              label: z.string(),
              note: z.string().optional(),
            })),
          })).optional().describe('area_breakdown: 1–3 titled accessory/fitting columns'),
          notes: z.array(z.string()).optional().describe('area_breakdown: bullet notes'),
          features: z.array(z.string()).optional().describe('area_breakdown: optional key-feature chips'),
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
