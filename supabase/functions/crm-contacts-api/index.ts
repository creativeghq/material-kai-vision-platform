import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
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
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
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
        { status: 403, headers: corsHeaders }
      );
    }

    // POST /api/contacts - Create contact
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const { name, email, phone, company, notes } = body;

      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Name is required' }),
          { status: 400, headers: corsHeaders }
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
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: data?.[0] }),
        { status: 201, headers: corsHeaders }
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
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data, count: data?.length || 0 }),
        { status: 200, headers: corsHeaders }
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
          { status: 404, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders }
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
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: data?.[0] }),
        { status: 200, headers: corsHeaders }
      );
    }

    // DELETE /api/contacts/{id} - Delete contact
    if (method === 'DELETE' && path.length === 1) {
      const contactId = path[0];

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
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ message: 'Contact deleted successfully' }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});

