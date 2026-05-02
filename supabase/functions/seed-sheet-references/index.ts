/**
 * One-shot admin endpoint: generate 8 reference images via Gemini and upload
 * them into the public `moodboard-sheet-references` bucket as
 * `<sheet_type>.png`. Used to seed the SheetTypePreviewModal so users see a
 * real example of every sheet type.
 *
 * POST /functions/v1/seed-sheet-references
 *   { types?: string[]   // optional subset; default: all 8
 *   , model?: 'flash' | 'pro' // default: 'flash' (faster, cheaper for static refs)
 *   , overwrite?: boolean // default: false; skip types that already have an image
 *   }
 *
 * Auth: requires the platform admin secret in `x-admin-secret` header (the
 * project SUPABASE_SERVICE_ROLE_KEY env var). Not user-callable.
 *
 * Why: a stable static asset is a one-time admin task. Putting the image
 * generation inside an edge function means we can re-run it later (e.g. to
 * refresh the look) without distributing the GOOGLE_API_KEY locally.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SHEET_TYPES = [
  'material_board',
  'color_palette',
  'concept_board',
  'lighting_plan',
  'annotated_render',
  'elevation_render_pair',
  'ffe_schedule',
  'full_deck',
] as const;

type SheetType = typeof SHEET_TYPES[number];

/** Every prompt produces the SAME architectural style — like sheets from a
 *  studio's permit set or designer portfolio. Reference visual language:
 *  Rayon AXO sheets, growarq detailing, Studio Baroli wardrobe drawings,
 *  Armenian/Russian bathroom-and-kitchen elevation+render combos.
 *
 *  HARD RULES — every prompt MUST honor these:
 *    - White or off-white A3 landscape paper background. Generous margins.
 *    - Thin black architectural line work and/or soft hand-illustrated
 *      axonometrics in muted greys, creams, sages. NEVER bold colorful design.
 *    - Small dimension lines in red with small black or grey numbers (only
 *      where structurally meaningful — not on every drawing).
 *    - Labels are tiny, lowercase or small-caps, sans-serif, attached to
 *      elements via THIN black leader lines. Never page-level headers.
 *    - NO logos, NO studio branding, NO watermarks, NO "MATERIAL BOARD" /
 *      "ELEVATION" / "COLOR PALETTE" titles, NO giant project banners.
 *    - Looks like a single sheet from a working drawing set, not an infographic.
 */
const PROMPTS: Record<SheetType, string> = {
  // Architectural sheet showing material samples DRAWN as small swatches with
  // thin leader lines — like the right column of a Rayon AXO sheet, full-page.
  material_board:
    'A single A3 landscape architectural sheet on white paper. Centered composition: a 4×2 grid of small rectangular material thumbnails drawn as flat soft-edged rectangles in muted realistic colors — warm travertine, white-oak veneer, brushed brass, cream linen weave, terracotta tile, polished concrete, woven jute, soft limestone. Each thumbnail is roughly 8cm wide. Beside each rectangle: 1–2 lines of tiny lowercase sans-serif text giving a short technical name and finish ("travertine — honed", "oak — natural #W-610", "brass — brushed", etc.) connected to the swatch with a very fine black hairline. Generous white margins. Bottom-right corner has a tiny architectural drawing-number block (like "M-001" in a thin-rule rectangle) drawn small. NO logo, NO studio branding, NO big header, NO project title, NO date. Pure architectural-portfolio aesthetic, like a single page from a permit set documenting finishes.',

  // Architectural color study — small color blocks drawn directly on the sheet
  // with thin pencil-style boundaries and tiny technical labels.
  color_palette:
    'A single A3 landscape architectural sheet on white paper. Centered: a horizontal row of 6 large rectangular color blocks (each ~12cm wide, slightly different heights) painted in muted designer tones — warm travertine, deep mocha, soft charcoal, muted sage, creamy bone, dusty terracotta. Each block has a tiny black hairline border and a small notation below it: a 4-character pencil-style code ("CL-01", "CL-02"...) followed by a thin underline and a tiny lowercase descriptive name. A few discrete red dimension-style annotations in the margin show where the colors apply ("walls", "trim", "ceiling"). Bottom-right has a small drafting drawing-number block ("CL-001" in a thin rectangle). Generous white margins, plenty of negative space. NO logo, NO branding, NO watermark, NO big "COLOR PALETTE" header. Looks like a working sheet from an architects finishes book.',

  // Architectural inspiration sheet — a grid of small reference thumbnails
  // each labeled with thin leader lines, like a precedent-study page.
  concept_board:
    'A single A3 landscape architectural sheet on white paper. Centered composition: a clean 3×2 grid of 6 small rectangular reference photographs (each ~10cm wide), each one a softly-lit interior detail — a stone courtyard, a linen-curtained bedroom, a brass tap on travertine, dappled sunlight through wooden slats, hand-thrown ceramics, a softly-lit kitchen counter. Each photograph has a thin black hairline border. Below each thumbnail is a tiny lowercase sans-serif caption (3-5 words: "morning light, stone floor", "linen drapery study", "brass on travertine") connected with a fine black leader line. Generous white margins. Bottom-right shows a small architectural drawing-number block ("REF-001"). NO logo, NO studio branding, NO "CONCEPT BOARD" title overlay, NO date. Pure architectural-portfolio aesthetic, like a single sheet of design precedents from a working set.',

  // Top-down architectural plan with fixture symbols + small legend column.
  // (Already on style — keeping the same prompt with hard rules emphasized.)
  lighting_plan:
    'A single A3 landscape architectural lighting plan on white paper. Top-down floor plan of a residential bathroom and bedroom drawn in crisp thin black lines: walls, doors with swing arcs, windows, fixtures (wall-hung toilet, vanity, shower, bed, wardrobe) all rendered as 2D black line work. Lighting symbols placed thoughtfully through the rooms: small ⊕ circles (recessed downlights) in ceiling positions, ● (pendants) above key spots, ◐ (wall lights) on walls, ▬ (LED strip) along select edges. A discrete legend column on the right lists each symbol next to its tiny lowercase label ("recessed", "pendant", "wall", "led strip"). Small dimension callouts in red on a few walls ("3200", "2400", "1800") with thin extension lines. Bottom-right shows a small drawing-number block ("L-001"). Generous white margins. NO logo, NO studio branding, NO "LIGHTING PLAN" header, NO date strip. Single working drawing.',

  // Soft hand-illustrated axonometric of a kitchen with thin callout leaders.
  // (Already on style — locking down the references and removing the studio
  // sheet wrapper around it.)
  annotated_render:
    'A single A3 landscape architectural sheet on white paper. Centered LEFT (filling ~65%): a soft hand-illustrated axonometric (isometric) drawing of a residential kitchen — cabinetry, range, fridge, sink, island with bar stools — rendered in muted creams, soft sages, light greys with very subtle shadows, NOT photoreal. Thin black hairline leader lines extend from key elements out to tiny lowercase sans-serif labels OUTSIDE the kitchen: "wall tiles", "inox oven", "double-door fridge", "sink 2-bowl", "polished stone countertop", "built-in dishwasher". On the RIGHT side 35%: a vertical stack of 4 small rectangular material thumbnails (sage green tile, white polished stone, oak wood, dark grey paint), each with 1–2 lines of tiny grey descriptive text. Generous white margins. Bottom-right has a small drawing-number block ("AXO-001"). NO logo, NO studio branding, NO "MATERIAL SELECTION" or "DRAWINGS" header, NO date strip. Pure architectural-portfolio aesthetic.',

  // Two-panel sheet: dimensioned elevation top, photoreal render bottom.
  // (Already on style.)
  elevation_render_pair:
    'A single A3 landscape architectural sheet on white paper. Two centered panels separated by white space. TOP PANEL: a 2D dimensioned elevation drawing of a bathroom wall in thin black line work — wall-hung toilet, floating vanity, large mirror, recessed niche, integrated shower head. Multiple thin red dimension lines run along the perimeter and across key fixtures with small black numbers ("2725", "1200", "900", "450"). Tile module hatching shown subtly. A few tiny lowercase callouts ("porcelain 600×1200", "brass tapware") connect to fixtures via thin leader lines. BOTTOM PANEL: a soft photoreal 3D render of the same bathroom wall installed — travertine porcelain tile, brass tapware, walnut vanity, soft daylight from the right. Same proportions as the top drawing. Bottom-right has a small drawing-number block ("EL-001"). Generous white margins. NO logo, NO studio branding, NO "ELEVATION" / "RENDER" overlay text, NO date strip.',

  // Architectural schedule sheet — clean tabular layout printed as a single
  // working drawing, NOT a photo of paper on a desk.
  ffe_schedule:
    'A single A3 landscape architectural schedule sheet on white paper, viewed straight-on (NOT photographed at an angle). Centered table: clean tabular layout in thin black hairline rules with small-caps column headers (room, item, dim., supplier, lead, qty, unit, total). About 9 rows of restrained text content like "living — boucle armchair sandmark — 920×880×740 — italy — 8 wk — 2 — 2,400 — 4,800". Tiny lowercase text, generous row height, hairline horizontal separators between rows. Bottom-right has totals in slightly bolder text. A discrete small drawing-number block in the bottom-right corner ("S-001" in a thin rectangle). Generous white margins on all sides. NO logo, NO studio branding, NO "FF&E SCHEDULE" title overlay, NO project header, NO date. Pure architectural-portfolio aesthetic — looks like a single sheet from a permit-set schedule page.',

  // A multi-panel index/title sheet — small thumbnails of the other 4-5
  // sheet types laid out on a single A3 page like a sheet index.
  full_deck:
    'A single A3 landscape architectural index sheet on white paper. Centered: a 3×2 grid of 5 small thumbnails of OTHER architectural drawings, each in its own thin-bordered rectangle, drawn at small scale: (1) a soft hand-illustrated axonometric of a kitchen with thin callout lines, (2) a 2×4 grid of small material swatches with tiny labels, (3) a horizontal row of color blocks with codes, (4) a top-down lighting plan with fixture symbols, (5) a 2D dimensioned elevation drawing. Each thumbnail has a tiny lowercase caption beneath it ("kitchen axonometric", "finishes", "color study", "lighting plan", "elevation"). The thumbnails are loose hand-illustrated drawings, not photographs. Bottom-right has a small drawing-number block ("D-001"). Generous white margins. NO logo, NO studio branding, NO "PRESENTATION DECK" title overlay, NO project header, NO date. Looks like a single index sheet from a working drawing set.',
};

interface SeedRequest {
  types?: SheetType[];
  model?: 'flash' | 'pro';
  overwrite?: boolean;
}

interface SeedResult {
  success: boolean;
  uploaded: { type: SheetType; path: string; public_url: string }[];
  skipped: { type: SheetType; reason: string }[];
  failed: { type: SheetType; error: string }[];
  total_duration_ms: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'POST only' }, 405);
  }

  // Admin gate — only the project's service-role key in x-admin-secret can call this
  const adminSecret = req.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: 'Unauthorized — pass service role key in x-admin-secret' }, 401);
  }

  if (!GOOGLE_API_KEY) {
    return jsonResponse({ success: false, error: 'GOOGLE_API_KEY env not set on this Supabase project' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body: SeedRequest = await req.json().catch(() => ({}));
  const wantTypes: SheetType[] = body.types && body.types.length > 0
    ? body.types.filter((t): t is SheetType => SHEET_TYPES.includes(t as SheetType))
    : [...SHEET_TYPES];
  const overwrite = body.overwrite ?? false;
  const modelId = body.model === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview';

  const result: SeedResult = {
    success: true,
    uploaded: [],
    skipped: [],
    failed: [],
    total_duration_ms: 0,
  };
  const t0 = Date.now();

  for (const sheetType of wantTypes) {
    const path = `${sheetType}.png`;

    // Skip if exists and not overwriting
    if (!overwrite) {
      const { data: existing } = await supabase.storage
        .from('moodboard-sheet-references')
        .list('', { limit: 1, search: path });
      if (existing && existing.find((f) => f.name === path)) {
        result.skipped.push({ type: sheetType, reason: 'exists (pass overwrite=true to replace)' });
        continue;
      }
    }

    try {
      console.log(`[seed-sheet-references] generating ${sheetType} via ${modelId}...`);
      const { bytes: imageBytes, mimeType } = await generateImage(PROMPTS[sheetType], modelId);

      const { error: uploadError } = await supabase.storage
        .from('moodboard-sheet-references')
        .upload(path, imageBytes, {
          contentType: mimeType,
          upsert: true,
          // 5 min — short enough that admin re-runs surface in clients within
          // a sensible window. The frontend additionally adds a `?v=updated_at`
          // query string so re-uploads invalidate by URL.
          cacheControl: '300',
        });

      if (uploadError) {
        result.failed.push({ type: sheetType, error: `upload failed: ${uploadError.message}` });
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('moodboard-sheet-references')
        .getPublicUrl(path);

      result.uploaded.push({
        type: sheetType,
        path,
        public_url: publicUrlData.publicUrl,
      });
      console.log(`[seed-sheet-references] uploaded ${path} → ${publicUrlData.publicUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[seed-sheet-references] FAILED ${sheetType}:`, msg);
      result.failed.push({ type: sheetType, error: msg });
    }
  }

  result.total_duration_ms = Date.now() - t0;
  result.success = result.failed.length === 0;

  return jsonResponse(result);
});

/**
 * Direct Gemini generateContent call. We don't import the shared
 * generateImageWithGemini because pulling in the @ai-sdk dependency on a
 * one-shot seed function bloats cold-start time — we just call the REST
 * endpoint directly with the same model and parse the inline image data.
 */
async function generateImage(prompt: string, model: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p?.inlineData?.data);

  if (!imagePart) {
    throw new Error('Gemini returned no image data; response: ' + JSON.stringify(data).slice(0, 500));
  }

  const base64: string = imagePart.inlineData.data;
  const mimeType: string = imagePart.inlineData.mimeType || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
