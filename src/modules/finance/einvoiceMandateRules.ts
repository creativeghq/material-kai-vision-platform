/**
 * The B2B e-invoicing mandate, both directions (#444).
 *
 * Outbound: from 1/10/2026 issuing a B2B invoice from our own ERP is legally NON-ISSUANCE
 * (Ε.2004/13.02.2026 §2) even though the transmission succeeds and returns a MARK. Inbound: since
 * 2/3/2026 we must ACCEPT a structured supplier e-invoice. Import-free so the predicates can be
 * tested without a client.
 */

export type MandateStatus =
  | 'compliant'
  | 'fallback_used'
  | 'fallback_unreconciled'
  | 'channel_unrecorded'
  | 'declaration_late'
  | 'declaration_missing';

export type InboundStatus =
  | 'accepting'
  | 'receipt_date_missing'
  | 'no_structured_document_yet'
  | 'nothing_received';

export type IssuanceChannel = 'provider' | 'timologio' | 'erp_fallback';

export interface MandatePosition {
  status: MandateStatus;
  mandate_from: string;
  grace_until: string;
  declaration_filed_on: string | null;
  declared_start_date: string | null;
  documents_since_mandate: number;
  via_provider: number;
  via_timologio: number;
  via_erp_fallback: number;
  channel_unrecorded: number;
  fallback_unreconciled: number;
  reason: string;
  legal_basis: string;
  note: string;
}

export interface InboundPosition {
  status: InboundStatus;
  due_from: string;
  documents: number;
  structured: number;
  pulled_from_mydata: number;
  booked: number;
  without_receipt_date: number;
  vida_clock_from: string;
  vida_clock_status: 'in_force' | 'not_yet_in_force';
  reason: string;
  legal_basis: string;
  note: string;
}

export const MANDATE_LABEL: Record<MandateStatus, string> = {
  compliant: 'Lawful channel on every document',
  fallback_used: 'ERP fallback used under a recorded outage',
  fallback_unreconciled: 'Fallback relying on an outage nobody closed',
  channel_unrecorded: 'Documents with no channel recorded',
  declaration_late: 'Declared start date is too late',
  declaration_missing: 'Δήλωση Έναρξης not filed',
};

export const INBOUND_LABEL: Record<InboundStatus, string> = {
  accepting: 'Accepting structured e-invoices',
  receipt_date_missing: 'Receipt dates missing',
  no_structured_document_yet: 'No structured document received yet',
  nothing_received: 'Nothing received since the duty fell due',
};

export const CHANNEL_LABEL: Record<IssuanceChannel, string> = {
  provider: 'Certified Πάροχος',
  timologio: 'AADE timologio',
  erp_fallback: 'ERP — Απώλεια Διασύνδεσης only',
};

/** The filing is the precondition. Nothing downstream makes issuance lawful without it. */
export const declarationIsFiled = (p: MandatePosition | null): boolean =>
  !!p && !!p.declaration_filed_on
  && !!p.declared_start_date && p.declared_start_date <= p.mandate_from;

export const mandateNeedsAttention = (p: MandatePosition | null): boolean =>
  !!p && p.status !== 'compliant';

/**
 * A fallback is an INCIDENT, not a retry. The unlawful path and the lawful one are
 * indistinguishable from the outside — the record is the only difference — so it is counted in the
 * open rather than swallowed.
 */
export const fallbackIsIncident = (p: MandatePosition | null): boolean =>
  !!p && (p.via_erp_fallback > 0 || p.fallback_unreconciled > 0);

export const inboundNeedsAttention = (p: InboundPosition | null): boolean =>
  !!p && (p.status === 'receipt_date_missing' || p.status === 'no_structured_document_yet');

/**
 * A myDATA pull mirrors what the ISSUER filed. It is not evidence that we can take a structured
 * document delivered to us, which is what the acceptance duty actually asks.
 */
export const pullIsNotAcceptance =
  'A myDATA pull mirrors what the issuer filed. The duty is to accept a structured document '
  + 'delivered to us, and a mirror does not evidence that.';

export const ERP_IS_NON_ISSUANCE =
  'Issuing a B2B invoice from our own ERP is treated as not issuing it at all (Ε.2004/2026 §2). '
  + 'The transmission still succeeds and still returns a MARK, which is exactly why the channel has '
  + 'to be recorded rather than inferred.';

export const DECLARATION_IS_AN_OPERATOR_ACTION =
  'The Δήλωση Έναρξης Ηλεκτρονικής Έκδοσης Στοιχείων (Α.1112/2025 άρθρο 6) is filed with AADE by a '
  + 'person, with a start date no later than 1/10/2026. No code can do it.';

/**
 * ViDA's cross-border leg is not grandfathered: EN 16931 becomes mandatory for the intra-Community
 * leg on 1 July 2030 and the recapitulative statements are abolished. That is a second
 * SERIALISATION of one invoice derivation, never a second invoice builder.
 */
export const VIDA_FROM = '2030-07-01';
export const ONE_DERIVATION_TWO_SERIALISATIONS =
  'The AADE synopsis today and an EN 16931 document from 2030 are two serialisations of one '
  + 'derivation. A second builder is how the printed and the transmitted document drifted before.';

/** Intra-EU B2B is out of the Greek mandate — ViDA governs it from 2030, not Α.1128 now. */
export const MANDATE_SCOPE =
  'Domestic B2B, wholesale to non-EU countries, and B2G. Intra-EU B2B is out of scope here.';

/** Verified in our own repo: the provider's spec and AADE's disagree on this field's spelling. */
export const NOVUS_FIELD_DIVERGENCE = 'invoiveDeliveryStatus';
export const AADE_FIELD_SPELLING = 'invoiceDeliveryStatus';
