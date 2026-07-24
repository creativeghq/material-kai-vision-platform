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

/** #281 Investments: derive yield/cap-rate/cash-flow metrics from the stored inputs. */
function computeInvestmentMetrics(r: any) {
  const num = (x: any) => Number(x ?? 0);
  const round = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : 0);
  const pct = (x: number) => round(x * 100, 2);
  const purchase = num(r.purchase_price);
  const totalInvestment = purchase + num(r.acquisition_costs) + num(r.renovation_costs);
  const vac = Math.min(Math.max(num(r.vacancy_pct), 0), 100) / 100;
  const grossAnnualRent = (num(r.monthly_rent) + num(r.other_monthly_income)) * 12;
  const effectiveAnnualRent = grossAnnualRent * (1 - vac);
  const annualOpex = num(r.monthly_opex) * 12;
  const noi = effectiveAnnualRent - annualOpex;
  // Debt service as a standard fixed-rate annuity (interest-free loans fall back to straight-line).
  const loan = num(r.loan_amount);
  const monthlyRate = num(r.interest_rate_pct) / 100 / 12;
  const nMonths = num(r.loan_term_years) * 12;
  let monthlyDebt = 0;
  if (loan > 0 && nMonths > 0) {
    monthlyDebt = monthlyRate > 0 ? loan * monthlyRate / (1 - Math.pow(1 + monthlyRate, -nMonths)) : loan / nMonths;
  }
  const annualDebtService = monthlyDebt * 12;
  const annualCashFlow = noi - annualDebtService;
  const cashInvested = Math.max(totalInvestment - loan, 0);
  return {
    total_investment: round(totalInvestment), cash_invested: round(cashInvested),
    gross_annual_rent: round(grossAnnualRent), effective_annual_rent: round(effectiveAnnualRent),
    annual_opex: round(annualOpex), noi: round(noi),
    monthly_debt_service: round(monthlyDebt), annual_debt_service: round(annualDebtService),
    annual_cash_flow: round(annualCashFlow), monthly_cash_flow: round(annualCashFlow / 12),
    gross_yield_pct: purchase > 0 ? pct(grossAnnualRent / purchase) : 0,
    net_yield_pct: totalInvestment > 0 ? pct(noi / totalInvestment) : 0,
    cap_rate_pct: purchase > 0 ? pct(noi / purchase) : 0,
    cash_on_cash_pct: cashInvested > 0 ? pct(annualCashFlow / cashInvested) : 0,
  };
}

/** Active saved searches in the workspace that match this listing (with their contact). */
async function findMatchingBuyers(supabase: any, workspaceId: string, property: any): Promise<any[]> {
  const { data: reqs } = await supabase.from('property_buyer_requirements')
    .select('id, criteria, label, contact:crm_contacts!property_buyer_requirements_crm_contact_id_fkey ( id, name, email, phone, marketing_consent )')
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

    // Direct-to-buyer (#281): notify each CONSENTED matching buyer that a new listing fits their
    // search. GDPR — only contacts with marketing_consent=true. Public listing page as the link.
    if (property.is_public && property.public_listing_token) {
      const pubUrl = `/p/${property.public_listing_token}`;
      const priceStr = property.price != null ? ` — ${new Intl.NumberFormat('en-GB', { style: 'currency', currency: property.currency || 'EUR', maximumFractionDigits: 0 }).format(Number(property.price))}` : '';
      for (const m of matches) {
        const c = m.contact;
        if (!c?.marketing_consent || !c.email) continue;
        await emitFlowEvent('realestate.new_listing_for_buyer', {
          workspace_id: workspaceId, email: c.email, phone: c.phone ?? null, contact_name: c.name ?? null,
          type: 'realestate_new_listing',
          title: 'A new property matches your search',
          subject: `New listing: ${label}`,
          body: `${lead} matching your saved search: ${label}${priceStr}.`,
          action_url: pubUrl, property_id: property.id,
        }).catch(() => {});
      }
    }
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

  // Sub-module entitlement gates (#281): Property Management + Investments are add-ons on top of
  // Real Estate. A workspace without the add-on gets 402 on those actions (root workspace is entitled).
  const PM_ACTIONS = new Set(['list-tenancies', 'upsert-tenancy', 'list-rent-charges', 'generate-rent-schedule', 'mark-rent-paid', 'list-maintenance', 'upsert-maintenance', 'landlord-statement', 'invoice-rent-charge', 'renew-tenancy']);
  const INVEST_ACTIONS = new Set(['get-investment', 'upsert-investment', 'list-investments']);
  if (PM_ACTIONS.has(action)) { const g = await assertEntitled(supabase, workspaceId, 'real-estate-management'); if (!g.ok) return g.response; }
  if (INVEST_ACTIONS.has(action)) { const g = await assertEntitled(supabase, workspaceId, 'real-estate-investments'); if (!g.ok) return g.response; }

  try {
    switch (action) {
      case 'ping':
        return json({ ok: true, module: 'real-estate', workspace_id: workspaceId, access });

      // ── Dashboard rollup (one round trip; leads/viewings honor agent scoping, D7) ──
      case 'dashboard': {
        const now = new Date();
        const weekAhead = new Date(now.getTime() + 7 * 864e5).toISOString();
        const yearStart = new Date(now.getUTCFullYear(), 0, 1).toISOString().slice(0, 10);
        const [{ data: statusRows }, { data: recentLeads }, { data: upcoming }, { data: sales }] = await Promise.all([
          supabase.from('properties').select('listing_status, is_public').eq('workspace_id', workspaceId),
          supabase.from('property_inquiries')
            .select('id, name, email, status, created_at, property_id, property:properties!property_inquiries_property_id_fkey ( title, listing_agent_id )')
            .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(40),
          supabase.from('property_viewings')
            .select('id, scheduled_at, type, status, agent_id, property_id, property:properties!property_viewings_property_id_fkey ( title )')
            .eq('workspace_id', workspaceId).gte('scheduled_at', now.toISOString()).lte('scheduled_at', weekAhead).order('scheduled_at').limit(50),
          supabase.from('property_sales')
            .select('sale_price, commission_base, currency, invoice_id, completed_at, agent_id, property:properties!property_sales_property_id_fkey ( listing_agent_id, created_by, open_for_all )')
            .eq('workspace_id', workspaceId).gte('completed_at', yearStart),
        ]);
        const byStatus: Record<string, number> = {};
        let publicCount = 0;
        for (const r of statusRows ?? []) { byStatus[r.listing_status] = (byStatus[r.listing_status] ?? 0) + 1; if (r.is_public) publicCount++; }
        const leads = (recentLeads ?? []).filter((r: any) => access.isBroker || r.property?.listing_agent_id === userId);
        const viewings = (upcoming ?? []).filter((r: any) => access.isBroker || r.agent_id === userId);
        // Commission rollup (year-to-date), agent-scoped like everything else.
        const myOwn = (s: any) => access.isBroker || s.property?.listing_agent_id === userId || s.property?.created_by === userId || s.agent_id === userId;
        const mySales = (sales ?? []).filter(myOwn);
        const commission = {
          sold_count: mySales.length,
          gross_sales: mySales.reduce((t: number, s: any) => t + Number(s.sale_price ?? 0), 0),
          commission_net: mySales.reduce((t: number, s: any) => t + Number(s.commission_base ?? 0), 0),
          invoiced_count: mySales.filter((s: any) => s.invoice_id).length,
          currency: (mySales[0]?.currency) ?? 'EUR',
        };
        return json({
          totals: { listings: (statusRows ?? []).length, public: publicCount, active: byStatus['active'] ?? 0, draft: byStatus['draft'] ?? 0, under_offer: byStatus['under_offer'] ?? 0, sold: byStatus['sold'] ?? 0 },
          commission,
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
        // Edit a lead: status and/or its contact fields (name/email/phone/message).
        const inqId = String(body.inquiry_id ?? '');
        if (!inqId) return json({ error: 'inquiry_id is required' }, 400);
        const patch: Record<string, unknown> = {};
        if (body.status !== undefined) {
          const status = String(body.status);
          if (!INQUIRY_STATUSES.includes(status)) return json({ error: 'a valid status is required' }, 400);
          patch.status = status;
        }
        for (const k of ['name', 'email', 'phone', 'message']) {
          if (body[k] !== undefined) patch[k] = body[k] === null ? null : String(body[k]).slice(0, 1000);
        }
        if (Object.keys(patch).length === 0) return json({ error: 'nothing to update' }, 400);
        const { data, error } = await supabase.from('property_inquiries').update(patch).eq('id', inqId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ inquiry: data });
      }

      case 'create-inquiry': {
        // Manually record a lead (someone who contacted the agency off-web). property_inquiries
        // requires a property, so a lead is always property-scoped. The lead IS a crm_contact (D9):
        // create/link the contact + a property_interest immediately, mirroring convert-inquiry.
        const name = String(body.name ?? '').trim();
        const propertyId = String(body.property_id ?? '');
        if (!name) return json({ error: 'name is required' }, 400);
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        const { data: prop } = await supabase.from('properties').select('id').eq('id', propertyId).eq('workspace_id', workspaceId).maybeSingle();
        if (!prop) return json({ error: 'property not found' }, 404);
        const email = body.email ? String(body.email).trim() : null;
        const phone = body.phone ? String(body.phone).trim() : null;
        const message = String(body.message ?? '').slice(0, 1000) || 'Manually added lead';

        const { data: contact, error: cErr } = await supabase.from('crm_contacts').insert({
          workspace_id: workspaceId, name, email, phone,
          contact_type: 'buyer', lead_source: 'manual', lead_status: 'new',
          responsible_sales_user_ids: [userId],
        }).select('id').single();
        if (cErr) throw new HttpError(400, cErr.message);

        const { data: inq, error } = await supabase.from('property_inquiries').insert({
          workspace_id: workspaceId, property_id: propertyId, name, email, phone, message,
          status: 'new', source: 'manual', gdpr_consent: true, crm_contact_id: contact.id,
        }).select('*').single();
        if (error) throw new HttpError(400, error.message);

        await supabase.from('property_interests').upsert(
          { workspace_id: workspaceId, property_id: propertyId, crm_contact_id: contact.id, interest_type: 'interested', note: 'manually added lead' },
          { onConflict: 'property_id,crm_contact_id,interest_type' });
        return json({ inquiry: inq, crm_contact_id: contact.id });
      }

      // ── Deletes for the sub-entities (workspace-scoped + editable-property guard) ──
      // Property-scoped: fetch the row's property_id, assert it's editable by the caller, then delete.
      case 'delete-inquiry':
      case 'delete-offer':
      case 'delete-viewing':
      case 'delete-tenancy':
      case 'delete-maintenance':
      case 'delete-sale': {
        requireManage();
        const MAP: Record<string, { table: string; idKey: string }> = {
          'delete-inquiry': { table: 'property_inquiries', idKey: 'inquiry_id' },
          'delete-offer': { table: 'property_offers', idKey: 'offer_id' },
          'delete-viewing': { table: 'property_viewings', idKey: 'viewing_id' },
          'delete-tenancy': { table: 'property_tenancies', idKey: 'tenancy_id' },
          'delete-maintenance': { table: 'property_maintenance', idKey: 'work_order_id' },
          'delete-sale': { table: 'property_sales', idKey: 'sale_id' },
        };
        const { table, idKey } = MAP[action];
        const rowId = String(body[idKey] ?? '');
        if (!rowId) return json({ error: `${idKey} is required` }, 400);
        const { data: ex } = await supabase.from(table).select('property_id').eq('id', rowId).eq('workspace_id', workspaceId).maybeSingle();
        if (!ex) return json({ error: 'not found' }, 404);
        await loadEditable(ex.property_id);
        const { error } = await supabase.from(table).delete().eq('id', rowId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'delete-investment': {
        requireManage();
        const propertyId = String(body.property_id ?? '');
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        await loadEditable(propertyId);
        const { error } = await supabase.from('property_investments').delete().eq('property_id', propertyId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'delete-contact-ext': {
        // Unlink a person from Real Estate (removes their buyer/seller role); the CRM contact stays.
        requireManage();
        const contactId = String(body.crm_contact_id ?? '');
        if (!contactId) return json({ error: 'crm_contact_id is required' }, 400);
        const { error } = await supabase.from('property_contacts_ext').delete().eq('crm_contact_id', contactId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
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

      // ── Offers (competing bids per property) ───────────────────────────
      case 'list-offers': {
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadProperty(id);
        const { data, error } = await supabase.from('property_offers')
          .select('*, buyer:crm_contacts!property_offers_buyer_contact_id_fkey ( id, name, email )')
          .eq('property_id', id).eq('workspace_id', workspaceId).order('created_at', { ascending: false });
        if (error) throw new HttpError(400, error.message);
        return json({ offers: data ?? [] });
      }

      case 'create-offer': {
        const id = String(body.property_id ?? '');
        if (!id || body.amount == null) return json({ error: 'property_id and amount are required' }, 400);
        await loadEditable(id);
        const { data, error } = await supabase.from('property_offers').insert({
          workspace_id: workspaceId, property_id: id, amount: Number(body.amount), currency: body.currency ?? 'EUR',
          buyer_contact_id: body.buyer_contact_id ?? null, buyer_name: body.buyer_name ?? null, terms: body.terms ?? null,
          proof_of_funds: !!body.proof_of_funds, mortgage_in_principle: !!body.mortgage_in_principle, chain_free: !!body.chain_free,
          note: body.note ?? null, agent_id: userId, created_by: userId, status: 'offered',
        }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ offer: data });
      }

      case 'update-offer': {
        const offerId = String(body.offer_id ?? '');
        if (!offerId) return json({ error: 'offer_id is required' }, 400);
        const { data: cur } = await supabase.from('property_offers').select('property_id').eq('id', offerId).eq('workspace_id', workspaceId).maybeSingle();
        if (!cur) return json({ error: 'not found' }, 404);
        await loadEditable(cur.property_id);
        const patch: Record<string, unknown> = {};
        if (body.status !== undefined) {
          if (!['offered', 'countered', 'accepted', 'rejected', 'withdrawn'].includes(String(body.status))) return json({ error: 'invalid status' }, 400);
          patch.status = body.status;
        }
        if (body.amount !== undefined) patch.amount = Number(body.amount);
        if (body.terms !== undefined) patch.terms = body.terms;
        if (body.note !== undefined) patch.note = body.note;
        const { data, error } = await supabase.from('property_offers').update(patch).eq('id', offerId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ offer: data });
      }

      case 'accept-offer': {
        const offerId = String(body.offer_id ?? '');
        if (!offerId) return json({ error: 'offer_id is required' }, 400);
        const { data: offer } = await supabase.from('property_offers').select('property_id').eq('id', offerId).eq('workspace_id', workspaceId).maybeSingle();
        if (!offer) return json({ error: 'not found' }, 404);
        await loadEditable(offer.property_id);
        // Accept-cascade: mark accepted, reject the other live offers, move the listing to under_offer,
        // and cancel its future viewings (+ their calendar meetings).
        await supabase.from('property_offers').update({ status: 'accepted' }).eq('id', offerId).eq('workspace_id', workspaceId);
        await supabase.from('property_offers').update({ status: 'rejected' }).eq('property_id', offer.property_id).eq('workspace_id', workspaceId).neq('id', offerId).in('status', ['offered', 'countered']);
        await supabase.from('properties').update({ listing_status: 'under_offer' }).eq('id', offer.property_id).eq('workspace_id', workspaceId);
        const { data: fv } = await supabase.from('property_viewings').select('id, meeting_id').eq('property_id', offer.property_id).eq('workspace_id', workspaceId).eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString());
        for (const v of fv ?? []) {
          await supabase.from('property_viewings').update({ status: 'cancelled' }).eq('id', v.id);
          if (v.meeting_id) await supabase.from('crm_meetings').update({ status: 'cancelled' }).eq('id', v.meeting_id);
        }
        return json({ ok: true, cancelled_viewings: (fv ?? []).length });
      }

      // ── Sale completion + commission (#281) ────────────────────────────
      // Captures the agreed sale price, computes commission (price × pct + fixed, + VAT),
      // marks the listing sold, and (if from an offer) runs the accept-cascade. The commission
      // invoice is issued deliberately from Finance later (link-sale-invoice stamps it back).
      case 'complete-sale': {
        const offerId = String(body.offer_id ?? '');
        let propertyId = String(body.property_id ?? '');
        let acceptedOffer: any = null;
        if (offerId) {
          const { data: o } = await supabase.from('property_offers').select('id, property_id, amount, currency, buyer_contact_id').eq('id', offerId).eq('workspace_id', workspaceId).maybeSingle();
          if (!o) return json({ error: 'offer not found' }, 404);
          acceptedOffer = o; propertyId = o.property_id;
        }
        if (!propertyId) return json({ error: 'property_id or offer_id is required' }, 400);
        const property = await loadEditable(propertyId);
        const salePrice = Number(body.sale_price ?? acceptedOffer?.amount);
        if (!salePrice || salePrice <= 0) return json({ error: 'sale_price is required' }, 400);
        const commissionPct = body.commission_pct != null ? Number(body.commission_pct) : Number(property.commission_pct ?? 0);
        const commissionFixed = body.commission_fixed != null ? Number(body.commission_fixed) : 0;
        const vatPct = body.vat_pct != null ? Number(body.vat_pct) : 0;
        const currency = String(body.currency ?? acceptedOffer?.currency ?? property.currency ?? 'EUR');
        const saleRow = {
          workspace_id: workspaceId, property_id: propertyId, offer_id: offerId || null,
          sale_price: salePrice, currency, commission_pct: commissionPct, commission_fixed: commissionFixed, vat_pct: vatPct,
          seller_contact_id: property.vendor_contact_id ?? null,
          buyer_contact_id: body.buyer_contact_id ?? acceptedOffer?.buyer_contact_id ?? null,
          completed_at: body.completed_at ?? new Date().toISOString().slice(0, 10),
          notes: body.notes ?? null, agent_id: userId, created_by: userId,
        };
        const { data: sale, error: sErr } = await supabase.from('property_sales')
          .upsert(saleRow, { onConflict: 'property_id' }).select('*').single();
        if (sErr) throw new HttpError(400, sErr.message);
        // Mark the listing sold + snapshot the final price.
        await supabase.from('properties').update({ listing_status: 'sold', sold_price: salePrice, sold_at: new Date().toISOString() }).eq('id', propertyId).eq('workspace_id', workspaceId);
        if (acceptedOffer) {
          await supabase.from('property_offers').update({ status: 'accepted' }).eq('id', offerId).eq('workspace_id', workspaceId);
          await supabase.from('property_offers').update({ status: 'rejected' }).eq('property_id', propertyId).eq('workspace_id', workspaceId).neq('id', offerId).in('status', ['offered', 'countered']);
          const { data: fv } = await supabase.from('property_viewings').select('id, meeting_id').eq('property_id', propertyId).eq('workspace_id', workspaceId).eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString());
          for (const v of fv ?? []) {
            await supabase.from('property_viewings').update({ status: 'cancelled' }).eq('id', v.id);
            if (v.meeting_id) await supabase.from('crm_meetings').update({ status: 'cancelled' }).eq('id', v.meeting_id);
          }
        }
        return json({ sale });
      }

      case 'list-sales': {
        let q = supabase.from('property_sales')
          .select('*, property:properties!property_sales_property_id_fkey ( id, title, reference_code, town, listing_agent_id, created_by, open_for_all ), seller:crm_contacts!property_sales_seller_contact_id_fkey ( id, name, email )')
          .eq('workspace_id', workspaceId).order('completed_at', { ascending: false });
        if (body.property_id) q = q.eq('property_id', String(body.property_id));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        const rows = (data ?? []).filter((s: any) => access.isBroker || canViewProperty(s.property ?? {}));
        return json({ sales: rows });
      }

      // Stamp the Finance commission invoice back onto the sale (called after the invoice is created).
      case 'link-sale-invoice': {
        requireManage();
        const saleId = String(body.sale_id ?? '');
        const invoiceId = String(body.invoice_id ?? '');
        if (!saleId || !invoiceId) return json({ error: 'sale_id and invoice_id are required' }, 400);
        const { data: sale } = await supabase.from('property_sales').select('property_id').eq('id', saleId).eq('workspace_id', workspaceId).maybeSingle();
        if (!sale) return json({ error: 'not found' }, 404);
        await loadEditable(sale.property_id);
        const { data, error } = await supabase.from('property_sales')
          .update({ invoice_id: invoiceId, invoice_status: body.invoice_status ?? 'issued' }).eq('id', saleId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ sale: data });
      }

      // ── A CRM person's linked properties (for the contact-page "Properties" panel) ──
      case 'contact-properties': {
        const contactId = String(body.crm_contact_id ?? '');
        if (!contactId) return json({ error: 'crm_contact_id is required' }, 400);
        const cardCols = 'id, title, reference_code, property_type, transaction_type, listing_status, price, currency, town, region, is_public, public_listing_token';
        const [{ data: selling }, { data: interests }] = await Promise.all([
          supabase.from('properties').select(cardCols).eq('workspace_id', workspaceId).eq('vendor_contact_id', contactId).order('updated_at', { ascending: false }),
          supabase.from('property_interests').select(`interest_type, property:properties!property_interests_property_id_fkey ( ${cardCols} )`).eq('workspace_id', workspaceId).eq('crm_contact_id', contactId),
        ]);
        const interested = (interests ?? []).map((r: any) => ({ ...r.property, interest_type: r.interest_type })).filter((p: any) => p?.id);
        return json({ selling: selling ?? [], interested });
      }

      // ── Seller leads (vendors) — crm_contacts flagged seller via the RE extension ──
      case 'list-sellers': {
        const { data, error } = await supabase.from('property_contacts_ext')
          .select('crm_contact_id, owned_property_address, owned_property_value, owned_property_equity, contact:crm_contacts!property_contacts_ext_crm_contact_id_fkey ( id, name, email, phone, lead_status, lead_score, lead_source, created_at )')
          .eq('workspace_id', workspaceId).eq('contact_role', 'seller');
        if (error) throw new HttpError(400, error.message);
        const sellers = (data ?? []).sort((a: any, b: any) => new Date(b.contact?.created_at ?? 0).getTime() - new Date(a.contact?.created_at ?? 0).getTime());
        return json({ sellers });
      }

      // ── Buyer requirements (saved searches; auto-match in P2) ───────────
      case 'list-buyer-requirements': {
        let q = supabase.from('property_buyer_requirements').select('*, contact:crm_contacts!property_buyer_requirements_crm_contact_id_fkey ( id, name, email )').eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
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
          if (!['kyero', 'generic', 'openimmo'].includes(String(body.feed_format))) return json({ error: 'invalid feed_format' }, 400);
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

      // ── Lettings / property management (#281) — tenancies → rent ledger → maintenance ──
      // A tenancy hangs off a rental property; its rent charges are the ledger; maintenance
      // work-orders are per property. Landlord statement = rent received − maintenance cost.
      case 'list-tenancies': {
        // workspace-wide list for the Lettings dashboard, or property-scoped when property_id given
        let q = supabase.from('property_tenancies')
          .select('*, property:properties!property_tenancies_property_id_fkey ( id, title, reference_code, town, listing_agent_id, created_by, open_for_all ), tenant:crm_contacts!property_tenancies_tenant_contact_id_fkey ( id, name, email, phone ), landlord:crm_contacts!property_tenancies_landlord_contact_id_fkey ( id, name )')
          .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
        if (body.property_id) q = q.eq('property_id', String(body.property_id));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        // agent scoping: non-brokers only see tenancies on listings they can view
        const rows = (data ?? []).filter((t: any) => access.isBroker || canViewProperty(t.property ?? {}));
        return json({ tenancies: rows });
      }

      case 'upsert-tenancy': {
        requireManage();
        const propertyId = String(body.property_id ?? '');
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        await loadEditable(propertyId); // owner-or-broker on the underlying listing
        if (body.rent_amount == null || !body.start_date) return json({ error: 'rent_amount and start_date are required' }, 400);
        const payload = pick(body, ['tenant_contact_id', 'landlord_contact_id', 'rent_amount', 'currency', 'rent_frequency', 'deposit', 'start_date', 'end_date', 'status', 'notes']);
        const tenancyId = String(body.tenancy_id ?? '');
        if (tenancyId) {
          const { data, error } = await supabase.from('property_tenancies').update(payload).eq('id', tenancyId).eq('workspace_id', workspaceId).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ tenancy: data });
        }
        const { data, error } = await supabase.from('property_tenancies')
          .insert({ ...payload, workspace_id: workspaceId, property_id: propertyId, agent_id: userId, created_by: userId }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ tenancy: data });
      }

      case 'list-rent-charges': {
        const tenancyId = String(body.tenancy_id ?? '');
        if (!tenancyId) return json({ error: 'tenancy_id is required' }, 400);
        const { data, error } = await supabase.from('property_rent_charges')
          .select('*').eq('tenancy_id', tenancyId).eq('workspace_id', workspaceId).order('due_date', { ascending: true });
        if (error) throw new HttpError(400, error.message);
        return json({ charges: data ?? [] });
      }

      case 'generate-rent-schedule': {
        requireManage();
        const tenancyId = String(body.tenancy_id ?? '');
        const periods = Math.min(Math.max(Number(body.periods ?? 12), 1), 60);
        if (!tenancyId) return json({ error: 'tenancy_id is required' }, 400);
        const { data: t } = await supabase.from('property_tenancies').select('*').eq('id', tenancyId).eq('workspace_id', workspaceId).maybeSingle();
        if (!t) return json({ error: 'not found' }, 404);
        await loadEditable(t.property_id);
        const start = new Date(String(body.from_date ?? t.start_date));
        const rows: any[] = [];
        for (let i = 0; i < periods; i++) {
          const d = new Date(start);
          if (t.rent_frequency === 'weekly') d.setUTCDate(d.getUTCDate() + i * 7);
          else if (t.rent_frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + i * 3);
          else if (t.rent_frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + i);
          else d.setUTCMonth(d.getUTCMonth() + i); // monthly
          if (t.end_date && d > new Date(t.end_date)) break;
          rows.push({ workspace_id: workspaceId, tenancy_id: tenancyId, due_date: d.toISOString().slice(0, 10), amount: t.rent_amount, currency: t.currency, status: 'due' });
        }
        // skip due dates already scheduled so re-running is idempotent
        const { data: existing } = await supabase.from('property_rent_charges').select('due_date').eq('tenancy_id', tenancyId).eq('workspace_id', workspaceId);
        const seen = new Set((existing ?? []).map((r: any) => r.due_date));
        const fresh = rows.filter((r) => !seen.has(r.due_date));
        if (fresh.length) {
          const { error } = await supabase.from('property_rent_charges').insert(fresh);
          if (error) throw new HttpError(400, error.message);
        }
        return json({ ok: true, created: fresh.length, skipped: rows.length - fresh.length });
      }

      case 'mark-rent-paid': {
        requireManage();
        const chargeId = String(body.charge_id ?? '');
        if (!chargeId) return json({ error: 'charge_id is required' }, 400);
        const { data: charge } = await supabase.from('property_rent_charges').select('amount, tenancy_id').eq('id', chargeId).eq('workspace_id', workspaceId).maybeSingle();
        if (!charge) return json({ error: 'not found' }, 404);
        const paid = body.status === 'waived';
        const patch = paid
          ? { status: 'waived' as const, paid_at: null, paid_amount: null, note: body.note ?? null }
          : { status: 'paid' as const, paid_at: new Date().toISOString(), paid_amount: Number(body.paid_amount ?? charge.amount), note: body.note ?? null };
        const { data, error } = await supabase.from('property_rent_charges').update(patch).eq('id', chargeId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ charge: data });
      }

      case 'list-maintenance': {
        let q = supabase.from('property_maintenance')
          .select('*, property:properties!property_maintenance_property_id_fkey ( id, title, reference_code, listing_agent_id, created_by, open_for_all )')
          .eq('workspace_id', workspaceId).order('reported_at', { ascending: false });
        if (body.property_id) q = q.eq('property_id', String(body.property_id));
        if (body.status) q = q.eq('status', String(body.status));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        const rows = (data ?? []).filter((m: any) => access.isBroker || canViewProperty(m.property ?? {}));
        return json({ work_orders: rows });
      }

      case 'upsert-maintenance': {
        requireManage();
        const propertyId = String(body.property_id ?? '');
        const woId = String(body.work_order_id ?? '');
        if (!propertyId && !woId) return json({ error: 'property_id is required' }, 400);
        const payload = pick(body, ['tenancy_id', 'title', 'description', 'status', 'priority', 'contractor_name', 'cost', 'resolved_at']);
        if (woId) {
          const { data: existing } = await supabase.from('property_maintenance').select('property_id').eq('id', woId).eq('workspace_id', workspaceId).maybeSingle();
          if (!existing) return json({ error: 'not found' }, 404);
          await loadEditable(existing.property_id);
          if (payload.status === 'completed' && body.resolved_at == null) (payload as any).resolved_at = new Date().toISOString();
          const { data, error } = await supabase.from('property_maintenance').update(payload).eq('id', woId).eq('workspace_id', workspaceId).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ work_order: data });
        }
        await loadEditable(propertyId);
        if (!payload.title) return json({ error: 'title is required' }, 400);
        const { data, error } = await supabase.from('property_maintenance')
          .insert({ ...payload, workspace_id: workspaceId, property_id: propertyId, created_by: userId }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ work_order: data });
      }

      case 'landlord-statement': {
        // Per-tenancy summary: rent charged / received / outstanding + maintenance spend = net to landlord.
        const tenancyId = String(body.tenancy_id ?? '');
        if (!tenancyId) return json({ error: 'tenancy_id is required' }, 400);
        const { data: t } = await supabase.from('property_tenancies').select('*, property:properties!property_tenancies_property_id_fkey ( id, title, listing_agent_id, created_by, open_for_all )').eq('id', tenancyId).eq('workspace_id', workspaceId).maybeSingle();
        if (!t) return json({ error: 'not found' }, 404);
        if (!access.isBroker && !canViewProperty(t.property ?? {})) return json({ error: 'not found' }, 404);
        const [{ data: charges }, { data: wos }] = await Promise.all([
          supabase.from('property_rent_charges').select('amount, paid_amount, status').eq('tenancy_id', tenancyId).eq('workspace_id', workspaceId),
          supabase.from('property_maintenance').select('cost, status').eq('tenancy_id', tenancyId).eq('workspace_id', workspaceId),
        ]);
        const num = (x: any) => Number(x ?? 0);
        const rentCharged = (charges ?? []).filter((c: any) => c.status !== 'waived').reduce((s: number, c: any) => s + num(c.amount), 0);
        const rentReceived = (charges ?? []).filter((c: any) => c.status === 'paid').reduce((s: number, c: any) => s + num(c.paid_amount), 0);
        const outstanding = (charges ?? []).filter((c: any) => c.status === 'due' || c.status === 'overdue').reduce((s: number, c: any) => s + num(c.amount), 0);
        const maintenanceSpend = (wos ?? []).reduce((s: number, w: any) => s + num(w.cost), 0);
        return json({
          tenancy: t, currency: t.currency,
          summary: { rent_charged: rentCharged, rent_received: rentReceived, rent_outstanding: outstanding, maintenance_spend: maintenanceSpend, net_to_landlord: rentReceived - maintenanceSpend },
        });
      }

      // ── Investments add-on (#281) — per-property analysis + portfolio ──────
      case 'get-investment': {
        const propertyId = String(body.property_id ?? '');
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        await loadProperty(propertyId); // view-scoped 404
        const { data } = await supabase.from('property_investments').select('*').eq('property_id', propertyId).eq('workspace_id', workspaceId).maybeSingle();
        return json({ investment: data ?? null, metrics: data ? computeInvestmentMetrics(data) : null });
      }
      case 'upsert-investment': {
        requireManage();
        const propertyId = String(body.property_id ?? '');
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        await loadEditable(propertyId);
        const INVEST_WRITABLE = ['purchase_price', 'acquisition_costs', 'renovation_costs', 'loan_amount', 'interest_rate_pct', 'loan_term_years', 'monthly_rent', 'other_monthly_income', 'monthly_opex', 'vacancy_pct', 'currency', 'notes'];
        const payload: Record<string, unknown> = {};
        for (const k of INVEST_WRITABLE) if (body[k] !== undefined) payload[k] = body[k];
        const { data, error } = await supabase.from('property_investments')
          .upsert({ ...payload, workspace_id: workspaceId, property_id: propertyId, created_by: userId }, { onConflict: 'property_id' })
          .select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ investment: data, metrics: computeInvestmentMetrics(data) });
      }
      case 'list-investments': {
        const { data, error } = await supabase.from('property_investments')
          .select('*, property:properties!property_investments_property_id_fkey ( id, title, reference_code, town, listing_status, listing_agent_id, created_by, open_for_all )')
          .eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        const rows = (data ?? []).filter((r: any) => access.isBroker || canViewProperty(r.property ?? {}))
          .map((r: any) => ({ ...r, metrics: computeInvestmentMetrics(r) }));
        const currency = rows[0]?.currency ?? 'EUR';
        const sum = (f: (m: any) => number) => rows.reduce((t: number, r: any) => t + f(r.metrics), 0);
        const totalInvested = sum((m) => m.total_investment);
        const annualNoi = sum((m) => m.noi);
        const portfolio = {
          count: rows.length,
          total_invested: Math.round(totalInvested * 100) / 100,
          cash_invested: Math.round(sum((m) => m.cash_invested) * 100) / 100,
          annual_noi: Math.round(annualNoi * 100) / 100,
          annual_cash_flow: Math.round(sum((m) => m.annual_cash_flow) * 100) / 100,
          monthly_cash_flow: Math.round(sum((m) => m.monthly_cash_flow) * 100) / 100,
          blended_net_yield_pct: totalInvested > 0 ? Math.round(annualNoi / totalInvested * 10000) / 100 : 0,
          currency,
        };
        return json({ investments: rows, portfolio });
      }

      // ── Rent → Finance (#281) — draft invoice per rent charge, to the tenant ──
      case 'invoice-rent-charge': {
        requireManage();
        const chargeId = String(body.charge_id ?? '');
        if (!chargeId) return json({ error: 'charge_id is required' }, 400);
        const { data: charge } = await supabase.from('property_rent_charges')
          .select('id, amount, currency, due_date, invoice_id, tenancy:property_tenancies!property_rent_charges_tenancy_id_fkey ( property_id, tenant_contact_id )')
          .eq('id', chargeId).eq('workspace_id', workspaceId).maybeSingle();
        if (!charge) return json({ error: 'not found' }, 404);
        if (charge.invoice_id) return json({ invoice_id: charge.invoice_id, already: true });
        const tenancy = (charge as any).tenancy;
        if (!tenancy?.property_id) return json({ error: 'charge has no tenancy' }, 400);
        await loadEditable(tenancy.property_id);
        if (!tenancy.tenant_contact_id) return json({ error: 'Set a tenant on the tenancy before invoicing rent.' }, 400);
        const property = await loadProperty(tenancy.property_id);
        const amount = Number(charge.amount);
        const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', { p_workspace_id: workspaceId });
        if (numErr) throw new HttpError(500, `numbering failed: ${numErr.message}`);
        // Draft, VAT-0 (operator sets the correct rent VAT/doc-type on issue — residential rent is
        // usually exempt, commercial is not). Not transmitted until issued in Finance.
        const { data: inv, error: invErr } = await supabase.from('invoices').insert({
          workspace_id: workspaceId, customer_contact_id: tenancy.tenant_contact_id,
          internal_number: draftNumber as string, status: 'draft', document_type: '1.1',
          currency: charge.currency ?? 'EUR', subtotal_net: amount, vat_rate: 0, vat_amount: 0, total: amount,
          notes: `Rent — ${property.title ?? 'property'} — due ${charge.due_date}`, issued_at: null, due_at: charge.due_date,
        }).select('id').single();
        if (invErr) throw new HttpError(400, invErr.message);
        const { error: itErr } = await supabase.from('invoice_items').insert({
          invoice_id: (inv as any).id, description: `Rent — ${property.title ?? 'property'} (${charge.due_date})`,
          quantity: 1, unit_price: amount, net_value: amount, vat_amount: 0, line_total: amount,
        });
        if (itErr) throw new HttpError(400, itErr.message);
        await supabase.from('property_rent_charges').update({ invoice_id: (inv as any).id }).eq('id', chargeId).eq('workspace_id', workspaceId);
        return json({ invoice_id: (inv as any).id });
      }

      case 'renew-tenancy': {
        requireManage();
        const tenancyId = String(body.tenancy_id ?? '');
        if (!tenancyId) return json({ error: 'tenancy_id is required' }, 400);
        const { data: t } = await supabase.from('property_tenancies').select('property_id').eq('id', tenancyId).eq('workspace_id', workspaceId).maybeSingle();
        if (!t) return json({ error: 'not found' }, 404);
        await loadEditable(t.property_id);
        const patch: Record<string, unknown> = { status: 'active' };
        if (body.new_end_date) patch.end_date = body.new_end_date;
        if (body.new_rent != null && body.new_rent !== '') patch.rent_amount = Number(body.new_rent);
        const { data, error } = await supabase.from('property_tenancies').update(patch).eq('id', tenancyId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ tenancy: data });
      }

      // ── CMA / listing-pitch report (#281) — comps from own stock ──────────
      case 'cma-report': {
        const propertyId = String(body.property_id ?? '');
        let subject: any = null;
        let propertyType = String(body.property_type ?? '');
        let town = String(body.town ?? '');
        let area = Number(body.area ?? 0);
        if (propertyId) {
          subject = await loadProperty(propertyId); // view-scoped 404
          propertyType = subject.property_type;
          town = subject.town ?? '';
          area = Number(subject.area_built ?? subject.plot_area ?? 0);
        }
        if (!propertyType) return json({ error: 'property_type or property_id is required' }, 400);
        let cq = supabase.from('properties')
          .select('id, title, town, price, area_built, plot_area, listing_status, sold_price, sold_at, created_at, currency, bedrooms')
          .eq('workspace_id', workspaceId).eq('property_type', propertyType)
          .in('listing_status', ['active', 'under_offer', 'sold']).not('price', 'is', null);
        if (town) cq = cq.ilike('town', town);
        if (propertyId) cq = cq.neq('id', propertyId);
        const { data: raw } = await cq.limit(60);
        const comps = (raw ?? []).map((c: any) => {
          const a = Number(c.area_built ?? c.plot_area ?? 0);
          const effPrice = c.listing_status === 'sold' && c.sold_price != null ? Number(c.sold_price) : Number(c.price);
          const pps = a > 0 ? effPrice / a : null;
          const dom = c.listing_status === 'sold' && c.sold_at ? Math.max(0, Math.round((new Date(c.sold_at).getTime() - new Date(c.created_at).getTime()) / 864e5)) : null;
          return { id: c.id, title: c.title, town: c.town, price: effPrice, area: a || null, bedrooms: c.bedrooms ?? null, price_per_sqm: pps ? Math.round(pps) : null, listing_status: c.listing_status, days_on_market: dom, currency: c.currency ?? 'EUR' };
        }).filter((c: any) => c.price_per_sqm != null).sort((a: any, b: any) => a.price_per_sqm - b.price_per_sqm);
        const pps = comps.map((c: any) => c.price_per_sqm as number);
        const median = pps.length ? pps[Math.floor(pps.length / 2)] : null;
        const domVals = comps.map((c: any) => c.days_on_market).filter((d: any): d is number => d != null);
        const stats = {
          count: comps.length,
          sold_count: comps.filter((c: any) => c.listing_status === 'sold').length,
          min_per_sqm: pps[0] ?? null,
          median_per_sqm: median,
          max_per_sqm: pps[pps.length - 1] ?? null,
          avg_days_on_market: domVals.length ? Math.round(domVals.reduce((a: number, b: number) => a + b, 0) / domVals.length) : null,
        };
        const suggestion = (median && area > 0) ? {
          estimate: Math.round(median * area / 1000) * 1000,
          low: Math.round(median * area * 0.9 / 1000) * 1000,
          high: Math.round(median * area * 1.1 / 1000) * 1000,
        } : null;
        return json({
          subject: { property_id: propertyId || null, title: subject?.title ?? null, property_type: propertyType, town, area: area || null, price: subject?.price ?? null, currency: subject?.currency ?? 'EUR' },
          comps, stats, suggestion, generated_at: new Date().toISOString(),
        });
      }

      // ── Deal pipeline (#281) — stage board + per-deal tasks ────────────────
      case 'list-deals': {
        const { data, error } = await supabase.from('property_deals')
          .select('*, property:properties!property_deals_property_id_fkey ( id, title, reference_code, town, listing_agent_id, created_by, open_for_all ), buyer:crm_contacts!property_deals_buyer_contact_id_fkey ( id, name ), tasks:property_deal_tasks ( id, done )')
          .eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
        if (error) throw new HttpError(400, error.message);
        const rows = (data ?? []).filter((d: any) => access.isBroker || canViewProperty(d.property ?? {}))
          .map((d: any) => { const tasks = d.tasks ?? []; return { ...d, tasks: undefined, task_total: tasks.length, task_done: tasks.filter((t: any) => t.done).length }; });
        return json({ deals: rows });
      }
      case 'upsert-deal': {
        requireManage();
        const propertyId = String(body.property_id ?? '');
        const dealId = String(body.deal_id ?? '');
        if (!dealId && !propertyId) return json({ error: 'property_id is required' }, 400);
        const DEAL_WRITABLE = ['buyer_contact_id', 'stage', 'value', 'currency', 'expected_close_date', 'notes', 'status', 'lost_reason'];
        const payload: Record<string, unknown> = {};
        for (const k of DEAL_WRITABLE) if (body[k] !== undefined) payload[k] = body[k];
        if (payload.stage === 'completed' && payload.status === undefined) payload.status = 'won'; // reaching the last stage wins
        if (dealId) {
          const { data: ex } = await supabase.from('property_deals').select('property_id').eq('id', dealId).eq('workspace_id', workspaceId).maybeSingle();
          if (!ex) return json({ error: 'not found' }, 404);
          await loadEditable(ex.property_id);
          const { data, error } = await supabase.from('property_deals').update(payload).eq('id', dealId).eq('workspace_id', workspaceId).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ deal: data });
        }
        await loadEditable(propertyId);
        const { data, error } = await supabase.from('property_deals').insert({ ...payload, workspace_id: workspaceId, property_id: propertyId, agent_id: userId, created_by: userId }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ deal: data });
      }
      case 'delete-deal': {
        requireManage();
        const dealId = String(body.deal_id ?? '');
        if (!dealId) return json({ error: 'deal_id is required' }, 400);
        const { data: ex } = await supabase.from('property_deals').select('property_id').eq('id', dealId).eq('workspace_id', workspaceId).maybeSingle();
        if (!ex) return json({ error: 'not found' }, 404);
        await loadEditable(ex.property_id);
        const { error } = await supabase.from('property_deals').delete().eq('id', dealId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }
      case 'list-deal-tasks': {
        const dealId = String(body.deal_id ?? '');
        if (!dealId) return json({ error: 'deal_id is required' }, 400);
        const { data, error } = await supabase.from('property_deal_tasks').select('*').eq('deal_id', dealId).eq('workspace_id', workspaceId).order('created_at');
        if (error) throw new HttpError(400, error.message);
        return json({ tasks: data ?? [] });
      }
      case 'add-deal-task': {
        requireManage();
        const dealId = String(body.deal_id ?? '');
        if (!dealId || !body.title) return json({ error: 'deal_id and title are required' }, 400);
        const { data: ex } = await supabase.from('property_deals').select('property_id').eq('id', dealId).eq('workspace_id', workspaceId).maybeSingle();
        if (!ex) return json({ error: 'not found' }, 404);
        await loadEditable(ex.property_id);
        const { data, error } = await supabase.from('property_deal_tasks').insert({ workspace_id: workspaceId, deal_id: dealId, title: String(body.title), due_date: body.due_date ?? null }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ task: data });
      }
      case 'toggle-deal-task': {
        requireManage();
        const taskId = String(body.task_id ?? '');
        if (!taskId) return json({ error: 'task_id is required' }, 400);
        const { data, error } = await supabase.from('property_deal_tasks').update({ done: !!body.done }).eq('id', taskId).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ task: data });
      }
      case 'delete-deal-task': {
        requireManage();
        const taskId = String(body.task_id ?? '');
        if (!taskId) return json({ error: 'task_id is required' }, 400);
        const { error } = await supabase.from('property_deal_tasks').delete().eq('id', taskId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return json({ error: (e as Error)?.message ?? 'internal error' }, 500);
  }
}));
