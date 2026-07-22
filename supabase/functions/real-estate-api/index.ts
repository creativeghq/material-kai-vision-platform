// deno-lint-ignore-file no-explicit-any
// #249 — Real Estate module API (P1). Authed CRUD/publish/media/inquiry/viewing router for the
// `real-estate` add-on. The public token page lives in a SEPARATE fn (real-estate-public).
//
// SECURITY (pen-test #250 baseline — cloned from hr-api):
//  • authenticate() yields a SERVICE-ROLE client (RLS bypassed) → every action re-derives the
//    workspace from the caller and calls userCanAccessWorkspace() (systemic root #2, no body trust).
//  • Module gates: isModuleEnabled('real-estate') [publish] + assertEntitled [402], strict priority.
//  • RBAC: resolveRealEstateAccess — broker (owner/admin) manage + see all leads; realestate_agent
//    manages listings + OWN leads/viewings (D7); other members read the shared listings only (D1).
//  • Writes go through PROPERTY_WRITABLE allowlist (no mass-assignment/BOPLA). Trust/derived/system
//    fields (workspace_id, view_count, public_listing_token, published_at, …) are server-set only.
//  • Publish runs the compliance gate (GR hard-block); toPublic() is never applied here (management
//    sees full rows) — it is the public fn's contract.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';
import { checkPublishRequirements } from '../_shared/real-estate.ts';
import { resolveRealEstateAccess, PROPERTY_WRITABLE, pick } from './rbac.ts';
import { draftListingCopy, analyzePropertyPhotos } from './ai.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

/** Does a buyer requirement's saved-search criteria match a listing? (deterministic facets) */
function matchesCriteria(c: any, p: any): boolean {
  if (!c) return false;
  if (c.type && c.type !== p.property_type) return false;
  if (c.transaction_type && c.transaction_type !== p.transaction_type) return false;
  if (c.price_min != null && p.price != null && Number(p.price) < Number(c.price_min)) return false;
  if (c.price_max != null && p.price != null && Number(p.price) > Number(c.price_max)) return false;
  if (c.beds != null && p.bedrooms != null && Number(p.bedrooms) < Number(c.beds)) return false;
  if (c.baths != null && p.bathrooms != null && Number(p.bathrooms) < Number(c.baths)) return false;
  if (c.location) { const loc = `${p.town ?? ''} ${p.region ?? ''}`.toLowerCase(); if (!loc.includes(String(c.location).toLowerCase())) return false; }
  return true;
}

/** Active saved searches in the workspace that match this listing (with their contact). */
async function findMatchingBuyers(supabase: any, workspaceId: string, property: any): Promise<any[]> {
  const { data: reqs } = await supabase.from('property_buyer_requirements')
    .select('id, criteria, label, contact:crm_contacts!property_buyer_requirements_crm_contact_id_fkey ( id, name, email )')
    .eq('workspace_id', workspaceId).eq('is_active', true);
  return (reqs ?? []).filter((r: any) => matchesCriteria(r.criteria, property));
}

/**
 * Emit the buyer-match Flow event (D10). The seeded system-default flow delivers to the listing
 * agent: bell + email now, WhatsApp when the workspace connects Zernio. Never hardcode the send —
 * this only emits; the Flows engine owns delivery. `reason` distinguishes new-listing vs price-drop.
 */
async function emitBuyerMatchAlert(supabase: any, workspaceId: string, property: any, reason: 'new_listing' | 'price_drop'): Promise<void> {
  try {
    const matches = await findMatchingBuyers(supabase, workspaceId, property);
    if (!matches.length) return;
    const agentUserId = property.listing_agent_id ?? property.created_by;
    if (!agentUserId) return;
    const { data: prof } = await supabase.from('user_profiles').select('email, phone').eq('user_id', agentUserId).maybeSingle();
    const names = matches.map((m: any) => m.contact?.name || m.contact?.email || 'a buyer').slice(0, 5).join(', ');
    const label = property.title || property.reference_code || 'your listing';
    const lead = reason === 'price_drop' ? 'Price drop' : 'New listing';
    await emitFlowEvent('realestate.buyer_matches_found', {
      workspace_id: workspaceId,
      user_id: agentUserId,
      email: prof?.email ?? null,
      phone: prof?.phone ?? null,
      type: 'realestate_buyer_match',
      title: `${matches.length} buyer${matches.length > 1 ? 's' : ''} match “${label}”`,
      subject: `${lead}: ${matches.length} matching buyer${matches.length > 1 ? 's' : ''}`,
      body: `${lead} — ${matches.length} registered buyer(s) match this listing: ${names}.`,
      action_url: `/properties/${property.id}`,
      property_id: property.id,
      match_count: matches.length,
      reason,
    });
  } catch (_) { /* non-fatal — alerting must never block the listing op */ }
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const INQUIRY_STATUSES = ['new', 'contacted', 'qualified', 'viewing_booked', 'closed', 'spam'];
const VIEWING_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];
const VIEWING_TYPES = ['viewing', 'tour', 'open_house'];
const INTEREST_TYPES = ['viewed', 'interested', 'favorite', 'offer_made'];

/** url-safe random token for the public listing page. */
function newToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

Deno.serve(withApiLogging('real-estate-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const action = String(body?.action ?? '').trim();
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!action) return json({ error: 'action is required' }, 400);
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);

  // Gates 1–2 concurrent, evaluate access 404 → module 404 → entitlement 402.
  const accessP = userCanAccessWorkspace(supabase, userId, workspaceId);
  const moduleP = isModuleEnabled(supabase, 'real-estate');
  const entP = assertEntitled(supabase, workspaceId, 'real-estate');
  if (!(await accessP)) return json({ error: 'not found' }, 404);
  if (!(await moduleP)) throw new HttpError(404, 'Real Estate module is not available');
  const ent = await entP;
  if (!ent.ok) return ent.response;

  // 3) RBAC.
  const access = await resolveRealEstateAccess(supabase, userId, workspaceId);
  if (!access.canView) return json({ error: 'You do not have access to Real Estate in this workspace.' }, 403);
  const requireManage = () => {
    if (!access.canManage) throw new HttpError(403, 'You need the listings-manage role for this action.');
  };

  // #249 agent scoping: a non-broker (realestate_agent) owns a listing when they're its listing agent
  // or its creator; "open_for_all" makes a listing VIEWABLE (not editable) by all agents. Brokers see all.
  const ownsProperty = (p: any) => access.isBroker || p.listing_agent_id === userId || p.created_by === userId;
  const canViewProperty = (p: any) => ownsProperty(p) || !!p.open_for_all;

  /** Load a property scoped to the workspace + view permission, or throw 404 (enumeration-safe). */
  async function loadProperty(id: string): Promise<any> {
    const { data, error } = await supabase.from('properties').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw new HttpError(400, error.message);
    if (!data) throw new HttpError(404, 'not found');
    if (!canViewProperty(data)) throw new HttpError(404, 'not found'); // agent can't see others' private listings
    return data;
  }

  /** Load a property the caller may EDIT (own or broker), else 403. */
  async function loadEditable(id: string): Promise<any> {
    const p = await loadProperty(id);
    if (!ownsProperty(p)) throw new HttpError(403, 'This listing belongs to another agent.');
    return p;
  }

  try {
    switch (action) {
      case 'ping':
        return json({ ok: true, module: 'real-estate', workspace_id: workspaceId, access });

      // ── Dashboard rollup (one round trip; leads/viewings honor agent scoping, D7) ──
      case 'dashboard': {
        const now = new Date();
        const weekAhead = new Date(now.getTime() + 7 * 864e5).toISOString();
        const [{ data: statusRows }, { data: recentLeads }, { data: upcoming }] = await Promise.all([
          supabase.from('properties').select('listing_status, is_public').eq('workspace_id', workspaceId),
          supabase.from('property_inquiries')
            .select('id, name, email, status, created_at, property_id, property:properties!property_inquiries_property_id_fkey ( title, listing_agent_id )')
            .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(40),
          supabase.from('property_viewings')
            .select('id, scheduled_at, type, status, agent_id, property_id, property:properties!property_viewings_property_id_fkey ( title )')
            .eq('workspace_id', workspaceId).gte('scheduled_at', now.toISOString()).lte('scheduled_at', weekAhead).order('scheduled_at').limit(50),
        ]);
        const byStatus: Record<string, number> = {};
        let publicCount = 0;
        for (const r of statusRows ?? []) { byStatus[r.listing_status] = (byStatus[r.listing_status] ?? 0) + 1; if (r.is_public) publicCount++; }
        const leads = (recentLeads ?? []).filter((r: any) => access.isBroker || r.property?.listing_agent_id === userId);
        const viewings = (upcoming ?? []).filter((r: any) => access.isBroker || r.agent_id === userId);
        return json({
          totals: { listings: (statusRows ?? []).length, public: publicCount, active: byStatus['active'] ?? 0, draft: byStatus['draft'] ?? 0, under_offer: byStatus['under_offer'] ?? 0 },
          new_leads: leads.filter((l: any) => l.status === 'new').length,
          recent_leads: leads.slice(0, 6),
          upcoming_viewings: viewings.slice(0, 8),
        });
      }

      // ── Properties ─────────────────────────────────────────────────────
      case 'list-properties': {
        let q = supabase.from('properties')
          .select('id, reference_code, title, property_type, subtype, transaction_type, listing_status, price, currency, town, region, is_public, in_discovery, syndicate_to, listing_agent_id, created_by, open_for_all, view_count, updated_at, created_at')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false });
        if (body.status) q = q.eq('listing_status', String(body.status));
        if (body.property_type) q = q.eq('property_type', String(body.property_type));
        // Estate-agent scoping: own listings + any flagged open_for_all. Brokers (owner/admin) see all.
        if (!access.isBroker) q = q.or(`listing_agent_id.eq.${userId},created_by.eq.${userId},open_for_all.eq.true`);
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return json({ properties: data ?? [] });
      }

      case 'get-property': {
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const property = await loadProperty(id);
        const [{ data: photos }, { data: inquiries }, { data: viewings }, { data: priceHistory }, { data: openHouses }, { data: documents }] = await Promise.all([
          supabase.from('property_photos').select('*').eq('property_id', id).order('sort_order'),
          supabase.from('property_inquiries').select('*').eq('property_id', id).order('created_at', { ascending: false }),
          supabase.from('property_viewings').select('*').eq('property_id', id).order('scheduled_at', { ascending: false }),
          supabase.from('property_price_history').select('*').eq('property_id', id).order('changed_at', { ascending: false }),
          supabase.from('property_open_houses').select('*').eq('property_id', id).order('starts_at'),
          supabase.from('property_documents').select('*').eq('property_id', id).order('created_at', { ascending: false }),
        ]);
        return json({ property, can_edit: ownsProperty(property), photos: photos ?? [], inquiries: inquiries ?? [], viewings: viewings ?? [], price_history: priceHistory ?? [], open_houses: openHouses ?? [], documents: documents ?? [] });
      }

      case 'create-property': {
        requireManage();
        const payload = pick(body, PROPERTY_WRITABLE);
        // The creator becomes the listing agent (owner) unless a broker explicitly assigns another.
        if (payload.listing_agent_id === undefined) payload.listing_agent_id = userId;
        const { data, error } = await supabase.from('properties')
          .insert({ ...payload, workspace_id: workspaceId, created_by: userId })
          .select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ property: data });
      }

      case 'update-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        const payload = pick(body, PROPERTY_WRITABLE);
        // record a price-history row when price changes; flag a drop for buyer-match alerts
        let priceDropped = false;
        if (payload.price !== undefined) {
          const { data: cur } = await supabase.from('properties').select('price, currency').eq('id', id).single();
          if (cur && Number(cur.price) !== Number(payload.price)) {
            await supabase.from('property_price_history').insert({ workspace_id: workspaceId, property_id: id, price: payload.price, currency: (payload.currency as string) ?? cur.currency, note: 'list price updated' });
            if (payload.price != null && cur.price != null && Number(payload.price) < Number(cur.price)) priceDropped = true;
          }
        }
        const { data, error } = await supabase.from('properties').update(payload).eq('id', id).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        if (priceDropped && data.is_public && data.listing_status === 'active') await emitBuyerMatchAlert(supabase, workspaceId, data, 'price_drop');
        return json({ property: data });
      }

      case 'delete-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        const { error } = await supabase.from('properties').delete().eq('id', id).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'publish-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const property = await loadEditable(id);
        const gate = checkPublishRequirements(property);
        if (!gate.ok) return json({ code: 'publish_blocked', errors: gate.hardErrors, warnings: gate.warnings }, 422);
        const patch: Record<string, unknown> = {
          listing_status: 'active',
          is_public: true,
          published_at: new Date().toISOString(),
          public_listing_token: property.public_listing_token ?? newToken(),
        };
        if (!property.listing_date) patch.listing_date = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase.from('properties').update(patch).eq('id', id).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        await emitBuyerMatchAlert(supabase, workspaceId, data, 'new_listing'); // D10 — alert agent of matching buyers
        return json({ property: data, warnings: gate.warnings });
      }

      case 'draft-description': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const property = await loadEditable(id);
        // Credit-metered (reserve → call → settle inside draftListingCopy). Returns a draft the
        // workbench fills into the form for human review before Save (fair-housing safety).
        const copy = await draftListingCopy(supabase, userId, workspaceId, property);
        return json(copy);
      }

      case 'unpublish-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        const { data, error } = await supabase.from('properties')
          .update({ is_public: false, in_discovery: false, listing_status: 'draft' })
          .eq('id', id).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ property: data });
      }

      // ── Photos (protected property-media bucket) ───────────────────────
      case 'photo-upload-url': {
        requireManage();
        const id = String(body.property_id ?? '');
        const ext = String(body.ext ?? 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        const path = `${workspaceId}/${id}/${crypto.randomUUID()}.${ext}`;
        const { data, error } = await supabase.storage.from('property-media').createSignedUploadUrl(path);
        if (error) throw new HttpError(400, error.message);
        return json({ path, token: data.token, signed_url: data.signedUrl });
      }

      case 'add-photo': {
        requireManage();
        const id = String(body.property_id ?? '');
        const storagePath = String(body.storage_path ?? '');
        if (!id || !storagePath) return json({ error: 'property_id and storage_path are required' }, 400);
        await loadEditable(id);
        const kind = ['photo', 'floor_plan', 'render'].includes(body.kind) ? body.kind : 'photo';
        const { count } = await supabase.from('property_photos').select('id', { count: 'exact', head: true }).eq('property_id', id);
        const { data, error } = await supabase.from('property_photos').insert({
          workspace_id: workspaceId, property_id: id, storage_path: storagePath, kind,
          caption: body.caption ?? null, sort_order: count ?? 0, is_cover: (count ?? 0) === 0,
        }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ photo: data });
      }

      case 'analyze-photos': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        const { data: photos } = await supabase.from('property_photos').select('id, storage_path').eq('property_id', id).order('sort_order');
        if (!photos?.length) return json({ error: 'no photos to analyze' }, 400);
        const result = await analyzePropertyPhotos(supabase, userId, workspaceId, photos);
        // Write ai_tags per analyzed photo + set the recommended cover.
        for (const a of result.photos) {
          const ph = photos[a.index];
          if (ph) await supabase.from('property_photos').update({ ai_tags: a.tags ?? [] }).eq('id', ph.id).eq('workspace_id', workspaceId);
        }
        const coverPhoto = photos[result.cover_index];
        if (coverPhoto) {
          await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', id).eq('workspace_id', workspaceId);
          await supabase.from('property_photos').update({ is_cover: true }).eq('id', coverPhoto.id).eq('workspace_id', workspaceId);
        }
        return json({ ok: true, cover_photo_id: coverPhoto?.id ?? null, tagged: result.photos.length, credits: result.credits });
      }

      case 'delete-photo': {
        requireManage();
        const photoId = String(body.photo_id ?? '');
        if (!photoId) return json({ error: 'photo_id is required' }, 400);
        const { data: photo } = await supabase.from('property_photos').select('storage_path').eq('id', photoId).eq('workspace_id', workspaceId).maybeSingle();
        if (photo?.storage_path) await supabase.storage.from('property-media').remove([photo.storage_path]);
        const { error } = await supabase.from('property_photos').delete().eq('id', photoId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'set-cover': {
        requireManage();
        const photoId = String(body.photo_id ?? '');
        const id = String(body.property_id ?? '');
        if (!photoId || !id) return json({ error: 'photo_id and property_id are required' }, 400);
        await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', id).eq('workspace_id', workspaceId);
        const { error } = await supabase.from('property_photos').update({ is_cover: true }).eq('id', photoId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'reorder-photos': {
        requireManage();
        const orderedIds: string[] = Array.isArray(body.photo_ids) ? body.photo_ids : [];
        for (let i = 0; i < orderedIds.length; i++) {
          await supabase.from('property_photos').update({ sort_order: i }).eq('id', orderedIds[i]).eq('workspace_id', workspaceId);
        }
        return json({ ok: true });
      }

      // ── Inquiries / leads (agent-scoped read, D7) ──────────────────────
      case 'list-inquiries': {
        let q = supabase.from('property_inquiries')
          .select('*, property:properties!property_inquiries_property_id_fkey ( id, title, reference_code, listing_agent_id )')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });
        if (body.status) q = q.eq('status', String(body.status));
        if (body.property_id) q = q.eq('property_id', String(body.property_id));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        // Non-broker agent sees only inquiries on the listings they own (D7).
        const rows = (data ?? []).filter((r: any) => access.isBroker || r.property?.listing_agent_id === userId);
        return json({ inquiries: rows });
      }

      case 'convert-inquiry': {
        // Turn an anonymous inquiry into a trackable CRM lead (D9: the lead IS a crm_contact),
        // link it to the inquiry + property, and assign it to the caller (responsible_sales_user_ids).
        const inqId = String(body.inquiry_id ?? '');
        if (!inqId) return json({ error: 'inquiry_id is required' }, 400);
        const { data: inq } = await supabase.from('property_inquiries').select('*').eq('id', inqId).eq('workspace_id', workspaceId).maybeSingle();
        if (!inq) return json({ error: 'not found' }, 404);
        if (inq.crm_contact_id) return json({ crm_contact_id: inq.crm_contact_id, already_linked: true });

        const { data: contact, error: cErr } = await supabase.from('crm_contacts').insert({
          workspace_id: workspaceId, name: inq.name || inq.email || 'Website lead', email: inq.email, phone: inq.phone,
          contact_type: 'buyer', lead_source: 'property_portal', lead_status: 'new',
          responsible_sales_user_ids: [userId],
        }).select('id').single();
        if (cErr) throw new HttpError(400, cErr.message);

        await supabase.from('property_inquiries').update({ crm_contact_id: contact.id, status: 'contacted' }).eq('id', inqId).eq('workspace_id', workspaceId);
        await supabase.from('property_interests').upsert(
          { workspace_id: workspaceId, property_id: inq.property_id, crm_contact_id: contact.id, interest_type: 'interested', note: 'from listing enquiry' },
          { onConflict: 'property_id,crm_contact_id,interest_type' });
        await supabase.from('property_contacts_ext').upsert({ crm_contact_id: contact.id, workspace_id: workspaceId, contact_role: 'buyer' }, { onConflict: 'crm_contact_id' });
        return json({ crm_contact_id: contact.id });
      }

      case 'update-inquiry': {
        const inqId = String(body.inquiry_id ?? '');
        const status = String(body.status ?? '');
        if (!inqId || !INQUIRY_STATUSES.includes(status)) return json({ error: 'inquiry_id and a valid status are required' }, 400);
        const { data, error } = await supabase.from('property_inquiries').update({ status }).eq('id', inqId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ inquiry: data });
      }

      // ── Viewings (agent-scoped, Google Calendar sync in P2) ────────────
      case 'list-viewings': {
        let q = supabase.from('property_viewings')
          .select('*, property:properties!property_viewings_property_id_fkey ( id, title, reference_code )')
          .eq('workspace_id', workspaceId)
          .order('scheduled_at', { ascending: false });
        if (!access.isBroker) q = q.eq('agent_id', userId);       // D7 self-scope
        if (body.property_id) q = q.eq('property_id', String(body.property_id));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return json({ viewings: data ?? [] });
      }

      case 'create-viewing': {
        const id = String(body.property_id ?? '');
        const scheduledAt = String(body.scheduled_at ?? '');
        if (!id || !scheduledAt) return json({ error: 'property_id and scheduled_at are required' }, 400);
        const prop = await loadProperty(id);
        const type = VIEWING_TYPES.includes(body.type) ? body.type : 'viewing';
        const contactId = body.crm_contact_id ?? null;
        const agentId = body.agent_id ?? userId;
        // Mirror into the platform calendar (crm_meetings) so it shows in Profile→Calendar /
        // Appointments and gets the reminder cron. reminder_at is computed by crm_meetings_sync_trg.
        const subject = `${type === 'open_house' ? 'Open house' : type === 'tour' ? 'Property tour' : 'Viewing'} — ${prop.title || prop.reference_code || 'listing'}`;
        const location = [prop.hide_exact_address ? null : prop.address, prop.town, prop.region].filter(Boolean).join(', ') || null;
        const { data: meeting } = await supabase.from('crm_meetings').insert({
          workspace_id: workspaceId, owner_user_id: agentId,
          target_kind: contactId ? 'contact' : null, target_id: contactId,
          subject, notes: prop.reference_code ? `Ref ${prop.reference_code}` : null,
          meeting_at: scheduledAt, location, remind_email: true, reminder_minutes_before: 60, status: 'scheduled',
        }).select('id').single();
        const { data, error } = await supabase.from('property_viewings').insert({
          workspace_id: workspaceId, property_id: id, scheduled_at: scheduledAt, type,
          crm_contact_id: contactId, agent_id: agentId, meeting_id: meeting?.id ?? null,
        }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ viewing: data });
      }

      case 'update-viewing': {
        const vId = String(body.viewing_id ?? '');
        if (!vId) return json({ error: 'viewing_id is required' }, 400);
        const patch: Record<string, unknown> = {};
        if (body.status !== undefined) {
          if (!VIEWING_STATUSES.includes(String(body.status))) return json({ error: 'invalid status' }, 400);
          patch.status = body.status;
        }
        if (body.scheduled_at !== undefined) patch.scheduled_at = body.scheduled_at;
        if (body.feedback !== undefined) patch.feedback = body.feedback;
        const { data, error } = await supabase.from('property_viewings').update(patch).eq('id', vId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        // Keep the linked calendar meeting in sync (reschedule + status; trigger recomputes reminder_at).
        if (data?.meeting_id && (body.status !== undefined || body.scheduled_at !== undefined)) {
          const mPatch: Record<string, unknown> = {};
          if (body.scheduled_at !== undefined) mPatch.meeting_at = body.scheduled_at;
          // crm_meetings.status ∈ {scheduled, done, cancelled}
          if (body.status !== undefined) mPatch.status = body.status === 'completed' ? 'done' : (body.status === 'cancelled' || body.status === 'no_show') ? 'cancelled' : 'scheduled';
          await supabase.from('crm_meetings').update(mPatch).eq('id', data.meeting_id).eq('workspace_id', workspaceId);
        }
        return json({ viewing: data });
      }

      // ── Interests (contact ↔ property) ─────────────────────────────────
      case 'add-interest': {
        const id = String(body.property_id ?? '');
        const contactId = String(body.crm_contact_id ?? '');
        const interestType = INTEREST_TYPES.includes(body.interest_type) ? body.interest_type : 'interested';
        if (!id || !contactId) return json({ error: 'property_id and crm_contact_id are required' }, 400);
        await loadProperty(id);
        const { data, error } = await supabase.from('property_interests')
          .upsert({ workspace_id: workspaceId, property_id: id, crm_contact_id: contactId, interest_type: interestType, note: body.note ?? null },
            { onConflict: 'property_id,crm_contact_id,interest_type' })
          .select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ interest: data });
      }

      // ── Buyer requirements (saved searches; auto-match in P2) ───────────
      case 'list-buyer-requirements': {
        let q = supabase.from('property_buyer_requirements').select('*').eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
        if (body.crm_contact_id) q = q.eq('crm_contact_id', String(body.crm_contact_id));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return json({ requirements: data ?? [] });
      }

      case 'upsert-buyer-requirement': {
        const contactId = String(body.crm_contact_id ?? '');
        if (!contactId) return json({ error: 'crm_contact_id is required' }, 400);
        const row: Record<string, unknown> = {
          workspace_id: workspaceId, crm_contact_id: contactId,
          label: body.label ?? null, criteria: body.criteria ?? {}, is_active: body.is_active ?? true,
        };
        if (body.requirement_id) {
          const { data, error } = await supabase.from('property_buyer_requirements').update(row).eq('id', String(body.requirement_id)).eq('workspace_id', workspaceId).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ requirement: data });
        }
        const { data, error } = await supabase.from('property_buyer_requirements').insert(row).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ requirement: data });
      }

      case 'match-buyer-requirement': {
        // Deterministic criteria match of a saved buyer search against the workspace's active
        // listings (facet-style; Voyage semantic re-rank is a MIVAA follow-up once text_embedding lands).
        const reqId = String(body.requirement_id ?? '');
        if (!reqId) return json({ error: 'requirement_id is required' }, 400);
        const { data: req } = await supabase.from('property_buyer_requirements').select('*').eq('id', reqId).eq('workspace_id', workspaceId).maybeSingle();
        if (!req) return json({ error: 'not found' }, 404);
        const c = (req.criteria ?? {}) as Record<string, any>;
        let q = supabase.from('properties')
          .select('id, title, reference_code, property_type, transaction_type, price, currency, town, region, bedrooms, bathrooms, area_built, is_public, public_listing_token')
          .eq('workspace_id', workspaceId).in('listing_status', ['active', 'under_offer']);
        if (c.type) q = q.eq('property_type', String(c.type));
        if (c.transaction_type) q = q.eq('transaction_type', String(c.transaction_type));
        if (c.price_min != null) q = q.gte('price', Number(c.price_min));
        if (c.price_max != null) q = q.lte('price', Number(c.price_max));
        if (c.beds != null) q = q.gte('bedrooms', Number(c.beds));
        if (c.baths != null) q = q.gte('bathrooms', Number(c.baths));
        if (c.location) q = q.or(`town.ilike.%${String(c.location)}%,region.ilike.%${String(c.location)}%`);
        const { data, error } = await q.limit(50);
        if (error) throw new HttpError(400, error.message);
        return json({ requirement: req, matches: data ?? [] });
      }

      case 'buyers-for-property': {
        // The inverse: which active saved searches would match this listing (buyer leads for it).
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const p = await loadProperty(id);
        const { data: reqs } = await supabase.from('property_buyer_requirements')
          .select('*, contact:crm_contacts!property_buyer_requirements_crm_contact_id_fkey ( id, name, email )')
          .eq('workspace_id', workspaceId).eq('is_active', true);
        const matches = (reqs ?? []).filter((r: any) => matchesCriteria(r.criteria, p));
        return json({ matches });
      }

      case 'delete-buyer-requirement': {
        const reqId = String(body.requirement_id ?? '');
        if (!reqId) return json({ error: 'requirement_id is required' }, 400);
        const { error } = await supabase.from('property_buyer_requirements').delete().eq('id', reqId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      // ── Contact real-estate extension (1:1) ────────────────────────────
      case 'get-contact-ext': {
        const contactId = String(body.crm_contact_id ?? '');
        if (!contactId) return json({ error: 'crm_contact_id is required' }, 400);
        const { data } = await supabase.from('property_contacts_ext').select('*').eq('crm_contact_id', contactId).eq('workspace_id', workspaceId).maybeSingle();
        return json({ ext: data ?? null });
      }

      case 'upsert-contact-ext': {
        const contactId = String(body.crm_contact_id ?? '');
        if (!contactId) return json({ error: 'crm_contact_id is required' }, 400);
        const EXT_WRITABLE = ['contact_role', 'pre_approval_status', 'pre_approval_amount', 'lender', 'budget_min', 'budget_max', 'owned_property_value', 'owned_property_address', 'owned_property_equity'];
        const row = { ...pick(body, EXT_WRITABLE), crm_contact_id: contactId, workspace_id: workspaceId };
        const { data, error } = await supabase.from('property_contacts_ext').upsert(row, { onConflict: 'crm_contact_id' }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ ext: data });
      }

      // ── Syndication feed settings ──────────────────────────────────────
      case 'get-feed-settings': {
        let { data: row } = await supabase.from('real_estate_settings').select('*').eq('workspace_id', workspaceId).maybeSingle();
        if (!row) {
          if (!access.canManage) return json({ settings: null });
          const ins = await supabase.from('real_estate_settings').insert({ workspace_id: workspaceId }).select('*').single();
          if (ins.error) throw new HttpError(400, ins.error.message);
          row = ins.data;
        }
        return json({ settings: row });
      }

      case 'update-feed-settings': {
        requireManage();
        const patch: Record<string, unknown> = {};
        if (body.feed_enabled !== undefined) patch.feed_enabled = !!body.feed_enabled;
        if (body.feed_format !== undefined) {
          if (!['kyero', 'generic'].includes(String(body.feed_format))) return json({ error: 'invalid feed_format' }, 400);
          patch.feed_format = body.feed_format;
        }
        const { data, error } = await supabase.from('real_estate_settings')
          .upsert({ workspace_id: workspaceId, ...patch }, { onConflict: 'workspace_id' }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ settings: data });
      }

      case 'rotate-feed-token': {
        requireManage();
        const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
        const { data, error } = await supabase.from('real_estate_settings')
          .upsert({ workspace_id: workspaceId, feed_token: token }, { onConflict: 'workspace_id' }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ settings: data });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return json({ error: (e as Error)?.message ?? 'internal error' }, 500);
  }
}));
