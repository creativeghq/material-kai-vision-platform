import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Columns a client may write on create/update. Single source of truth so POST and PATCH
 * stay in sync (a prior bug let PATCH persist VAT/tax fields that POST silently dropped, so a
 * company created with a VAT number lost it). Includes the ΑΑΔΕ-enrichment columns the
 * CompanyDetailPage adopts from a lookup so a brand-new Greek business persists its details
 * on first Save without a second round trip.
 */
const COMPANY_WRITABLE_COLUMNS = [
  'name', 'website', 'industry', 'employee_count', 'annual_revenue',
  'email', 'phone', 'address', 'city', 'state', 'postal_code', 'country', 'notes',
  'linkedin', 'twitter', 'facebook', 'description',
  'is_supplier', 'is_customer', 'discount_percent', 'discount_notes', 'credit_limit',
  // Tax / VAT identity
  'vat_number', 'country_code', 'tax_office', 'profession', 'street', 'street_number',
  // VIES / ΑΑΔΕ verification (mirrors the myaade-rgwspublic2 / vies-validate write set)
  'vat_validated', 'vat_validated_at', 'vat_validated_name', 'vat_validated_address', 'vat_validation_source',
  // ΑΑΔΕ structured enrichment
  'commercial_title', 'legal_status', 'kad_primary', 'kad_primary_description', 'kad_secondary',
  'business_start_date', 'aade_data', 'aade_data_at',
] as const;

function pickCompanyFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of COMPANY_WRITABLE_COLUMNS) {
    if (body[col] !== undefined) out[col] = body[col];
  }
  return out;
}

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

      if (!body.name) {
        return new Response(
          JSON.stringify({ error: 'Company name is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_companies')
        .insert({
          ...pickCompanyFields(body),
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

      const updates: Record<string, unknown> = {
        ...pickCompanyFields(body),
        updated_at: new Date().toISOString(),
      };

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

