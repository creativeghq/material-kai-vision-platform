import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope, scopeAllows, rowInScope, type CrmScope } from './_scope.ts';
import { emitFlowEvent } from '../../_shared/flow-events.ts';
import { foldForSearch, escapeLike } from '../../_shared/searchFold.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LIST_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Max ids accepted in the `ids` allowlist. Bounds both the URL length and the
 *  generated `IN (...)` list — the caller resolves category/industry membership and
 *  sends the ids, so an unbounded list would be a cheap way to build a huge query. */
export const MAX_FILTER_IDS = 1000;

// Moved to _shared/searchFold.ts, beside the fold it always composes with. Re-exported here so
// the existing importer (companies-api-handler) keeps working and no second copy appears.
export { escapeLike };

/**
 * Quote a value for use INSIDE a PostgREST `or(...)` filter string.
 *
 * That grammar is comma-delimited with `.` separating column/operator/value, so an unquoted
 * value carrying `,` or `(` is re-parsed as syntax — a Greek business name
 * ("ΠΛΑΚΑΚΙΩΝ, ΠΛΑΚΟΛΙΘΩΝ") is enough to do it. Inside double quotes only `"` and `\` need
 * escaping. Composes with `escapeLike`: fold → escapeLike → quoteOrValue.
 *
 * A DIFFERENT contract from `escapeHtml` (invariant 11) — this is PostgREST filter grammar,
 * not HTML. Never substitute one for the other.
 */
export function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Parse the `ids` allowlist query param (used for the client-resolved category /
 * industry / attached-company membership filters).
 *
 * Returns `null` when the param is ABSENT — no filter. Returns an ARRAY when it is
 * present, and that array may be EMPTY: an empty list means "the caller's membership
 * lookup matched nothing" and MUST produce an empty page. Treating it as "no filter"
 * would show every row precisely when the user filtered down to none.
 */
export function parseIdsParam(url: URL): string[] | null {
  if (!url.searchParams.has('ids')) return null;
  return (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    // Drop anything that isn't a uuid rather than letting Postgres 22P02 the whole list.
    .filter((s) => LIST_UUID_RE.test(s))
    .slice(0, MAX_FILTER_IDS);
}

/** Verify a contact id is reachable by the caller's workspace scope. */
const contactInScope = (contactId: string, scope: CrmScope) => rowInScope(supabase, 'crm_contacts', contactId, scope);

/** Columns a client may write on a CRM contact. Used by BOTH create and update so
 * a field added on the frontend can never silently no-op (the bug that hid
 * lead_status / department). System columns are intentionally excluded. */
const CONTACT_WRITABLE_COLUMNS = [
  'name', 'email', 'phone', 'mobile', 'company', 'position', 'department',
  'first_name', 'last_name', 'profession',
  'linkedin', 'twitter', 'facebook', 'website',
  'address', 'city', 'state', 'postal_code', 'country', 'street', 'street_number',
  'status', 'lead_source', 'lead_status', 'lifecycle_stage', 'contact_type', 'marketing_consent',
  'is_client', 'is_supplier',
  'vat_number', 'country_code', 'tax_office', 'date_of_birth',
  'discount_percent', 'discount_notes', 'credit_limit', 'user_level_key', 'prices_vat_inclusive',
  'contact_group', 'include_in_myf', 'vat_exemption_reason',
  'billing_name', 'billing_vat', 'billing_tax_office', 'billing_street',
  'billing_street_number', 'billing_postal_code', 'billing_city', 'billing_country_code',
  'industry', 'employee_count', 'annual_revenue', 'min_order_value', 'payment_terms_days',
  'finance_statement_opt_out', 'responsible_sales_user_ids', 'tags',
] as const;

/** Exported so the companies handler's create-and-attach path writes the exact same
 * allowlisted column set (BOPLA — never spread a request body into the insert). */
export function pickContactFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of CONTACT_WRITABLE_COLUMNS) {
    if (body[col] !== undefined) out[col] = body[col];
  }
  // Legacy alias: some callers send discount_pct for discount_percent.
  if (out.discount_percent === undefined && body.discount_pct !== undefined) {
    out.discount_percent = body.discount_pct;
  }
  return out;
}

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
      // Include workspace owner + super_admin so the primary business persona can manage
      // their own CRM contacts (was ['admin','factory'], which locked owners out). Tenant
      // isolation stays enforced by the workspace scope below.
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

    // Workspace scoping (service-role handler — mirrors is_workspace_member RLS on crm_contacts).
    const scope = await getCrmScope(supabase, auth);

    // POST /api/contacts - Create contact
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const name = body.name as string | undefined;

      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Name is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Resolve the target workspace (crm_contacts.workspace_id is NOT NULL): an explicit
      // workspace_id must be in scope (any workspace for a global operator); otherwise
      // default to the caller's primary (first active) membership. A global operator that
      // omits it still needs a concrete home workspace, so default the same way.
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
          JSON.stringify({ error: 'No workspace available to create this contact in. Pass workspace_id.' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_contacts')
        .insert({
          ...pickContactFields(body),
          name,
          workspace_id: targetWs,
          created_by: userId || 'system',
        })
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Flows — new CRM contact. Carries lead_source so a flow can filter out bulk imports
      // (e.g. only fire for lead_source != 'import'). Best-effort; never block the create.
      const created = data?.[0];
      if (created) {
        try {
          await emitFlowEvent('crm_contact_created', {
            type: 'crm_contact_created', workspace_id: targetWs, user_id: userId || undefined,
            contact_id: created.id, contact_name: created.name, email: created.email ?? null,
            lead_source: created.lead_source ?? null, lead_status: created.lead_status ?? null,
            title: `New contact: ${created.name}`,
            body: `${created.name}${created.lead_source ? ` (${created.lead_source})` : ''} was added to your CRM.`,
            action_url: `/crm/contacts/${created.id}`,
          });
        } catch { /* best-effort */ }
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

      // Server-side filters. These exist so the CRM list can be SERVER-paged: the page
      // used to drain every contact into the browser purely because these five filters
      // ran client-side.
      const search = (url.searchParams.get('search') || '').trim();
      const profession = url.searchParams.get('profession') || '';
      const status = url.searchParams.get('status') || '';
      const lifecycleStage = url.searchParams.get('lifecycle_stage') || '';
      const kind = url.searchParams.get('kind') || ''; // client | supplier | neither
      // Attached-company filter, sent as a NAME. Resolved here rather than client-side because a
      // contact can carry its company two ways: the crm_company_contacts junction, or the legacy
      // free-text `company` column. Only the server can match both in one query.
      const companyName = (url.searchParams.get('company_name') || '').trim();
      const ids = parseIdsParam(url);

      if (!scope.isGlobalOperator && scope.workspaceIds.length === 0) {
        return new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: corsHeaders });
      }

      // Present-but-empty `ids` = the caller's membership lookup matched nothing.
      // Short-circuit rather than fall through to an unfiltered query.
      if (ids !== null && ids.length === 0) {
        return new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: corsHeaders });
      }

      // `count: 'exact'` so the caller can paginate — the response used to report
      // `count: rows.length` (the PAGE size), which made a total row count unknowable.
      // With the filters below applied the count reflects the FILTERED set, which is
      // what the table footer needs.
      let listQuery = supabase
        .from('crm_contacts')
        .select(`
          *,
          crm_company_contacts(
            id,
            company_id,
            is_primary,
            crm_companies(
              id,
              name
            )
          )
        `, { count: 'exact' })
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });
      if (!scope.isGlobalOperator) {
        listQuery = listQuery.in('workspace_id', scope.workspaceIds);
      }

      // Every filter below is ANDed ON TOP of the workspace clause above. None of them
      // may relax or replace it — a request param must never influence tenant scope.
      if (ids) listQuery = listQuery.in('id', ids);
      if (search) {
        // Match the FOLDED haystack with a FOLDED term: `ilike` is case-insensitive but not
        // accent-insensitive, so "Κώστας" never found "ΚΩΣΤΑΣ ΑΛΕΞΙΟΥ". `search_fold` is a
        // generated column (name + email) written by public.crm_fold(); foldForSearch() is its
        // twin — see _shared/searchFold.ts.
        const safe = escapeLike(foldForSearch(search));
        // The list renders each contact's ATTACHED COMPANY, and the old client-side search matched
        // on that name too. `company` isn't a column here (it's the crm_company_contacts junction),
        // so resolve matching companies to their contact ids first and OR them in — otherwise
        // moving search server-side would quietly lose a way people actually find contacts.
        let companyContactIds: string[] = [];
        let companyQuery = supabase
          .from('crm_companies')
          .select('id')
          .ilike('search_fold', `%${safe}%`)
          .limit(MAX_FILTER_IDS);
        if (!scope.isGlobalOperator) {
          companyQuery = companyQuery.in('workspace_id', scope.workspaceIds);
        }
        const { data: matchedCompanies } = await companyQuery;
        const matchedIds = (matchedCompanies ?? []).map((c: { id: string }) => c.id);
        if (matchedIds.length > 0) {
          const { data: junction } = await supabase
            .from('crm_company_contacts')
            .select('contact_id')
            .in('company_id', matchedIds)
            .limit(MAX_FILTER_IDS);
          companyContactIds = [...new Set((junction ?? [])
            .map((j: { contact_id: string }) => j.contact_id)
            .filter(Boolean))];
        }
        // One column now covers name + email, so the common case needs no `.or()` at all —
        // which also keeps the term out of PostgREST's comma-delimited filter grammar. When the
        // attached-company clause IS needed, the term is quoted so a comma in a search
        // ("ΠΛΑΚΑΚΙΩΝ, ΠΛΑΚΟΛΙΘΩΝ") can't be read as the start of a second condition.
        listQuery = companyContactIds.length > 0
          ? listQuery.or(`search_fold.ilike.${quoteOrValue(`%${safe}%`)},id.in.(${companyContactIds.join(',')})`)
          : listQuery.ilike('search_fold', `%${safe}%`);
      }
      if (companyName) {
        const safeCompany = escapeLike(companyName);
        let namedQuery = supabase
          .from('crm_companies')
          .select('id')
          .eq('name', companyName)
          .limit(MAX_FILTER_IDS);
        if (!scope.isGlobalOperator) {
          namedQuery = namedQuery.in('workspace_id', scope.workspaceIds);
        }
        const { data: namedCompanies } = await namedQuery;
        const namedIds = (namedCompanies ?? []).map((c: { id: string }) => c.id);
        let attachedContactIds: string[] = [];
        if (namedIds.length > 0) {
          const { data: junction } = await supabase
            .from('crm_company_contacts')
            .select('contact_id')
            .in('company_id', namedIds)
            .limit(MAX_FILTER_IDS);
          attachedContactIds = [...new Set((junction ?? [])
            .map((j: { contact_id: string }) => j.contact_id)
            .filter(Boolean))];
        }
        // Quoted for the same reason as the search clause: a company name may contain a comma.
        listQuery = attachedContactIds.length > 0
          ? listQuery.or(`company.ilike.${quoteOrValue(`%${safeCompany}%`)},id.in.(${attachedContactIds.join(',')})`)
          : listQuery.ilike('company', `%${safeCompany}%`);
      }
      if (profession) listQuery = listQuery.eq('profession', profession);
      if (status) listQuery = listQuery.eq('status', status);
      if (lifecycleStage) listQuery = listQuery.eq('lifecycle_stage', lifecycleStage);
      // `neither` uses IS NOT TRUE so NULL (never set) counts as "not a client/supplier",
      // matching the client-side `!c.is_client && !c.is_supplier` this replaces.
      if (kind === 'client') listQuery = listQuery.eq('is_client', true);
      else if (kind === 'supplier') listQuery = listQuery.eq('is_supplier', true);
      else if (kind === 'neither') {
        listQuery = listQuery.not('is_client', 'is', true).not('is_supplier', 'is', true);
      }

      const { data, error, count } = await listQuery;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Flatten each contact's company attachments into a `companies` array (same
      // shape as the single-contact GET) so the list can show the attached business
      // instead of only the legacy free-text `company` column.
      const rows = (data ?? []).map((row) => {
        const attachments = (row as { crm_company_contacts?: Array<{
          id: string; company_id: string; is_primary: boolean;
          crm_companies?: { id: string; name: string } | null;
        }> }).crm_company_contacts ?? [];
        const companies = attachments.map((a) => ({
          relationship_id: a.id,
          company_id: a.company_id,
          company_name: a.crm_companies?.name ?? null,
          is_primary: a.is_primary,
        }));
        delete (row as { crm_company_contacts?: unknown }).crm_company_contacts;
        (row as { companies?: unknown }).companies = companies;
        return row;
      });

      return new Response(
        JSON.stringify({ data: rows, count: count ?? rows.length }),
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
          crm_company_contacts(
            id,
            company_id,
            role,
            is_primary,
            crm_companies(
              id,
              name
            )
          )
        `)
        .eq('id', contactId)
        .single();

      if (error || !data || !scopeAllows(scope, (data as { workspace_id?: string }).workspace_id)) {
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Flatten the company attachments (crm_company_contacts) into the `companies`
      // shape the contact detail page reads — { relationship_id, company_id,
      // company_name, is_primary, role }. This is what drives the attached-company
      // badge AND the Pricing / Invoicing / Tax & VAT inheritance (a contact with a
      // primary company inherits the company's commercial fields unless overridden).
      const attachments = (data as { crm_company_contacts?: Array<{
        id: string; company_id: string; role: string | null; is_primary: boolean;
        crm_companies?: { id: string; name: string } | null;
      }> }).crm_company_contacts ?? [];
      const companies = attachments.map((a) => ({
        relationship_id: a.id,
        company_id: a.company_id,
        company_name: a.crm_companies?.name ?? null,
        is_primary: a.is_primary,
        role: a.role,
      }));
      delete (data as { crm_company_contacts?: unknown }).crm_company_contacts;
      (data as { companies?: unknown }).companies = companies;

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/contacts/{id} - Update contact
    if (method === 'PATCH' && path.length === 1) {
      const contactId = path[0];
      const body = await req.json();

      if (!(await contactInScope(contactId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      const updates: Record<string, unknown> = {
        ...pickContactFields(body),
        updated_at: new Date().toISOString(),
      };

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

      // Existence + workspace-scope check in one (out-of-scope rows are reported as not found).
      if (!(await contactInScope(contactId, scope))) {
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

      if (!(await contactInScope(contactId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Only link a user who is an active member of the caller's
      // workspace(s) — otherwise an admin could bind an arbitrary platform user_id to a
      // contact (granting that user the contact's inbox/finance scope).
      if (!scope.isGlobalOperator) {
        const { data: targetMem } = await supabase
          .from('workspace_members')
          .select('user_id')
          .eq('user_id', userId)
          .in('workspace_id', scope.workspaceIds.length ? scope.workspaceIds : ['00000000-0000-0000-0000-000000000000'])
          .limit(1)
          .maybeSingle();
        if (!targetMem) {
          return new Response(
            JSON.stringify({ error: 'User is not a member of your workspace' }),
            { status: 403, headers: corsHeaders },
          );
        }
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
          linked_by: scope.callerUserId ?? 'system',
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

      if (!(await contactInScope(contactId, scope))) {
        return new Response(
          JSON.stringify({ error: 'Contact not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('crm_contacts')
        .update({
          user_id: null,
          linked_at: null,
          linked_by: scope.callerUserId ?? 'system', // Track who unlinked
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
      if (!scope.isGlobalOperator && scope.workspaceIds.length === 0) {
        return new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: corsHeaders });
      }

      // Find contacts with emails that match user emails
      let pmQuery = supabase
        .from('crm_contacts')
        .select('id, name, email')
        .not('email', 'is', null)
        .is('user_id', null);
      if (!scope.isGlobalOperator) {
        pmQuery = pmQuery.in('workspace_id', scope.workspaceIds);
      }
      const { data: contacts } = await pmQuery;

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
          if (!(await contactInScope(contactId, scope))) {
            errors.push({ contactId, userId, error: 'Contact not found' });
            continue;
          }

          // Only link a user who is a member of the caller's workspace.
          if (!scope.isGlobalOperator) {
            const { data: targetMem } = await supabase
              .from('workspace_members')
              .select('user_id')
              .eq('user_id', userId)
              .in('workspace_id', scope.workspaceIds.length ? scope.workspaceIds : ['00000000-0000-0000-0000-000000000000'])
              .limit(1)
              .maybeSingle();
            if (!targetMem) {
              errors.push({ contactId, userId, error: 'User is not a member of your workspace' });
              continue;
            }
          }

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
              linked_by: scope.callerUserId ?? 'system',
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

      if (error || !data || !scopeAllows(scope, (data as { workspace_id?: string }).workspace_id)) {
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

