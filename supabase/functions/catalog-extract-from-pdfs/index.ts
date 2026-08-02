/**
 * catalog-extract-from-pdfs
 *
 * Vision pass over admin-uploaded source PDFs. Returns candidate materials
 * matching the user's free-form query. Lightweight — no full Stage 1-4
 * ingestion pipeline trigger; just Claude Sonnet reading the PDF directly.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getGenerationPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';

const MODEL = 'claude-sonnet-4-6';

// Admin-editable at /admin/ai-configs (prompt_type='generation', category='catalog_extract').
// This literal is the fallback used only if the DB row is missing. Variables:
// {{filename}}, {{manufacturer}} (pre-formatted suffix or empty), {{query}}, {{max}}.
const EXTRACT_PROMPT_FALLBACK =
  `Source PDF: {{filename}}{{manufacturer}}.\n\n` +
  `User query: "{{query}}"\n\n` +
  `Identify up to {{max}} materials in this PDF that match the query. ` +
  `For each, return its name (as printed), a short description (1-2 sentences from the page), ` +
  `and any visible price + currency + specs (size, finish, color, SKU). ` +
  `Set page_no to the 1-based page where the material appears. ` +
  `If the query does not match anything in this PDF, return an empty candidates array.`;

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
      .select('id, workspace_id, uploaded_by, original_filename, manufacturer_name, storage_path, page_count')
      .in('id', body.source_pdf_ids);

    if (pdfErr) return jsonResponse({ success: false, error: pdfErr.message }, 500);
    if (!pdfs || pdfs.length === 0) return jsonResponse({ success: false, error: 'No source PDFs found' }, 404);

    // authenticate() proves only that the caller is *some* user; the
    // service-role load bypasses RLS. Without this, any authenticated user could pass
    // another tenant's source_pdf_ids and exfiltrate their private catalog PDFs. Bind
    // the caller to every referenced PDF's workspace before downloading any bytes.
    // "Act on behalf of": agent-chat invokes this server-to-server with the platform
    // service key, so authenticate() resolves to level 'secret' with userId=null — the
    // real acting user rides in body.caller_user_id. Honor it ONLY at secret level (a
    // direct user call must bind to its own verified JWT, never a body-supplied id —
    // tenancy invariant #8). This mirrors agent-chat's own body.user_id handling.
    const effectiveUserId = auth.level === 'secret' && body.caller_user_id
      ? body.caller_user_id
      : auth.userId;
    if (!effectiveUserId) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    // Bind the caller to every source PDF. Prefer the PDF's workspace, but fall back to the
    // uploader: chat-uploaded source PDFs are stamped `uploaded_by` and historically NOT
    // `workspace_id` (it was left null), so a workspace-only check can never pass for them.
    // Both columns are server-set at upload, so this remains a real tenancy check — not a
    // body-supplied id. (New uploads now stamp workspace_id too; this keeps old rows working.)
    for (const pdf of pdfs) {
      const okByWorkspace = pdf.workspace_id
        ? await userCanAccessWorkspace(supabase, effectiveUserId, pdf.workspace_id)
        : false;
      const okByUploader = !!pdf.uploaded_by && pdf.uploaded_by === effectiveUserId;
      if (!okByWorkspace && !okByUploader) {
        return jsonResponse({ success: false, error: 'Not authorized for one or more source PDFs' }, 403);
      }
    }

    // ── Credit metering: one Sonnet vision pass per PDF → charge per PDF ────
    const EXTRACT_CREDIT_COST_PER_PDF = 3;
    const refundExtract = async (pdfId: string, wsId: string | null, reason: string): Promise<void> => {
      try {
        await supabase.rpc('refund_credits', {
          p_user_id: effectiveUserId,
          p_amount: EXTRACT_CREDIT_COST_PER_PDF,
          p_operation_type: 'catalog_extract_from_pdf_refund',
          p_description: `Catalog extract refund (${reason})`,
          p_metadata: { catalog_id: body.catalog_id, source_pdf_id: pdfId, reason },
          p_workspace_id: wsId,
        });
      } catch (e) { console.warn('[catalog-extract] refund failed:', e instanceof Error ? e.message : e); }
    };

    const allCandidates: Candidate[] = [];
    const errors: string[] = [];

    for (const pdf of pdfs) {
      let pdfCharged = false;
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

        const promptTemplate = await getGenerationPrompt(supabase, 'catalog_extract', EXTRACT_PROMPT_FALLBACK);
        const userText = renderPromptTemplate(promptTemplate, {
          filename: pdf.original_filename,
          manufacturer: pdf.manufacturer_name ? ` (manufacturer: ${pdf.manufacturer_name})` : '',
          query: body.query,
          max: perPdfBudget,
        });

        // Debit before this PDF's Sonnet vision pass; refund below if it fails.
        const { data: dd, error: de } = await supabase.rpc('debit_credits', {
          p_user_id: effectiveUserId,
          p_amount: EXTRACT_CREDIT_COST_PER_PDF,
          p_operation_type: 'catalog_extract_from_pdf',
          p_description: `Catalog extract: ${pdf.original_filename}`,
          p_metadata: { catalog_id: body.catalog_id, source_pdf_id: pdf.id },
          p_workspace_id: pdf.workspace_id ?? null,
        });
        const drow = Array.isArray(dd) ? dd[0] : dd;
        if (de || !drow?.success) {
          errors.push(`insufficient credits: ${pdf.id}`);
          break; // out of credits → remaining PDFs would also fail
        }
        pdfCharged = true;

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
          if (pdfCharged) await refundExtract(pdf.id, pdf.workspace_id ?? null, 'anthropic_error');
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
        if (pdfCharged) await refundExtract(pdf.id, pdf.workspace_id ?? null, 'exception');
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
