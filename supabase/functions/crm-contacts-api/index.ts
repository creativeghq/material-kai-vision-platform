import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * CRM Contacts API
 * Handles CRM contact management: create, list, update, delete
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/crm-contacts-api

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    // Check if user has CRM access (Manager, Factory, Admin)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role_id')
      .eq('user_id', user.id)
      .single();

    const { data: allowedRoles } = await supabase
      .from('roles')
      .select('id')
      .in('name', ['admin', 'manager', 'factory']);

    const allowedRoleIds = allowedRoles?.map(r => r.id) || [];

    if (!userProfile || !allowedRoleIds.includes(userProfile.role_id)) {
      return new Response(
        JSON.stringify({ error: 'CRM access required' }),
        { status: 403, headers: corsHeaders },
      );
    }

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
          created_by: user.id,
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

      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

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

      const { data, error } = await supabase
        .from('crm_contacts')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
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
        JSON.stringify({ data: data?.[0] }),
        { status: 200, headers: corsHeaders },
      );
    }

    // DELETE /api/contacts/{id} - Delete contact
    if (method === 'DELETE' && path.length === 1 && !path[0].includes('unlink-user')) {
      const contactId = path[0];
      console.log('[crm-contacts-api] DELETE request for contact:', contactId);

      // First check if contact exists
      const { data: existingContact, error: checkError } = await supabase
        .from('crm_contacts')
        .select('id, name')
        .eq('id', contactId)
        .single();

      console.log('[crm-contacts-api] Existing contact check:', { existingContact, checkError });

      if (checkError || !existingContact) {
        console.log('[crm-contacts-api] Contact not found:', contactId);
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Delete relationships first
      const { error: relError, count: relCount } = await supabase
        .from('crm_contact_relationships')
        .delete()
        .eq('contact_id', contactId);

      console.log('[crm-contacts-api] Deleted relationships:', { relError, relCount });

      // Delete contact and return deleted row to verify
      const { data: deletedContact, error } = await supabase
        .from('crm_contacts')
        .delete()
        .eq('id', contactId)
        .select()
        .single();

      console.log('[crm-contacts-api] Delete result:', { deletedContact, error });

      if (error) {
        console.error('[crm-contacts-api] Delete error:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      console.log('[crm-contacts-api] Contact deleted successfully:', contactId);
      return new Response(
        JSON.stringify({
          message: 'Contact deleted successfully',
          deletedContact: deletedContact,
        }),
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
          linked_by: user.id,
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
          linked_by: user.id, // Track who unlinked
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
              linked_by: user.id,
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
});

