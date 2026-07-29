import { supabase } from '@/integrations/supabase/client';

// Get Supabase URL — lazy to avoid crash at module load time
const getApiBase = (): string => {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not defined');
  return url.replace(/\/$/, '') + '/functions/v1';
};

/** Returns the active session access token, or throws if unauthenticated. */
async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.access_token;
}

/**
 * CRM Service
 * Handles all CRM-related API calls
 */

// ============ Users Management ============

export const usersAPI = {
  async listUsers(limit = 50, offset = 0, search?: string) {
    const token = await getAuthToken();

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      ...(search && { search }),
    });

    const response = await fetch(`${getApiBase()}/crm-api/users?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch users');
    }

    return response.json();
  },

  async getUser(userId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch user');
    }

    return response.json();
  },

  async updateUser(userId: string, updates: any) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update user');
    }

    return response.json();
  },

  async deleteUser(userId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete user');
    }

    return response.json();
  },

  async inviteUser(email: string, fullName?: string, contactId?: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, full_name: fullName, contact_id: contactId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to invite user');
    }

    return response.json();
  },
};

// ============ Subscriptions & Credits ============

export const stripeAPI = {
  async createCheckoutSession(planId: string) {
    const token = await getAuthToken();

    const response = await fetch(
      `${getApiBase()}/crm-api/stripe/subscriptions/create-checkout`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: planId }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return response.json();
  },

  async purchaseCredits(packageId: string) {
    const token = await getAuthToken();

    const response = await fetch(
      `${getApiBase()}/crm-api/stripe/credits/purchase`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ package_id: packageId }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to purchase credits');
    }

    return response.json();
  },

  async getSubscription() {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/stripe/subscriptions`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch subscription');
    }

    return response.json();
  },

  async getCredits() {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/stripe/credits`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch credits');
    }

    return response.json();
  },
};

// ============ CRM Contacts ============

/**
 * Server-side list filters shared by contacts + companies.
 *
 * These exist so the CRM list pages can be SERVER-paged: filtering in the browser
 * forced the page to drain every row first.
 */
export interface CrmListFilters {
  /** Free text: name/email (+ website for companies), ILIKE. */
  search?: string;
  profession?: string;
  /** Contacts only — crm_companies has no status column. */
  status?: string;
  /** contacts: is_client/is_supplier · companies: is_customer/is_supplier. */
  kind?: 'client' | 'supplier' | 'neither';
  /**
   * Contacts only — attached-company filter, by NAME. Resolved server-side because a contact can
   * carry its company via the junction OR the legacy free-text `company` column; matching both
   * needs one query, which the client can't express.
   */
  companyName?: string;
  /**
   * Id allowlist for membership filters the client already resolved (category /
   * industry / attached company).
   *
   * `undefined` = no filter. An EMPTY ARRAY means "the membership lookup matched
   * nothing" and is sent as an explicit empty `ids=` param so the server returns an
   * empty page — dropping it would show everything exactly when the user filtered to none.
   */
  ids?: string[];
}

/** Append the shared filters onto a list request's query string. */
function appendCrmFilters(params: URLSearchParams, filters?: CrmListFilters) {
  if (!filters) return;
  if (filters.search) params.set('search', filters.search);
  if (filters.profession) params.set('profession', filters.profession);
  if (filters.status) params.set('status', filters.status);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.companyName) params.set('company_name', filters.companyName);
  // Set even when empty — see the `ids` note above.
  if (filters.ids !== undefined) params.set('ids', filters.ids.join(','));
}

export const contactsAPI = {
  async createContact(contact: any) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contact),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create contact');
    }

    return response.json();
  },

  /** `filters` is optional so the existing positional (limit, offset) call sites keep working. */
  async listContacts(limit = 50, offset = 0, filters?: CrmListFilters) {
    const token = await getAuthToken();

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    appendCrmFilters(params, filters);

    const response = await fetch(`${getApiBase()}/crm-api/contacts?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch contacts');
    }

    return response.json();
  },

  async getContact(contactId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/${contactId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch contact');
    }

    return response.json();
  },

  async updateContact(contactId: string, updates: any) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update contact');
    }

    return response.json();
  },

  async deleteContact(contactId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/${contactId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete contact');
    }

    return response.json();
  },

  // ============ User-Contact Linking ============

  async linkUserToContact(contactId: string, userId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/${contactId}/link-user`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to link user to contact');
    }

    return response.json();
  },

  async unlinkUserFromContact(contactId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/${contactId}/unlink-user`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unlink user from contact');
    }

    return response.json();
  },

  async getPotentialMatches() {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/potential-matches`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch potential matches');
    }

    return response.json();
  },

  async bulkLinkContacts(links: Array<{ contactId: string; userId: string }>) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/bulk-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ links }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to bulk link contacts');
    }

    return response.json();
  },

  async getContactByUserId(userId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/contacts/by-user/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch contact by user ID');
    }

    return response.json();
  },
};

// Companies API
export const companiesAPI = {
  async createCompany(company: any) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(company),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create company');
    }

    return response.json();
  },

  /** `search` stays positional for the existing call sites; `filters` adds the rest
   *  (and `filters.search` wins when both are supplied). */
  async listCompanies(limit = 50, offset = 0, search?: string, filters?: CrmListFilters) {
    const token = await getAuthToken();

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      ...(search && { search }),
    });
    appendCrmFilters(params, filters);

    const response = await fetch(`${getApiBase()}/crm-api/companies?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch companies');
    }

    return response.json();
  },

  async getCompany(companyId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies/${companyId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch company');
    }

    return response.json();
  },

  async updateCompany(companyId: string, updates: any) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies/${companyId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update company');
    }

    return response.json();
  },

  async deleteCompany(companyId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies/${companyId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete company');
    }

    return response.json();
  },

  async attachContact(companyId: string, contactId: string, role?: string, isPrimary?: boolean, notes?: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies/${companyId}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact_id: contactId,
        role,
        is_primary: isPrimary,
        notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to attach contact');
    }

    return response.json();
  },

  /**
   * Create a contact and attach it to the company in ONE request. The server rolls the
   * contact back if the attach fails, so this never strands an orphan contact the way
   * a client-side createContact() + attachContact() pair did. The new contact is created
   * in the company's workspace.
   */
  async createAndAttachContact(
    companyId: string,
    contact: { name: string; email?: string; phone?: string; position?: string },
    role?: string,
    isPrimary?: boolean,
    notes?: string,
  ) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies/${companyId}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact,
        role,
        is_primary: isPrimary,
        notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create and attach contact');
    }

    return response.json();
  },

  async detachContact(companyId: string, relationshipId: string) {
    const token = await getAuthToken();

    const response = await fetch(`${getApiBase()}/crm-api/companies/${companyId}/contacts/${relationshipId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to detach contact');
    }

    return response.json();
  },
};

// ---------------------------------------------------------------------------
// Address sub-units (secondary / branch / ΑΑΔΕ establishment addresses)
// ---------------------------------------------------------------------------

/** A named secondary address attached to a CRM company or contact. */
export interface AddressUnit {
  id: string;
  workspace_id: string;
  company_id: string | null;
  contact_id: string | null;
  label: string;
  branch_number: number | null;
  address: string | null;
  street: string | null;
  street_number: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  country_code: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type AddressUnitInput = Partial<
  Pick<
    AddressUnit,
    | 'label' | 'branch_number' | 'address' | 'street' | 'street_number'
    | 'city' | 'state' | 'postal_code' | 'country' | 'country_code' | 'is_default'
  >
>;

/** Build a one-line human-readable summary of an address (unit or main). */
export function formatAddressLine(a: {
  street?: string | null; street_number?: string | null; address?: string | null;
  postal_code?: string | null; city?: string | null; country?: string | null;
}): string {
  const streetPart = [a.street || a.address, a.street_number].filter(Boolean).join(' ');
  return [streetPart, a.postal_code, a.city, a.country].filter(Boolean).join(', ');
}

export const addressUnitsAPI = {
  /**
   * List the sub-units of a company OR contact (pass exactly one id).
   * Read goes through the supabase client (table RLS = is_workspace_member), NOT the
   * crm-api edge function: that function gates address-units to admin/factory, which is
   * correct for writes but too strict for this read — the sub-unit picker is mounted in
   * the project/quote client flows used by non-admin workspace members, where the strict
   * gate produced a benign-but-noisy "Access denied" and hid the picker. RLS keeps it
   * tenant-safe; writes (create/update/remove) stay on the admin-gated edge function.
   */
  async list(parent: { companyId?: string; contactId?: string }): Promise<AddressUnit[]> {
    let query = (supabase as any).from('crm_address_units').select('*');
    if (parent.companyId) query = query.eq('company_id', parent.companyId);
    else if (parent.contactId) query = query.eq('contact_id', parent.contactId);
    else return [];

    const { data, error } = await query
      .order('is_default', { ascending: false })
      .order('branch_number', { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message || 'Failed to fetch address units');
    return (data ?? []) as AddressUnit[];
  },

  async create(
    parent: { companyId?: string; contactId?: string },
    unit: AddressUnitInput,
  ): Promise<AddressUnit> {
    const token = await getAuthToken();
    const response = await fetch(`${getApiBase()}/crm-api/address-units`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...unit,
        company_id: parent.companyId,
        contact_id: parent.contactId,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to create address unit');
    }
    return (await response.json()).data;
  },

  async update(id: string, unit: AddressUnitInput): Promise<AddressUnit> {
    const token = await getAuthToken();
    const response = await fetch(`${getApiBase()}/crm-api/address-units/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(unit),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update address unit');
    }
    return (await response.json()).data;
  },

  async remove(id: string): Promise<void> {
    const token = await getAuthToken();
    const response = await fetch(`${getApiBase()}/crm-api/address-units/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to delete address unit');
    }
  },
};

// -------- CRM bank accounts (a counterparty's OWN bank details) --------

export interface CrmBankAccount {
  id: string;
  workspace_id: string;
  company_id: string | null;
  contact_id: string | null;
  bank_name: string;
  account_holder: string | null;
  iban: string | null;
  account_ref: string | null;
  currency: string;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmBankAccountInput = Partial<
  Pick<CrmBankAccount, 'bank_name' | 'account_holder' | 'iban' | 'account_ref' | 'currency' | 'is_primary' | 'notes'>
>;

/**
 * Bank accounts belonging to a CRM company OR contact — the counterparty's own banks (e.g. a
 * supplier IBAN you pay to). Distinct from `finance_bank_accounts` (your workspace treasury).
 * Reads + writes go through the supabase client; table RLS = is_workspace_member(workspace_id).
 * Trust fields (workspace_id / company_id / contact_id) are set here from the verified parent,
 * never spread from a caller body (mass-assignment invariant #8).
 */
export const crmBankAccountsAPI = {
  async list(parent: { companyId?: string; contactId?: string }): Promise<CrmBankAccount[]> {
    let query = (supabase as any).from('crm_bank_accounts').select('*');
    if (parent.companyId) query = query.eq('company_id', parent.companyId);
    else if (parent.contactId) query = query.eq('contact_id', parent.contactId);
    else return [];
    const { data, error } = await query
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to fetch bank accounts');
    return (data ?? []) as CrmBankAccount[];
  },

  async create(
    parent: { workspaceId: string; companyId?: string; contactId?: string },
    input: CrmBankAccountInput,
  ): Promise<CrmBankAccount> {
    const payload = {
      workspace_id: parent.workspaceId,
      company_id: parent.companyId ?? null,
      contact_id: parent.companyId ? null : (parent.contactId ?? null),
      bank_name: (input.bank_name ?? '').trim(),
      account_holder: input.account_holder?.trim() || null,
      iban: input.iban?.trim() || null,
      account_ref: input.account_ref?.trim() || null,
      currency: input.currency || 'EUR',
      is_primary: input.is_primary ?? false,
      notes: input.notes?.trim() || null,
    };
    if (!payload.bank_name) throw new Error('Bank name is required');
    const { data, error } = await (supabase as any).from('crm_bank_accounts').insert(payload).select('*').single();
    if (error) throw new Error(error.message || 'Failed to add bank account');
    return data as CrmBankAccount;
  },

  async update(id: string, input: CrmBankAccountInput): Promise<CrmBankAccount> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.bank_name !== undefined) patch.bank_name = (input.bank_name ?? '').trim();
    if (input.account_holder !== undefined) patch.account_holder = input.account_holder?.trim() || null;
    if (input.iban !== undefined) patch.iban = input.iban?.trim() || null;
    if (input.account_ref !== undefined) patch.account_ref = input.account_ref?.trim() || null;
    if (input.currency !== undefined) patch.currency = input.currency || 'EUR';
    if (input.is_primary !== undefined) patch.is_primary = input.is_primary;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    const { data, error } = await (supabase as any).from('crm_bank_accounts').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message || 'Failed to update bank account');
    return data as CrmBankAccount;
  },

  async remove(id: string): Promise<void> {
    const { error } = await (supabase as any).from('crm_bank_accounts').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Failed to delete bank account');
  },
};

// -------- CRM phone numbers (additional named numbers for a party) --------

export type CrmPhoneType = 'mobile' | 'landline' | 'work' | 'home' | 'fax' | 'whatsapp' | 'other';

export const CRM_PHONE_TYPES: { value: CrmPhoneType; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'landline', label: 'Landline' },
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'fax', label: 'Fax' },
  { value: 'other', label: 'Other' },
];

export interface CrmPhone {
  id: string;
  workspace_id: string;
  company_id: string | null;
  contact_id: string | null;
  label: string;
  phone: string;
  /** Generated in the DB (digits + '+' only) — read-only, used for inbound-channel matching. */
  phone_normalized: string;
  phone_type: CrmPhoneType;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CrmPhoneInput = Partial<
  Pick<CrmPhone, 'label' | 'phone' | 'phone_type' | 'is_primary' | 'notes'>
>;

/**
 * Additional named phone numbers belonging to a CRM company OR contact (Reception, Warehouse,
 * Accounts, After-hours…). The party's MAIN number stays inline on `crm_companies.phone` /
 * `crm_contacts.phone|mobile` — that is what invoices, PDFs and the fiscal party builder read.
 * Reads + writes go through the supabase client; table RLS = is_workspace_member(workspace_id).
 * Trust fields (workspace_id / company_id / contact_id) are set here from the verified parent,
 * never spread from a caller body (mass-assignment invariant #8).
 */
export const crmPhonesAPI = {
  async list(parent: { companyId?: string; contactId?: string }): Promise<CrmPhone[]> {
    let query = (supabase as any).from('crm_phones').select('*');
    if (parent.companyId) query = query.eq('company_id', parent.companyId);
    else if (parent.contactId) query = query.eq('contact_id', parent.contactId);
    else return [];
    const { data, error } = await query
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to fetch phone numbers');
    return (data ?? []) as CrmPhone[];
  },

  async create(
    parent: { workspaceId: string; companyId?: string; contactId?: string },
    input: CrmPhoneInput,
  ): Promise<CrmPhone> {
    const payload = {
      workspace_id: parent.workspaceId,
      company_id: parent.companyId ?? null,
      contact_id: parent.companyId ? null : (parent.contactId ?? null),
      label: (input.label ?? '').trim(),
      phone: (input.phone ?? '').trim(),
      phone_type: input.phone_type || 'other',
      is_primary: input.is_primary ?? false,
      notes: input.notes?.trim() || null,
    };
    if (!payload.label) throw new Error('Name is required');
    if (!payload.phone) throw new Error('Phone number is required');
    const { data, error } = await (supabase as any).from('crm_phones').insert(payload).select('*').single();
    if (error) throw new Error(error.message || 'Failed to add phone number');
    return data as CrmPhone;
  },

  async update(id: string, input: CrmPhoneInput): Promise<CrmPhone> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.label !== undefined) patch.label = (input.label ?? '').trim();
    if (input.phone !== undefined) patch.phone = (input.phone ?? '').trim();
    if (input.phone_type !== undefined) patch.phone_type = input.phone_type || 'other';
    if (input.is_primary !== undefined) patch.is_primary = input.is_primary;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    const { data, error } = await (supabase as any).from('crm_phones').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message || 'Failed to update phone number');
    return data as CrmPhone;
  },

  async remove(id: string): Promise<void> {
    const { error } = await (supabase as any).from('crm_phones').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Failed to delete phone number');
  },
};
