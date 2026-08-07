// deno-lint-ignore-file no-explicit-any
// Real Estate module API (P1). Authed CRUD/publish/media/inquiry/viewing router for the
// `real-estate` add-on. The public token page lives in a SEPARATE fn (real-estate-public).
// SECURITY (cloned from hr-api):
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
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';
import {
  checkPublishRequirements, matchesCriteria, createRentInvoiceForCharge, estimateFromMedianPerSqm,
  withRentSettlements, buildCompsReport, buildVendorReport, sendVendorReport,
} from '../_shared/real-estate.ts';
import { normaliseImportRow } from '../_shared/real-estate-import.ts';
import { parseKyeroXml } from '../_shared/real-estate-import-xml.ts';
import { resolveRealEstateAccess, PROPERTY_WRITABLE, pick } from './rbac.ts';
import { draftListingCopy, analyzePropertyPhotos } from './ai.ts';
import { refreshListingEmbedding } from '../_shared/real-estate-embedding.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

/** Member-entered link fields render as hrefs on the ANONYMOUS public page — enforce http(s)
 *  at write time so a stored `javascript:` URL can never exist (the page also guards on render). */
function assertHttpUrls(payload: Record<string, unknown>): void {
  for (const key of ['virtual_tour_url', 'video_url', 'agent_website']) {
    const v = payload[key];
    if (v == null || v === '') continue;
    let ok = false;
    try { const u = new URL(String(v)); ok = u.protocol === 'https:' || u.protocol === 'http:'; } catch { ok = false; }
    if (!ok) throw new HttpError(400, `${key} must be an http(s) URL`);
  }
}

/** Does a buyer requirement's saved-search criteria match a listing? (deterministic facets) */

/** Investments: derive yield/cap-rate/cash-flow metrics from the stored inputs. */
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

    // Direct-to-buyer: notify each CONSENTED matching buyer that a new listing fits their
    // search. GDPR — only contacts with marketing_consent=true. Public listing page as the link.
    if (property.is_public && property.public_listing_token) {
      const pubUrl = `/p/${property.public_listing_token}`;
      const priceStr = property.price != null ? ` — ${new Intl.NumberFormat('en-GB', { style: 'currency', currency: property.currency || 'EUR', maximumFractionDigits: 0 }).format(Number(property.price))}` : '';
      const alertedReqIds: string[] = [];
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
        if (m.id) alertedReqIds.push(m.id);
      }
      // Advance the digest window for buyers we just alerted immediately, so tonight's digest
      // doesn't email them the SAME listing again (double-notify). Only for new_listing (the digest is
      // about new listings; a price_drop alert doesn't overlap it).
      if (reason === 'new_listing' && alertedReqIds.length > 0) {
        // This write IS the double-notify guard. Swallowing its failure means last_digest_at
        // never advances and tonight's digest emails the same listing to the same buyers a
        // second time — the exact outcome the line above exists to prevent — with nothing
        // anywhere saying why.
        const { error: stampError } = await supabase.from('property_buyer_requirements')
          .update({ last_digest_at: new Date().toISOString() }).in('id', alertedReqIds);
        if (stampError) {
          console.error(
            `[real-estate-api] last_digest_at not advanced for ${alertedReqIds.length} buyer(s) — ` +
            `tonight's digest will re-notify them about property ${property.id}:`, stampError.message,
          );
        }
      }
    }
  } catch (e) { console.error('[real-estate-api] buyer alerting failed (listing op unaffected):', e); }
}


const INQUIRY_STATUSES = ['new', 'contacted', 'qualified', 'viewing_booked', 'closed', 'spam'];
const VIEWING_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];
/** Listing paperwork. The compliance types come first because they are the evidence behind the GR
 *  publish gate — `energy_class` and `electronic_building_id` are claims until the certificate is
 *  attached. Anything unrecognised is stored as 'other' rather than rejected. */
const DOC_TYPES = ['energy_certificate', 'building_id', 'title_deed', 'floor_plan', 'topographic',
  'agency_agreement', 'permit', 'tax_clearance', 'other'];
/** Who a commission split can pay. Mirrors the CHECK on property_sale_commission_splits. */
const COMMISSION_PARTY_TYPES = ['listing_agent', 'buyer_agent', 'house', 'referral', 'external'];
/** AML/KYC vocabulary. Mirrors the CHECKs on property_kyc_checks. */
const KYC_CHECK_TYPES = ['identity', 'source_of_funds', 'pep_sanctions'];
const KYC_STATUSES = ['pending', 'passed', 'failed', 'waived'];
// `virtual` added 2026-08-01. The scheduling dialog has always offered
// in_person | virtual | open_house, but the allowlist held viewing | tour | open_house and
// SUBSTITUTED rather than rejected — so `in_person` and `virtual`, two of the three options and
// including the default, were both silently written as `viewing`. property_viewings has no CHECK
// on `type`, so nothing downstream caught it and viewing-mix reporting was simply wrong.
// `in_person` is normalised to the stored `viewing`; anything else now 400s.
const VIEWING_TYPES = ['viewing', 'virtual', 'tour', 'open_house'];
const VIEWING_TYPE_ALIASES: Record<string, string> = { in_person: 'viewing' };
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

  // Agent scoping: a non-broker (realestate_agent) owns a listing when they're its listing agent
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

  // Sub-module entitlement gates: Property Management + Investments are add-ons on top of
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
        assertHttpUrls(payload);
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
        assertHttpUrls(payload);
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
        // Keep the semantic-search vector in step with the listing text while it is live.
        if (data.is_public && data.listing_status === 'active') await refreshListingEmbedding(supabase, data);
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
          // `in_discovery` had NO writer anywhere in the platform. The
          // column stayed at its `false` default forever, while `real-estate-feed` filters
          // `.eq('in_discovery', true)` and the cross-workspace Properties tab gates on it. So a
          // broker could enable syndication, copy the feed URL, hand it to Kyero or an OpenImmo
          // portal — and the portal pulled an empty document, permanently, with no error anywhere.
          // `unpublish-property` already clears it, so setting it here makes the pair symmetric.
          // Defaults true because publishing IS the act of making a listing publicly
          // discoverable; pass `in_discovery: false` to publish to the agency's own site only.
          in_discovery: body.in_discovery === undefined ? true : body.in_discovery === true,
        };
        if (!property.listing_date) patch.listing_date = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase.from('properties').update(patch).eq('id', id).eq('workspace_id', workspaceId).select('*').single();
        if (error) throw new HttpError(400, error.message);
        await emitBuyerMatchAlert(supabase, workspaceId, data, 'new_listing'); // D10 — alert agent of matching buyers
        await refreshListingEmbedding(supabase, data); // semantic Discovery search (best-effort, never blocks publish)
        // "The listing went live" as a governable event rather than a hardcoded announcement. The
        // seeded system-default flow turns it into a social post; an agency that wants it to also
        // ping a Teams webhook or skip Sundays edits the flow instead of waiting on a deploy.
        // Best-effort: a marketing side-effect must never fail the publish itself.
        try {
          const { data: cover } = await supabase.from('property_photos')
            .select('storage_path').eq('property_id', id).order('is_cover', { ascending: false }).order('sort_order').limit(1).maybeSingle();
          await emitFlowEvent('realestate.listing_published', {
            workspace_id: workspaceId, user_id: userId, type: 'realestate_listing_published',
            property_id: id,
            title: 'Listing published',
            body: `${data.title || 'A listing'}${data.town ? ` in ${data.town}` : ''} is now live.`,
            action_url: `/properties/${id}`,
            listing_title: data.title, town: data.town, price: data.price, currency: data.currency ?? 'EUR',
            bedrooms: data.bedrooms, property_type: data.property_type, transaction_type: data.transaction_type,
            public_url: data.public_listing_token ? `/p/${data.public_listing_token}` : null,
            cover_storage_path: cover?.storage_path ?? null,
          });
        } catch (e) { console.error('[real-estate-api] listing_published emit failed (non-fatal):', e); }
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

      // ── AML / KYC (#281 gap 10) ────────────────────────────────────────
      case 'kyc-status': {
        const contactId = String(body.contact_id ?? '');
        const { data, error } = await supabase.rpc('property_kyc_status', {
          p_workspace_id: workspaceId, p_contact_id: contactId || null,
        });
        if (error) throw new HttpError(400, error.message);
        const { data: checks } = contactId
          ? await supabase.from('property_kyc_checks').select('*').eq('workspace_id', workspaceId).eq('contact_id', contactId)
          : { data: [] };
        return json({ status: (data ?? [])[0] ?? { required: false, satisfied: true, missing: [] }, checks: checks ?? [] });
      }

      case 'upsert-kyc-check': {
        // Broker-level. An agent recording their own buyer's AML verdict is the conflict of interest
        // the check exists to manage.
        if (!access.isBroker) return json({ error: 'Only a workspace owner or admin can record an AML/KYC verdict.' }, 403);
        const contactId = String(body.contact_id ?? '');
        const checkType = String(body.check_type ?? '');
        if (!contactId || !KYC_CHECK_TYPES.includes(checkType)) {
          return json({ error: `contact_id and a check_type of ${KYC_CHECK_TYPES.join(', ')} are required` }, 400);
        }
        const status = String(body.status ?? 'pending');
        if (!KYC_STATUSES.includes(status)) return json({ error: `status must be one of ${KYC_STATUSES.join(', ')}` }, 400);
        // The contact must belong to this workspace — otherwise a broker could stamp a verdict onto
        // another tenant's contact row.
        const { data: contact } = await supabase.from('crm_contacts')
          .select('id').eq('id', contactId).eq('workspace_id', workspaceId).maybeSingle();
        if (!contact) return json({ error: 'not found' }, 404);

        const verdictReached = status === 'passed' || status === 'failed' || status === 'waived';
        const { data, error } = await supabase.from('property_kyc_checks').upsert({
          workspace_id: workspaceId, contact_id: contactId, check_type: checkType, status,
          document_id: body.document_id || null,
          reference: body.reference ? String(body.reference).slice(0, 200) : null,
          notes: body.notes ? String(body.notes).slice(0, 2000) : null,
          expires_at: body.expires_at || null,
          // Who signed it off, stamped server-side — an audit needs the real reviewer, not a body field.
          verified_by: verdictReached ? userId : null,
          verified_at: verdictReached ? new Date().toISOString() : null,
          created_by: userId, updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,contact_id,check_type' }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ check: data });
      }

      case 'update-kyc-policy': {
        if (!access.isBroker) return json({ error: 'Only a workspace owner or admin can change the AML policy.' }, 403);
        const patch: Record<string, unknown> = { workspace_id: workspaceId };
        if (body.kyc_required_for_offers !== undefined) patch.kyc_required_for_offers = body.kyc_required_for_offers === true;
        if (body.kyc_required_types !== undefined) {
          const types = (Array.isArray(body.kyc_required_types) ? body.kyc_required_types : [])
            .map((t: unknown) => String(t)).filter((t: string) => KYC_CHECK_TYPES.includes(t));
          if (!types.length) return json({ error: 'At least one check type is required.' }, 400);
          patch.kyc_required_types = types;
        }
        const { data, error } = await supabase.from('real_estate_settings')
          .upsert(patch, { onConflict: 'workspace_id' }).select('kyc_required_for_offers, kyc_required_types').single();
        if (error) throw new HttpError(400, error.message);
        return json({ policy: data });
      }

      // ── Commission splits & agent payouts (#281 gap 6) ─────────────────
      case 'list-commission-splits': {
        const saleId = String(body.sale_id ?? '');
        if (!saleId) return json({ error: 'sale_id is required' }, 400);
        const { data: sale } = await supabase.from('property_sales')
          .select('id, property_id, property:properties!property_sales_property_id_fkey ( listing_agent_id, created_by, open_for_all )')
          .eq('id', saleId).eq('workspace_id', workspaceId).maybeSingle();
        if (!sale) return json({ error: 'not found' }, 404);
        if (!access.isBroker && !canViewProperty((sale as any).property ?? {})) return json({ error: 'not found' }, 404);
        // Amounts are DERIVED — a split row stores the rule (50%), never the figure. The fee moves
        // when a sale price is corrected, and a stored amount would quietly stop adding up.
        const { data, error } = await supabase.rpc('get_sale_commission_splits', { p_sale_ids: [saleId] });
        if (error) throw new HttpError(400, error.message);
        const rows = (data ?? []).filter((r: any) => r.split_id);
        const head = (data ?? [])[0];
        return json({
          splits: rows,
          totals: head
            ? { currency: head.currency, commission_base: head.commission_base, allocated: head.allocated, unallocated: head.unallocated }
            : null,
        });
      }

      case 'upsert-commission-split': {
        // Broker-level: who gets paid what out of a completed sale is not an agent's own call.
        if (!access.isBroker) return json({ error: 'Only a workspace owner or admin can edit commission splits.' }, 403);
        const saleId = String(body.sale_id ?? '');
        const splitId = String(body.split_id ?? '');
        if (!saleId && !splitId) return json({ error: 'sale_id or split_id is required' }, 400);

        const payload: Record<string, unknown> = {};
        if (body.party_type !== undefined) {
          const pt = String(body.party_type);
          if (!COMMISSION_PARTY_TYPES.includes(pt)) return json({ error: `party_type must be one of ${COMMISSION_PARTY_TYPES.join(', ')}` }, 400);
          payload.party_type = pt;
        }
        if (body.basis !== undefined) {
          const b = String(body.basis);
          if (b !== 'pct' && b !== 'fixed') return json({ error: "basis must be 'pct' or 'fixed'" }, 400);
          payload.basis = b;
        }
        if (body.pct !== undefined) payload.pct = body.pct === null || body.pct === '' ? null : Number(body.pct);
        if (body.fixed_amount !== undefined) payload.fixed_amount = body.fixed_amount === null || body.fixed_amount === '' ? null : Number(body.fixed_amount);
        if (body.label !== undefined) payload.label = body.label ? String(body.label).slice(0, 160) : null;
        if (body.contact_id !== undefined) payload.contact_id = body.contact_id || null;
        if (body.notes !== undefined) payload.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
        if (body.paid_at !== undefined) payload.paid_at = body.paid_at || null;
        if (body.user_id !== undefined) {
          const uid = body.user_id ? String(body.user_id) : null;
          if (uid) {
            // Paying a user id from another tenant would both leak the sale and misdirect money.
            const { data: member } = await supabase.from('workspace_members')
              .select('user_id').eq('workspace_id', workspaceId).eq('user_id', uid).maybeSingle();
            if (!member) return json({ error: 'That user is not a member of this workspace.' }, 400);
          }
          payload.user_id = uid;
        }

        if (splitId) {
          payload.updated_at = new Date().toISOString();
          const { data, error } = await supabase.from('property_sale_commission_splits')
            .update(payload).eq('id', splitId).eq('workspace_id', workspaceId).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ split: data });
        }
        const { data: sale } = await supabase.from('property_sales')
          .select('id, property_id').eq('id', saleId).eq('workspace_id', workspaceId).maybeSingle();
        if (!sale) return json({ error: 'not found' }, 404);
        const { data, error } = await supabase.from('property_sale_commission_splits')
          .insert({ ...payload, workspace_id: workspaceId, sale_id: saleId, created_by: userId }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ split: data });
      }

      case 'delete-commission-split': {
        if (!access.isBroker) return json({ error: 'Only a workspace owner or admin can edit commission splits.' }, 403);
        const splitId = String(body.split_id ?? '');
        if (!splitId) return json({ error: 'split_id is required' }, 400);
        const { error } = await supabase.from('property_sale_commission_splits')
          .delete().eq('id', splitId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'agent-commission-statement': {
        // "What am I owed for this period." An agent may always run their own; only a broker may
        // run someone else's or the whole desk.
        const targetUser = body.user_id ? String(body.user_id) : userId;
        if (targetUser !== userId && !access.isBroker) {
          return json({ error: "You can only run your own commission statement." }, 403);
        }
        const from = String(body.from ?? new Date(new Date().getUTCFullYear(), 0, 1).toISOString().slice(0, 10));
        const to = String(body.to ?? new Date().toISOString().slice(0, 10));
        const { data: sales } = await supabase.from('property_sales')
          .select('id, property_id, sale_price, currency, completed_at, property:properties!property_sales_property_id_fkey ( title, reference_code )')
          .eq('workspace_id', workspaceId).gte('completed_at', from).lte('completed_at', to);
        if (!sales?.length) return json({ from, to, user_id: targetUser, lines: [], totals: { earned: 0, paid: 0, outstanding: 0, currency: 'EUR' } });

        const { data: splits, error } = await supabase.rpc('get_sale_commission_splits', { p_sale_ids: sales.map((s: any) => s.id) });
        if (error) throw new HttpError(400, error.message);
        const saleById = new Map(sales.map((s: any) => [s.id, s]));
        const mine = (splits ?? []).filter((r: any) => r.split_id && (body.all_agents === true ? true : r.user_id === targetUser));
        const lines = mine.map((r: any) => {
          const s: any = saleById.get(r.sale_id);
          return {
            sale_id: r.sale_id, split_id: r.split_id, user_id: r.user_id, party_type: r.party_type,
            property_title: s?.property?.title ?? null, reference_code: s?.property?.reference_code ?? null,
            completed_at: s?.completed_at ?? null, sale_price: s?.sale_price ?? null,
            currency: r.currency, amount: r.amount, paid_at: r.paid_at,
          };
        });
        const sum = (f: (l: any) => boolean) => Math.round(lines.filter(f).reduce((t: number, l: any) => t + Number(l.amount ?? 0), 0) * 100) / 100;
        return json({
          from, to, user_id: targetUser, lines,
          totals: {
            earned: sum(() => true),
            paid: sum((l) => !!l.paid_at),
            outstanding: sum((l) => !l.paid_at),
            currency: lines[0]?.currency ?? 'EUR',
          },
        });
      }

      // ── Lead routing rules ─────────────────────────────────────────────
      case 'list-routing-rules': {
        const { data, error } = await supabase.from('realestate_lead_routing_rules')
          .select('*').eq('workspace_id', workspaceId).order('priority').order('created_at');
        if (error) throw new HttpError(400, error.message);
        return json({ rules: data ?? [] });
      }

      case 'upsert-routing-rule': {
        // Broker-level, not agent-level: routing decides who GETS the leads, so an agent editing it
        // would be handing themselves the desk.
        if (!access.isBroker) return json({ error: 'Only a workspace owner or admin can change lead routing.' }, 403);
        const ruleId = String(body.rule_id ?? '');
        const arr = (v: unknown): string[] =>
          Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
            : String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        const payload: Record<string, unknown> = {};
        if (body.name !== undefined) payload.name = String(body.name).slice(0, 120);
        if (body.match_towns !== undefined) payload.match_towns = arr(body.match_towns);
        if (body.match_regions !== undefined) payload.match_regions = arr(body.match_regions);
        if (body.match_postcode_prefixes !== undefined) payload.match_postcode_prefixes = arr(body.match_postcode_prefixes);
        if (body.priority !== undefined) payload.priority = Number(body.priority) || 100;
        if (body.is_active !== undefined) payload.is_active = body.is_active === true;
        if (body.agent_user_ids !== undefined) {
          // Every id must be an ACTIVE member of this workspace. Without this check a broker could
          // route their leads to a user id from another tenant, who would then see the lead.
          const ids = arr(body.agent_user_ids);
          if (ids.length) {
            const { data: members } = await supabase.from('workspace_members')
              .select('user_id').eq('workspace_id', workspaceId).in('user_id', ids);
            const ok = new Set((members ?? []).map((m: any) => m.user_id));
            const strangers = ids.filter((id) => !ok.has(id));
            if (strangers.length) return json({ error: 'Every agent on a routing rule must be a member of this workspace.' }, 400);
          }
          payload.agent_user_ids = ids;
        }

        if (ruleId) {
          payload.updated_at = new Date().toISOString();
          const { data, error } = await supabase.from('realestate_lead_routing_rules')
            .update(payload).eq('id', ruleId).eq('workspace_id', workspaceId).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ rule: data });
        }
        if (!payload.name) return json({ error: 'name is required' }, 400);
        const { data, error } = await supabase.from('realestate_lead_routing_rules')
          .insert({ ...payload, workspace_id: workspaceId, created_by: userId }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ rule: data });
      }

      case 'delete-routing-rule': {
        if (!access.isBroker) return json({ error: 'Only a workspace owner or admin can change lead routing.' }, 403);
        const ruleId = String(body.rule_id ?? '');
        if (!ruleId) return json({ error: 'rule_id is required' }, 400);
        const { error } = await supabase.from('realestate_lead_routing_rules')
          .delete().eq('id', ruleId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      // ── Listing import (#281) — the onboarding path ────────────────────
      case 'import-listings': {
        requireManage();
        // Two inputs, one pipeline: tabular rows (CSV parsed in the browser) or Kyero XML.
        let rows: Record<string, unknown>[] = [];
        if (typeof body.xml === 'string' && body.xml.trim()) {
          try { rows = parseKyeroXml(body.xml); }
          catch (e) { throw new HttpError(400, `Could not parse that XML: ${e instanceof Error ? e.message : 'unknown error'}`); }
        } else if (Array.isArray(body.rows)) {
          rows = body.rows as Record<string, unknown>[];
        } else {
          return json({ error: 'rows[] or xml is required' }, 400);
        }
        if (!rows.length) return json({ error: 'nothing to import' }, 400);
        // A hard cap, reported rather than silently truncated: a 5,000-row paste would otherwise
        // half-import and leave the agency guessing which half.
        if (rows.length > 500) return json({ error: `That file has ${rows.length} rows; import up to 500 at a time.` }, 400);

        const dryRun = body.dry_run === true;
        const results: any[] = [];

        for (const [i, raw] of rows.entries()) {
          const { payload, errors } = normaliseImportRow(raw);
          const ref = (payload.reference_code as string) ?? null;
          if (errors.length) { results.push({ row: i + 1, reference_code: ref, action: 'skipped', errors }); continue; }

          // Idempotence on the agency's own reference. Re-running an import must update the same
          // listing, not duplicate the book — the failure that makes people distrust an importer.
          let existing: any = null;
          if (ref) {
            const { data } = await supabase.from('properties')
              .select('id, listing_agent_id, created_by, open_for_all')
              .eq('workspace_id', workspaceId).eq('reference_code', ref).maybeSingle();
            existing = data;
          }
          // An agent may not overwrite another agent's listing through the importer either.
          if (existing && !access.isBroker && !canViewProperty(existing)) {
            results.push({ row: i + 1, reference_code: ref, action: 'skipped', errors: ['a listing with this reference belongs to another agent'] });
            continue;
          }
          if (dryRun) {
            results.push({ row: i + 1, reference_code: ref, action: existing ? 'updated' : 'created', errors: [] });
            continue;
          }

          if (existing) {
            const { data, error } = await supabase.from('properties')
              .update(payload).eq('id', existing.id).eq('workspace_id', workspaceId).select('id').single();
            if (error) results.push({ row: i + 1, reference_code: ref, action: 'skipped', errors: [error.message] });
            else results.push({ row: i + 1, reference_code: ref, action: 'updated', errors: [], property_id: data.id });
          } else {
            const { data, error } = await supabase.from('properties').insert({
              ...payload,
              workspace_id: workspaceId, created_by: userId, listing_agent_id: userId,
              // Imported listings land as unpublished drafts, always. They have not been through
              // checkPublishRequirements, and a bulk import that silently pushed 300 listings to the
              // public site and the portal feeds would be unrecoverable in the way that matters.
              listing_status: 'draft', is_public: false, in_discovery: false,
            }).select('id').single();
            if (error) results.push({ row: i + 1, reference_code: ref, action: 'skipped', errors: [error.message] });
            else results.push({ row: i + 1, reference_code: ref, action: 'created', errors: [], property_id: data.id });
          }
        }

        const summary = {
          total: rows.length,
          created: results.filter((r) => r.action === 'created').length,
          updated: results.filter((r) => r.action === 'updated').length,
          skipped: results.filter((r) => r.action === 'skipped').length,
        };
        return json({ dry_run: dryRun, summary, results });
      }

      // ── Listing performance (#281 gap 8) ───────────────────────────────
      case 'listing-performance': {
        // One listing (workbench Performance tab) or the whole book (Listings tab ranking).
        const propertyId = String(body.property_id ?? '');
        let ids: string[];
        if (propertyId) {
          await loadProperty(propertyId); // view-scoped 404
          ids = [propertyId];
        } else {
          const { data: rows } = await supabase.from('properties')
            .select('id, listing_agent_id, created_by, open_for_all')
            .eq('workspace_id', workspaceId).in('listing_status', ['active', 'under_offer']).limit(300);
          // Same scoping as every other list: an agent sees their own book, not the agency's.
          ids = (rows ?? []).filter((r: any) => access.isBroker || canViewProperty(r)).map((r: any) => r.id);
        }
        if (!ids.length) return json({ performance: [], series: [] });
        const { data: perf, error } = await supabase.rpc('get_property_performance', { p_property_ids: ids });
        if (error) throw new HttpError(400, error.message);
        // The daily series backs the sparkline. 90 days is what the Performance tab charts; the
        // vendor report only ever asks for one listing, so this stays small either way.
        const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
        const { data: series } = await supabase.from('property_daily_stats')
          .select('property_id, day, views').in('property_id', ids).gte('day', since).order('day');
        return json({ performance: perf ?? [], series: series ?? [] });
      }

      // ── Listing paperwork ──────────────────────────────────────────────
      // `property_documents` existed and was READ by get-property, but had no write path and no UI,
      // so it stayed empty forever. That mattered beyond the dead table: the GR publish gate asserts
      // energy_class (ΠΕΑ) and electronic_building_id (Ηλ. Ταυτότητα) as bare text, with nowhere to
      // attach the certificate that backs the claim, and the Transaction tab's signed agreements had
      // no home on the listing either.
      case 'document-upload-url': {
        requireManage();
        const id = String(body.property_id ?? '');
        const ext = String(body.ext ?? 'pdf').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'pdf';
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        // Same private bucket as the media, under a `documents/` prefix — paperwork is never public,
        // so it is read back through a short-lived signed URL, never a persisted one (pipeline §7).
        const path = `${workspaceId}/${id}/documents/${crypto.randomUUID()}.${ext}`;
        const { data, error } = await supabase.storage.from('property-media').createSignedUploadUrl(path);
        if (error) throw new HttpError(400, error.message);
        return json({ path, token: data.token, signed_url: data.signedUrl });
      }

      case 'add-document': {
        requireManage();
        const id = String(body.property_id ?? '');
        const storagePath = String(body.storage_path ?? '');
        if (!id || !storagePath) return json({ error: 'property_id and storage_path are required' }, 400);
        await loadEditable(id);
        const docType = DOC_TYPES.includes(String(body.doc_type)) ? String(body.doc_type) : 'other';
        const { data, error } = await supabase.from('property_documents').insert({
          workspace_id: workspaceId, property_id: id, storage_path: storagePath,
          doc_type: docType, title: body.title ? String(body.title).slice(0, 200) : null, uploaded_by: userId,
        }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ document: data });
      }

      case 'list-documents': {
        const id = String(body.property_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadProperty(id); // view-scoped 404
        const { data, error } = await supabase.from('property_documents')
          .select('*').eq('property_id', id).eq('workspace_id', workspaceId).order('created_at', { ascending: false });
        if (error) throw new HttpError(400, error.message);
        const docs = await Promise.all((data ?? []).map(async (d: any) => {
          const { data: s } = await supabase.storage.from(d.storage_bucket || 'property-media').createSignedUrl(d.storage_path, 3600);
          return { ...d, url: s?.signedUrl ?? null };
        }));
        return json({ documents: docs });
      }

      case 'delete-document': {
        requireManage();
        const docId = String(body.document_id ?? '');
        if (!docId) return json({ error: 'document_id is required' }, 400);
        // Resolve the parent property and prove agent ownership first — workspace scope alone does
        // not separate two agents (same reasoning as delete-photo).
        const { data: doc } = await supabase.from('property_documents')
          .select('storage_path, storage_bucket, property_id').eq('id', docId).eq('workspace_id', workspaceId).maybeSingle();
        if (!doc) return json({ error: 'not found' }, 404);
        await loadEditable(String((doc as any).property_id));
        if (doc.storage_path) await supabase.storage.from(doc.storage_bucket || 'property-media').remove([doc.storage_path]);
        const { error } = await supabase.from('property_documents').delete().eq('id', docId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      // ── Open houses ────────────────────────────────────────────────────
      // Also read-only until now: get-property returned them and nothing could create one.
      case 'upsert-open-house': {
        requireManage();
        const id = String(body.property_id ?? '');
        const openHouseId = String(body.open_house_id ?? '');
        if (!id) return json({ error: 'property_id is required' }, 400);
        await loadEditable(id);
        const startsAt = String(body.starts_at ?? '');
        if (!openHouseId && !startsAt) return json({ error: 'starts_at is required' }, 400);
        const payload: Record<string, unknown> = {};
        if (startsAt) payload.starts_at = startsAt;
        if (body.ends_at !== undefined) payload.ends_at = body.ends_at || null;
        if (body.note !== undefined) payload.note = body.note ? String(body.note).slice(0, 1000) : null;
        if (openHouseId) {
          const { data, error } = await supabase.from('property_open_houses')
            .update(payload).eq('id', openHouseId).eq('workspace_id', workspaceId).eq('property_id', id).select('*').single();
          if (error) throw new HttpError(400, error.message);
          return json({ open_house: data });
        }
        const { data, error } = await supabase.from('property_open_houses')
          .insert({ ...payload, workspace_id: workspaceId, property_id: id }).select('*').single();
        if (error) throw new HttpError(400, error.message);
        return json({ open_house: data });
      }

      case 'delete-open-house': {
        requireManage();
        const openHouseId = String(body.open_house_id ?? '');
        if (!openHouseId) return json({ error: 'open_house_id is required' }, 400);
        const { data: oh } = await supabase.from('property_open_houses')
          .select('property_id').eq('id', openHouseId).eq('workspace_id', workspaceId).maybeSingle();
        if (!oh) return json({ error: 'not found' }, 404);
        await loadEditable(String((oh as any).property_id));
        const { error } = await supabase.from('property_open_houses').delete().eq('id', openHouseId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
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
        // Resolve the parent property and prove agent ownership before deleting — workspace
        // scope alone does not separate two agents.
        const { data: photo } = await supabase.from('property_photos').select('storage_path, property_id').eq('id', photoId).eq('workspace_id', workspaceId).maybeSingle();
        if (!photo) return json({ error: 'not found' }, 404);
        await loadEditable(String((photo as any).property_id));
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
        // SECURITY: scoping by workspace_id alone is not enough. requireManage()
        // is true for `realestate_agent`, so agent-ownership is the ONLY thing separating agents —
        // and without this, agent B could re-cover agent A's listing, including listings A has not
        // flagged open_for_all (ones B cannot even read via get-property). Every other photo action
        // (add-photo, delete-photo, analyze-photos, photo-upload-url) already does this.
        await loadEditable(id);
        await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', id).eq('workspace_id', workspaceId);
        const { error } = await supabase.from('property_photos').update({ is_cover: true }).eq('id', photoId).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'reorder-photos': {
        requireManage();
        const orderedIds: string[] = Array.isArray(body.photo_ids) ? body.photo_ids : [];
        if (orderedIds.length === 0) return json({ ok: true });
        // SECURITY: same gap as set-cover — workspace scope alone let one agent
        // reorder another's gallery. The photo ids are caller-supplied, so resolve them to their
        // parent properties and prove ownership of each before writing.
        const { data: owning, error: ownErr } = await supabase
          .from('property_photos')
          .select('property_id')
          .in('id', orderedIds)
          .eq('workspace_id', workspaceId);
        if (ownErr) throw new HttpError(400, ownErr.message);
        const propertyIds = [...new Set((owning ?? []).map((r: any) => r.property_id).filter(Boolean))];
        // Any id that is not in this workspace simply did not come back — refuse rather than
        // silently reordering the subset that did.
        if ((owning ?? []).length !== orderedIds.length) return json({ error: 'not found' }, 404);
        for (const pid of propertyIds) await loadEditable(String(pid));
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
        // Non-broker agent sees inquiries on the listings they own (D7) — OR routed to them.
        // Without the second clause, routing a lead to agent B on agent A's listing would hide it
        // from the very person it was assigned to, which makes the whole routing feature useless.
        const rows = (data ?? []).filter((r: any) =>
          access.isBroker || r.property?.listing_agent_id === userId || r.assigned_user_id === userId);
        return json({ inquiries: rows });
      }

      case 'convert-inquiry': {
        // SECURITY: this is a WRITE — inserts a crm_contacts row. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
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
          // Carry the enquiry's marketing opt-in onto the contact. This is the ONLY bridge between the
          // consent the buyer gave on the public page and the flag the direct-to-buyer alert and the
          // digest cron gate on; dropping it here re-opts-out everyone the module converts.
          marketing_consent: inq.marketing_consent === true,
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
        // SECURITY: this is a WRITE — edits buyer PII. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
        // Edit a lead: status and/or its contact fields (name/email/phone/message).
        const inqId = String(body.inquiry_id ?? '');
        if (!inqId) return json({ error: 'inquiry_id is required' }, 400);

        // SECURITY: requireManage() only proves the caller
        // may manage SOMETHING here — for a realestate_agent it is true, so on its own it lets
        // agent B rewrite the buyer PII on agent A's listing, including listings A has not
        // flagged open_for_all and B therefore cannot even READ. `list-inquiries` already scopes
        // reads by `property.listing_agent_id === userId`; scoping the write the same way is what
        // stops read and write permissions disagreeing.
        const { data: inqRow, error: inqErr } = await supabase
          .from('property_inquiries').select('property_id, assigned_user_id').eq('id', inqId).eq('workspace_id', workspaceId).maybeSingle();
        if (inqErr) throw new HttpError(400, inqErr.message);
        if (!inqRow) throw new HttpError(404, 'not found');
        // The assignee may work their own lead even on someone else's listing — routing would be
        // pointless otherwise, and this keeps the write rule matching the read rule in
        // `list-inquiries`. Everyone else still has to be able to edit the parent listing.
        if (inqRow.property_id && inqRow.assigned_user_id !== userId) await loadEditable(String(inqRow.property_id));

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
        // SECURITY: this is a WRITE — inserts a crm_contacts row. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
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

        // A walk-in or phone lead routes like any other. The agent recording it is the natural
        // owner, so they are the fallback when no territory rule matches — that is the one path
        // where an unowned lead would be strictly worse than the status quo.
        const { data: routed } = await supabase.rpc('route_property_lead', {
          p_workspace_id: workspaceId, p_property_id: propertyId,
        });
        const assignee = routed ?? userId;
        const { data: inq, error } = await supabase.from('property_inquiries').insert({
          workspace_id: workspaceId, property_id: propertyId, name, email, phone, message,
          status: 'new', source: 'manual', gdpr_consent: true, crm_contact_id: contact.id,
          assigned_user_id: assignee, assigned_at: new Date().toISOString(),
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
        // SECURITY: this is a WRITE — inserts a crm_meetings row. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
        const id = String(body.property_id ?? '');
        const scheduledAt = String(body.scheduled_at ?? '');
        if (!id || !scheduledAt) return json({ error: 'property_id and scheduled_at are required' }, 400);
        const prop = await loadProperty(id);
        const rawType = body.type === undefined ? 'viewing' : String(body.type);
        const type = VIEWING_TYPE_ALIASES[rawType] ?? rawType;
        if (!VIEWING_TYPES.includes(type)) {
          return json({ error: `type must be one of: ${VIEWING_TYPES.join(', ')}` }, 400);
        }
        const contactId = body.crm_contact_id ?? null;

        // `agent_id` is body-supplied and used as crm_meetings.owner_user_id. Unvalidated it
        // could point at anyone — a plausible cause of the very insert failure the code below
        // could not see. Must be an active member of THIS workspace.
        const agentId = String(body.agent_id ?? userId);
        if (agentId !== userId) {
          const { data: member } = await supabase.from('workspace_members')
            .select('user_id').eq('workspace_id', workspaceId).eq('user_id', agentId).eq('status', 'active').maybeSingle();
          if (!member) return json({ error: 'agent_id must be an active member of this workspace' }, 400);
        }
        // Mirror into the platform calendar (crm_meetings) so it shows in Profile→Calendar /
        // Appointments and gets the reminder cron. reminder_at is computed by crm_meetings_sync_trg.
        const subject = `${type === 'open_house' ? 'Open house' : type === 'tour' ? 'Property tour' : type === 'virtual' ? 'Virtual viewing' : 'Viewing'} — ${prop.title || prop.reference_code || 'listing'}`;
        const location = type === 'virtual'
          ? null
          : [prop.hide_exact_address ? null : prop.address, prop.town, prop.region].filter(Boolean).join(', ') || null;
        // The error MUST be checked. This discarded it, so on failure
        // `meeting` was null, `meeting_id` stored null, the viewing was created anyway and the
        // action returned 200 — leaving a viewing that appears in the Real Estate list but never
        // in the agent's calendar and never fires the 60-minute reminder, so the agent misses the
        // appointment. `update-viewing`'s sync block is gated on `data?.meeting_id`, so the
        // mismatch stayed invisible forever. Note the sibling insert two statements down has
        // always checked its error — the omission was inconsistent within one block.
        const { data: meeting, error: meetingErr } = await supabase.from('crm_meetings').insert({
          workspace_id: workspaceId, owner_user_id: agentId,
          target_kind: contactId ? 'contact' : null, target_id: contactId,
          subject, notes: prop.reference_code ? `Ref ${prop.reference_code}` : null,
          meeting_at: scheduledAt, location, remind_email: true, reminder_minutes_before: 60, status: 'scheduled',
        }).select('id').single();
        if (meetingErr || !meeting?.id) {
          throw new HttpError(400, `Could not add the viewing to the calendar: ${meetingErr?.message ?? 'unknown error'}`);
        }
        const { data, error } = await supabase.from('property_viewings').insert({
          workspace_id: workspaceId, property_id: id, scheduled_at: scheduledAt, type,
          crm_contact_id: contactId, agent_id: agentId, meeting_id: meeting.id,
        }).select('*').single();
        if (error) {
          // The calendar row is already written, and there is no transaction across these two
          // inserts. Leaving it would put a reminder-bearing appointment in the agent's calendar
          // for a viewing that does not exist — the mirror image of the bug fixed above, so it is
          // undone rather than traded.
          await supabase.from('crm_meetings').delete().eq('id', meeting.id).eq('workspace_id', workspaceId);
          throw new HttpError(400, error.message);
        }
        return json({ viewing: data });
      }

      case 'update-viewing': {
        // SECURITY: this is a WRITE — reschedules/cancels a viewing. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
        const vId = String(body.viewing_id ?? '');
        if (!vId) return json({ error: 'viewing_id is required' }, 400);

        // SECURITY: workspace scoping alone lets one agent cancel or reschedule another
        // agent's viewing, so this needs a property AND agent lookup. `list-viewings`
        // self-scopes reads with `if (!access.isBroker) q = q.eq('agent_id', userId)`; the
        // write matches it, and also defers to listing ownership so a listing agent retains
        // control of viewings on their own property. 404 rather than 403 on the lookup, to
        // stay enumeration-safe.
        const { data: vRow, error: vErr } = await supabase
          .from('property_viewings').select('agent_id, property_id').eq('id', vId).eq('workspace_id', workspaceId).maybeSingle();
        if (vErr) throw new HttpError(400, vErr.message);
        if (!vRow) throw new HttpError(404, 'not found');
        if (!access.isBroker && vRow.agent_id !== userId) {
          if (!vRow.property_id) throw new HttpError(403, 'This viewing belongs to another agent.');
          await loadEditable(String(vRow.property_id)); // throws 403/404 unless the caller owns the listing
        }

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
        // SECURITY: this is a WRITE — writes property_interests. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
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
        const { data: offer } = await supabase.from('property_offers').select('property_id, buyer_contact_id').eq('id', offerId).eq('workspace_id', workspaceId).maybeSingle();
        if (!offer) return json({ error: 'not found' }, 404);
        await loadEditable(offer.property_id);

        // AML/KYC gate. Accepting is the point of no return — it rejects every competing offer,
        // moves the listing to under_offer and cancels its future viewings. Doing that for a buyer
        // nobody has identified is what the EU AML rules on estate agency exist to stop, and it is a
        // real commercial position to unwind if it turns out badly. Off unless the broker enables it.
        const { data: kycRows } = await supabase.rpc('property_kyc_status', {
          p_workspace_id: workspaceId, p_contact_id: offer.buyer_contact_id ?? null,
        });
        const kyc = (kycRows ?? [])[0];
        if (kyc?.required && !kyc.satisfied) {
          // Name what is missing rather than refusing flatly — the agent's next action is to collect
          // exactly these, and "not allowed" would send them hunting.
          return json({
            code: 'kyc_required',
            error: offer.buyer_contact_id
              ? `This buyer still needs: ${(kyc.missing ?? []).join(', ').replace(/_/g, ' ')}.`
              : 'Link a buyer contact to this offer before accepting — AML checks are recorded against the contact.',
            missing: kyc.missing ?? [],
          }, 422);
        }

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

      // ── Sale completion + commission ────────────────────────────
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
        // Buyer saved searches carry buyer PII (name/email) and are a lead surface → manager-only,
        // like list-inquiries / list-viewings (a plain viewer must not read or write them).
        requireManage();
        let q = supabase.from('property_buyer_requirements').select('*, contact:crm_contacts!property_buyer_requirements_crm_contact_id_fkey ( id, name, email )').eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
        if (body.crm_contact_id) q = q.eq('crm_contact_id', String(body.crm_contact_id));
        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return json({ requirements: data ?? [] });
      }

      case 'upsert-buyer-requirement': {
        requireManage();
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
        requireManage();
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
        // SECURITY: this is a WRITE — writes buyer/seller contact extension. It had no
        // guard at all, so the documented read-only Member persona could reach it. RLS
        // cannot help: this function runs service-role.
        requireManage();
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

      // ── Lettings / property management — tenancies → rent ledger → maintenance ──
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
        // Settlement is DERIVED, never re-computed here: an invoiced charge is settled by the Finance
        // ledger and the stored `status` on the row can be stale the moment the tenant pays the invoice.
        // The UI renders `payment_status` / `settled`; `status` stays for the manual/waived path only.
        return json({ charges: await withRentSettlements(supabase, data ?? []) });
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
        const { data: charge } = await supabase.from('property_rent_charges').select('amount, tenancy_id, invoice_id').eq('id', chargeId).eq('workspace_id', workspaceId).maybeSingle();
        if (!charge) return json({ error: 'not found' }, 404);
        // Once a charge is invoiced the Finance ledger owns its settlement. Hand-setting the flag here
        // would create a second answer that nothing reconciles — the money is recorded by registering
        // a payment (or a credit note to waive), and get_rent_charge_settlements reads that back.
        if (charge.invoice_id) {
          return json({ error: 'This charge is invoiced — record the payment (or a credit note to waive it) in Finance. The rent ledger follows the invoice.' }, 409);
        }
        const isWaived = body.status === 'waived';
        const patch = isWaived
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
          supabase.from('property_rent_charges').select('id, amount, paid_amount, status, invoice_id, due_date, currency').eq('tenancy_id', tenancyId).eq('workspace_id', workspaceId),
          supabase.from('property_maintenance').select('cost, status').eq('tenancy_id', tenancyId).eq('workspace_id', workspaceId),
        ]);
        const num = (x: any) => Number(x ?? 0);
        // Rent received and outstanding come from the DERIVATION, not the stored flag. Summing
        // `status = 'paid'` here is what made a landlord statement under-report every invoiced rent
        // the tenant had actually paid through Finance, while showing it as still owed.
        const settled = await withRentSettlements(supabase, charges ?? []);
        const rentCharged = settled.filter((c: any) => c.payment_status !== 'waived').reduce((s: number, c: any) => s + num(c.amount), 0);
        const rentReceived = settled.reduce((s: number, c: any) => s + num(c.settled), 0);
        const outstanding = settled.reduce((s: number, c: any) => s + num(c.outstanding), 0);
        const maintenanceSpend = (wos ?? []).reduce((s: number, w: any) => s + num(w.cost), 0);
        return json({
          tenancy: t, currency: t.currency,
          summary: { rent_charged: rentCharged, rent_received: rentReceived, rent_outstanding: outstanding, maintenance_spend: maintenanceSpend, net_to_landlord: rentReceived - maintenanceSpend },
        });
      }

      // ── Investments add-on — per-property analysis + portfolio ──────
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

      // ── Rent → Finance — draft invoice per rent charge, to the tenant ──
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
        // Shared with the rent-invoicing cron (single source — no VAT/doc-type/numbering drift).
        let invoiceId: string;
        try {
          invoiceId = await createRentInvoiceForCharge(supabase, {
            workspaceId, chargeId, tenantContactId: tenancy.tenant_contact_id,
            amount: Number(charge.amount), currency: charge.currency ?? 'EUR',
            dueDate: charge.due_date, propertyTitle: property.title ?? 'property',
          });
        } catch (e) {
          throw new HttpError(400, e instanceof Error ? e.message : 'Could not create the rent invoice.');
        }
        return json({ invoice_id: invoiceId });
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

      // ── CMA / listing-pitch report — comps from own stock ──────────
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
        // Comps engine is shared with the vendor report — the seller must not be quoted a different
        // number by the two documents.
        const { comps, stats, suggestion } = await buildCompsReport(supabase, {
          workspaceId, propertyType, town, area, excludePropertyId: propertyId || undefined, bandPct: 0.1,
        });
        return json({
          subject: { property_id: propertyId || null, title: subject?.title ?? null, property_type: propertyType, town, area: area || null, price: subject?.price ?? null, currency: subject?.currency ?? 'EUR' },
          comps, stats, suggestion, generated_at: new Date().toISOString(),
        });
      }

      // ── Vendor (seller) report ─────────────────────────────────────────
      // What the instructing vendor is told about their own property: traffic, viewings and the
      // feedback from them, and what the comps say the asking price should be now. Same builder the
      // weekly cron uses, so the in-app preview and the email can never disagree.
      case 'vendor-report': {
        const propertyId = String(body.property_id ?? '');
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        const property = await loadProperty(propertyId); // view-scoped 404
        return json(await buildVendorReport(supabase, property));
      }

      case 'send-vendor-report': {
        requireManage();
        const propertyId = String(body.property_id ?? '');
        if (!propertyId) return json({ error: 'property_id is required' }, 400);
        const property = await loadEditable(propertyId);
        const sent = await sendVendorReport(supabase, property);
        if (!sent.ok) return json({ error: sent.reason }, 400);
        return json({ ok: true, to: sent.to });
      }

      // ── Deal pipeline — stage board + per-deal tasks ────────────────
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
