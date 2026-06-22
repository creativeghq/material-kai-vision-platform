import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope, scopeAllows } from './_scope.ts';

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
  'user_level_key', // #227 — pricing level
  'prices_vat_inclusive', // #227 — show this customer gross (VAT-incl) prices

  // #207 — commercial depth: segmentation, ΜΥΦ inclusion, on-invoice VAT-exemption
  // reason, and a separate billing identity (consumed by partyFromCrm at issue).
  'contact_group', 'include_in_myf', 'vat_exemption_reason',
  'billing_name', 'billing_vat', 'billing_tax_office', 'billing_street',
  'billing_street_number', 'billing_postal_code', 'billing_city', 'billing_country_code',
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

/** Verify a company id is reachable by the caller's workspace scope. */
async function companyInScope(
  companyId: string,
  scope: import('./_scope.ts').CrmScope,
): Promise<boolean> {
  if (scope.isGlobalOperator) {
    const { data } = await supabase.from('crm_companies').select('id').eq('id', companyId).maybeSingle();
    return !!data;
  }
  if (scope.workspaceIds.length === 0) return false;
  const { data } = await supabase
    .from('crm_companies')
    .select('id')
    .eq('id', companyId)
    .in('workspace_id', scope.workspaceIds)
    .maybeSingle();
  return !!data;
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
      // Business-ops gate: a workspace OWNER (the primary business persona, often global
      // role 'user') and platform super_admin must be allowed — matches finance/messaging/
      // email/agent handlers. The earlier ['admin','factory'] locked owners out of their
      // own CRM (list AND write). Tenant isolation is still enforced by getCrmScope below.
      allowedRoles: ['admin', 'super_admin', 'owner', 'factory'],
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

    // Workspace scoping: the handler runs under the service role (RLS bypassed), so we
    // must constrain every read/write to the caller's member workspaces (mirrors the
    // is_workspace_member RLS on crm_companies). Global operators act across all tenants.
    const scope = await getCrmScope(supabase, auth);

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

      // Resolve the target workspace: an explicit body workspace_id must be in scope
      // (any workspace for a global operator); otherwise default to the caller's primary
      // (first active) membership. workspace_id is NOT NULL, so a global operator that
      // omits it still needs a concrete home workspace — without this, global admins/
      // super_admins (workspaceIds derived from their own memberships) could not create.
      const requestedWs = (body.workspace_id as string | undefined) || undefined;
      if (requestedWs && !scopeAllows(scope, requestedWs)) {
        return new Response(
          JSON.stringify({ error: 'Not authorized for the requested workspace' }),
          { status: 403, headers: corsHeaders },
        );
      }
      const targetWs = (requestedWs && scopeAllows(scope, requestedWs))
        ? requestedWs
        : scope.workspaceIds[0];
      if (!targetWs) {
        return new Response(
          JSON.stringify({ error: 'No workspace available to create this company in. Pass workspace_id.' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_companies')
        .insert({
          ...pickCompanyFields(body),
          workspace_id: targetWs,
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

      // Non-global callers with no membership see nothing.
      if (!scope.isGlobalOperator && scope.workspaceIds.length === 0) {
        return new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: corsHeaders });
      }

      let query = supabase
        .from('crm_companies')
        .select('*', { count: 'exact' })
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (!scope.isGlobalOperator) {
        query = query.in('workspace_id', scope.workspaceIds);
      }

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

      if (error || !data || !scopeAllows(scope, (data as { workspace_id?: string }).workspace_id)) {
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

      if (!(await companyInScope(companyId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      const updates: Record<string, unknown> = {
        ...pickCompanyFields(body),
        updated_at: new Date().toISOString(),
      };
      // workspace_id is never reassignable through the writable-columns set; drop any
      // attempt so a row can't be moved to another tenant via PATCH.
      delete (updates as Record<string, unknown>).workspace_id;

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

      if (!(await companyInScope(companyId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

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

      if (!(await companyInScope(companyId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

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
      const companyId = path[0];
      const relationshipId = path[2];

      if (!(await companyInScope(companyId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      const { error } = await supabase
        .from('crm_company_contacts')
        .delete()
        .eq('id', relationshipId)
        .eq('company_id', companyId);

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

