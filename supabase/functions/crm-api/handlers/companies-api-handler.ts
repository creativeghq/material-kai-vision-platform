import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * CRM Companies API
 * Handles company management: create, list, update, delete
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): Requires admin/manager/factory role
 */
export async function handleCompanies(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const url = new URL(req.url);
    const path = url.pathname.replace(/^(\/functions\/v1)?(\/crm-api)?\/companies/, '').split('/').filter(Boolean);
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

      // Add search filter if provided — escape % and _ to prevent wildcard injection
      if (search) {
        const safeSearch = search.replace(/[%_\\]/g, '\\$&');
        query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,website.ilike.%${safeSearch}%`);
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
      const body = await req.json();

      const {
        name, website, industry, employee_count, annual_revenue,
        email, phone, address, city, state, postal_code, country,
        linkedin, twitter, facebook, description,
        is_supplier, is_customer, commercial_title, legal_status,
        tax_office, profession, street, street_number, vat_number, country_code,
      } = body;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (website !== undefined) updates.website = website;
      if (industry !== undefined) updates.industry = industry;
      if (employee_count !== undefined) updates.employee_count = employee_count;
      if (annual_revenue !== undefined) updates.annual_revenue = annual_revenue;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (address !== undefined) updates.address = address;
      if (city !== undefined) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (postal_code !== undefined) updates.postal_code = postal_code;
      if (country !== undefined) updates.country = country;
      if (linkedin !== undefined) updates.linkedin = linkedin;
      if (twitter !== undefined) updates.twitter = twitter;
      if (facebook !== undefined) updates.facebook = facebook;
      if (description !== undefined) updates.description = description;
      if (is_supplier !== undefined) updates.is_supplier = is_supplier;
      if (is_customer !== undefined) updates.is_customer = is_customer;
      if (commercial_title !== undefined) updates.commercial_title = commercial_title;
      if (legal_status !== undefined) updates.legal_status = legal_status;
      if (tax_office !== undefined) updates.tax_office = tax_office;
      if (profession !== undefined) updates.profession = profession;
      if (street !== undefined) updates.street = street;
      if (street_number !== undefined) updates.street_number = street_number;
      if (vat_number !== undefined) updates.vat_number = vat_number;
      if (country_code !== undefined) updates.country_code = country_code;

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
}

