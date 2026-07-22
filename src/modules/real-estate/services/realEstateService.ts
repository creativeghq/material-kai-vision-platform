import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// #249 — client for the `real-estate-api` (authed) + `real-estate-public` (token page) edge functions.
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

export interface FeedSettings { workspace_id: string; feed_token: string; feed_enabled: boolean; feed_format: string }

/** Public syndication feed URL a portal can pull. */
export function feedUrl(token: string, format: string): string {
  const base = (supabase as any).supabaseUrl || '';
  return `${base}/functions/v1/real-estate-feed?token=${encodeURIComponent(token)}&format=${encodeURIComponent(format)}`;
}

export interface RealEstateDashboard {
  totals: { listings: number; public: number; active: number; draft: number; under_offer: number };
  new_leads: number;
  recent_leads: (PropertyInquiry & { property?: { title: string | null } | null })[];
  upcoming_viewings: (PropertyViewing & { property?: { title: string | null } | null })[];
}

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
    call<{ property: Property; photos: PropertyPhoto[]; inquiries: PropertyInquiry[]; viewings: PropertyViewing[]; price_history: any[]; open_houses: any[]; documents: any[] }>(ws, 'get-property', { property_id: propertyId }),
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
  listInquiries: (ws: string, filters: { status?: string; property_id?: string } = {}) =>
    call<{ inquiries: PropertyInquiry[] }>(ws, 'list-inquiries', filters).then((r) => r.inquiries),
  updateInquiry: (ws: string, inquiryId: string, status: string) =>
    call<{ inquiry: PropertyInquiry }>(ws, 'update-inquiry', { inquiry_id: inquiryId, status }).then((r) => r.inquiry),
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

  /** Upload a File to the signed URL returned by photoUploadUrl, then register the row. */
  async uploadPhoto(ws: string, propertyId: string, file: File, kind = 'photo'): Promise<PropertyPhoto> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const { path, token } = await this.photoUploadUrl(ws, propertyId, ext);
    const { error } = await supabase.storage.from('property-media').uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) throw error;
    return this.addPhoto(ws, propertyId, path, kind);
  },
};

/** Detect the 422 publish-gate rejection so the UI can list the missing fields. */
export function isPublishBlocked(e: unknown): e is { code: 'publish_blocked'; errors: string[]; warnings: string[] } {
  return !!e && typeof e === 'object' && (e as any).code === 'publish_blocked';
}

// ── Public token page + cross-workspace discovery (no auth; toPublic-projected) ──
export interface PublicListing { listing: Record<string, any>; photos: { id: string; kind: string; caption: string | null; is_cover: boolean; url: string | null }[] }
export type PublicListingCard = Record<string, any> & { id: string; cover_url: string | null };
export interface DiscoverFilters { property_type?: string; transaction_type?: string; town?: string; price_min?: number; price_max?: number; bedrooms_min?: number }

export const realEstatePublic = {
  async getListing(token: string): Promise<PublicListing> {
    const { data, error } = await supabase.functions.invoke('real-estate-public', { body: { action: 'get', token } });
    if (error) throw await edgeError(error);
    return data as PublicListing;
  },
  async inquire(token: string, payload: { name: string; email: string; phone?: string; message?: string; gdpr_consent: boolean }): Promise<void> {
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
};

/** Shared listing-card link target for the public page. */
export const listingHref = (l: PublicListingCard) => `/p/${l.public_listing_token ?? ''}`;
