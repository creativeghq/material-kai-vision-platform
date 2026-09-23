/** What the CRM OFFERS. The column is free text — real-estate writes 'buyer'/'seller' into it. */
export const CONTACT_TYPE_OPTIONS = [
  { value: 'private', label: 'Private (B2C)' },
  { value: 'company', label: 'Company (B2B)' },
] as const;

export type ContactTypeValue = (typeof CONTACT_TYPE_OPTIONS)[number]['value'];

export interface NewContactPrefill {
  is_client?: boolean;
  is_supplier?: boolean;
  contact_type?: ContactTypeValue | null;
}

export type NewPartyKindId = 'customer_private' | 'customer_business' | 'supplier' | 'other';

export interface NewPartyKind {
  id: NewPartyKindId;
  entity: 'contact' | 'company';
  group: 'person' | 'business';
  label: string;
  hint: string;
  companyRoles?: { is_customer?: boolean; is_supplier?: boolean };
  contactPrefill: NewContactPrefill;
}

/** Asked BEFORE the form because the column DEFAULTS to 'private': a contact nobody classified
 *  is a consumer to every fiscal path, and a consumer can only be issued a retail receipt. */
export const NEW_PARTY_KINDS: NewPartyKind[] = [
  {
    id: 'customer_private',
    entity: 'contact',
    group: 'person',
    label: 'Customer · Private Person',
    hint: 'Buys for themselves — retail receipt, no VAT number.',
    contactPrefill: { is_client: true, is_supplier: false, contact_type: 'private' },
  },
  {
    id: 'other',
    entity: 'contact',
    group: 'person',
    label: 'Other Contact',
    hint: 'A lead, partner or colleague — not trading with us yet.',
    contactPrefill: { is_client: false, is_supplier: false, contact_type: null },
  },
  {
    id: 'customer_business',
    entity: 'company',
    group: 'business',
    label: 'Customer · Business',
    hint: 'A business we invoice against their ΑΦΜ / VAT number.',
    companyRoles: { is_customer: true, is_supplier: false },
    contactPrefill: { is_client: true, is_supplier: false, contact_type: 'company' },
  },
  {
    id: 'supplier',
    entity: 'company',
    group: 'business',
    label: 'Supplier',
    hint: 'A business we buy from — no pricing or invoicing profile.',
    companyRoles: { is_supplier: true, is_customer: false },
    contactPrefill: { is_client: false, is_supplier: true, contact_type: 'company' },
  },
];

export const PARTY_GROUP_LABEL: Record<NewPartyKind['group'], string> = {
  person: 'A person',
  business: 'A business',
};
