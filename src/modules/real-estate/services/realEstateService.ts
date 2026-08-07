import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Client for the `real-estate-api` (authed) + `real-estate-public` (token page) edge functions.
// Every management call passes the active workspace_id; the edge fn re-derives access from the caller
// (JWT) and enforces entitlement + realestate.* RBAC. `properties` post-dates the last gen-types run,
// so rows are loosely typed here (same safety level hrService uses for its post-types tables).

export type ListingStatus = 'draft' | 'active' | 'under_offer' | 'sold' | 'rented' | 'withdrawn' | 'archived';
export type PropertyType = 'residential' | 'commercial' | 'land' | 'other';
export type TransactionType = 'sale' | 'rent' | 'short_let' | 'business_transfer' | 'auction';

export interface PropertyListItem {
  id: string;
  reference_code: string | null;
  title: string | null;
  property_type: PropertyType;
  subtype: string | null;
  transaction_type: TransactionType;
  listing_status: ListingStatus;
  price: number | null;
  currency: string;
  town: string | null;
  region: string | null;
  is_public: boolean;
  in_discovery: boolean;
  syndicate_to: string[];
  listing_agent_id: string | null;
  view_count: number;
  updated_at: string;
  created_at: string;
}

// The full row carries ~110 columns (category-segmented §3) — kept as an open record so the workbench
// can bind any field without churning this type on every schema addition.
export type Property = Record<string, any> & { id: string; workspace_id: string };

export interface PropertyPhoto {
  id: string; property_id: string; storage_path: string; kind: 'photo' | 'floor_plan' | 'render';
  sort_order: number; is_cover: boolean; caption: string | null; ai_tags: string[]; created_at: string;
}
export interface PropertyInquiry {
  id: string; property_id: string; crm_contact_id: string | null; name: string | null; email: string | null;
  phone: string | null; message: string | null; status: string; source: string; created_at: string;
  property?: { id: string; title: string | null; reference_code: string | null; listing_agent_id: string | null } | null;
}
export interface PropertyViewing {
  id: string; property_id: string; crm_contact_id: string | null; agent_id: string | null;
  scheduled_at: string; type: string; status: string; feedback: string | null; created_at: string;
  property?: { id: string; title: string | null; reference_code: string | null } | null;
}

export interface BuyerRequirement {
  id: string; crm_contact_id: string; label: string | null; criteria: Record<string, any>; is_active: boolean; created_at: string; updated_at: string;
  portal_token?: string | null; digest_enabled?: boolean; last_digest_at?: string | null;
  contact?: { id: string; name: string | null; email: string | null } | null;
}
export interface ContactExt {
  crm_contact_id: string; workspace_id: string; contact_role: string | null;
  pre_approval_status: string | null; pre_approval_amount: number | null; lender: string | null;
  budget_min: number | null; budget_max: number | null;
  owned_property_value: number | null; owned_property_address: string | null; owned_property_equity: number | null;
}

async function call<T>(workspaceId: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('real-estate-api', {
    body: { action, workspace_id: workspaceId, ...extra },
  });
  if (error) throw await edgeError(error);
  return data as T;
}

export interface PropertyOffer {
  id: string; property_id: string; buyer_contact_id: string | null; buyer_name: string | null;
  amount: number; currency: string; status: 'offered' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
  terms: string | null; proof_of_funds: boolean; mortgage_in_principle: boolean; chain_free: boolean; note: string | null; created_at: string;
  buyer?: { id: string; name: string | null; email: string | null } | null;
}

export interface SellerLead {
  crm_contact_id: string; owned_property_address: string | null; owned_property_value: number | null; owned_property_equity: number | null;
  contact?: { id: string; name: string | null; email: string | null; phone: string | null; lead_status: string | null; lead_score: number | null; lead_source: string | null; created_at: string } | null;
}
export interface ValuationResult { estimate: number | null; range_low: number | null; range_high: number | null; currency: string; comps_count: number; median_per_sqm: number | null }

// ── Lettings / property management ──
export type RentFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface Tenancy {
  id: string; property_id: string; tenant_contact_id: string | null; landlord_contact_id: string | null;
  rent_amount: number; currency: string; rent_frequency: RentFrequency; deposit: number | null;
  start_date: string; end_date: string | null; status: 'pending' | 'active' | 'ended' | 'terminated'; notes: string | null;
  property?: { id: string; title: string | null; reference_code: string | null; town: string | null } | null;
  tenant?: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  landlord?: { id: string; name: string | null } | null;
}
export interface RentCharge {
  id: string; tenancy_id: string; due_date: string; amount: number; currency: string;
  /** The STORED flag. Meaningful only for uninvoiced charges — render `payment_status` instead. */
  status: 'due' | 'paid' | 'overdue' | 'waived'; paid_at: string | null; paid_amount: number | null; note: string | null;
  invoice_id: string | null;
  /** Derived by get_rent_charge_settlements — invoiced charges settle from the Finance ledger,
   *  uninvoiced ones from the stored flag. This is the number to display. */
  payment_status: 'due' | 'paid' | 'partial' | 'overdue' | 'waived';
  settled: number; outstanding: number;
  settlement_source: 'invoice' | 'manual' | 'waived' | 'stale';
}
/** Derived by `get_property_performance` — the single source, including days_on_market.
 *  Never re-compute a DOM or a view total from columns in a consumer. */
export interface ListingPerformance {
  property_id: string;
  days_on_market: number | null;
  views_total: number; views_7d: number; views_30d: number;
  inquiries_total: number; inquiries_30d: number;
  viewings_total: number; viewings_completed: number;
  offers_total: number;
  price_changes: number; first_price: number | null; current_price: number | null; price_change_pct: number | null;
  lead_sources: Record<string, number>;
}
export interface ListingViewPoint { property_id: string; day: string; views: number }

/** Listing paperwork. `url` is a short-lived signed URL minted on read — never persist it. */
export interface PropertyDocument {
  id: string; property_id: string; storage_bucket: string; storage_path: string;
  doc_type: string; title: string | null; uploaded_by: string | null; created_at: string;
  url?: string | null;
}
export const DOC_TYPE_LABELS: Record<string, string> = {
  energy_certificate: 'Energy certificate (ΠΕΑ)',
  building_id: 'Electronic building ID (Ηλ. Ταυτότητα)',
  title_deed: 'Title deed',
  floor_plan: 'Floor plan',
  topographic: 'Topographic diagram',
  agency_agreement: 'Agency agreement',
  permit: 'Permit',
  tax_clearance: 'Tax clearance',
  other: 'Other',
};
export interface OpenHouse {
  id: string; property_id: string; starts_at: string; ends_at: string | null; note: string | null; created_at: string;
}
export interface MaintenanceWorkOrder {
  id: string; property_id: string; tenancy_id: string | null; title: string; description: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'; priority: 'low' | 'normal' | 'high' | 'urgent';
  contractor_name: string | null; cost: number | null; reported_at: string; resolved_at: string | null;
  property?: { id: string; title: string | null; reference_code: string | null } | null;
}
export interface LandlordStatement {
  tenancy: Tenancy; currency: string;
  summary: { rent_charged: number; rent_received: number; rent_outstanding: number; maintenance_spend: number; net_to_landlord: number };
}

// ── Sale completion + commission ──
export interface PropertySale {
  id: string; property_id: string; offer_id: string | null; sale_price: number; currency: string;
  commission_pct: number; commission_fixed: number; vat_pct: number; commission_base: number; commission_total: number;
  seller_contact_id: string | null; buyer_contact_id: string | null; completed_at: string;
  invoice_id: string | null; invoice_status: string | null; notes: string | null;
  property?: { id: string; title: string | null; reference_code: string | null; town: string | null } | null;
  seller?: { id: string; name: string | null; email: string | null } | null;
}

export interface FeedSettings { workspace_id: string; feed_token: string; feed_enabled: boolean; feed_format: string }

/** Public syndication feed URL a portal can pull. */
export function feedUrl(token: string, format: string): string {
  const base = (supabase as any).supabaseUrl || '';
  return `${base}/functions/v1/real-estate-feed?token=${encodeURIComponent(token)}&format=${encodeURIComponent(format)}`;
}

export interface RealEstateDashboard {
  totals: { listings: number; public: number; active: number; draft: number; under_offer: number; sold: number };
  commission: { sold_count: number; gross_sales: number; commission_net: number; invoiced_count: number; currency: string };
  new_leads: number;
  recent_leads: (PropertyInquiry & { property?: { title: string | null } | null })[];
  upcoming_viewings: (PropertyViewing & { property?: { title: string | null } | null })[];
}

// ── Investments add-on ──
export interface InvestmentInputs {
  purchase_price: number; acquisition_costs: number; renovation_costs: number;
  loan_amount: number; interest_rate_pct: number; loan_term_years: number;
  monthly_rent: number; other_monthly_income: number; monthly_opex: number; vacancy_pct: number;
  currency: string; notes: string | null;
}
export interface InvestmentMetrics {
  total_investment: number; cash_invested: number; gross_annual_rent: number; effective_annual_rent: number;
  annual_opex: number; noi: number; monthly_debt_service: number; annual_debt_service: number;
  annual_cash_flow: number; monthly_cash_flow: number;
  gross_yield_pct: number; net_yield_pct: number; cap_rate_pct: number; cash_on_cash_pct: number;
}
export interface PropertyInvestment extends InvestmentInputs {
  id: string; property_id: string;
  property?: { id: string; title: string | null; reference_code: string | null; town: string | null; listing_status: string } | null;
  metrics?: InvestmentMetrics;
}
export interface InvestmentPortfolio {
  count: number; total_invested: number; cash_invested: number; annual_noi: number;
  annual_cash_flow: number; monthly_cash_flow: number; blended_net_yield_pct: number; currency: string;
}

// ── CMA report ──
export interface CmaComp { id: string; title: string | null; town: string | null; price: number; area: number | null; bedrooms: number | null; price_per_sqm: number | null; listing_status: string; days_on_market: number | null; currency: string }
export interface CmaReport {
  subject: { property_id: string | null; title: string | null; property_type: string; town: string; area: number | null; price: number | null; currency: string };
  comps: CmaComp[];
  stats: { count: number; sold_count: number; min_per_sqm: number | null; median_per_sqm: number | null; max_per_sqm: number | null; avg_days_on_market: number | null };
  suggestion: { estimate: number; low: number; high: number } | null;
  generated_at: string;
}

// ── Deal pipeline ──
export type DealStage = 'lead' | 'viewing' | 'offer' | 'under_offer' | 'conveyancing' | 'exchanged' | 'completed';
export interface PropertyDeal {
  id: string; property_id: string; buyer_contact_id: string | null; stage: DealStage;
  status: 'open' | 'won' | 'lost'; value: number | null; currency: string;
  expected_close_date: string | null; lost_reason: string | null; notes: string | null;
  task_total: number; task_done: number;
  property?: { id: string; title: string | null; reference_code: string | null; town: string | null } | null;
  buyer?: { id: string; name: string | null } | null;
}
export interface DealTask { id: string; deal_id: string; title: string; done: boolean; due_date: string | null; created_at: string }

export const realEstateService = {
  dashboard: (ws: string) => call<RealEstateDashboard>(ws, 'dashboard'),
  // Syndication feed
  getFeedSettings: (ws: string) => call<{ settings: FeedSettings | null }>(ws, 'get-feed-settings').then((r) => r.settings),
  updateFeedSettings: (ws: string, patch: { feed_enabled?: boolean; feed_format?: string }) =>
    call<{ settings: FeedSettings }>(ws, 'update-feed-settings', patch).then((r) => r.settings),
  rotateFeedToken: (ws: string) => call<{ settings: FeedSettings }>(ws, 'rotate-feed-token').then((r) => r.settings),
  // Properties
  listProperties: (ws: string, filters: { status?: string; property_type?: string } = {}) =>
    call<{ properties: PropertyListItem[] }>(ws, 'list-properties', filters).then((r) => r.properties),
  getProperty: (ws: string, propertyId: string) =>
    call<{ property: Property; can_edit: boolean; photos: PropertyPhoto[]; inquiries: PropertyInquiry[]; viewings: PropertyViewing[]; price_history: any[]; open_houses: OpenHouse[]; documents: PropertyDocument[] }>(ws, 'get-property', { property_id: propertyId }),
  createProperty: (ws: string, fields: Record<string, unknown>) =>
    call<{ property: Property }>(ws, 'create-property', fields).then((r) => r.property),
  updateProperty: (ws: string, propertyId: string, fields: Record<string, unknown>) =>
    call<{ property: Property }>(ws, 'update-property', { property_id: propertyId, ...fields }).then((r) => r.property),
  deleteProperty: (ws: string, propertyId: string) => call<{ ok: true }>(ws, 'delete-property', { property_id: propertyId }),
  /** May reject with a `publish_blocked` payload — see isPublishBlocked(). */
  publishProperty: (ws: string, propertyId: string) =>
    call<{ property: Property; warnings: string[] }>(ws, 'publish-property', { property_id: propertyId }),
  unpublishProperty: (ws: string, propertyId: string) =>
    call<{ property: Property }>(ws, 'unpublish-property', { property_id: propertyId }).then((r) => r.property),
  /** AI listing copy (credit-metered). Returns a draft to fill into the form — not auto-saved. */
  draftDescription: (ws: string, propertyId: string) =>
    call<{ title: string; description_en: string; description_el: string; credits: number }>(ws, 'draft-description', { property_id: propertyId }),
  /** Render a client-ready brochure PDF (property-media bucket). Returns a 7-day signed URL. */
  async generateBrochure(propertyId: string): Promise<{ pdf_url: string | null; page_count: number }> {
    const { data, error } = await supabase.functions.invoke('generate-moodboard-sheet-pdf', { body: { property_brochure_id: propertyId } });
    if (error) throw await edgeError(error);
    return data as { pdf_url: string | null; page_count: number };
  },

  // Photos
  photoUploadUrl: (ws: string, propertyId: string, ext: string) =>
    call<{ path: string; token: string; signed_url: string }>(ws, 'photo-upload-url', { property_id: propertyId, ext }),
  addPhoto: (ws: string, propertyId: string, storagePath: string, kind = 'photo', caption?: string) =>
    call<{ photo: PropertyPhoto }>(ws, 'add-photo', { property_id: propertyId, storage_path: storagePath, kind, caption }).then((r) => r.photo),
  deletePhoto: (ws: string, photoId: string) => call<{ ok: true }>(ws, 'delete-photo', { photo_id: photoId }),
  setCover: (ws: string, propertyId: string, photoId: string) => call<{ ok: true }>(ws, 'set-cover', { property_id: propertyId, photo_id: photoId }),
  reorderPhotos: (ws: string, photoIds: string[]) => call<{ ok: true }>(ws, 'reorder-photos', { photo_ids: photoIds }),
  /** Vision AI: tag photos + auto-pick the cover (credit-metered). */
  analyzePhotos: (ws: string, propertyId: string) =>
    call<{ ok: true; cover_photo_id: string | null; tagged: number; credits: number }>(ws, 'analyze-photos', { property_id: propertyId }),

  // Inquiries / viewings
  listSellers: (ws: string) => call<{ sellers: SellerLead[] }>(ws, 'list-sellers').then((r) => r.sellers),
  /** A CRM person's linked properties — those they're selling (vendor) + interested in. */
  contactProperties: (ws: string, crmContactId: string) =>
    call<{ selling: PropertyListItem[]; interested: (PropertyListItem & { interest_type: string })[] }>(ws, 'contact-properties', { crm_contact_id: crmContactId }),
  // Offers
  listOffers: (ws: string, propertyId: string) => call<{ offers: PropertyOffer[] }>(ws, 'list-offers', { property_id: propertyId }).then((r) => r.offers),
  createOffer: (ws: string, fields: { property_id: string; amount: number; currency?: string; buyer_contact_id?: string; buyer_name?: string; terms?: string; proof_of_funds?: boolean; mortgage_in_principle?: boolean; chain_free?: boolean; note?: string }) =>
    call<{ offer: PropertyOffer }>(ws, 'create-offer', fields).then((r) => r.offer),
  updateOffer: (ws: string, offerId: string, fields: { status?: string; amount?: number; terms?: string; note?: string }) =>
    call<{ offer: PropertyOffer }>(ws, 'update-offer', { offer_id: offerId, ...fields }).then((r) => r.offer),
  acceptOffer: (ws: string, offerId: string) => call<{ ok: true; cancelled_viewings: number }>(ws, 'accept-offer', { offer_id: offerId }),

  // Sale completion + commission
  completeSale: (ws: string, fields: { offer_id?: string; property_id?: string; sale_price: number; currency?: string; commission_pct?: number; commission_fixed?: number; vat_pct?: number; completed_at?: string; buyer_contact_id?: string; notes?: string }) =>
    call<{ sale: PropertySale }>(ws, 'complete-sale', fields).then((r) => r.sale),
  listSales: (ws: string, propertyId?: string) =>
    call<{ sales: PropertySale[] }>(ws, 'list-sales', propertyId ? { property_id: propertyId } : {}).then((r) => r.sales),
  linkSaleInvoice: (ws: string, saleId: string, invoiceId: string, invoiceStatus = 'issued') =>
    call<{ sale: PropertySale }>(ws, 'link-sale-invoice', { sale_id: saleId, invoice_id: invoiceId, invoice_status: invoiceStatus }).then((r) => r.sale),

  // Investments add-on
  getInvestment: (ws: string, propertyId: string) =>
    call<{ investment: PropertyInvestment | null; metrics: InvestmentMetrics | null }>(ws, 'get-investment', { property_id: propertyId }),
  upsertInvestment: (ws: string, propertyId: string, fields: Partial<InvestmentInputs>) =>
    call<{ investment: PropertyInvestment; metrics: InvestmentMetrics }>(ws, 'upsert-investment', { property_id: propertyId, ...fields }),
  listInvestments: (ws: string) =>
    call<{ investments: PropertyInvestment[]; portfolio: InvestmentPortfolio }>(ws, 'list-investments'),

  // CMA report
  cmaReport: (ws: string, params: { property_id?: string; property_type?: string; town?: string; area?: number }) =>
    call<CmaReport>(ws, 'cma-report', params),

  // Deal pipeline
  listDeals: (ws: string) => call<{ deals: PropertyDeal[] }>(ws, 'list-deals').then((r) => r.deals),
  upsertDeal: (ws: string, fields: { deal_id?: string; property_id?: string; buyer_contact_id?: string | null; stage?: DealStage; status?: string; value?: number | null; currency?: string; expected_close_date?: string | null; notes?: string; lost_reason?: string }) =>
    call<{ deal: PropertyDeal }>(ws, 'upsert-deal', fields).then((r) => r.deal),
  deleteDeal: (ws: string, dealId: string) => call<{ ok: true }>(ws, 'delete-deal', { deal_id: dealId }),
  listDealTasks: (ws: string, dealId: string) => call<{ tasks: DealTask[] }>(ws, 'list-deal-tasks', { deal_id: dealId }).then((r) => r.tasks),
  addDealTask: (ws: string, dealId: string, title: string, dueDate?: string) => call<{ task: DealTask }>(ws, 'add-deal-task', { deal_id: dealId, title, due_date: dueDate }).then((r) => r.task),
  toggleDealTask: (ws: string, taskId: string, done: boolean) => call<{ task: DealTask }>(ws, 'toggle-deal-task', { task_id: taskId, done }).then((r) => r.task),
  deleteDealTask: (ws: string, taskId: string) => call<{ ok: true }>(ws, 'delete-deal-task', { task_id: taskId }),
  listInquiries: (ws: string, filters: { status?: string; property_id?: string } = {}) =>
    call<{ inquiries: PropertyInquiry[] }>(ws, 'list-inquiries', filters).then((r) => r.inquiries),
  updateInquiry: (ws: string, inquiryId: string, status: string) =>
    call<{ inquiry: PropertyInquiry }>(ws, 'update-inquiry', { inquiry_id: inquiryId, status }).then((r) => r.inquiry),
  /** Manually record a lead (off-web contact). property_id is required; also creates the CRM contact. */
  createInquiry: (ws: string, fields: { property_id: string; name: string; email?: string; phone?: string; message?: string }) =>
    call<{ inquiry: PropertyInquiry; crm_contact_id: string }>(ws, 'create-inquiry', fields).then((r) => r.inquiry),
  /** Edit a lead's contact fields and/or status. */
  editInquiry: (ws: string, inquiryId: string, fields: { name?: string; email?: string; phone?: string; message?: string; status?: string }) =>
    call<{ inquiry: PropertyInquiry }>(ws, 'update-inquiry', { inquiry_id: inquiryId, ...fields }).then((r) => r.inquiry),
  deleteInquiry: (ws: string, inquiryId: string) => call<{ ok: true }>(ws, 'delete-inquiry', { inquiry_id: inquiryId }),
  deleteOffer: (ws: string, offerId: string) => call<{ ok: true }>(ws, 'delete-offer', { offer_id: offerId }),
  deleteViewing: (ws: string, viewingId: string) => call<{ ok: true }>(ws, 'delete-viewing', { viewing_id: viewingId }),
  deleteTenancy: (ws: string, tenancyId: string) => call<{ ok: true }>(ws, 'delete-tenancy', { tenancy_id: tenancyId }),
  deleteMaintenance: (ws: string, workOrderId: string) => call<{ ok: true }>(ws, 'delete-maintenance', { work_order_id: workOrderId }),
  deleteSale: (ws: string, saleId: string) => call<{ ok: true }>(ws, 'delete-sale', { sale_id: saleId }),
  deleteInvestment: (ws: string, propertyId: string) => call<{ ok: true }>(ws, 'delete-investment', { property_id: propertyId }),
  /** Unlink a person from Real Estate (removes their buyer/seller role); the CRM contact stays. */
  unlinkContact: (ws: string, crmContactId: string) => call<{ ok: true }>(ws, 'delete-contact-ext', { crm_contact_id: crmContactId }),
  /** Turn an anonymous inquiry into a CRM lead (contact) linked to the property + assigned to caller. */
  convertInquiry: (ws: string, inquiryId: string) =>
    call<{ crm_contact_id: string; already_linked?: boolean }>(ws, 'convert-inquiry', { inquiry_id: inquiryId }),

  // Buyer requirements (saved searches) + auto-match
  listBuyerRequirements: (ws: string, crmContactId?: string) =>
    call<{ requirements: BuyerRequirement[] }>(ws, 'list-buyer-requirements', { crm_contact_id: crmContactId }).then((r) => r.requirements),
  upsertBuyerRequirement: (ws: string, fields: { requirement_id?: string; crm_contact_id: string; label?: string; criteria?: Record<string, any>; is_active?: boolean }) =>
    call<{ requirement: BuyerRequirement }>(ws, 'upsert-buyer-requirement', fields).then((r) => r.requirement),
  deleteBuyerRequirement: (ws: string, requirementId: string) => call<{ ok: true }>(ws, 'delete-buyer-requirement', { requirement_id: requirementId }),
  matchBuyerRequirement: (ws: string, requirementId: string) =>
    call<{ requirement: BuyerRequirement; matches: PropertyListItem[] }>(ws, 'match-buyer-requirement', { requirement_id: requirementId }),
  buyersForProperty: (ws: string, propertyId: string) =>
    call<{ matches: (BuyerRequirement & { contact?: { id: string; name: string | null; email: string | null } | null })[] }>(ws, 'buyers-for-property', { property_id: propertyId }).then((r) => r.matches),
  getContactExt: (ws: string, crmContactId: string) =>
    call<{ ext: ContactExt | null }>(ws, 'get-contact-ext', { crm_contact_id: crmContactId }).then((r) => r.ext),
  upsertContactExt: (ws: string, crmContactId: string, fields: Partial<ContactExt>) =>
    call<{ ext: ContactExt }>(ws, 'upsert-contact-ext', { crm_contact_id: crmContactId, ...fields }).then((r) => r.ext),
  listViewings: (ws: string, filters: { property_id?: string } = {}) =>
    call<{ viewings: PropertyViewing[] }>(ws, 'list-viewings', filters).then((r) => r.viewings),
  createViewing: (ws: string, fields: { property_id: string; scheduled_at: string; type?: string; crm_contact_id?: string; agent_id?: string }) =>
    call<{ viewing: PropertyViewing }>(ws, 'create-viewing', fields).then((r) => r.viewing),
  updateViewing: (ws: string, viewingId: string, fields: { status?: string; scheduled_at?: string; feedback?: string }) =>
    call<{ viewing: PropertyViewing }>(ws, 'update-viewing', { viewing_id: viewingId, ...fields }).then((r) => r.viewing),

  // ── Lettings / property management ──
  listTenancies: (ws: string, propertyId?: string) =>
    call<{ tenancies: Tenancy[] }>(ws, 'list-tenancies', propertyId ? { property_id: propertyId } : {}).then((r) => r.tenancies),
  upsertTenancy: (ws: string, fields: { tenancy_id?: string; property_id: string; tenant_contact_id?: string | null; landlord_contact_id?: string | null; rent_amount: number; currency?: string; rent_frequency?: RentFrequency; deposit?: number | null; start_date: string; end_date?: string | null; status?: string; notes?: string }) =>
    call<{ tenancy: Tenancy }>(ws, 'upsert-tenancy', fields).then((r) => r.tenancy),
  listRentCharges: (ws: string, tenancyId: string) =>
    call<{ charges: RentCharge[] }>(ws, 'list-rent-charges', { tenancy_id: tenancyId }).then((r) => r.charges),
  generateRentSchedule: (ws: string, tenancyId: string, periods = 12, fromDate?: string) =>
    call<{ ok: true; created: number; skipped: number }>(ws, 'generate-rent-schedule', { tenancy_id: tenancyId, periods, from_date: fromDate }),
  markRentPaid: (ws: string, chargeId: string, fields: { paid_amount?: number; status?: 'paid' | 'waived'; note?: string } = {}) =>
    call<{ charge: RentCharge }>(ws, 'mark-rent-paid', { charge_id: chargeId, ...fields }).then((r) => r.charge),
  listMaintenance: (ws: string, filters: { property_id?: string; status?: string } = {}) =>
    call<{ work_orders: MaintenanceWorkOrder[] }>(ws, 'list-maintenance', filters).then((r) => r.work_orders),
  upsertMaintenance: (ws: string, fields: { work_order_id?: string; property_id?: string; tenancy_id?: string | null; title?: string; description?: string; status?: string; priority?: string; contractor_name?: string; cost?: number | null }) =>
    call<{ work_order: MaintenanceWorkOrder }>(ws, 'upsert-maintenance', fields).then((r) => r.work_order),
  landlordStatement: (ws: string, tenancyId: string) =>
    call<LandlordStatement>(ws, 'landlord-statement', { tenancy_id: tenancyId }),
  invoiceRentCharge: (ws: string, chargeId: string) =>
    call<{ invoice_id: string; already?: boolean }>(ws, 'invoice-rent-charge', { charge_id: chargeId }),
  renewTenancy: (ws: string, tenancyId: string, fields: { new_end_date?: string; new_rent?: number }) =>
    call<{ tenancy: Tenancy }>(ws, 'renew-tenancy', { tenancy_id: tenancyId, ...fields }).then((r) => r.tenancy),

  /** Upload a File to the signed URL returned by photoUploadUrl, then register the row. */
  async uploadPhoto(ws: string, propertyId: string, file: File, kind = 'photo'): Promise<PropertyPhoto> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const { path, token } = await this.photoUploadUrl(ws, propertyId, ext);
    const { error } = await supabase.storage.from('property-media').uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) throw error;
    return this.addPhoto(ws, propertyId, path, kind);
  },

  /** Listing performance. Omit `propertyId` for the whole (agent-scoped) book. */
  listingPerformance: (ws: string, propertyId?: string) =>
    call<{ performance: ListingPerformance[]; series: ListingViewPoint[] }>(ws, 'listing-performance', { property_id: propertyId }),

  // Documents — listing paperwork (private bucket; `url` is a 1h signed URL, never persisted).
  listDocuments: (ws: string, propertyId: string) =>
    call<{ documents: PropertyDocument[] }>(ws, 'list-documents', { property_id: propertyId }).then((r) => r.documents),
  deleteDocument: (ws: string, documentId: string) => call<{ ok: true }>(ws, 'delete-document', { document_id: documentId }),
  /** Same two-step as uploadPhoto: signed upload URL → PUT the file → register the row. */
  async uploadDocument(ws: string, propertyId: string, file: File, docType: string, title?: string): Promise<PropertyDocument> {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const { path, token } = await call<{ path: string; token: string; signed_url: string }>(ws, 'document-upload-url', { property_id: propertyId, ext });
    const { error } = await supabase.storage.from('property-media').uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) throw error;
    return call<{ document: PropertyDocument }>(ws, 'add-document', {
      property_id: propertyId, storage_path: path, doc_type: docType, title: title || file.name,
    }).then((r) => r.document);
  },

  // Open houses
  upsertOpenHouse: (ws: string, propertyId: string, fields: { open_house_id?: string; starts_at?: string; ends_at?: string | null; note?: string | null }) =>
    call<{ open_house: OpenHouse }>(ws, 'upsert-open-house', { property_id: propertyId, ...fields }).then((r) => r.open_house),
  deleteOpenHouse: (ws: string, openHouseId: string) => call<{ ok: true }>(ws, 'delete-open-house', { open_house_id: openHouseId }),
};

/** Detect the 422 publish-gate rejection so the UI can list the missing fields. */
export function isPublishBlocked(e: unknown): e is { code: 'publish_blocked'; errors: string[]; warnings: string[] } {
  return !!e && typeof e === 'object' && (e as any).code === 'publish_blocked';
}

// ── Public token page + cross-workspace discovery (no auth; toPublic-projected) ──
export interface PublicVrWorld { splat_url_100k: string | null; splat_url_500k: string | null; splat_url_full: string | null; panorama_url: string | null; caption: string | null }
export interface PublicListing { listing: Record<string, any>; photos: { id: string; kind: string; caption: string | null; is_cover: boolean; url: string | null }[]; vr_world?: PublicVrWorld | null }
export type PublicListingCard = Record<string, any> & { id: string; cover_url: string | null };
/** `query` triggers semantic (Voyage) ranking server-side; the facet fields still apply as filters. */
export interface DiscoverFilters { query?: string; property_type?: string; transaction_type?: string; town?: string; price_min?: number; price_max?: number; bedrooms_min?: number }

export const realEstatePublic = {
  async getListing(token: string): Promise<PublicListing> {
    const { data, error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'get', token } });
    if (error) throw await edgeError(error);
    return data as PublicListing;
  },
  async inquire(token: string, payload: { name: string; email: string; phone?: string; message?: string; gdpr_consent: boolean; marketing_consent?: boolean }): Promise<void> {
    const { error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'inquire', token, ...payload } });
    if (error) throw await edgeError(error);
  },
  /** Cross-workspace marketplace discovery — only active + public + in_discovery listings. */
  async discover(filters: DiscoverFilters = {}): Promise<PublicListingCard[]> {
    const { data, error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'discover', ...filters } });
    if (error) throw await edgeError(error);
    return (data as { listings: PublicListingCard[] }).listings;
  },
  /** A live public listings index for the agency profile Listings tab — by workspace_id OR the
   *  profile owner's user_id (resolves their owned workspaces server-side). */
  async agencyListings(by: { workspaceId?: string; userId?: string }): Promise<PublicListingCard[]> {
    const { data, error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'agency-listings', workspace_id: by.workspaceId, user_id: by.userId } });
    if (error) throw await edgeError(error);
    return (data as { listings: PublicListingCard[] }).listings;
  },
  /** Public seller lead-magnet: instant comps-based valuation + capture as a seller lead. */
  async requestValuation(by: { workspaceId?: string; userId?: string }, payload: { name: string; email: string; phone?: string; address?: string; property_type?: string; town?: string; area?: number; gdpr_consent: boolean; marketing_consent?: boolean }): Promise<ValuationResult> {
    const { data, error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'request-valuation', workspace_id: by.workspaceId, user_id: by.userId, ...payload } });
    if (error) throw await edgeError(error);
    return data as ValuationResult;
  },

  // Buyer portal — token-scoped, no auth
  async buyerPortal(token: string): Promise<{ requirement: { label: string | null; criteria: Record<string, any> }; agency: string | null; favorites: string[]; alerts_enabled: boolean; listings: PublicListingCard[] }> {
    const { data, error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'buyer-portal', token } });
    if (error) throw await edgeError(error);
    return data as any;
  },
  /** The buyer's own opt-in/withdrawal for match emails — sets the saved search's digest flag AND the
   *  contact's marketing_consent, which is what both alert paths gate on. */
  async buyerSetConsent(token: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'buyer-set-consent', token, enabled } });
    if (error) throw await edgeError(error);
  },
  async buyerFavorite(token: string, propertyId: string, on: boolean): Promise<void> {
    const { error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'buyer-favorite', token, property_id: propertyId, on } });
    if (error) throw await edgeError(error);
  },
  async buyerRequestViewing(token: string, propertyId: string, message?: string): Promise<void> {
    const { error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'buyer-request-viewing', token, property_id: propertyId, message } });
    if (error) throw await edgeError(error);
  },
};

/** Shared listing-card link target for the public page. */
export const listingHref = (l: PublicListingCard) => `/p/${l.public_listing_token ?? ''}`;
