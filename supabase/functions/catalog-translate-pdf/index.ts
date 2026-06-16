/**
 * catalog-translate-pdf
 *
 * Whole-PDF → catalog body translation. One Vision pass over the entire
 * source PDF returns sections + materials, written into the target catalog's
 * body_data. Use case: admin uploads a manufacturer catalog and wants the
 * full thing mirrored as a new editable catalog.
 *
 * preserve_original_layout=true mirrors page-by-page (one PDF page = one
 * section). preserve_original_layout=false (default) restructures by
 * category — Claude groups materials into sensible sections.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getGenerationPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';

const MODEL = 'claude-sonnet-4-6';
const MAX_MATERIALS = 200;

// Admin-editable at /admin/ai-configs (prompt_type='generation'). Two rows, one
// per mode. These literals are the fallbacks used only if the DB row is missing.
// Variables: {{filename}}, {{max}}.
const TRANSLATE_PRESERVE_FALLBACK =
  `Source PDF: {{filename}}.\n\n` +
  `Mirror this catalog page-by-page. Create one section per PDF page. ` +
  `Section title format: "Page N — <heading on the page>". List every distinct material visible on each page ` +
  `with its name, short description, visible price + currency, and visible specs. Cap at {{max}} materials total.`;

const TRANSLATE_RESTRUCTURE_FALLBACK =
  `Source PDF: {{filename}}.\n\n` +
  `Translate this manufacturer catalog into a clean editable catalog body. ` +
  `Group materials into sensible category-based sections (e.g. "Porcelain Tiles", "Wood Flooring", "Metallic Finishes"). ` +
  `Each material: name, short description, visible price + currency, visible specs. Set page_no per material. ` +
  `Cap at {{max}} materials total. Skip filler / non-product pages (covers, contents, contact pages).`;

interface TranslateRequest {
  source_pdf_id: string;
  target_catalog_id: string;
  preserve_original_layout?: boolean;
  caller_user_id?: string;
}

interface TranslateResponse {
  success: boolean;
  sections_count?: number;
  materials_count?: number;
  error?: string;
}

const TRANSLATE_TOOL = {
  name: 'record_catalog_body',
  description:
    'Record the catalog body. Group materials into sections. When preserve_original_layout=true, ' +
    'create one section per PDF page numbered as "Page N — <heading on that page>". When false, ' +
    'restructure into clean category-based sections. ' +
    'For each material return a normalized [0..1] bbox framing its image / block on the page.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            intro: { type: ['string', 'null'] },
            materials: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  page_no: { type: ['integer', 'null'] },
                  name: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  price: { type: ['number', 'null'] },
                  currency: { type: ['string', 'null'] },
                  specs: { type: ['object', 'null'] },
                  bbox: {
                    type: ['object', 'null'],
                    properties: {
                      x1: { type: 'number', minimum: 0, maximum: 1 },
                      y1: { type: 'number', minimum: 0, maximum: 1 },
                      x2: { type: 'number', minimum: 0, maximum: 1 },
                      y2: { type: 'number', minimum: 0, maximum: 1 },
                    },
                    required: ['x1', 'y1', 'x2', 'y2'],
                  },
                },
                required: ['name'],
              },
            },
          },
          required: ['title', 'materials'],
        },
      },
    },
    required: ['sections'],
  },
};

Deno.serve(withApiLogging('catalog-translate-pdf', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error ?? 'Unauthorized' }, 401);
  }

  if (!ANTHROPIC_API_KEY()) return jsonResponse({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, 500);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: TranslateRequest = await req.json();
    if (!body.source_pdf_id || !body.target_catalog_id) {
      return jsonResponse({ success: false, error: 'source_pdf_id and target_catalog_id are required' }, 400);
    }

    const { data: pdf, error: pdfErr } = await supabase
      .from('catalog_source_pdfs')
      .select('id, original_filename, manufacturer_name, storage_path, page_count')
      .eq('id', body.source_pdf_id)
      .single();
    if (pdfErr || !pdf) return jsonResponse({ success: false, error: 'Source PDF not found' }, 404);

    const { data: blob, error: dlErr } = await supabase.storage
      .from('pdf-documents')
      .download(pdf.storage_path);
    if (dlErr || !blob) return jsonResponse({ success: false, error: `Download failed: ${dlErr?.message}` }, 500);

    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    const base64 = base64Encode(bytes);

    const promptCategory = body.preserve_original_layout ? 'catalog_translate_preserve' : 'catalog_translate_restructure';
    const promptFallback = body.preserve_original_layout ? TRANSLATE_PRESERVE_FALLBACK : TRANSLATE_RESTRUCTURE_FALLBACK;
    const promptTemplate = await getGenerationPrompt(supabase, promptCategory, promptFallback);
    const userText = renderPromptTemplate(promptTemplate, {
      filename: pdf.original_filename,
      max: MAX_MATERIALS,
    });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        tools: [TRANSLATE_TOOL],
        tool_choice: { type: 'tool', name: 'record_catalog_body' },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: userText },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return jsonResponse({ success: false, error: `Anthropic ${resp.status}: ${errText.slice(0, 300)}` }, 502);
    }

    const data = await resp.json();
    const toolUse = data?.content?.find((c: any) => c.type === 'tool_use');
    const sectionsRaw: any[] = toolUse?.input?.sections || [];

    let materialsCount = 0;
    const sections = sectionsRaw.map((s) => {
      const materials = (s.materials || []).map((m: any) => {
        materialsCount++;
        const bbox = isValidBbox(m.bbox) ? m.bbox : null;
        return {
          id: crypto.randomUUID(),
          name: m.name,
          description: m.description ?? null,
          image_url: null,
          image_source: null,
          image_source_ref: null,
          price: typeof m.price === 'number' ? m.price : null,
          currency: m.currency ?? null,
          price_source: typeof m.price === 'number' ? 'manual' : null,
          price_source_ref: null,
          specs: m.specs ?? {},
          provenance: {
            source_pdf_id: pdf.id,
            page_no: m.page_no ?? null,
            bbox,
            extracted_at: new Date().toISOString(),
            mode: body.preserve_original_layout ? 'preserve_layout' : 'restructured',
          },
        };
      });
      return {
        id: crypto.randomUUID(),
        title: s.title || 'Untitled section',
        intro: s.intro ?? null,
        materials,
      };
    });

    // Rasterize the page region (or full page) for every material that has a
    // page_no. Cap concurrency to avoid hammering MIVAA when the catalog has
    // hundreds of materials. Failures are non-fatal.
    await rasterizeAllMaterials(supabase, sections);

    const { data: existing } = await supabase
      .from('presentation_catalogs')
      .select('body_data')
      .eq('id', body.target_catalog_id)
      .maybeSingle();

    const baseBody = existing?.body_data || { sections: [] };
    const mergedSections = Array.isArray(baseBody.sections) ? [...baseBody.sections, ...sections] : sections;

    const { error: upErr } = await supabase
      .from('presentation_catalogs')
      .update({ body_data: { ...baseBody, sections: mergedSections }, updated_at: new Date().toISOString() })
      .eq('id', body.target_catalog_id);
    if (upErr) return jsonResponse({ success: false, error: upErr.message }, 500);

    await logCost(supabase, body.caller_user_id, body.target_catalog_id, pdf.id, data?.usage);

    return jsonResponse({
      success: true,
      sections_count: sections.length,
      materials_count: materialsCount,
    });
  } catch (err) {
    console.error('[catalog-translate-pdf] error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Translation failed' }, 500);
  }
}));

function isValidBbox(b: any): b is { x1: number; y1: number; x2: number; y2: number } {
  if (!b || typeof b !== 'object') return false;
  for (const k of ['x1', 'y1', 'x2', 'y2']) {
    if (typeof b[k] !== 'number' || b[k] < 0 || b[k] > 1) return false;
  }
  return b.x2 > b.x1 && b.y2 > b.y1;
}

async function rasterizeAllMaterials(supabase: any, sections: any[]): Promise<void> {
  const queue: any[] = [];
  for (const s of sections) {
    for (const m of s.materials) {
      const provenance = m.provenance || {};
      if (provenance.source_pdf_id && provenance.page_no) queue.push(m);
    }
  }
  if (queue.length === 0) return;

  const CONCURRENCY = 4;
  const work = [...queue];

  const worker = async () => {
    while (true) {
      const m = work.shift();
      if (!m) return;
      const provenance = m.provenance || {};
      try {
        const { data, error } = await supabase.functions.invoke('catalog-render-pdf-page', {
          body: {
            source_pdf_id: provenance.source_pdf_id,
            page_no: provenance.page_no,
            bbox: provenance.bbox || undefined,
            dpi: 200,
          },
        });
        if (!error && data?.success && data.image_url) {
          m.image_url = data.image_url;
          m.image_source = 'extracted_from_pdf';
          m.image_source_ref = `${provenance.source_pdf_id}#${provenance.page_no}`;
        }
      } catch (e) {
        console.warn('[catalog-translate] rasterize failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));
}

async function logCost(supabase: any, userId: string | undefined, catalogId: string, sourcePdfId: string, usage: any) {
  if (!userId || !usage) return;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  const rawCost = inputCost + outputCost;
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: 'catalog_translate_pdf',
      model_name: MODEL,
      api_provider: 'anthropic',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: 1,
      billed_cost_usd: rawCost,
      credits_debited: 0,
      metadata: {
        feature: 'presentation_catalogs',
        sub_feature: 'translate_pdf',
        catalog_id: catalogId,
        source_pdf_id: sourcePdfId,
      },
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[catalog-translate-pdf] cost log failed:', e instanceof Error ? e.message : e);
  }
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function jsonResponse(body: TranslateResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
