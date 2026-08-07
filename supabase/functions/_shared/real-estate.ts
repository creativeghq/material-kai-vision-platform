// deno-lint-ignore-file no-explicit-any
// Real Estate shared logic used by BOTH real-estate-api (management) and real-estate-public
// (token page). Keeping the publish gate and the public projection here makes them the SINGLE source
// for compliance + field visibility across every surface (a security control, not cosmetics).

import { escapeHtml } from './html.ts';

const GR = new Set(['EL', 'GR', 'GRC']); // ΑΑΔΕ uses 'EL'; ISO alpha-2 'GR'

/**
 * Does a listing `p` satisfy a saved-buyer-search `criteria` `c`? The SINGLE source used by the buyer
 * portal, the cross-workspace discover, the "buyers for this property" inverse, and the daily digest —
 * so a criteria tweak can't make those surfaces silently disagree (was copy-pasted in 3 files).
 */
export function matchesCriteria(c: any, p: any): boolean {
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

/**
 * Create the draft rent invoice (+ line item) for a rent charge and link it back. SINGLE source used
 * by BOTH the rent-invoicing cron and the invoice-rent-charge API action (was duplicated → drift risk
 * on VAT/doc-type/numbering). Draft, VAT-0, doc_type 1.1 — the operator sets the correct rent VAT on
 * issue in Finance (residential rent is usually exempt, commercial isn't); nothing is transmitted here.
 * Throws on any step; returns the new invoice id.
 */
/** Median-price-per-sqm × area, ±band, rounded to the nearest 1,000. SINGLE source for the CMA report
 *  (±10%) and the public instant valuation (±15%) — same formula, band passed in (was 2 copies). */
export function estimateFromMedianPerSqm(median: number | null, area: number, bandPct: number): { estimate: number; low: number; high: number } | null {
  if (!median || !(area > 0)) return null;
  const round1k = (n: number) => Math.round(n / 1000) * 1000;
  const base = median * area;
  return { estimate: round1k(base), low: round1k(base * (1 - bandPct)), high: round1k(base * (1 + bandPct)) };
}

/**
 * Attach the DERIVED settlement to rent-charge rows: `settled`, `outstanding`, `payment_status` and
 * `settlement_source`, from `get_rent_charge_settlements` — the single source (see the migration
 * `realestate_rent_charge_settlement_derivation`). TypeScript formats, SQL derives: never re-compute
 * rent received from `status`/`paid_amount` in a consumer, because an invoiced charge is settled by
 * the Finance ledger and the stored flag on the row does not move when the tenant pays.
 *
 * Falls back to the stored flag ONLY if the RPC itself fails — a landlord statement that renders
 * slightly stale beats one that renders nothing, and the drift check reports the disagreement either way.
 */
export async function withRentSettlements(supabase: any, charges: any[]): Promise<any[]> {
  if (!charges.length) return [];
  const ids = charges.map((c) => c.id).filter(Boolean);
  if (!ids.length) return charges;
  const { data, error } = await supabase.rpc('get_rent_charge_settlements', { p_charge_ids: ids });
  if (error) {
    console.error('[real-estate] rent settlement derivation failed, falling back to stored flag:', error.message);
    return charges.map((c) => ({
      ...c,
      settled: c.status === 'paid' ? Number(c.paid_amount ?? c.amount ?? 0) : 0,
      outstanding: c.status === 'paid' || c.status === 'waived' ? 0 : Number(c.amount ?? 0),
      payment_status: c.status,
      settlement_source: 'stale',
    }));
  }
  const byId = new Map((data ?? []).map((r: any) => [r.charge_id, r]));
  return charges.map((c) => ({ ...c, ...(byId.get(c.id) ?? {}) }));
}

/**
 * Comps + stats + suggested asking price from the agency's OWN stock. SINGLE source for the CMA
 * report and the vendor report — the vendor report's "what your property is worth now" line has to
 * be the same number the CMA would print, or the agent and the seller are reading two valuations.
 *
 * Days-on-market comes from `get_property_performance`, never re-derived here.
 */
export async function buildCompsReport(supabase: any, args: {
  workspaceId: string; propertyType: string; town: string; area: number;
  excludePropertyId?: string; bandPct?: number;
}): Promise<{ comps: any[]; stats: any; suggestion: { estimate: number; low: number; high: number } | null }> {
  let cq = supabase.from('properties')
    .select('id, title, town, price, area_built, plot_area, listing_status, sold_price, sold_at, created_at, currency, bedrooms')
    .eq('workspace_id', args.workspaceId).eq('property_type', args.propertyType)
    .in('listing_status', ['active', 'under_offer', 'sold']).not('price', 'is', null);
  if (args.town) cq = cq.ilike('town', args.town);
  if (args.excludePropertyId) cq = cq.neq('id', args.excludePropertyId);
  const { data: raw } = await cq.limit(60);

  const { data: perfRows } = await supabase.rpc('get_property_performance', { p_property_ids: (raw ?? []).map((c: any) => c.id) });
  const domById = new Map((perfRows ?? []).map((r: any) => [r.property_id, r.days_on_market]));

  const comps = (raw ?? []).map((c: any) => {
    const a = Number(c.area_built ?? c.plot_area ?? 0);
    // A sold comp is worth what it SOLD for, not what it was asking — using the asking price would
    // bias every valuation upward by the market's typical discount.
    const effPrice = c.listing_status === 'sold' && c.sold_price != null ? Number(c.sold_price) : Number(c.price);
    const pps = a > 0 ? effPrice / a : null;
    return {
      id: c.id, title: c.title, town: c.town, price: effPrice, area: a || null, bedrooms: c.bedrooms ?? null,
      price_per_sqm: pps ? Math.round(pps) : null, listing_status: c.listing_status,
      days_on_market: domById.get(c.id) ?? null, currency: c.currency ?? 'EUR',
    };
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
  return { comps, stats, suggestion: estimateFromMedianPerSqm(median, args.area, args.bandPct ?? 0.1) };
}

/**
 * The vendor report payload: how the vendor's own property is performing, the feedback from the
 * people who viewed it, and what the comps say it should be asking now.
 *
 * SINGLE builder for the in-app preview, the manual send and the weekly cron — a seller who reads
 * the emailed number and then hears a different one from their agent stops trusting both.
 */
export async function buildVendorReport(supabase: any, property: any): Promise<any> {
  const [{ data: perfRows }, { data: viewings }, { data: vendor }] = await Promise.all([
    supabase.rpc('get_property_performance', { p_property_ids: [property.id] }),
    supabase.from('property_viewings')
      .select('scheduled_at, status, feedback')
      .eq('property_id', property.id).eq('status', 'completed').not('feedback', 'is', null)
      .order('scheduled_at', { ascending: false }).limit(6),
    property.vendor_contact_id
      ? supabase.from('crm_contacts').select('id, name, email').eq('id', property.vendor_contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const perf = (perfRows ?? [])[0] ?? null;

  const area = Number(property.area_built ?? property.plot_area ?? 0);
  const { stats, suggestion } = await buildCompsReport(supabase, {
    workspaceId: property.workspace_id, propertyType: property.property_type,
    town: property.town ?? '', area, excludePropertyId: property.id, bandPct: 0.1,
  });

  // The one judgement the report makes. Deliberately conservative and only offered when there is
  // both enough evidence and a real gap — an agent nudging every vendor to cut on two comps is how
  // this feature loses its credibility.
  let recommendation: string | null = null;
  if (suggestion && property.price != null && stats.count >= 3) {
    const gap = (Number(property.price) - suggestion.estimate) / suggestion.estimate;
    if (gap > 0.1) recommendation = 'The asking price is above what comparable local sales support. A reduction toward the range below would widen the buyer pool.';
    else if (gap < -0.1) recommendation = 'The asking price sits below comparable local sales — there may be room to hold firm on offers.';
    else recommendation = 'The asking price is in line with comparable local sales.';
  }

  return {
    property: {
      id: property.id, title: property.title, town: property.town,
      price: property.price, currency: property.currency ?? 'EUR',
      public_token: property.public_listing_token ?? null,
    },
    vendor: vendor ? { id: vendor.id, name: vendor.name, email: vendor.email } : null,
    performance: perf,
    feedback: (viewings ?? []).map((v: any) => ({ at: v.scheduled_at, feedback: v.feedback })),
    market: { comps_count: stats.count, median_per_sqm: stats.median_per_sqm, avg_days_on_market: stats.avg_days_on_market, suggestion },
    recommendation,
    period_since: property.last_vendor_report_at ?? null,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Build + email the vendor report, and stamp the listing. Shared by the manual "Send now" action and
 * the weekly cron so there is one email body and one stamping rule.
 *
 * Returns a reason rather than throwing when there is simply nobody to send to — the cron sweeps
 * hundreds of listings and a missing vendor email is an ordinary state, not an error.
 */
export async function sendVendorReport(supabase: any, property: any): Promise<{ ok: boolean; reason?: string; to?: string }> {
  const report = await buildVendorReport(supabase, property);
  const to = report.vendor?.email as string | undefined;
  if (!to) return { ok: false, reason: 'This listing has no vendor contact with an email address.' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';
  const p = report.performance ?? {};
  const money = (n: number | null | undefined, ccy: string) =>
    n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(Number(n));

  const stat = (label: string, value: string) =>
    `<td style="padding:10px 12px;border:1px solid #eee;border-radius:10px">
       <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888">${escapeHtml(label)}</div>
       <div style="font-size:20px;font-weight:600">${escapeHtml(value)}</div>
     </td>`;

  const feedbackHtml = report.feedback.length
    ? `<h3 style="margin:22px 0 6px;font-size:15px">What viewers said</h3>` +
      report.feedback.map((f: any) =>
        `<div style="padding:8px 0;border-bottom:1px solid #eee">
           <div style="font-size:14px">“${escapeHtml(String(f.feedback).slice(0, 400))}”</div>
           <div style="font-size:12px;color:#999">${new Date(f.at).toLocaleDateString('en-GB')}</div>
         </div>`).join('')
    : '';

  const marketHtml = report.market.suggestion
    ? `<h3 style="margin:22px 0 6px;font-size:15px">The local market</h3>
       <p style="font-size:14px;margin:0 0 6px">Based on ${report.market.comps_count} comparable local propert${report.market.comps_count === 1 ? 'y' : 'ies'}, we would expect
       <strong>${escapeHtml(money(report.market.suggestion.low, report.property.currency))} – ${escapeHtml(money(report.market.suggestion.high, report.property.currency))}</strong>.
       ${report.market.avg_days_on_market != null ? `They took an average of ${report.market.avg_days_on_market} days to sell.` : ''}</p>
       ${report.recommendation ? `<p style="font-size:14px;margin:0">${escapeHtml(report.recommendation)}</p>` : ''}`
    : '';

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#222">
    <h2 style="margin:0 0 2px">Your property update</h2>
    <p style="color:#666;font-size:14px;margin:0 0 16px">${escapeHtml(report.property.title || 'Your property')}${report.property.town ? ` — ${escapeHtml(report.property.town)}` : ''} · asking ${escapeHtml(money(report.property.price, report.property.currency))}</p>
    <table style="width:100%;border-collapse:separate;border-spacing:6px 0"><tr>
      ${stat('Views (30d)', String(p.views_30d ?? 0))}
      ${stat('Enquiries', String(p.inquiries_total ?? 0))}
      ${stat('Viewings', String(p.viewings_total ?? 0))}
      ${stat('Days listed', p.days_on_market != null ? String(p.days_on_market) : '—')}
    </tr></table>
    ${feedbackHtml}
    ${marketHtml}
    ${report.property.public_token ? `<p style="margin:20px 0"><a href="${appUrl}/p/${encodeURIComponent(report.property.public_token)}" style="background:#b0106a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">View your listing</a></p>` : ''}
    <p style="color:#999;font-size:12px;margin-top:22px">You're receiving this because we're marketing this property for you. Reply to this email to speak to your agent.</p>
  </div>`;

  const res = await fetch(`${supabaseUrl}/functions/v1/email-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({
      action: 'send', to, subject: `Your property update — ${report.property.title || report.property.town || 'this week'}`,
      html, emailType: 'transactional',
      tags: { feature: 'vendor_report', property_id: report.property.id },
      workspace_id: property.workspace_id,
    }),
  });
  if (!res.ok) return { ok: false, reason: `email send failed (${res.status})` };

  // Stamp only after a successful send, so a failed week retries rather than being skipped.
  await supabase.from('properties').update({ last_vendor_report_at: new Date().toISOString() }).eq('id', property.id);
  return { ok: true, to };
}

export async function createRentInvoiceForCharge(supabase: any, args: {
  workspaceId: string; chargeId: string; tenantContactId: string;
  amount: number; currency: string; dueDate: string; propertyTitle: string;
}): Promise<string> {
  const title = args.propertyTitle || 'property';
  const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', { p_workspace_id: args.workspaceId });
  if (numErr) throw new Error(`numbering failed: ${numErr.message}`);
  const { data: inv, error: invErr } = await supabase.from('invoices').insert({
    workspace_id: args.workspaceId, customer_contact_id: args.tenantContactId,
    internal_number: draftNumber as string, status: 'draft', document_type: '1.1',
    currency: args.currency || 'EUR', subtotal_net: args.amount, vat_rate: 0, vat_amount: 0, total: args.amount,
    notes: `Rent — ${title} — due ${args.dueDate}`, issued_at: null, due_at: args.dueDate,
  }).select('id').single();
  if (invErr) throw new Error(invErr.message);
  const invoiceId = (inv as any).id as string;
  const { error: itErr } = await supabase.from('invoice_items').insert({
    invoice_id: invoiceId, description: `Rent — ${title} (${args.dueDate})`,
    quantity: 1, unit_price: args.amount, net_value: args.amount, vat_amount: 0, line_total: args.amount,
  });
  if (itErr) throw new Error(itErr.message);
  await supabase.from('property_rent_charges').update({ invoice_id: invoiceId }).eq('id', args.chargeId).eq('workspace_id', args.workspaceId);
  return invoiceId;
}

/**
 * Publish compliance gate (revised §3 per-category required-field policy + the GR hard-block).
 * Greece: buildings need energy_class + electronic_building_id (ΠΕΑ + Ηλεκτρονική Ταυτότητα);
 * short-let needs the ΑΜΑ license; land needs land_use/zoning. Non-GR: same list, warn-only.
 */
export function checkPublishRequirements(
  p: any,
): { ok: boolean; hardErrors: string[]; warnings: string[] } {
  const isGR = GR.has(String(p.country_code ?? '').toUpperCase());
  const missing: string[] = [];

  if (p.transaction_type === 'short_let') {
    if (!p.short_term_rental_license) missing.push('short_term_rental_license (ΑΜΑ)');
  } else if (p.property_type === 'land') {
    if (!p.land_use) missing.push('land_use / zoning');
  } else {
    // residential / commercial / other = a building
    if (!p.energy_class) missing.push('energy_class (ΠΕΑ)');
    if (!p.electronic_building_id) missing.push('electronic_building_id (Ηλεκτρονική Ταυτότητα Κτηρίου)');
  }
  // Universally sensible publish preconditions (hard everywhere).
  const base: string[] = [];
  if (!p.title && !(p.description_i18n && Object.keys(p.description_i18n).length)) base.push('title or description');
  if (p.price == null && !p.price_on_request) base.push('price (or price_on_request)');

  if (isGR) return { ok: missing.length === 0 && base.length === 0, hardErrors: [...missing, ...base], warnings: [] };
  return { ok: base.length === 0, hardErrors: base, warnings: missing };
}

/**
 * The public projection — the SINGLE source for the public listing page, Discovery, and portal feeds.
 * Emits only 🌐 listing / 🔎 facet fields; strips 🔒 internal fields (cost_basis, min_offer,
 * commission_pct, atak, syndication state) and nulls the exact address when hidden. NEVER return the
 * raw row to an anonymous surface.
 */
export function toPublic(p: any): Record<string, unknown> {
  const hide = !!p.hide_exact_address;
  return {
    id: p.id,
    public_listing_token: p.public_listing_token, // the public URL capability (safe: these are published listings)
    reference_code: p.reference_code,
    property_type: p.property_type,
    subtype: p.subtype,
    transaction_type: p.transaction_type,
    listing_status: p.listing_status,
    // pricing (public)
    price: p.price_on_request ? null : p.price,
    currency: p.currency,
    price_period: p.price_period,
    price_on_request: p.price_on_request,
    common_charges: p.common_charges,
    price_per_sqm: p.price_per_sqm,
    // location (exact address stripped when hidden)
    country_code: p.country_code, region: p.region, prefecture: p.prefecture,
    municipality: p.municipality, town: p.town, postcode: hide ? null : p.postcode,
    lat: hide ? null : p.lat, lng: hide ? null : p.lng, hide_exact_address: hide,
    address: hide ? null : p.address, street_number: hide ? null : p.street_number,
    // content
    title: p.title, description_i18n: p.description_i18n, features: p.features, amenities: p.amenities, slug: p.slug,
    // energy (public/facet); compliance ids (electronic_building_id, atak) stay internal
    energy_class: p.energy_class, heating_type: p.heating_type,
    // media
    virtual_tour_url: p.virtual_tour_url, video_url: p.video_url, vr_world_id: p.vr_world_id,
    // agent (public)
    agent_license_no: p.agent_license_no, agency_logo_url: p.agency_logo_url,
    agent_name: p.agent_name, agent_phone: p.agent_phone, agent_email: p.agent_email, agent_website: p.agent_website,
    // No days_on_market here: it is DERIVED by get_property_performance, not a column. The column it
    // used to read was never written by anything, so this shipped a permanent null to the public page
    // and to every portal feed.
    listing_date: p.listing_date, view_count: p.view_count,
    previous_price: p.previous_price, price_reduced: p.price_reduced, is_new_development: p.is_new_development, construction_status: p.construction_status,
    // facetable physical (safe subset)
    area_built: p.area_built, area_plot: p.area_plot, plot_area: p.plot_area,
    bedrooms: p.bedrooms, rooms: p.rooms, bathrooms: p.bathrooms, wc: p.wc, kitchens: p.kitchens, living_rooms: p.living_rooms,
    floor: p.floor, floors_total: p.floors_total, levels: p.levels,
    year_built: p.year_built, year_renovated: p.year_renovated, condition: p.condition, furnished: p.furnished, orientation: p.orientation,
    parking_spaces: p.parking_spaces, parking_type: p.parking_type, open_parking_spots: p.open_parking_spots, closed_parking_spots: p.closed_parking_spots,
    view_types: p.view_types, max_guests: p.max_guests, balcony_area: p.balcony_area,
    // amenities (public booleans)
    elevator: p.elevator, fireplace: p.fireplace, garden: p.garden, pool: p.pool, storage: p.storage,
    air_conditioning: p.air_conditioning, underfloor_heating: p.underfloor_heating, solar_heater: p.solar_heater,
    security_door: p.security_door, double_glazing: p.double_glazing, screens: p.screens, awning: p.awning,
    alarm: p.alarm, night_current: p.night_current, has_view: p.has_view, pets_allowed: p.pets_allowed, heating_medium: p.heating_medium,
    // full category detail for rich display (already non-sensitive)
    category_attributes: p.category_attributes,
  };
}
