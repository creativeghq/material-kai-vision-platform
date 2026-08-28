// GENERATED MIRROR of src/modules/real-estate/realEstateVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The real-estate value-sets, written ONCE (#391).
 *
 * `property_type` was declared in four files — `CmaReportDialog`, `PropertyWorkbench`,
 * `realEstateService` and `real-estate-import` — as an array, an array, a union and a
 * `Set` respectively. Four shapes of one fact, agreeing only by memory.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `properties_property_type_check` admits exactly these four, and this set is pinned to
 * the constraint text by `tests/unit/realEstateVocabulary.test.ts`.
 *
 * A NOTE ON `other`
 * -----------------
 * `PropertyWorkbench` branches on `cat === 'residential' || cat === 'other'` to decide
 * whether to show residential fields. That is a UI grouping, not a fifth value, and it
 * stays where it is: folding it in here would turn a display decision into something that
 * looks like part of the database's vocabulary.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — it is byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/** `properties_property_type_check`. */
export const PROPERTY_TYPES = ['residential', 'commercial', 'land', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === 'string' && (PROPERTY_TYPES as readonly string[]).includes(v);
}

/**
 * `property_kyc_checks_check_type_check`.
 *
 * The three checks an anti-money-laundering file needs on a property transaction. Kept in
 * this module's vocabulary rather than its own file: it was declared as an inline union
 * in `realEstateService` and as an array in `real-estate-api`, which is the same two-copy
 * shape as `property_type` above and belongs in the same place.
 */
export const KYC_CHECK_TYPES = ['identity', 'source_of_funds', 'pep_sanctions'] as const;
export type KycCheckType = (typeof KYC_CHECK_TYPES)[number];

export function isKycCheckType(v: unknown): v is KycCheckType {
  return typeof v === 'string' && (KYC_CHECK_TYPES as readonly string[]).includes(v);
}

/**
 * `property_inquiries_status_check` — a lead's progress.
 *
 * `spam` is a real member and not a deletion: an inquiry arriving through the public
 * listing form is unauthenticated, so marking it rather than removing it keeps the
 * evidence for whoever tunes the form.
 */
export const INQUIRY_STATUSES = [
  'new', 'contacted', 'qualified', 'viewing_booked', 'closed', 'spam',
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/**
 * `property_sale_commission_splits_party_type_check` — who a split can pay.
 *
 * `house` is the agency's own share and is the reason a split table exists at all rather
 * than a single `commission_pct` on the sale: the agency's cut and an agent's cut are rows
 * of the same shape, so a sale that pays only the house is one row, not a special case.
 */
export const COMMISSION_PARTY_TYPES = [
  'listing_agent', 'buyer_agent', 'house', 'referral', 'external',
] as const;
export type CommissionPartyType = (typeof COMMISSION_PARTY_TYPES)[number];

/**
 * `property_bookings_channel_check` — where a short-let stay came from.
 *
 * TWO CONSTRAINTS, NOT ONE — READ THIS BEFORE MERGING THEM
 * --------------------------------------------------------
 * `property_bookings.channel` admits five values; `property_channel_links.channel` admits
 * FOUR, because `direct` is not a channel you can sync an iCal feed from — there is no
 * feed for a booking somebody phoned in. That difference is deliberate and enforced on
 * both tables, so the two sets stay two names here. `SYNCABLE_CHANNELS` is derived from
 * this one by removing `direct` rather than typed out again: a sixth channel then joins
 * both automatically, which is the whole point of the exercise.
 *
 * The edge function had the four-value list written inline in its `upsert-channel-link`
 * validator, so the two facts were the same length of literal array sitting six hundred
 * lines apart with nothing saying they differed on purpose.
 */
export const BOOKING_CHANNELS = ['direct', 'airbnb', 'booking_com', 'vrbo', 'other'] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

/** `property_channel_links_channel_check` — the bookings set minus `direct`. Derived. */
export const SYNCABLE_CHANNELS = BOOKING_CHANNELS.filter((c) => c !== 'direct');
export type SyncableChannel = Exclude<BookingChannel, 'direct'>;

export function isInquiryStatus(v: unknown): v is InquiryStatus {
  return typeof v === 'string' && (INQUIRY_STATUSES as readonly string[]).includes(v);
}
export function isCommissionPartyType(v: unknown): v is CommissionPartyType {
  return typeof v === 'string' && (COMMISSION_PARTY_TYPES as readonly string[]).includes(v);
}
export function isBookingChannel(v: unknown): v is BookingChannel {
  return typeof v === 'string' && (BOOKING_CHANNELS as readonly string[]).includes(v);
}
export function isSyncableChannel(v: unknown): v is SyncableChannel {
  return typeof v === 'string' && (SYNCABLE_CHANNELS as readonly string[]).includes(v);
}
