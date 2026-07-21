import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope, scopeAllows } from './_scope.ts';
import { pickContactFields, escapeLike, parseIdsParam } from './contacts-api-handler.ts';
import { emitFlowEvent } from '../../_shared/flow-events.ts';

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
  'factory_names', // supplier↔factory pin (ingested metadata.factory_name values)
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
  // ΓΕΜΗ (GEMI) enrichment (mirrors the mygemi-opendata write set)
  'gemi_number', 'gemi_legal_form', 'gemi_status', 'gemi_data', 'gemi_data_at',
  // Normalized queryable ΚΑΔ (merged ΑΑΔΕ+ΓΕΜΗ)
  'kad_codes', 'kad_all',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Guard a path/body id before it reaches Postgres so a malformed value returns a
 * clean 400 instead of a raw "invalid input syntax for type uuid" 22P02. */
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

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

/** companyInScope + the company's workspace_id, for the create-and-attach path: a contact
 * created from a company page belongs in THAT company's workspace, not whichever workspace
 * happens to be first in the caller's membership list. */
async function companyWorkspaceInScope(
  companyId: string,
  scope: import('./_scope.ts').CrmScope,
): Promise<string | null> {
  let q = supabase.from('crm_companies').select('workspace_id').eq('id', companyId);
  if (!scope.isGlobalOperator) {
    if (scope.workspaceIds.length === 0) return null;
    q = q.in('workspace_id', scope.workspaceIds);
  }
  const { data } = await q.maybeSingle<{ workspace_id: string }>();
  return data?.workspace_id ?? null;
}

// Pentest #250 H7: mirror of companyInScope for contacts. The company↔contact link
// insert verified the company but NOT the contact, so a caller could attach another
// tenant's contact_id to their own company and then read that contact's PII via the
// nested crm_contacts join on GET /companies/{id}.
async function contactInScope(
  contactId: string,
  scope: import('./_scope.ts').CrmScope,
): Promise<boolean> {
  if (scope.isGlobalOperator) {
    const { data } = await supabase.from('crm_contacts').select('id').eq('id', contactId).maybeSingle();
    return !!data;
  }
  if (scope.workspaceIds.length === 0) return false;
  const { data } = await supabase
    .from('crm_contacts')
    .select('id')
    .eq('id', contactId)
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
      allowedRoles: ['admin', 'super_admin', 'owner', 'supplier', 'architect', 'sales'],
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

      // Flows — new CRM company. Best-effort; never block the create.
      const created = data?.[0];
      if (created) {
        try {
          await emitFlowEvent('crm_company_created', {
            type: 'crm_company_created', workspace_id: targetWs, user_id: user.id,
            company_id: created.id, company_name: created.name, email: created.email ?? null,
            title: `New company: ${created.name}`,
            body: `${created.name} was added to your CRM.`,
            action_url: `/crm/companies/${created.id}`,
          });
        } catch { /* best-effort */ }
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
      // Server-side filters so the CRM list can be SERVER-paged instead of draining every
      // company into the browser to filter it there. NOTE: there is deliberately no
      // `status` param — crm_companies has no status column.
      const profession = url.searchParams.get('profession') || '';
      const kind = url.searchParams.get('kind') || ''; // client (=customer) | supplier | neither
      const ids = parseIdsParam(url);

      // Non-global callers with no membership see nothing.
      if (!scope.isGlobalOperator && scope.workspaceIds.length === 0) {
        return new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: corsHeaders });
      }

      // Present-but-empty `ids` = the caller's category/industry lookup matched nothing.
      // Short-circuit rather than fall through to an unfiltered query.
      if (ids !== null && ids.length === 0) {
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

      // Every filter below is ANDed ON TOP of the workspace clause above. None of them
      // may relax or replace it — a request param must never influence tenant scope.

      // Add search filter if provided — escape % and _ to prevent wildcard injection
      if (search) {
        const safeSearch = escapeLike(search);
        query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,website.ilike.%${safeSearch}%`);
      }
      if (ids) query = query.in('id', ids);
      if (profession) query = query.eq('profession', profession);
      // `neither` uses IS NOT TRUE so NULL (never set) counts as "not a customer/supplier",
      // matching the client-side `!c.is_customer && !c.is_supplier` this replaces.
      if (kind === 'client') query = query.eq('is_customer', true);
      else if (kind === 'supplier') query = query.eq('is_supplier', true);
      else if (kind === 'neither') {
        query = query.not('is_customer', 'is', true).not('is_supplier', 'is', true);
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

      // Flatten the contact attachments (crm_company_contacts) into the `contacts`
      // shape the company detail page reads — { relationship_id, contact_id,
      // contact_name, contact_email, contact_phone, role, is_primary, notes }.
      // Mirrors the inverse flatten in contacts-api-handler's GET /contacts/{id}.
      const attachments = (data as { crm_company_contacts?: Array<{
        id: string; contact_id: string; role: string | null; is_primary: boolean;
        notes: string | null; created_at: string;
        crm_contacts?: { id: string; name: string; email: string | null; phone: string | null } | null;
      }> }).crm_company_contacts ?? [];
      const contacts = attachments.map((a) => ({
        relationship_id: a.id,
        contact_id: a.contact_id,
        contact_name: a.crm_contacts?.name ?? null,
        contact_email: a.crm_contacts?.email ?? null,
        contact_phone: a.crm_contacts?.phone ?? null,
        role: a.role,
        is_primary: a.is_primary,
        notes: a.notes,
        created_at: a.created_at,
      }));
      delete (data as { crm_company_contacts?: unknown }).crm_company_contacts;
      (data as { contacts?: unknown }).contacts = contacts;

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

      // Capture the company name + its attached contacts BEFORE deleting — the
      // crm_company_contacts rows cascade away with the company, so we can't read
      // them afterwards. These feed the symmetric "Business deleted" activity that
      // closes the loop on each affected contact's timeline (mirrors the
      // company_attached / company_deleted pairing surfaced on the contact page).
      const { data: companyRow } = await supabase
        .from('crm_companies')
        .select('name, workspace_id')
        .eq('id', companyId)
        .maybeSingle();
      const { data: linkedContacts } = await supabase
        .from('crm_company_contacts')
        .select('contact_id')
        .eq('company_id', companyId);

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

      // Best-effort audit counter-event: never let a logging failure fail the delete.
      const contactIds = [...new Set((linkedContacts ?? []).map((r: { contact_id: string }) => r.contact_id).filter(Boolean))];
      if (contactIds.length > 0) {
        try {
          const companyName = (companyRow as { name?: string } | null)?.name ?? 'Company';
          const workspaceId = (companyRow as { workspace_id?: string } | null)?.workspace_id ?? null;
          await supabase.from('crm_activities').insert(
            contactIds.map((contactId) => ({
              target_kind: 'contact',
              target_id: contactId,
              activity_type: 'company_deleted',
              title: 'Business deleted',
              description: companyName,
              metadata: { company_id: companyId },
              actor_user_id: user.id,
              workspace_id: workspaceId,
            })),
          );
        } catch (e) {
          console.warn('[crm-companies-api] company_deleted activity log failed (non-fatal):', e);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders },
      );
    }

    // POST /api/companies/{id}/contacts - Attach a contact to a company.
    // Takes EITHER an existing `contact_id`, OR a `contact: {name, ...}` object to create
    // and attach in one request. The two-call client flow (create contact, then attach)
    // left an orphan contact — invisible on both pages — whenever the attach leg failed.
    if (method === 'POST' && path.length === 2 && path[1] === 'contacts') {
      const companyId = path[0];
      const body = await req.json();
      const { role, is_primary, notes } = body;
      const newContact = body.contact as Record<string, unknown> | undefined;
      let contact_id = body.contact_id as string | undefined;

      // Validate ids up front so a malformed value returns a clear 400 rather than a
      // raw Postgres "invalid input syntax for type uuid" surfaced as an opaque error.
      if (!isUuid(companyId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid company id' }),
          { status: 400, headers: corsHeaders },
        );
      }
      if (!contact_id && !newContact) {
        return new Response(
          JSON.stringify({ error: 'Either contact_id or contact is required' }),
          { status: 400, headers: corsHeaders },
        );
      }
      if (contact_id && !isUuid(contact_id)) {
        return new Response(
          JSON.stringify({ error: 'Invalid contact id' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const companyWs = await companyWorkspaceInScope(companyId, scope);
      if (!companyWs) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Create-and-attach: the contact lands in the company's workspace, and is rolled
      // back below if the join insert fails, so the two writes succeed or fail together.
      let createdContactId: string | null = null;
      if (!contact_id) {
        const name = typeof newContact?.name === 'string' ? newContact.name.trim() : '';
        if (!name) {
          return new Response(
            JSON.stringify({ error: 'contact.name is required' }),
            { status: 400, headers: corsHeaders },
          );
        }
        const { data: created, error: createErr } = await supabase
          .from('crm_contacts')
          .insert({
            ...pickContactFields(newContact ?? {}),
            name,
            workspace_id: companyWs,
            created_by: userId || 'system',
          })
          .select()
          .single();

        if (createErr || !created) {
          return new Response(
            JSON.stringify({ error: createErr?.message || 'Failed to create contact' }),
            { status: 400, headers: corsHeaders },
          );
        }
        contact_id = created.id;
        createdContactId = created.id;
      } else {
        // Pentest #250 H7: an existing contact must also be in the caller's scope, else
        // attaching a foreign contact_id leaks that tenant's contact PII via the join.
        if (!(await contactInScope(contact_id, scope))) {
          return new Response(
            JSON.stringify({ error: 'Contact not found' }),
            { status: 404, headers: corsHeaders },
          );
        }
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
        // Compensating delete — without it a failed attach strands the contact we just
        // created with no company link and no way to reach it from the company page.
        if (createdContactId) {
          const { error: rollbackErr } = await supabase
            .from('crm_contacts').delete().eq('id', createdContactId);
          if (rollbackErr) {
            console.error(
              '[crm-companies-api] attach failed AND contact rollback failed — orphan contact',
              createdContactId, rollbackErr,
            );
          }
        }
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Flows — parity with POST /contacts, which emits this for every new contact.
      // Only after the attach commits, so a rolled-back create never fires an event.
      if (createdContactId) {
        try {
          const name = typeof newContact?.name === 'string' ? newContact.name.trim() : '';
          await emitFlowEvent('crm_contact_created', {
            type: 'crm_contact_created', workspace_id: companyWs, user_id: userId || undefined,
            contact_id: createdContactId, contact_name: name,
            email: (newContact?.email as string | undefined) ?? null,
            lead_source: (newContact?.lead_source as string | undefined) ?? null,
            lead_status: (newContact?.lead_status as string | undefined) ?? null,
            title: `New contact: ${name}`,
            body: `${name} was added to your CRM.`,
            action_url: `/crm/contacts/${createdContactId}`,
          });
        } catch { /* best-effort */ }
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

