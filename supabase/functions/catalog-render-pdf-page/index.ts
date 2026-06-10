/**
 * catalog-render-pdf-page
 *
 * Thin proxy to MIVAA's `/api/internal/catalog/rasterize-pdf-page`. Takes a
 * `source_pdf_id` + `page_no` (+ optional normalized [0..1] bbox), returns a
 * signed URL to the rendered PNG stored at `pdf-tiles/catalog-extracted/`.
 *
 * Used by `catalog-extract-from-pdfs` and `catalog-translate-pdf` to populate
 * `image_url` on every extracted candidate without dragging the heavy Wasm
 * PDF stack into the edge runtime.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

interface RenderRequest {
  source_pdf_id: string;
  page_no: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  dpi?: number;
  target_path?: string;
  signed_url_ttl_seconds?: number;
}

interface RenderResponse {
  success: boolean;
  image_url?: string;
  storage_path?: string;
  width?: number;
  height?: number;
  error?: string;
}

Deno.serve(withApiLogging('catalog-render-pdf-page', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  if (!CRON_SECRET()) {
    return jsonResponse({ success: false, error: 'CRON_SECRET not configured on edge function' }, 500);
  }

  try {
    const body: RenderRequest = await req.json();
    if (!body.source_pdf_id || !Number.isInteger(body.page_no) || body.page_no < 1) {
      return jsonResponse({ success: false, error: 'source_pdf_id and page_no (>=1) are required' }, 400);
    }

    const res = await fetch(`${MIVAA_GATEWAY_URL}/api/internal/catalog/rasterize-pdf-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({
        success: false,
        error: `MIVAA ${res.status}: ${text.slice(0, 300)}`,
      }, 502);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    console.error('[catalog-render-pdf-page] error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Render failed' }, 500);
  }
}));

function jsonResponse(body: RenderResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
