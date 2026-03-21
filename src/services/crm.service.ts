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

    const response = await fetch(`${getApiBase()}/crm-users-api?${params}`, {
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

    const response = await fetch(`${getApiBase()}/crm-users-api/${userId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-users-api/${userId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-users-api/${userId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-users-api`, {
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
      `${getApiBase()}/crm-stripe-api/subscriptions/create-checkout`,
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
      `${getApiBase()}/crm-stripe-api/credits/purchase`,
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

    const response = await fetch(`${getApiBase()}/crm-stripe-api/subscriptions`, {
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

    const response = await fetch(`${getApiBase()}/crm-stripe-api/credits`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api?${params}`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/${contactId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/${contactId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/${contactId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/${contactId}/link-user`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/${contactId}/unlink-user`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/potential-matches`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/bulk-link`, {
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

    const response = await fetch(`${getApiBase()}/crm-contacts-api/by-user/${userId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api?${params}`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api/${companyId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api/${companyId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api/${companyId}`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api/${companyId}/contacts`, {
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

    const response = await fetch(`${getApiBase()}/crm-companies-api/${companyId}/contacts/${relationshipId}`, {
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
