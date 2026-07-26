// deno-lint-ignore-file no-explicit-any
// #249 — Real Estate shared logic used by BOTH real-estate-api (management) and real-estate-public
// (token page). Keeping the publish gate and the public projection here makes them the SINGLE source
// for compliance + field visibility across every surface (a security control, not cosmetics).

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
    listing_date: p.listing_date, days_on_market: p.days_on_market, view_count: p.view_count,
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
