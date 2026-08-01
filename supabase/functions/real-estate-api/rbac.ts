// deno-lint-ignore-file no-explicit-any
// #249 — Real Estate API: RBAC, write allowlist (anti-BOPLA), and the publish compliance gate.

/** Access for the caller in this workspace (mirrors the frontend persona model, §11 / D7).
 *  - broker: owner/admin (or global admin) → manage listings + see ALL leads/viewings.
 *  - agent:  workspace role 'realestate_agent' → manage listings + own leads/viewings only.
 *  - viewer: any other active member → read listings (shared team asset, D1), no writes.
 */
export async function resolveRealEstateAccess(
  supabase: any, userId: string, workspaceId: string,
): Promise<{ canView: boolean; canManage: boolean; isBroker: boolean; role: string | null }> {
  const [{ data: prof }, { data: mem }] = await Promise.all([
    supabase.from('user_profiles').select('roles!user_profiles_role_id_fkey(name)').eq('user_id', userId).maybeSingle(),
    supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  const globalRole = (prof as any)?.roles?.name;
  if (globalRole && ['admin', 'super_admin'].includes(globalRole)) return { canView: true, canManage: true, isBroker: true, role: 'operator' };
  const role = (mem as any)?.role ?? null;
  if (role === 'owner' || role === 'admin') return { canView: true, canManage: true, isBroker: true, role };
  if (role === 'realestate_agent') return { canView: true, canManage: true, isBroker: false, role };
  // Any other active member reads the shared listings but cannot mutate.
  return { canView: !!role, canManage: false, isBroker: false, role };
}

/** Columns a client may write on a property. Identity/trust/derived/system fields are set server-side
 *  only (no mass-assignment / BOPLA, invariant #8): id, workspace_id, created_by, timestamps,
 *  view_count, public_listing_token, published_at, price_per_sqm, days_on_market, text_embedding. */
export const PROPERTY_WRITABLE = [
  'reference_code', 'property_type', 'subtype', 'transaction_type', 'listing_status',
  'listing_agent_id', 'parent_development_id', 'open_for_all', 'vendor_contact_id',
  // pricing (incl. 🔒 internal — writable by managers, just not public)
  'price', 'currency', 'price_period', 'price_on_request', 'common_charges', 'previous_price',
  'cost_basis', 'min_offer', 'commission_pct',
  // location
  'country_code', 'region', 'prefecture', 'municipality', 'town', 'postcode', 'lat', 'lng',
  'hide_exact_address', 'address', 'street_number',
  // content
  'title', 'description_i18n', 'features', 'amenities', 'slug',
  // energy & compliance
  'energy_class', 'electronic_building_id', 'atak', 'heating_type',
  // media
  'virtual_tour_url', 'video_url', 'vr_world_id',
  // agent & branding
  'agent_license_no', 'agency_logo_url',
  // lifecycle switches (publish state is set via publish/unpublish actions, not free-write)
  // `syndicate_to` REMOVED from the allowlist 2026-08-01 (audit #303 finding 9). It is typed
  // string[] and looks like a per-listing portal switch, but it has no reader and no writer
  // anywhere: real-estate-feed decides membership purely from feed_enabled + in_discovery.
  // Leaving it writable let any manager put arbitrary strings into a column with no defined
  // semantics, so whoever builds per-portal routing would inherit pre-existing garbage. Add it
  // back in the same change that gives it meaning.
  'in_discovery', 'listing_expires_at',
  // AVM / derived-ish (manager-supplied)
  'estimated_value', 'avm_source', 'price_reduced', 'listing_date',
  // residential
  'area_built', 'area_plot', 'bedrooms', 'rooms', 'bathrooms', 'wc', 'kitchens', 'living_rooms', 'levels',
  'floor', 'floors_total', 'year_built', 'year_renovated', 'condition', 'furnished', 'heating_medium',
  'air_conditioning', 'underfloor_heating', 'orientation', 'view_types', 'balcony_area',
  'parking_spaces', 'parking_type', 'storage', 'pets_allowed', 'suitable_for',
  // amenities (Spitogatos/portal-mapped) + agent contact + construction
  'elevator', 'fireplace', 'garden', 'pool', 'alarm', 'solar_heater', 'security_door', 'double_glazing',
  'screens', 'awning', 'night_current', 'has_view', 'open_parking_spots', 'closed_parking_spots',
  'is_new_development', 'construction_status', 'agent_name', 'agent_phone', 'agent_email', 'agent_website',
  // commercial
  'gross_area', 'net_area', 'frontage', 'ceiling_height', 'floors_included', 'storefront_windows',
  'wc_count', 'loading_dock', 'goods_lift', 'three_phase_power', 'power_capacity_kva',
  'fire_safety_cert', 'accessibility_amea', 'current_use', 'permitted_use', 'operating_license',
  'occupancy_status', 'current_rent', 'cap_rate', 'lease_expiry', 'remaining_lease_term',
  'key_money', 'business_type', 'annual_turnover', 'staff_count', 'inventory_included', 'reason_for_sale',
  // land
  'plot_area', 'buildable', 'building_coefficient', 'coverage_ratio', 'max_building_height',
  'allowed_floors', 'land_use', 'inside_city_plan', 'within_settlement', 'frontage_to_road',
  'road_access', 'slope', 'corner_plot', 'utilities_available', 'distance_to_sea',
  'existing_structures', 'legal_clearances',
  // short-let
  'max_guests', 'bed_config', 'min_stay_nights', 'check_in_time', 'check_out_time', 'house_rules',
  'cleaning_fee', 'deposit', 'instant_book', 'cancellation_policy', 'short_term_rental_license',
  'smoking_allowed', 'events_allowed',
  // long tail
  'category_attributes',
] as const;

export function pick(body: any, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (body?.[c] !== undefined) out[c] = body[c];
  return out;
}
