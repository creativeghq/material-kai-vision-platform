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

export type NewContactKindId = 'customer_private' | 'customer_business' | 'supplier' | 'other';

export interface NewContactKind {
  id: NewContactKindId;
  label: string;
  hint: string;
  prefill: NewContactPrefill;
}

/** Asked BEFORE the form because the column DEFAULTS to 'private': a contact nobody classified
 *  is a consumer to every fiscal path, and a consumer can only be issued a retail receipt. */
export const NEW_CONTACT_KINDS: NewContactKind[] = [
  {
    id: 'customer_private',
    label: 'Customer · private person',
    hint: 'Buys for themselves — retail receipt, no VAT number.',
    prefill: { is_client: true, is_supplier: false, contact_type: 'private' },
  },
  {
    id: 'customer_business',
    label: 'Customer · business',
    hint: 'A sole trader or business we invoice against their ΑΦΜ / VAT number.',
    prefill: { is_client: true, is_supplier: false, contact_type: 'company' },
  },
  {
    id: 'supplier',
    label: 'Supplier',
    hint: 'Someone we buy from — no pricing or invoicing profile.',
    prefill: { is_client: false, is_supplier: true, contact_type: null },
  },
  {
    id: 'other',
    label: 'Other contact',
    hint: 'A lead, partner or colleague — not trading with us yet.',
    prefill: { is_client: false, is_supplier: false, contact_type: null },
  },
];
