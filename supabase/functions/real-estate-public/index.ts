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

  /** Sign the cover photo for a set of listings in one round trip → { property_id: url }. */
  async function coverUrls(propertyIds: string[]): Promise<Record<string, string | null>> {
    if (!propertyIds.length) return {};
    const { data } = await supabase.from('property_photos')
      .select('property_id, storage_path, is_cover, sort_order').in('property_id', propertyIds).order('sort_order');
    const chosen = new Map<string, string>();
    for (const p of data ?? []) { if (!chosen.has(p.property_id) || p.is_cover) chosen.set(p.property_id, p.storage_path); }
    const out: Record<string, string | null> = {};
    await Promise.all([...chosen.entries()].map(async ([pid, path]) => {
      const { data: s } = await supabase.storage.from('property-media').createSignedUrl(path, 3600);
      out[pid] = s?.signedUrl ?? null;
    }));
    return out;
  }

  // ── Cross-workspace Discovery (no token) — only active+public+in_discovery listings, toPublic-projected.
  if (action === 'discover' || action === 'agency-listings') {
    let q = supabase.from('properties').select('*')
      .eq('is_public', true).eq('listing_status', 'active')
      .order('published_at', { ascending: false }).limit(60);
    if (action === 'discover') q = q.eq('in_discovery', true);
    if (action === 'agency-listings') {
      const wsId = String(body?.workspace_id ?? '').trim();
      const userId = String(body?.user_id ?? '').trim();
      if (wsId) {
        q = q.eq('workspace_id', wsId);
      } else if (userId) {
        // Resolve the user's OWNED workspaces (the "agency") — public profile is keyed on user_id.
        const { data: owned } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).eq('role', 'owner').eq('status', 'active');
        const wsIds = (owned ?? []).map((m: any) => m.workspace_id);
        if (!wsIds.length) return json({ listings: [] });
        q = q.in('workspace_id', wsIds);
      } else {
        return json({ error: 'workspace_id or user_id is required' }, 400);
      }
    }
    // Optional facet filters (discover)
    if (body?.property_type) q = q.eq('property_type', String(body.property_type));
    if (body?.transaction_type) q = q.eq('transaction_type', String(body.transaction_type));
    if (body?.town) q = q.ilike('town', `%${String(body.town)}%`);
    if (body?.price_max != null) q = q.lte('price', Number(body.price_max));
    if (body?.price_min != null) q = q.gte('price', Number(body.price_min));
    if (body?.bedrooms_min != null) q = q.gte('bedrooms', Number(body.bedrooms_min));
    const { data, error: qErr } = await q;
    if (qErr) throw new HttpError(400, qErr.message);
    const rows = data ?? [];
    const covers = await coverUrls(rows.map((r: any) => r.id));
    // toPublic strips 🔒 fields; attach the signed cover url per listing.
    return json({ listings: rows.map((r: any) => ({ ...toPublic(r), cover_url: covers[r.id] ?? null })) });
  }

  // ── Seller lead-magnet: instant valuation (no token) — comps-based estimate from the agency's own
  //    stock + captures the visitor as a seller lead. GDPR-gated. ──
  if (action === 'request-valuation') {
    const wsId = String(body?.workspace_id ?? '').trim();
    const userId = String(body?.user_id ?? '').trim();
    let workspaceId = wsId;
    if (!workspaceId && userId) {
      const { data: owned } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).eq('role', 'owner').eq('status', 'active').limit(1).maybeSingle();
      workspaceId = owned?.workspace_id ?? '';
    }
    if (!workspaceId) return json({ error: 'workspace_id or user_id is required' }, 400);
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim();
    if (!name || !email) return json({ error: 'name and email are required' }, 400);
    if (body?.gdpr_consent !== true) return json({ error: 'gdpr_consent is required' }, 400);

    const propertyType = String(body?.property_type ?? 'residential');
    const town = String(body?.town ?? '').trim();
    const area = Number(body?.area ?? 0);

    // Comps: the agency's own listings of the same type + town with a price and a floor area.
    let cq = supabase.from('properties').select('price, area_built, plot_area')
      .eq('workspace_id', workspaceId).eq('property_type', propertyType)
      .in('listing_status', ['active', 'under_offer', 'sold']).not('price', 'is', null);
    if (town) cq = cq.ilike('town', `%${town}%`);
    const { data: comps } = await cq.limit(100);
    const perSqm = (comps ?? [])
      .map((c: any) => { const a = Number(c.area_built ?? c.plot_area ?? 0); return a > 0 && c.price != null ? Number(c.price) / a : null; })
      .filter((v: any): v is number => v != null && isFinite(v) && v > 0)
      .sort((a: number, b: number) => a - b);
    let estimate: number | null = null, low: number | null = null, high: number | null = null, medianPerSqm: number | null = null;
    if (perSqm.length >= 3 && area > 0) {
      medianPerSqm = perSqm[Math.floor(perSqm.length / 2)];
      estimate = Math.round((medianPerSqm * area) / 1000) * 1000;
      low = Math.round((estimate * 0.85) / 1000) * 1000;
      high = Math.round((estimate * 1.15) / 1000) * 1000;
    }

    // Capture the seller lead (crm_contact + real-estate extension). property_id/workspace are server-set.
    const { data: contact } = await supabase.from('crm_contacts').insert({
      workspace_id: workspaceId, name, email, phone: String(body?.phone ?? '').slice(0, 40) || null,
      contact_type: 'seller', lead_source: 'valuation_request', lead_status: 'new',
    }).select('id').single();
    if (contact?.id) {
      await supabase.from('property_contacts_ext').upsert({
        crm_contact_id: contact.id, workspace_id: workspaceId, contact_role: 'seller',
        owned_property_address: [String(body?.address ?? '').trim(), town].filter(Boolean).join(', ') || null,
        owned_property_value: estimate,
      }, { onConflict: 'crm_contact_id' });
    }
    return json({ estimate, range_low: low, range_high: high, currency: 'EUR', comps_count: perSqm.length, median_per_sqm: medianPerSqm });
  }

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
