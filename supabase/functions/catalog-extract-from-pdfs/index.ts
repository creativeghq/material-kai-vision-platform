/**
 * catalog-extract-from-pdfs
 *
 * Vision pass over admin-uploaded source PDFs. Returns candidate materials
 * matching the user's free-form query. Lightweight — no full Stage 1-4
 * ingestion pipeline trigger; just Claude Sonnet reading the PDF directly.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';

const MODEL = 'claude-sonnet-4-6';

interface ExtractRequest {
  catalog_id: string;
  source_pdf_ids: string[];
  query: string;
  max_results?: number;
  caller_user_id?: string;
}

interface Candidate {
  source_pdf_id: string;
  page_no: number | null;
  name: string;
  description: string | null;
  image_url: string | null;
  bbox: { x1: number; y1: number; x2: number; y2: number } | null;
  price: number | null;
  currency: string | null;
  specs: Record<string, any> | null;
}

interface ExtractResponse {
  success: boolean;
  candidates?: Candidate[];
  error?: string;
}

const EXTRACT_TOOL = {
  name: 'record_candidates',
  description:
    'Record the materials matching the user query. Use page_no when visible in the PDF. Leave price/specs null when not visible. ' +
    'For each candidate, return a normalized [0..1] bounding box on the page that tightly frames the material image (or the material+name+price block if no isolated image). ' +
    'Coordinates: (0,0) is top-left, (1,1) is bottom-right.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            page_no: { type: ['integer', 'null'], description: '1-based PDF page where this material appears' },
            name: { type: 'string', description: 'Product / material name as printed' },
            description: { type: ['string', 'null'], description: '1-2 short sentences from the page' },
            price: { type: ['number', 'null'] },
            currency: { type: ['string', 'null'], description: 'ISO 4217 like EUR, USD' },
            specs: {
              type: ['object', 'null'],
              description: 'Free-form key/value pairs from the page (size, finish, color, sku)',
            },
            bbox: {
              type: ['object', 'null'],
              description: 'Normalized [0..1] bounding box framing the material image / block on the page.',
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
    required: ['candidates'],
  },
};

Deno.serve(withApiLogging('catalog-extract-from-pdfs', async (req) => {
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
    const body: ExtractRequest = await req.json();
    if (!body.catalog_id || !Array.isArray(body.source_pdf_ids) || body.source_pdf_ids.length === 0) {
      return jsonResponse({ success: false, error: 'catalog_id and source_pdf_ids are required' }, 400);
    }
    if (!body.query?.trim()) return jsonResponse({ success: false, error: 'query is required' }, 400);

    const maxResults = Math.min(40, Math.max(1, body.max_results || 12));

    const { data: pdfs, error: pdfErr } = await supabase
      .from('catalog_source_pdfs')
      .select('id, original_filename, manufacturer_name, storage_path, page_count')
      .in('id', body.source_pdf_ids);

    if (pdfErr) return jsonResponse({ success: false, error: pdfErr.message }, 500);
    if (!pdfs || pdfs.length === 0) return jsonResponse({ success: false, error: 'No source PDFs found' }, 404);

    const allCandidates: Candidate[] = [];
    const errors: string[] = [];

    for (const pdf of pdfs) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from('pdf-documents')
          .download(pdf.storage_path);
        if (dlErr || !blob) {
          errors.push(`download failed: ${pdf.id}`);
          continue;
        }
        const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
        const base64 = base64Encode(bytes);

        const perPdfBudget = Math.max(2, Math.floor(maxResults / pdfs.length));

        const userText =
          `Source PDF: ${pdf.original_filename}` +
          (pdf.manufacturer_name ? ` (manufacturer: ${pdf.manufacturer_name})` : '') +
          `.\n\nUser query: "${body.query}"\n\n` +
          `Identify up to ${perPdfBudget} materials in this PDF that match the query. ` +
          `For each, return its name (as printed), a short description (1-2 sentences from the page), ` +
          `and any visible price + currency + specs (size, finish, color, SKU). ` +
          `Set page_no to the 1-based page where the material appears. ` +
          `If the query does not match anything in this PDF, return an empty candidates array.`;

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 2500,
            tools: [EXTRACT_TOOL],
            tool_choice: { type: 'tool', name: 'record_candidates' },
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
          errors.push(`anthropic ${resp.status}: ${errText.slice(0, 200)}`);
          continue;
        }

        const data = await resp.json();
        const toolUse = data?.content?.find((c: any) => c.type === 'tool_use');
        if (!toolUse?.input?.candidates) continue;

        for (const c of toolUse.input.candidates) {
          if (!c?.name) continue;
          const bbox = isValidBbox(c.bbox) ? c.bbox : null;
          allCandidates.push({
            source_pdf_id: pdf.id,
            page_no: typeof c.page_no === 'number' ? c.page_no : null,
            name: c.name,
            description: c.description ?? null,
            image_url: null,
            bbox,
            price: typeof c.price === 'number' ? c.price : null,
            currency: c.currency ?? null,
            specs: c.specs ?? null,
          });
          if (allCandidates.length >= maxResults) break;
        }

        await logCost(supabase, body.caller_user_id, body.catalog_id, pdf.id, data?.usage);

        if (allCandidates.length >= maxResults) break;
      } catch (perPdfErr) {
        errors.push(`pdf ${pdf.id}: ${perPdfErr instanceof Error ? perPdfErr.message : 'error'}`);
      }
    }

    const limited = allCandidates.slice(0, maxResults);

    // Rasterize the bbox region (or full page) for every candidate that has a
    // page_no. Run in parallel with a small concurrency cap so we don't melt
    // MIVAA when the user asks for 40 candidates at once. Best-effort: a
    // failed render leaves image_url=null and the admin can call
    // find_image_for_material instead.
    await rasterizeAll(supabase, limited);

    return jsonResponse({
      success: true,
      candidates: limited,
      ...(errors.length > 0 ? { partial_errors: errors } : {}),
    } as any);
  } catch (err) {
    console.error('[catalog-extract-from-pdfs] error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Extraction failed' }, 500);
  }
}));

function isValidBbox(b: any): b is { x1: number; y1: number; x2: number; y2: number } {
  if (!b || typeof b !== 'object') return false;
  for (const k of ['x1', 'y1', 'x2', 'y2']) {
    if (typeof b[k] !== 'number' || b[k] < 0 || b[k] > 1) return false;
  }
  return b.x2 > b.x1 && b.y2 > b.y1;
}

async function rasterizeAll(supabase: any, candidates: Candidate[]): Promise<void> {
  const rasterizable = candidates.filter((c) => c.page_no != null);
  if (rasterizable.length === 0) return;

  const CONCURRENCY = 4;
  const queue = [...rasterizable];

  const worker = async () => {
    while (true) {
      const c = queue.shift();
      if (!c) return;
      try {
        const { data, error } = await supabase.functions.invoke('catalog-render-pdf-page', {
          body: {
            source_pdf_id: c.source_pdf_id,
            page_no: c.page_no,
            bbox: c.bbox || undefined,
            dpi: 200,
          },
        });
        if (!error && data?.success && data.image_url) {
          c.image_url = data.image_url;
        }
      } catch (e) {
        console.warn('[catalog-extract] rasterize failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rasterizable.length) }, () => worker()));
}

async function logCost(supabase: any, userId: string | undefined, catalogId: string, sourcePdfId: string, usage: any) {
  if (!userId || !usage) return;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  // Sonnet 4.6 pricing: $3/MTok input, $15/MTok output (matches anthropic public pricing — keep aligned with ai_model_pricing).
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  const rawCost = inputCost + outputCost;
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: 'catalog_extract_from_pdf',
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
        sub_feature: 'extract_from_pdf',
        catalog_id: catalogId,
        source_pdf_id: sourcePdfId,
      },
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[catalog-extract] cost log failed:', e instanceof Error ? e.message : e);
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

function jsonResponse(body: ExtractResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
