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

  async listContacts(limit = 50, offset = 0) {
    const token = await getAuthToken();

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

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

  async listCompanies(limit = 50, offset = 0, search?: string) {
    const token = await getAuthToken();

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      ...(search && { search }),
    });

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
  /** List the sub-units of a company OR contact (pass exactly one id). */
  async list(parent: { companyId?: string; contactId?: string }): Promise<AddressUnit[]> {
    const token = await getAuthToken();
    const params = new URLSearchParams();
    if (parent.companyId) params.set('company_id', parent.companyId);
    if (parent.contactId) params.set('contact_id', parent.contactId);

    const response = await fetch(`${getApiBase()}/crm-api/address-units?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to fetch address units');
    }
    return (await response.json()).data ?? [];
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
