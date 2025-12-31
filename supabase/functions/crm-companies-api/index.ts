import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace('/crm-companies-api', '').split('/').filter(Boolean);
    const method = req.method;

    // POST /api/companies - Create company
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const {
        name,
        website,
        industry,
        employee_count,
        annual_revenue,
        email,
        phone,
        address,
        city,
        state,
        postal_code,
        country,
        linkedin,
        twitter,
        facebook,
        description,
        notes,
      } = body;

      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Company name is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_companies')
        .insert({
          name,
          website,
          industry,
          employee_count,
          annual_revenue,
          email,
          phone,
          address,
          city,
          state,
          postal_code,
          country,
          linkedin,
          twitter,
          facebook,
          description,
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

    // GET /api/companies - List companies with optional search
    if (method === 'GET' && path.length === 0) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const search = url.searchParams.get('search');

      let query = supabase
        .from('crm_companies')
        .select('*', { count: 'exact' })
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      // Add search filter if provided
      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,website.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data, count: count || 0 }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/companies/{id} - Get company with contacts
    if (method === 'GET' && path.length === 1) {
      const companyId = path[0];

      const { data, error } = await supabase
        .from('crm_companies')
        .select(`
          *,
          crm_company_contacts(
            id,
            contact_id,
            role,
            is_primary,
            notes,
            created_at,
            crm_contacts(
              id,
              name,
              email,
              phone,
              company
            )
          )
        `)
        .eq('id', companyId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/companies/{id} - Update company
    if (method === 'PATCH' && path.length === 1) {
      const companyId = path[0];
      const updates = await req.json();

      const { data, error } = await supabase
        .from('crm_companies')
        .update(updates)
        .eq('id', companyId)
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

    // DELETE /api/companies/{id} - Delete company
    if (method === 'DELETE' && path.length === 1) {
      const companyId = path[0];

      const { error } = await supabase
        .from('crm_companies')
        .delete()
        .eq('id', companyId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders },
      );
    }

    // POST /api/companies/{id}/contacts - Attach contact to company
    if (method === 'POST' && path.length === 2 && path[1] === 'contacts') {
      const companyId = path[0];
      const body = await req.json();
      const { contact_id, role, is_primary, notes } = body;

      if (!contact_id) {
        return new Response(
          JSON.stringify({ error: 'contact_id is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_company_contacts')
        .insert({
          company_id: companyId,
          contact_id,
          role,
          is_primary: is_primary || false,
          notes,
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

    // DELETE /api/companies/{companyId}/contacts/{relationshipId} - Detach contact
    if (method === 'DELETE' && path.length === 3 && path[1] === 'contacts') {
      const relationshipId = path[2];

      const { error } = await supabase
        .from('crm_company_contacts')
        .delete()
        .eq('id', relationshipId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders },
    );
  }
});

