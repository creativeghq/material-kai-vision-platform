/**
 * Public share lookup for moodboard presentation sheets.
 *
 * POST /functions/v1/moodboard-sheet-share { token }
 *   → { sheet: { ... } | null, pdf_url: signed-1h-url | null, expired: bool }
 *
 * Anonymous-friendly: the route accepts the project anon key in
 * Authorization: Bearer (Supabase enforces this at the gateway), then uses
 * the service role internally to bypass RLS. Increments `share_view_count`
 * on every successful lookup so admins can see traction.
 *
 * Security: only returns sheets where `share_token` matches AND
 * `share_expires_at` is in the future. Token is cryptographically random
 * (uuid v4); attempting all guesses is computationally infeasible.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { token } = await req.json().catch(() => ({}));

  if (!token || typeof token !== 'string' || token.length < 32) {
    return jsonResponse({ error: 'Invalid token' }, 400);
  }

  const { data: sheet, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, sheet_type, title, status, page_count, pdf_storage_path, share_expires_at, share_view_count')
    .eq('share_token', token)
    .maybeSingle();

  if (error || !sheet) {
    return jsonResponse({ sheet: null, pdf_url: null, expired: false });
  }

  const now = Date.now();
  const exp = sheet.share_expires_at ? new Date(sheet.share_expires_at).getTime() : 0;
  if (!exp || exp < now) {
    return jsonResponse({ sheet: null, pdf_url: null, expired: true });
  }

  // Bump view counter (best-effort; ignore errors)
  supabase
    .from('moodboard_presentation_sheets')
    .update({ share_view_count: (sheet.share_view_count ?? 0) + 1 })
    .eq('id', sheet.id)
    .then(() => {});

  // Issue a fresh 1-hour signed URL for the PDF
  let pdf_url: string | null = null;
  if (sheet.pdf_storage_path) {
    const { data: signed } = await supabase.storage
      .from('moodboard-sheets')
      .createSignedUrl(sheet.pdf_storage_path, 60 * 60);
    pdf_url = signed?.signedUrl ?? null;
  }

  return jsonResponse({
    sheet: {
      id: sheet.id,
      sheet_type: sheet.sheet_type,
      title: sheet.title,
      status: sheet.status,
      page_count: sheet.page_count,
    },
    pdf_url,
    expired: false,
  });
});

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
