/**
 * The business identity behind Profile → Business.
 *
 * **The derivation is in SQL and nothing here repeats it.** `my_business_identity()` answers who
 * you are as a business — the explicit `user_profiles.business_id` link if there is one, otherwise
 * the invoicing profile of a workspace you own or administer — and returns the two copies plus the
 * identity fields they disagree on, already compared.
 *
 * That split is the whole point. "Am I a business?" used to be recorded twice: once in
 * `finance_settings.business_*`, the identity printed on every invoice and transmitted to myDATA,
 * and once in `user_profiles.entity_type`, the copy `role-upgrade-requests` checks. Only the first
 * is load-bearing, so it is the one an operator fills in — and a workspace could therefore invoice
 * as a real ΕΕ, with a VAT number and a ΓΕΜΗ number, while its own admin was shown a badge reading
 * "Solo entity" and told to switch if they "operate as a registered company". Nothing was
 * detectably wrong: `'solo'` is a valid `entity_type` and the finance row was complete.
 *
 * A TypeScript twin of the projection would be that same second copy wearing a different hat, so
 * this file holds only the shapes, the labels and the parser. If you need to know what the
 * invoicing profile says, ask the database. Kept free of the Supabase client so it stays testable.
 */

/** The company fields Profile → Business edits, mirroring the `crm_companies` columns it writes. */
export interface BusinessForm {
  name: string;
  vat_number: string;
  tax_office: string;
  profession: string;
  phone: string;
  email: string;
  website: string;
  country: string;
  country_code: string;
  city: string;
  postal_code: string;
  street: string;
  street_number: string;
}

export const EMPTY_BUSINESS: BusinessForm = {
  name: '',
  vat_number: '',
  tax_office: '',
  profession: '',
  phone: '',
  email: '',
  website: '',
  country: '',
  country_code: '',
  city: '',
  postal_code: '',
  street: '',
  street_number: '',
};

/** A company identity as the RPC returns it — the editable fields plus the ΓΕΜΗ number. */
export interface CompanyIdentity extends BusinessForm {
  gemi_number: string;
}

/**
 * Where the answer came from. `profile` means somebody stated it deliberately; `workspace` means it
 * was derived from an invoicing profile and no row was written to say so.
 */
export type IdentitySource = 'profile' | 'workspace' | null;

export interface BusinessIdentity {
  entityType: 'solo' | 'business';
  source: IdentitySource;
  /** The `crm_companies` row id, when one exists. Null for a workspace-derived identity. */
  companyId: string | null;
  workspaceId: string | null;
  /** The effective identity — the linked company, or the invoicing profile standing in for it. */
  identity: CompanyIdentity | null;
  /** What the workspace's invoicing profile says, when this user runs a workspace that has one. */
  invoicing: CompanyIdentity | null;
  /** Identity fields on which the two copies disagree. Compared in SQL; formatted here. */
  drift: (keyof BusinessForm)[];
}

export const SOLO_IDENTITY: BusinessIdentity = {
  entityType: 'solo',
  source: null,
  companyId: null,
  workspaceId: null,
  identity: null,
  invoicing: null,
  drift: [],
};

/** Display names for the drift list, so a mismatch names the field the operator sees, not the column. */
export const FIELD_LABELS: Record<keyof BusinessForm, string> = {
  name: 'company name',
  vat_number: 'VAT number',
  tax_office: 'tax office',
  profession: 'profession',
  phone: 'phone',
  email: 'email',
  website: 'website',
  country: 'country',
  country_code: 'VAT country',
  city: 'city',
  postal_code: 'postal code',
  street: 'street',
  street_number: 'street number',
};

/** NULL → '' so the form and the read-only display can treat every field as a string. */
const toCompanyIdentity = (raw: unknown): CompanyIdentity | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : '');
  const form = { ...EMPTY_BUSINESS };
  for (const key of Object.keys(EMPTY_BUSINESS) as (keyof BusinessForm)[]) form[key] = text(key);
  return { ...form, gemi_number: text('gemi_number') };
};

/** The identity minus the fields this card does not edit — what the form and `crm_companies` take. */
export const toBusinessForm = ({ gemi_number: _gemi, ...form }: CompanyIdentity): BusinessForm => form;

/** Parses the `my_business_identity()` payload. An unreadable answer is solo, never a half-identity. */
export const parseBusinessIdentity = (raw: unknown): BusinessIdentity => {
  if (!raw || typeof raw !== 'object') return SOLO_IDENTITY;
  const row = raw as Record<string, unknown>;
  const identity = toCompanyIdentity(row.identity);
  if (row.entity_type !== 'business' || !identity) return SOLO_IDENTITY;
  const known = new Set(Object.keys(EMPTY_BUSINESS));
  return {
    entityType: 'business',
    source: row.source === 'profile' || row.source === 'workspace' ? row.source : null,
    companyId: typeof row.company_id === 'string' ? row.company_id : null,
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    identity,
    invoicing: toCompanyIdentity(row.invoicing),
    drift: Array.isArray(row.drift)
      ? (row.drift.filter((k): k is keyof BusinessForm => typeof k === 'string' && known.has(k)))
      : [],
  };
};

/**
 * The RPC that answers it. Named here, called from the card: the derivation is server-side and
 * takes no arguments — it keys on the verified JWT, so there is no id to get wrong.
 */
export const MY_BUSINESS_IDENTITY_RPC = 'my_business_identity';
