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
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { toPublic, matchesCriteria, estimateFromMedianPerSqm, withRentSettlements } from '../_shared/real-estate.ts';
import { embedText } from '../_shared/real-estate-embedding.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { getTrustedClientIp } from '../_shared/client-ip.ts';


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
      .select('id, workspace_id, crm_contact_id, label, criteria, is_active, digest_enabled')
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
    // Both halves of the alert switch, so the portal can render its true state: the digest cron reads
    // `digest_enabled`, and BOTH the digest and the immediate new-listing alert read the contact's
    // `marketing_consent`. A buyer is emailed only when both are on.
    const { data: c } = req.crm_contact_id
      ? await supabase.from('crm_contacts').select('marketing_consent').eq('id', req.crm_contact_id).maybeSingle()
      : { data: null };
    return json({
      requirement: { label: req.label, criteria: req.criteria },
      agency: ws?.name ?? null,
      favorites: (favs ?? []).map((f: any) => f.property_id),
      alerts_enabled: req.digest_enabled !== false && c?.marketing_consent === true,
      listings: matched.map((r: any) => ({ ...toPublic(r), cover_url: covers[r.id] ?? null })),
    });
  }
  // ── Tenant portal — a tenancy's own rent view + raise a repair, no account ──────────
  async function loadTenancy(token: string): Promise<any> {
    if (!token) throw new HttpError(400, 'token is required');
    const { data } = await supabase.from('property_tenancies')
      .select('id, workspace_id, property_id, status, rent_amount, rent_frequency, currency, start_date, end_date, deposit, tenant_contact_id')
      .eq('portal_token', token).maybeSingle();
    // A revoked token (set to null) simply stops resolving — same 404 as one that never existed.
    if (!data) throw new HttpError(404, 'not found');
    return data;
  }

  if (action === 'tenant-portal') {
    const t = await loadTenancy(String(body?.token ?? ''));
    const [{ data: property }, { data: charges }, { data: jobs }] = await Promise.all([
      supabase.from('properties').select('title, address, town, region').eq('id', t.property_id).maybeSingle(),
      supabase.from('property_rent_charges')
        .select('id, due_date, amount, currency, status, paid_amount, invoice_id')
        .eq('tenancy_id', t.id).order('due_date', { ascending: false }).limit(24),
      supabase.from('property_maintenance')
        .select('id, title, status, priority, reported_at, resolved_at')
        .eq('tenancy_id', t.id).order('reported_at', { ascending: false }).limit(20),
    ]);
    // Settlement is DERIVED, exactly as it is for the agent — the tenant must not be shown a
    // different "still owed" figure from the one in the workbench.
    const settled = await withRentSettlements(supabase, charges ?? []);
    const outstanding = settled.reduce((s: number, c: any) => s + Number(c.outstanding ?? 0), 0);
    return json({
      tenancy: {
        rent_amount: t.rent_amount, rent_frequency: t.rent_frequency, currency: t.currency,
        start_date: t.start_date, end_date: t.end_date, deposit: t.deposit, status: t.status,
      },
      // The tenant lives there — the address is not a disclosure. Internal fields never are.
      property: property ? { title: property.title, address: property.address, town: property.town, region: property.region } : null,
      charges: settled.map((c: any) => ({
        id: c.id, due_date: c.due_date, amount: c.amount, currency: c.currency,
        payment_status: c.payment_status, settled: c.settled, outstanding: c.outstanding,
      })),
      outstanding: Math.round(outstanding * 100) / 100,
      maintenance: jobs ?? [],
    });
  }

  if (action === 'tenant-raise-issue') {
    const t = await loadTenancy(String(body?.token ?? ''));
    const title = String(body?.title ?? '').trim();
    if (!title) return json({ error: 'title is required' }, 400);
    const rl = await enforceLeadRateLimit(supabase, req, 'tenant-raise-issue', t.workspace_id);
    if (rl) return rl;
    // workspace/property/tenancy all come from the resolved token. Priority is NOT taken from the
    // tenant: "urgent" would otherwise be self-declared on every ticket and the field would stop
    // meaning anything to the agent triaging it.
    const { data, error } = await supabase.from('property_maintenance').insert({
      workspace_id: t.workspace_id, property_id: t.property_id, tenancy_id: t.id,
      title: title.slice(0, 200),
      description: String(body?.description ?? '').slice(0, 4000) || null,
      status: 'open', priority: 'normal', reported_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw new HttpError(400, error.message);
    // The agency has to know a repair was reported — a ticket nobody sees is worse than a phone call.
    try {
      await emitFlowEventToWorkspaceRoles(t.workspace_id, ['owner', 'admin'], 'crm_contact_created', (uid: string) => ({
        type: 'realestate_maintenance_reported', workspace_id: t.workspace_id, user_id: uid,
        title: 'Repair reported by a tenant', body: title.slice(0, 200),
        action_url: `/properties/${t.property_id}?tab=lettings`,
      }));
    } catch { /* best-effort */ }
    return json({ ok: true, work_order_id: data.id });
  }

  if (action === 'buyer-set-consent') {
    // GDPR withdrawal + opt-in, self-service. Consent that can only be set by an agent inside the CRM
    // is not withdrawable by the data subject, and there was no other surface where the buyer could
    // turn these emails on or off. The portal token IS the capability — it resolves to exactly one
    // requirement and its contact; workspace and ids are never taken from the body.
    const reqmt = await loadRequirement(String(body?.token ?? ''));
    const on = body?.enabled === true;
    await supabase.from('property_buyer_requirements').update({ digest_enabled: on }).eq('id', reqmt.id);
    // Withdrawal must reach the contact flag too — leaving marketing_consent=true would keep the
    // immediate new-listing alert (a different code path) mailing a buyer who just unsubscribed.
    if (reqmt.crm_contact_id) {
      await supabase.from('crm_contacts').update({ marketing_consent: on }).eq('id', reqmt.crm_contact_id).eq('workspace_id', reqmt.workspace_id);
    }
    return json({ ok: true, alerts_enabled: on });
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
    // Same routing as the listing-page enquiry — a viewing request is the hottest lead the module
    // takes, and it must not be the one shape that lands unowned.
    const { data: assignee } = await supabase.rpc('route_property_lead', {
      p_workspace_id: reqmt.workspace_id, p_property_id: propertyId,
    });
    const { error } = await supabase.from('property_inquiries').insert({
      workspace_id: reqmt.workspace_id, property_id: propertyId,
      name: contact?.name ?? 'Buyer (portal)', email: contact?.email ?? null, phone: contact?.phone ?? null,
      message: String(body?.message ?? '').slice(0, 1000) || 'Viewing requested via buyer portal',
      status: 'new', crm_contact_id: reqmt.crm_contact_id, source: 'buyer_portal',
      assigned_user_id: assignee ?? null,
      assigned_at: assignee ? new Date().toISOString() : null,
    });
    if (error) throw new HttpError(400, error.message);
    return json({ ok: true });
  }

  // ── Cross-workspace Discovery (no token) — only active+public+in_discovery listings, toPublic-projected.
  if (action === 'discover' || action === 'agency-listings') {
    // Semantic search: a free-text `query` embeds (Voyage, input_type 'query') and ranks by
    // cosine against properties.text_embedding via the service-role-only RPC. The RPC filters
    // to the exact discover population (active + is_public + in_discovery), so it can never
    // return a listing the facet path below would not. Falls back to the facet path on any
    // embedding/RPC failure — search degrading to recency beats search failing.
    const queryText = action === 'discover' ? String(body?.query ?? '').trim().slice(0, 500) : '';
    if (queryText) {
      try {
        const emb = await embedText(queryText, 'query');
        if (!emb) throw new Error('no embedding returned');
        const { data: hits, error: rpcErr } = await supabase.rpc('search_properties_semantic', {
          p_embedding: emb,
          p_limit: 60,
          p_property_type: body?.property_type ? String(body.property_type) : null,
          p_transaction_type: body?.transaction_type ? String(body.transaction_type) : null,
          p_town: body?.town ? String(body.town) : null,
          p_price_min: body?.price_min ?? null,
          p_price_max: body?.price_max ?? null,
          p_bedrooms_min: body?.bedrooms_min ?? null,
        });
        if (rpcErr) throw rpcErr;
        const ordered: string[] = (hits ?? []).map((h: any) => h.id);
        if (!ordered.length) return json({ listings: [], semantic: true });
        const { data: rows } = await supabase.from('properties').select('*').in('id', ordered);
        const byId = new Map((rows ?? []).map((r: any) => [r.id, r]));
        const ranked = ordered.map((pid) => byId.get(pid)).filter(Boolean);
        const covers = await coverUrls(ranked.map((r: any) => r.id));
        return json({ listings: ranked.map((r: any) => ({ ...toPublic(r), cover_url: covers[r.id] ?? null })), semantic: true });
      } catch (e) {
        console.error('[real-estate-public] semantic discover failed — falling back to facet search:', e);
      }
    }
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
      // Optional marketing opt-in, captured separately from the required processing consent above.
      // This is the ONLY moment we can ask — the column is NOT NULL DEFAULT false, so a seller who
      // opted in here but was written without it stays permanently unmailable by any automation.
      marketing_consent: body?.marketing_consent === true,
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
    // VR walkthrough: expose ONLY a completed world's public WorldLabs asset URLs — the anon
    // page cannot read vr_worlds itself, and an incomplete/failed world stays invisible.
    let vrWorld: Record<string, unknown> | null = null;
    if (property.vr_world_id) {
      const { data: w } = await supabase.from('vr_worlds')
        .select('status, splat_url_100k, splat_url_500k, splat_url_full, panorama_url, caption')
        .eq('id', property.vr_world_id).maybeSingle();
      if (w?.status === 'completed') {
        vrWorld = { splat_url_100k: w.splat_url_100k, splat_url_500k: w.splat_url_500k, splat_url_full: w.splat_url_full, panorama_url: w.panorama_url, caption: w.caption };
      }
    }
    // Fire-and-forget view counter (never blocks the render).
    supabase.rpc('increment_property_view_count', { p_property_id: property.id }).then(() => {}, () => {});
    return json({ listing: toPublic(property), photos: signed, vr_world: vrWorld });
  }

  if (action === 'inquire') {
    const email = String(body?.email ?? '').trim();
    const name = String(body?.name ?? '').trim();
    if (!name || !email) return json({ error: 'name and email are required' }, 400);
    if (body?.gdpr_consent !== true) return json({ error: 'gdpr_consent is required' }, 400);
    const rl = await enforceLeadRateLimit(supabase, req, 'inquire', property.workspace_id);
    if (rl) return rl;
    // property_id + workspace_id come from the resolved token, NEVER the request body (anti-IDOR).
    // Route the lead at creation. Response time is the whole game on a buyer enquiry, and an
    // unrouted lead sits on the listing until somebody happens to look. Workspace and property come
    // from the resolved token, never the body, so the RPC cannot be pointed at another tenant.
    const { data: assignee } = await supabase.rpc('route_property_lead', {
      p_workspace_id: property.workspace_id, p_property_id: property.id,
    });
    const { error: insErr } = await supabase.from('property_inquiries').insert({
      workspace_id: property.workspace_id, property_id: property.id,
      name, email, phone: String(body?.phone ?? '').slice(0, 40) || null,
      message: String(body?.message ?? '').slice(0, 4000) || null,
      source: 'listing_page', gdpr_consent: true,
      assigned_user_id: assignee ?? null,
      assigned_at: assignee ? new Date().toISOString() : null,
      // Separate, OPTIONAL marketing opt-in. `convert-inquiry` carries it onto the crm_contact, which
      // is what the direct-to-buyer alert and the digest cron gate on. Absent this the enquirer is
      // opted out for good (crm_contacts.marketing_consent is NOT NULL DEFAULT false) and the alert
      // path silently never fires for them. Strict === true: only an affirmative act is consent.
      marketing_consent: body?.marketing_consent === true,
    });
    if (insErr) throw new HttpError(400, insErr.message);
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
