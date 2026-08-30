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
import { jsonResponse } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getGenerationPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';
import { resolveTokenPrice } from '../_shared/ai-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';

const MODEL = 'claude-sonnet-5';
const MAX_MATERIALS = 200;

// Admin-editable at /admin/ai-configs (prompt_type='generation'). Two rows, one
// per mode. These literals are the fallbacks used only if the DB row is missing.
// Variables: {{filename}}, {{max}}.
// Prompts: generation/catalog_translate_preserve and .../catalog_translate_restructure.




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

  // ── Credit metering state (function-scope so the catch can refund too) ────
  const CATALOG_TRANSLATE_CREDIT_COST = 5;
  let chargedUserId: string | null = null;
  let refundMeta: Record<string, unknown> = {};
  let translateRefunded = false;
  const refundTranslate = async (reason: string): Promise<void> => {
    if (!chargedUserId || translateRefunded) return;
    translateRefunded = true;
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: chargedUserId,
        p_amount: CATALOG_TRANSLATE_CREDIT_COST,
        p_operation_type: 'catalog_translate_pdf_refund',
        p_description: `Catalog translate refund (${reason})`,
        p_metadata: { ...refundMeta, reason },
        p_workspace_id: null,
      });
    } catch (e) { console.warn('[catalog-translate-pdf] refund failed:', e instanceof Error ? e.message : e); }
  };

  try {
    const body: TranslateRequest = await req.json();
    if (!body.source_pdf_id || !body.target_catalog_id) {
      return jsonResponse({ success: false, error: 'source_pdf_id and target_catalog_id are required' }, 400);
    }

    const { data: pdf, error: pdfErr } = await supabase
      .from('catalog_source_pdfs')
      // `workspace_id` is selected for cost attribution — the AI usage row for this run had
      // no tenant on it, so it was invisible to every per-workspace cost view.
      .select('id, original_filename, manufacturer_name, storage_path, page_count, workspace_id')
      .eq('id', body.source_pdf_id)
      .single();
    if (pdfErr || !pdf) return jsonResponse({ success: false, error: 'Source PDF not found' }, 404);

    // Invariant 1 (BOLA). This runs on the service-role client and BOTH ids come from the body,
    // so ownership is checked by hand — and BEFORE the Vision call, not after, or an
    // unauthorized caller still burns the credits (invariant 10). `source_pdf_id` reaches a
    // download from the private `pdf-documents` bucket; `target_catalog_id` reaches an UPDATE of
    // someone else's catalog body. Both answer 404 rather than 403, so neither id can be
    // enumerated. Level 'secret' is the backend caller and is exempt by design — it supplies
    // `caller_user_id` for cost attribution instead.
    const { data: targetCatalog } = await supabase
      .from('presentation_catalogs')
      .select('id, workspace_id')
      .eq('id', body.target_catalog_id)
      .maybeSingle();
    if (!targetCatalog) {
      return jsonResponse({ success: false, error: 'Target catalog not found' }, 404);
    }

    if (auth.level !== 'secret') {
      const [ownsSource, ownsTarget] = await Promise.all([
        userCanAccessWorkspace(supabase, auth.userId, (pdf as { workspace_id?: string | null }).workspace_id),
        userCanAccessWorkspace(supabase, auth.userId, targetCatalog.workspace_id),
      ]);
      if (!ownsSource || !ownsTarget) {
        return jsonResponse({ success: false, error: 'Source PDF not found' }, 404);
      }
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from('pdf-documents')
      .download(pdf.storage_path);
    if (dlErr || !blob) return jsonResponse({ success: false, error: `Download failed: ${dlErr?.message}` }, 500);

    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    const base64 = base64Encode(bytes);

    const promptCategory = body.preserve_original_layout ? 'catalog_translate_preserve' : 'catalog_translate_restructure';
    const promptTemplate = await getGenerationPrompt(supabase, promptCategory);
    const userText = renderPromptTemplate(promptTemplate, {
      filename: pdf.original_filename,
      max: MAX_MATERIALS,
    });

    // ── Credit metering: debit before the paid Sonnet vision pass ──────────
    // "Act on behalf of": agent-chat invokes server-to-server (secret level)
    // with the real user in body.caller_user_id; a direct call binds to the JWT.
    const effectiveUserId = auth.level === 'secret' && body.caller_user_id ? body.caller_user_id : auth.userId;
    if (effectiveUserId) {
      refundMeta = { catalog_id: body.target_catalog_id, source_pdf_id: pdf.id };
      const { data: dd, error: de } = await supabase.rpc('debit_credits', {
        p_user_id: effectiveUserId,
        p_amount: CATALOG_TRANSLATE_CREDIT_COST,
        p_operation_type: 'catalog_translate_pdf',
        p_description: `Catalog translate: ${pdf.original_filename}`,
        p_metadata: { catalog_id: body.target_catalog_id, source_pdf_id: pdf.id },
        p_workspace_id: null,
      });
      const row = Array.isArray(dd) ? dd[0] : dd;
      if (de || !row?.success) {
        return jsonResponse({ success: false, error: row?.error_message || de?.message || 'Insufficient credits' }, 402);
      }
      chargedUserId = effectiveUserId;
    }

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
      await refundTranslate('anthropic_error');
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
    if (upErr) {
      await refundTranslate('persist_failed');
      return jsonResponse({ success: false, error: upErr.message }, 500);
    }

    await logCost(supabase, body.caller_user_id, (pdf as { workspace_id?: string | null }).workspace_id ?? null, body.target_catalog_id, pdf.id, data?.usage);

    return jsonResponse({
      success: true,
      sections_count: sections.length,
      materials_count: materialsCount,
    });
  } catch (err) {
    console.error('[catalog-translate-pdf] error:', err);
    await refundTranslate('exception');
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

async function logCost(supabase: any, userId: string | undefined, workspaceId: string | null, catalogId: string, sourcePdfId: string, usage: any) {
  if (!userId || !usage) return;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  // The rate is NOT a literal here. The comment this replaces said "keep aligned with
  // ai_model_pricing", which is the instruction to maintain two copies of one number — and the
  // model it named has no row in that table at all, so it was aligned with nothing.
  const price = await resolveTokenPrice(supabase, MODEL);
  const inputCost = price ? (inputTokens / 1_000_000) * price.input : null;
  const outputCost = price ? (outputTokens / 1_000_000) * price.output : null;
  // null, never 0 — an unpriced model is a gap in ai_model_pricing, not a free call, and
  // `ops.silent_zero` can only see the difference if we keep it.
  const rawCost = price ? inputCost! + outputCost! : null;
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      workspace_id: workspaceId,
      operation_type: 'catalog_translate_pdf',
      model_name: MODEL,
      api_provider: 'anthropic',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: price?.markup ?? null,
      billed_cost_usd: rawCost === null ? null : rawCost * price!.markup,
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

