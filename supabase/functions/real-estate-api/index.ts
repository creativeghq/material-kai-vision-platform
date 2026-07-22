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

  /** Load a property scoped to the workspace, or throw 404 (enumeration-safe). */
  async function loadProperty(id: string): Promise<any> {
    const { data, error } = await supabase.from('properties').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw new HttpError(400, error.message);
    if (!data) throw new HttpError(404, 'not found');
    return data;
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
          .select('id, reference_code, title, property_type, subtype, transaction_type, listing_status, price, currency, town, region, is_public, in_discovery, syndicate_to, listing_agent_id, view_count, updated_at, created_at')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false });
        if (body.status) q = q.eq('listing_status', String(body.status));
        if (body.property_type) q = q.eq('property_type', String(body.property_type));
        // Agent scoping (D7) is applied to leads/viewings, NOT to listings (shared team asset, D1).
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
        return json({ property, photos: photos ?? [], inquiries: inquiries ?? [], viewings: viewings ?? [], price_history: priceHistory ?? [], open_houses: openHouses ?? [], documents: documents ?? [] });
      }

      case 'create-property': {
        requireManage();
        const payload = pick(body, PROPERTY_WRITABLE);
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
        await loadProperty(id); // 404 if not in workspace
        const payload = pick(body, PROPERTY_WRITABLE);
        // record a price-history row when price changes
        if (payload.price !== undefined) {
          const { data: cur } = await supabase.from('properties').select('price, currency').eq('id', id).single();
          if (cur && Number(cur.price) !== Number(payload.price)) {
            await supabase.from('property_price_history').insert({ workspace_id: workspaceId, property_id: id, price: payload.price, currency: (payload.currency as string) ?? cur.currency, note: 'list price updated' });
          }
        }
        const { data, error } = await supabase.from('properties').update(payload).eq('id', id).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ property: data });
      }

      case 'delete-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const { error } = await supabase.from('properties').delete().eq('id', id).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'publish-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const property = await loadProperty(id);
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
        return json({ property: data, warnings: gate.warnings });
      }

      case 'draft-description': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        const property = await loadProperty(id);
        // Credit-metered (reserve → call → settle inside draftListingCopy). Returns a draft the
        // workbench fills into the form for human review before Save (fair-housing safety).
        const copy = await draftListingCopy(supabase, userId, workspaceId, property);
        return json(copy);
      }

      case 'unpublish-property': {
        requireManage();
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadProperty(id);
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
        await loadProperty(id);
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
        await loadProperty(id);
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
        await loadProperty(id);
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
        await loadProperty(id);
        const type = VIEWING_TYPES.includes(body.type) ? body.type : 'viewing';
        const { data, error } = await supabase.from('property_viewings').insert({
          workspace_id: workspaceId, property_id: id, scheduled_at: scheduledAt, type,
          crm_contact_id: body.crm_contact_id ?? null,
          agent_id: body.agent_id ?? userId,          // defaults to the caller (the acting agent)
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
