// deno-lint-ignore-file no-explicit-any
// Real Estate PUBLIC listing page (anonymous, token-gated). Serves the `/p/:token` page and
// accepts the anonymous inquiry POST. Separate from real-estate-api so no authed surface is exposed.
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
import { toPublic, matchesCriteria, estimateFromMedianPerSqm } from '../_shared/real-estate.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { getTrustedClientIp } from '../_shared/client-ip.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** RE T1-1 — per-IP throttle for the anonymous lead-capture writes. Returns a 429 Response when the
 *  caller has exceeded the hourly budget (across all public lead actions), else records the attempt and
 *  returns null. IP is hashed (never stored raw). Service-role table; no captcha dependency. */
const PUBLIC_LEAD_HOURLY_LIMIT = 8;
async function enforceLeadRateLimit(supabase: any, req: Request, action: string, workspaceId: string | null): Promise<Response | null> {
  // The two halves have DIFFERENT failure policies, and collapsing them into one
  // `catch { return null }` is what made this brake fail open:
  //   - The COUNT is the enforcement decision. If it cannot be answered we do not know
  //     whether the caller is over budget, so we must refuse. Failing open here hands an
  //     attacker an unlimited channel the moment they can induce an error in this query,
  //     which is exactly what a flood would do.
  //   - The INSERT is bookkeeping. Losing one row costs a little accuracy on a later
  //     window and must never block a legitimate submission.
  let ipHash: string;
  try {
    const ipRaw = getTrustedClientIp(req);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ipRaw));
    ipHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);

    const sinceIso = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await supabase.from('public_realestate_submissions')
      .select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', sinceIso);
    if (error) throw error;
    if ((count ?? 0) >= PUBLIC_LEAD_HOURLY_LIMIT) {
      return json({ error: 'Too many requests. Please try again later.' }, 429);
    }
  } catch (e) {
    console.error('[real-estate-public] lead throttle check failed — refusing (fail closed):', e);
    return json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  // Bookkeeping only: never blocks the submission.
  try {
    await supabase.from('public_realestate_submissions').insert({ ip_hash: ipHash, workspace_id: workspaceId, action });
  } catch (e) {
    console.error('[real-estate-public] lead throttle bookkeeping insert failed (non-fatal):', e);
  }
  return null;
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

  // ── Buyer portal — a saved search's shareable matches page + favourites + viewing request.
  async function loadRequirement(token: string): Promise<any> {
    if (!token) throw new HttpError(400, 'token is required');
    const { data } = await supabase.from('property_buyer_requirements')
      .select('id, workspace_id, crm_contact_id, label, criteria, is_active')
      .eq('portal_token', token).maybeSingle();
    if (!data || data.is_active === false) throw new HttpError(404, 'not found');
    return data;
  }
  if (action === 'buyer-portal') {
    const req = await loadRequirement(String(body?.token ?? ''));
    const [{ data: listings }, { data: favs }, { data: ws }] = await Promise.all([
      supabase.from('properties').select('*').eq('workspace_id', req.workspace_id).eq('is_public', true).eq('listing_status', 'active').limit(120),
      supabase.from('property_buyer_favorites').select('property_id').eq('requirement_id', req.id),
      supabase.from('workspaces').select('name').eq('id', req.workspace_id).maybeSingle(),
    ]);
    const matched = (listings ?? []).filter((p: any) => matchesCriteria(req.criteria, p));
    const covers = await coverUrls(matched.map((r: any) => r.id));
    return json({
      requirement: { label: req.label, criteria: req.criteria },
      agency: ws?.name ?? null,
      favorites: (favs ?? []).map((f: any) => f.property_id),
      listings: matched.map((r: any) => ({ ...toPublic(r), cover_url: covers[r.id] ?? null })),
    });
  }
  if (action === 'buyer-favorite') {
    const req = await loadRequirement(String(body?.token ?? ''));
    const propertyId = String(body?.property_id ?? '');
    if (!propertyId) return json({ error: 'property_id is required' }, 400);
    // The listing must belong to the same agency + be public (no cross-workspace favouriting).
    const { data: p } = await supabase.from('properties').select('id').eq('id', propertyId).eq('workspace_id', req.workspace_id).eq('is_public', true).maybeSingle();
    if (!p) return json({ error: 'not found' }, 404);
    if (body?.on === false) {
      await supabase.from('property_buyer_favorites').delete().eq('requirement_id', req.id).eq('property_id', propertyId);
      return json({ ok: true, favorited: false });
    }
    await supabase.from('property_buyer_favorites').upsert({ workspace_id: req.workspace_id, requirement_id: req.id, property_id: propertyId }, { onConflict: 'requirement_id,property_id' });
    return json({ ok: true, favorited: true });
  }
  if (action === 'buyer-request-viewing') {
    const reqmt = await loadRequirement(String(body?.token ?? ''));
    const propertyId = String(body?.property_id ?? '');
    if (!propertyId) return json({ error: 'property_id is required' }, 400);
    const rl = await enforceLeadRateLimit(supabase, req, 'buyer-request-viewing', reqmt.workspace_id);
    if (rl) return rl;
    const { data: p } = await supabase.from('properties').select('id').eq('id', propertyId).eq('workspace_id', reqmt.workspace_id).eq('is_public', true).maybeSingle();
    if (!p) return json({ error: 'not found' }, 404);
    const { data: contact } = await supabase.from('crm_contacts').select('name, email, phone').eq('id', reqmt.crm_contact_id).maybeSingle();
    const { error } = await supabase.from('property_inquiries').insert({
      workspace_id: reqmt.workspace_id, property_id: propertyId,
      name: contact?.name ?? 'Buyer (portal)', email: contact?.email ?? null, phone: contact?.phone ?? null,
      message: String(body?.message ?? '').slice(0, 1000) || 'Viewing requested via buyer portal',
      status: 'new', crm_contact_id: reqmt.crm_contact_id, source: 'buyer_portal',
    });
    if (error) throw new HttpError(400, error.message);
    return json({ ok: true });
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

    // SECURITY: workspace_id/user_id arrive in the BODY, and everything below
    // writes with the service-role client — a crm_contacts row plus a crm_contact_created flow
    // event to that workspace's owners/admins. Without this gate any unauthenticated caller who
    // knew (or enumerated) a workspace uuid could inject attacker-controlled contacts into a
    // stranger's CRM and push a bell + email to their owners: a spam/phishing channel into
    // another tenant, no account required.
    // The rest of this function derives everything from an opaque token; this action cannot,
    // because the valuation widget is rendered before any listing is chosen. So instead we require
    // the target workspace to actually BE a public agency — it must expose at least one public
    // listing. That is precisely the population that can legitimately host the widget, and it
    // makes a bare uuid useless against any workspace with no public presence.
    const { count: publicListings } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_public', true)
      .eq('listing_status', 'active');
    if (!publicListings) {
      // 404, not 403 — do not confirm whether the workspace exists (id-enumeration).
      return json({ error: 'Not found' }, 404);
    }

    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim();
    if (!name || !email) return json({ error: 'name and email are required' }, 400);
    if (body?.gdpr_consent !== true) return json({ error: 'gdpr_consent is required' }, 400);
    const rl = await enforceLeadRateLimit(supabase, req, 'request-valuation', workspaceId);
    if (rl) return rl;

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
      const est = estimateFromMedianPerSqm(medianPerSqm, area, 0.15); // shared formula, ±15% band
      if (est) { estimate = est.estimate; low = est.low; high = est.high; }
    }

    // Capture the seller lead (crm_contact + real-estate extension). property_id/workspace are server-set.
    // The error MUST be checked. This used to destructure only `data`, so a
    // failed insert left `contact` null, skipped the property_contacts_ext upsert AND the
    // crm_contact_created event, and still returned 200 with the estimate — while
    // ValuationWidget flips to its success screen on any resolved promise. The seller saw
    // "Thanks, we'll be in touch", the row was never written, no alert fired, and nothing logged
    // it (withApiLogging only reports thrown errors). This is the module's headline lead magnet.
    // `inquire`, in this same file, has always done it correctly.
    const { data: contact, error: contactErr } = await supabase.from('crm_contacts').insert({
      workspace_id: workspaceId, name, email, phone: String(body?.phone ?? '').slice(0, 40) || null,
      contact_type: 'seller', lead_source: 'valuation_request', lead_status: 'new',
    }).select('id').single();
    if (contactErr || !contact?.id) {
      console.error('[real-estate-public] valuation lead capture failed:', contactErr?.message);
      throw new HttpError(400, 'Could not record your request. Please try again.');
    }
    {
      await supabase.from('property_contacts_ext').upsert({
        crm_contact_id: contact.id, workspace_id: workspaceId, contact_role: 'seller',
        owned_property_address: [String(body?.address ?? '').trim(), town].filter(Boolean).join(', ') || null,
        owned_property_value: estimate,
      }, { onConflict: 'crm_contact_id' });
      // This is a genuine new-lead moment that writes crm_contacts directly (bypassing crm-api),
      // so it must fire crm_contact_created itself — otherwise the agency's "new lead → notify/assign"
      // automation never runs for its highest-value inbound. Notify workspace owners/admins.
      try {
        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'crm_contact_created', (uid: string) => ({
          type: 'crm_contact_created', workspace_id: workspaceId, user_id: uid,
          contact_id: contact.id, contact_name: name, lead_source: 'valuation_request',
          title: 'New seller lead', body: `${name} requested a property valuation.`,
          action_url: `/crm/contacts/${contact.id}`,
        }));
      } catch { /* best-effort */ }
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
    const rl = await enforceLeadRateLimit(supabase, req, 'inquire', property.workspace_id);
    if (rl) return rl;
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
