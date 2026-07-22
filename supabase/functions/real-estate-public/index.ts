// deno-lint-ignore-file no-explicit-any
// #249 — Real Estate PUBLIC listing page (anonymous, token-gated). Serves the `/p/:token` page and
// accepts the anonymous inquiry POST. Separate from real-estate-api so no authed surface is exposed.
//
// SECURITY:
//  • Service-role client, but access is bound to the opaque public_listing_token (anti-IDOR — the
//    token IS the capability; there is no id-addressable public read).
//  • Only listings that are is_public AND listing_status='active' resolve; everything else 404s.
//  • Output is the toPublic() projection ONLY — 🔒 internal fields never leave. Response is JSON;
//    the React page renders it (no HTML-string assembly, no dangerouslySetInnerHTML — invariant #11).
//  • Inquiry POST is bound to the token's property+workspace (client cannot supply either), requires
//    gdpr_consent, and is written server-side (no anon RLS insert path exists).
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { toPublic } from '../_shared/real-estate.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withApiLogging('real-estate-public', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const action = String(body?.action ?? 'get').trim();
  const token = String(body?.token ?? '').trim();
  if (!token) return json({ error: 'token is required' }, 400);

  // Resolve the token → live public listing (the only public read path).
  const { data: property, error } = await supabase.from('properties')
    .select('*').eq('public_listing_token', token).eq('is_public', true).eq('listing_status', 'active').maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!property) return json({ error: 'not found' }, 404);

  if (action === 'get') {
    // Signed URLs for the private property-media bucket (1h).
    const { data: photos } = await supabase.from('property_photos')
      .select('id, storage_path, kind, caption, is_cover, sort_order').eq('property_id', property.id).order('sort_order');
    const signed = await Promise.all((photos ?? []).map(async (ph: any) => {
      const { data } = await supabase.storage.from('property-media').createSignedUrl(ph.storage_path, 3600);
      return { id: ph.id, kind: ph.kind, caption: ph.caption, is_cover: ph.is_cover, url: data?.signedUrl ?? null };
    }));
    // Fire-and-forget view counter (never blocks the render).
    supabase.rpc('increment_property_view_count', { p_property_id: property.id }).then(() => {}, () => {});
    return json({ listing: toPublic(property), photos: signed });
  }

  if (action === 'inquire') {
    const email = String(body?.email ?? '').trim();
    const name = String(body?.name ?? '').trim();
    if (!name || !email) return json({ error: 'name and email are required' }, 400);
    if (body?.gdpr_consent !== true) return json({ error: 'gdpr_consent is required' }, 400);
    // property_id + workspace_id come from the resolved token, NEVER the request body (anti-IDOR).
    const { error: insErr } = await supabase.from('property_inquiries').insert({
      workspace_id: property.workspace_id, property_id: property.id,
      name, email, phone: String(body?.phone ?? '').slice(0, 40) || null,
      message: String(body?.message ?? '').slice(0, 4000) || null,
      source: 'listing_page', gdpr_consent: true,
    });
    if (insErr) throw new HttpError(400, insErr.message);
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
