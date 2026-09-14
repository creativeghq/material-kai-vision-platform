/**
 * GPSR, EAA and EUDR verdicts, with no I/O (#449, #450).
 *
 * IMPORT-FREE on purpose, for the same reason as [[complianceRules]]: the derivations live in SQL,
 * the services that fetch them pull in the Supabase client, and the unit tier is hermetic. What is
 * here is what a verdict MEANS — which is the half worth guarding.
 */

// ── GPSR art. 19 offer disclosure (#450) ─────────────────────────────────────

export type OfferDisclosureStatus = 'complete' | 'incomplete' | 'not_found';
export type ResponsiblePersonSource = 'us' | 'named' | 'manufacturer_is_eu';

export interface OfferDisclosure {
  status: OfferDisclosureStatus;
  product_id?: string;
  language?: string;
  manufacturer?: { name: string | null; postal_address: string | null; email: string | null };
  responsible_person?: {
    source: ResponsiblePersonSource;
    name?: string | null;
    postal_address?: string | null;
    email?: string | null;
  };
  product_identifier?: string | null;
  product_type?: string | null;
  warnings?: string[];
  accessibility_information?: string | null;
  safety_contact_email?: string | null;
  origin?: string | null;
  origin_is_eu?: boolean | null;
  is_own_brand?: boolean;
  missing?: string[];
  legal_basis?: string;
  reason: string;
}

export interface BannedPhrase {
  phrase: string;
  language_code: string;
  note: string | null;
}

export interface RecallDraft {
  product_description?: string | null;
  hazard_description?: string | null;
  consumer_action?: string | null;
  remedies?: string | null;
  contact_channel?: string | null;
  share_encouragement?: string | null;
}

/**
 * The headline art. 36(2)(a) fixes. It is not the operator's to phrase, which is why it is a
 * constant here and a CHECK at the write.
 */
export const RECALL_HEADLINE = 'Product safety recall';

/** The six elements a notice cannot be published without; the headline is the seventh. */
export const RECALL_REQUIRED_FIELDS: { key: keyof RecallDraft; label: string }[] = [
  { key: 'product_description', label: 'Product description (b)' },
  { key: 'hazard_description', label: 'Hazard description (c)' },
  { key: 'consumer_action', label: 'What consumers should do (d)' },
  { key: 'remedies', label: 'Remedies (e)' },
  { key: 'contact_channel', label: 'Contact channel (f)' },
  { key: 'share_encouragement', label: 'Encouragement to share (g)' },
];

export function missingRecallElements(r: RecallDraft): string[] {
  return RECALL_REQUIRED_FIELDS
    .filter((f) => !String(r[f.key] ?? '').trim())
    .map((f) => f.label);
}

/**
 * Which banned phrases a draft contains, against the fetched table.
 *
 * Case-insensitive substring, the same test the database makes — so the editor and the write
 * cannot disagree about whether a notice is publishable. English phrases are checked whatever the
 * notice language, because the Regulation names them in English and the notice is written in Greek.
 */
export function bannedPhrasesIn(
  text: string,
  phrases: BannedPhrase[],
  language = 'el',
): BannedPhrase[] {
  const hay = (text ?? '').toLowerCase();
  return phrases.filter(
    (p) =>
      (p.language_code === language || p.language_code === 'en') &&
      hay.includes(p.phrase.toLowerCase()),
  );
}

/** Whether the offer should be stopped from being published. */
export function offerBlocksPublish(d: OfferDisclosure | null): boolean {
  return d?.status === 'incomplete';
}

// ── EAA (#450) ───────────────────────────────────────────────────────────────

export type AccessibilityStatus =
  | 'assessed'
  | 'burden_claimed'
  | 'expired'
  | 'never_assessed'
  | 'no_workspace';

export interface AccessibilityPosition {
  status: AccessibilityStatus;
  assessed_on?: string;
  next_review_due?: string;
  has_statement?: boolean;
  burden_claimed?: boolean;
  funding_received?: boolean;
  legal_basis?: string;
  reason: string;
}

/**
 * Whether the accessibility position needs someone to act.
 *
 * `expired` and `never_assessed` both do, and they are different facts — an expired claim was made
 * and ran out, which is not the same as one nobody ever made.
 */
export function accessibilityNeedsAttention(p: AccessibilityPosition | null): boolean {
  return p?.status === 'never_assessed' || p?.status === 'expired';
}

/**
 * Art 14(6): funding received to improve accessibility voids the disproportionate-burden defence
 * outright. An ΕΣΠΑ or RRF digitalisation grant is exactly that.
 */
export function burdenClaimIsVoid(
  input: { funding_received: boolean; disproportionate_burden_claimed: boolean },
): boolean {
  return input.funding_received && input.disproportionate_burden_claimed;
}

// ── EUDR (#449) ──────────────────────────────────────────────────────────────

export type EudrRole = 'operator' | 'downstream_operator' | 'trader' | 'out_of_scope';

export interface EudrRoleVerdict {
  role: EudrRole | null;
  status: 'derived' | 'unknown_origin' | 'in_scope' | 'out_of_scope' | 'unlisted' | 'undeclared';
  origin?: string | null;
  cn_in?: string | null;
  cn_out?: string | null;
  /** True where the heading was already in the EUTR Annex, which is what kills the size deferral. */
  no_size_deferral?: boolean;
  legal_basis?: string;
  reason: string;
}

export interface EudrOrderLine {
  order_item_id: string;
  description: string | null;
  cn: string | null;
  origin: string | null;
  role: EudrRole | null;
  status: EudrRoleVerdict['status'];
  reason: string;
  has_statement: boolean;
  species_common: string | null;
  species_scientific: string | null;
}

/** 30 December 2026 for every size of operator, because our headings were in the EUTR Annex. */
export const EUDR_APPLIES_FROM = '2026-12-30';

/**
 * The obligations each role actually carries, in force after the 2025 simplification.
 *
 * The difference between the first and the third is the whole ticket: an operator submits a
 * statement and hands over plot coordinates; a trader collects paper. Reg. (EU) 2025/2650 removed
 * the downstream due-diligence duty but NOT the duty to collect and keep.
 */
export const EUDR_OBLIGATIONS: Record<Exclude<EudrRole, 'out_of_scope'>, string[]> = {
  operator: [
    'Exercise due diligence under art. 8 before placing the product on the market',
    'Submit a due diligence statement under art. 4(2) — before, not after',
    'Hold the geolocation of every plot, with its production date range (art. 9(1)(d))',
    'Record the common AND the scientific species name (art. 9(1)(a))',
    'Keep it all for five years',
  ],
  downstream_operator: [
    'No due diligence and no statement of our own since Reg. (EU) 2025/2650',
    'Collect and keep the art. 5(3) information, and produce it on request',
    'Keep the upstream DDS reference numbers for five years',
  ],
  trader: [
    'Register in the art. 33 information system',
    'Collect supplier and B2B customer identity, and the upstream DDS reference numbers',
    'Keep them five years and produce them on request',
    'Stop selling if a substantiated concern arises',
  ],
};

/**
 * Whether a line needs someone before 30 December 2026.
 *
 * An operator line with no statement does, and so does a line whose origin is missing — the role
 * cannot be derived without it, and the two candidate roles differ by a statement and a set of
 * plot coordinates.
 */
export function eudrLineNeedsAttention(l: EudrOrderLine): boolean {
  if (l.status === 'unknown_origin') return true;
  if (l.role === 'operator' && !l.has_statement) return true;
  return false;
}

/**
 * Whose identity art. 5(3)(b) makes us collect.
 *
 * B2B customers, and not consumers. Stating the asymmetry is the point: collecting a consumer's
 * details "to be safe" is over-collection, which is its own breach.
 */
export function eudrCollectsCustomerIdentity(customer: { isBusiness: boolean }): boolean {
  return customer.isBusiness;
}
