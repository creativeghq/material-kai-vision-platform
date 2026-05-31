import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * CRM Contacts API
 * Handles CRM contact management: create, list, update, delete
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access, no role check
 * - User JWT (Authorization header): Requires admin/manager/factory role
 */
export async function handleContacts(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    // Use replace + filter for robust path parsing (same as crm-companies-api)
    const path = url.pathname.replace(/^(\/functions\/v1)?(\/crm-api)?\/contacts/, '').split('/').filter(Boolean);

    // Authenticate request
    const auth = await authenticate(req, {
      allowedRoles: ['admin', 'factory'],
    });

    // authenticate() already grants success for secret-key (level='secret') access and
    // enforces the role gate for user tokens, so a failed auth is simply rejected here.
    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: corsHeaders },
      );
    }

    const user = auth.user;
    const userId = auth.userId;

    // POST /api/contacts - Create contact
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const { name, email, phone, company, notes } = body;

      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Name is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_contacts')
        .insert({
          name,
          email,
          phone,
          company,
          notes,
          created_by: userId || 'system',
        })
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: data?.[0] }),
        { status: 201, headers: corsHeaders },
      );
    }

    // GET /api/contacts - List contacts
    if (method === 'GET' && path.length === 0) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let listQuery = supabase
        .from('crm_contacts')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });
      const { data, error } = await listQuery;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data, count: data?.length || 0 }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/contacts/{id} - Get contact
    if (method === 'GET' && path.length === 1) {
      const contactId = path[0];

      const { data, error } = await supabase
        .from('crm_contacts')
        .select(`
          *,
          crm_contact_relationships(
            id,
            user_id,
            relationship_type,
            created_at
          )
        `)
        .eq('id', contactId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/contacts/{id} - Update contact
    if (method === 'PATCH' && path.length === 1) {
      const contactId = path[0];
      const body = await req.json();

      const {
        name, email, phone, mobile, company, position, title,
        linkedin, twitter, facebook, address, city, state, postal_code, country,
        status, lead_source, contact_type, vat_number, country_code, tax_office,
        first_name, last_name, profession, is_client, is_supplier,
        discount_pct, discount_notes,
      } = body;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (mobile !== undefined) updates.mobile = mobile;
      if (company !== undefined) updates.company = company;
      if (position !== undefined) updates.position = position;
      if (title !== undefined) updates.title = title;
      if (linkedin !== undefined) updates.linkedin = linkedin;
      if (twitter !== undefined) updates.twitter = twitter;
      if (facebook !== undefined) updates.facebook = facebook;
      if (address !== undefined) updates.address = address;
      if (city !== undefined) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (postal_code !== undefined) updates.postal_code = postal_code;
      if (country !== undefined) updates.country = country;
      if (status !== undefined) updates.status = status;
      if (lead_source !== undefined) updates.lead_source = lead_source;
      if (contact_type !== undefined) updates.contact_type = contact_type;
      if (vat_number !== undefined) updates.vat_number = vat_number;
      if (country_code !== undefined) updates.country_code = country_code;
      if (tax_office !== undefined) updates.tax_office = tax_office;
      if (first_name !== undefined) updates.first_name = first_name;
      if (last_name !== undefined) updates.last_name = last_name;
      if (profession !== undefined) updates.profession = profession;
      if (is_client !== undefined) updates.is_client = is_client;
      if (is_supplier !== undefined) updates.is_supplier = is_supplier;
      if (discount_pct !== undefined) updates.discount_pct = discount_pct;
      if (discount_notes !== undefined) updates.discount_notes = discount_notes;

      const { data, error } = await supabase
        .from('crm_contacts')
        .update(updates)
        .eq('id', contactId)
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: data?.[0] }),
        { status: 200, headers: corsHeaders },
      );
    }

    // DELETE /api/contacts/{id} - Delete contact
    if (method === 'DELETE' && path.length === 1 && !path[0].includes('unlink-user')) {
      const contactId = path[0];

      // First check if contact exists
      const { data: existingContact, error: checkError } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('id', contactId)
        .single();

      if (checkError || !existingContact) {
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Delete relationships first
      await supabase
        .from('crm_contact_relationships')
        .delete()
        .eq('contact_id', contactId);

      // Delete contact
      const { error } = await supabase
        .from('crm_contacts')
        .delete()
        .eq('id', contactId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ message: 'Contact deleted successfully' }),
        { status: 200, headers: corsHeaders },
      );
    }

    // POST /api/contacts/{id}/link-user - Link user to contact
    if (method === 'POST' && path.length === 2 && path[1] === 'link-user') {
      const contactId = path[0];
      const body = await req.json();
      const { userId } = body;

      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'userId is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Check if user is already linked to another contact
      const { data: existingLink } = await supabase
        .from('crm_contacts')
        .select('id, name')
        .eq('user_id', userId)
        .single();

      if (existingLink) {
        return new Response(
          JSON.stringify({
            error: `User is already linked to contact: ${existingLink.name}`,
            existingContact: existingLink
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Link user to contact
      const { data, error } = await supabase
        .from('crm_contacts')
        .update({
          user_id: userId,
          linked_at: new Date().toISOString(),
          linked_by: userId || 'system',
        })
        .eq('id', contactId)
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          data: data?.[0],
          message: 'User linked to contact successfully'
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // DELETE /api/contacts/{id}/unlink-user - Unlink user from contact
    if (method === 'DELETE' && path.length === 2 && path[1] === 'unlink-user') {
      const contactId = path[0];

      const { data, error } = await supabase
        .from('crm_contacts')
        .update({
          user_id: null,
          linked_at: null,
          linked_by: userId || 'system', // Track who unlinked
        })
        .eq('id', contactId)
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          data: data?.[0],
          message: 'User unlinked from contact successfully'
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/contacts/potential-matches - Get potential email matches
    if (method === 'GET' && path.length === 1 && path[0] === 'potential-matches') {
      // Find contacts with emails that match user emails
      const { data: contacts } = await supabase
        .from('crm_contacts')
        .select('id, name, email')
        .not('email', 'is', null)
        .is('user_id', null);

      if (!contacts || contacts.length === 0) {
        return new Response(
          JSON.stringify({ data: [], count: 0 }),
          { status: 200, headers: corsHeaders },
        );
      }

      // Get all users with matching emails
      const emails = contacts.map(c => c.email?.toLowerCase()).filter(Boolean);
      const { data: users } = await supabase.auth.admin.listUsers();

      const matches = [];
      for (const contact of contacts) {
        if (!contact.email) continue;

        const matchingUser = users.users.find(
          u => u.email?.toLowerCase() === contact.email?.toLowerCase()
        );

        if (matchingUser) {
          // Get user profile
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('full_name, subscription_tier')
            .eq('user_id', matchingUser.id)
            .single();

          matches.push({
            contact,
            user: {
              id: matchingUser.id,
              email: matchingUser.email,
              profile,
            },
          });
        }
      }

      return new Response(
        JSON.stringify({ data: matches, count: matches.length }),
        { status: 200, headers: corsHeaders },
      );
    }

    // POST /api/contacts/bulk-link - Bulk link contacts to users
    if (method === 'POST' && path.length === 1 && path[0] === 'bulk-link') {
      const body = await req.json();
      const { links } = body;

      if (!Array.isArray(links) || links.length === 0) {
        return new Response(
          JSON.stringify({ error: 'links array is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const results = [];
      const errors = [];

      for (const link of links) {
        const { contactId, userId } = link;

        try {
          // Check if user is already linked
          const { data: existingLink } = await supabase
            .from('crm_contacts')
            .select('id')
            .eq('user_id', userId)
            .single();

          if (existingLink && existingLink.id !== contactId) {
            errors.push({
              contactId,
              userId,
              error: 'User already linked to another contact',
            });
            continue;
          }

          // Link user to contact
          const { data, error } = await supabase
            .from('crm_contacts')
            .update({
              user_id: userId,
              linked_at: new Date().toISOString(),
              linked_by: userId || 'system',
            })
            .eq('id', contactId)
            .select();

          if (error) {
            errors.push({ contactId, userId, error: error.message });
          } else {
            results.push(data?.[0]);
          }
        } catch (err) {
          errors.push({
            contactId,
            userId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return new Response(
        JSON.stringify({
          data: results,
          errors,
          successCount: results.length,
          errorCount: errors.length,
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/contacts/by-user/{userId} - Get contact by user ID
    if (method === 'GET' && path.length === 2 && path[0] === 'by-user') {
      const userId = path[1];

      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Contact not found for this user' }),
          { status: 404, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders },
    );
  }
}

