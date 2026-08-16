import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope, scopeAllows, rowInScope, isUuid, type CrmScope } from './_scope.ts';
import { pickContactFields, escapeLike, parseIdsParam } from './contacts-api-handler.ts';
import { emitFlowEvent } from '../../_shared/flow-events.ts';
import { foldForSearch } from '../../_shared/searchFold.ts';

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
  'user_level_key', // Pricing level
  'prices_vat_inclusive', // Show this customer gross (VAT-incl) prices

  // Commercial depth: segmentation, ΜΥΦ inclusion, on-invoice VAT-exemption
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

function pickCompanyFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of COMPANY_WRITABLE_COLUMNS) {
    if (body[col] !== undefined) out[col] = body[col];
  }
  return out;
}

/** Verify a company id is reachable by the caller's workspace scope. */
const companyInScope = (companyId: string, scope: CrmScope) => rowInScope(supabase, 'crm_companies', companyId, scope);

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

// Mirror of companyInScope for contacts. The company↔contact link
// insert verified the company but NOT the contact, so a caller could attach another
// tenant's contact_id to their own company and then read that contact's PII via the
// nested crm_contacts join on GET /companies/{id}.
const contactInScope = (contactId: string, scope: CrmScope) => rowInScope(supabase, 'crm_contacts', contactId, scope);

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

      // Resolve the target workspace: an explicit body workspace_id must be in scope (any
      // workspace for a global operator). workspace_id is NOT NULL, so a caller that omits it
      // still needs a concrete home workspace.
      //
      // It used to fall back to `scope.workspaceIds[0]` — third instance of that shape after
      // CM-22 (#359) and EX-3 (#364), and closed here for the same reason (#366 BU-10). It was
      // never a tenancy hole: `scopeAllows` 403s a workspace the caller cannot reach. It is
      // wrong-tenant-BY-DEFAULT — a caller omitting the field filed the company in whichever
      // workspace happened to sort first, and nothing anywhere raised. Defaulting is only
      // unambiguous when there is exactly one workspace to default to; with a choice to make,
      // the caller has to make it.
      const requestedWs = (body.workspace_id as string | undefined) || undefined;
      if (requestedWs && !scopeAllows(scope, requestedWs)) {
        return new Response(
          JSON.stringify({ error: 'Not authorized for the requested workspace' }),
          { status: 403, headers: corsHeaders },
        );
      }
      const targetWs = requestedWs ?? (scope.workspaceIds.length === 1 ? scope.workspaceIds[0] : undefined);
      if (!targetWs) {
        return new Response(
          JSON.stringify({
            error: scope.workspaceIds.length > 1
              ? 'workspace_id is required: you belong to more than one workspace and a company must be filed in a named one.'
              : 'No workspace available to create this company in. Pass workspace_id.',
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Commercial role: stated, or customer. `crm_companies.is_customer` used to DEFAULT TO
      // TRUE at the column, which meant every caller that set only `is_supplier` also got a
      // customer — a supplier added from the expenses inbox showed up in customer pickers and
      // the receivables aging. The column now defaults to false and the "said nothing -> it's a
      // customer" convention lives here instead, because only a request can be inspected for
      // whether it stated a role at all. A caller that names either flag is taken at its word.
      const companyFields = pickCompanyFields(body);
      if (companyFields.is_customer === undefined && companyFields.is_supplier === undefined) {
        companyFields.is_customer = true;
      }

      // Server-side dedupe (#366 BU-3). The client probe in QuickAddCompanyDialog is a courtesy:
      // it is debounced, non-blocking and swallows its own errors, so Create could always win the
      // race. This is the guarantee — one query, on the same folded key, immediately before the
      // insert. `name_fold` is a generated column holding `crm_fold(name)`, so the match survives
      // Greek case and accents: "Καρέλης ΑΕ" finds the stored "ΚΑΡΕΛΗΣ ΑΕ", which plain `ilike`
      // on the raw column never did. Duplicates are not cosmetic — they are what makes
      // spend-per-supplier and AP aging wrong later.
      //
      // `allow_duplicate: true` is the escape hatch for the genuine case (two distinct legal
      // entities sharing a trading name). Refusing by default and opting in is the right way
      // round: the accidental duplicate is silent, the deliberate one is typed by a human.
      if (body.allow_duplicate !== true) {
        const { data: existing, error: dupError } = await supabase
          .from('crm_companies')
          .select('id, name')
          .eq('workspace_id', targetWs)
          .eq('name_fold', foldForSearch(body.name))
          .limit(1)
          .maybeSingle();
        // A failed lookup does NOT fall through to the insert. Creating a duplicate is cheap to
        // detect and expensive to unpick; retrying a create is neither.
        if (dupError) {
          return new Response(
            JSON.stringify({ error: `Could not check for an existing business: ${dupError.message}` }),
            { status: 503, headers: corsHeaders },
          );
        }
        if (existing) {
          return new Response(
            JSON.stringify({
              error: `"${existing.name}" already exists in this workspace.`,
              code: 'duplicate_company',
              existing: { id: existing.id, name: existing.name },
            }),
            { status: 409, headers: corsHeaders },
          );
        }
      }

      const { data, error } = await supabase
        .from('crm_companies')
        .insert({
          ...companyFields,
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

      // Match the FOLDED haystack with a FOLDED term — `ilike` is case-insensitive but not
      // accent-insensitive, so "Καρέλης" never found "ΚΑΡΕΛΗΣ". `search_fold` is a generated
      // column (name + email + website) written by public.crm_fold(); foldForSearch() is its
      // twin. One column replaces the three-way `.or()`, so the term no longer touches
      // PostgREST's comma-delimited filter grammar at all.
      if (search) {
        query = query.ilike('search_fold', `%${escapeLike(foldForSearch(search))}%`);
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
              position,
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
      // contact_name, contact_email, contact_phone, contact_position, role,
      // is_primary, notes }.
      // Mirrors the inverse flatten in contacts-api-handler's GET /contacts/{id}.
      // `role` is the OPTIONAL per-attachment role; `contact_position` is the person's
      // own job title from their profile. Most attachments never state a role, so the
      // page falls back to the title rather than rendering an empty column.
      const attachments = (data as { crm_company_contacts?: Array<{
        id: string; contact_id: string; role: string | null; is_primary: boolean;
        notes: string | null; created_at: string;
        crm_contacts?: {
          id: string; name: string; email: string | null; phone: string | null;
          position?: string | null;
        } | null;
      }> }).crm_company_contacts ?? [];
      const contacts = attachments.map((a) => ({
        relationship_id: a.id,
        contact_id: a.contact_id,
        contact_name: a.crm_contacts?.name ?? null,
        contact_email: a.crm_contacts?.email ?? null,
        contact_phone: a.crm_contacts?.phone ?? null,
        contact_position: a.crm_contacts?.position ?? null,
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
          // Audit trail for a DELETE, and deliberately non-fatal — the company is already gone.
          // But the catch below only sees a THROWN failure, and supabase-js resolves on an RLS
          // denial, so a rejected insert produced neither the rows nor the warning it exists to
          // print: the contacts silently lost any record of why the business vanished (#347).
          const { error: actErr } = await supabase.from('crm_activities').insert(
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
          if (actErr) throw actErr;
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
        // An existing contact must also be in the caller's scope, else
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

