import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope, scopeAllows, type CrmScope } from './_scope.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Sub-unit (secondary / branch / ΑΑΔΕ establishment) addresses for a CRM company or contact.
 * The party's main address stays inline on crm_companies / crm_contacts; these are the
 * additional named units a document (invoice / quote / project / delivery note) can opt into.
 *
 *   POST   /crm-api/address-units            {company_id|contact_id, label, ...address}
 *   GET    /crm-api/address-units?company_id= | ?contact_id=
 *   PATCH  /crm-api/address-units/{id}
 *   DELETE /crm-api/address-units/{id}
 */

const UNIT_WRITABLE_COLUMNS = [
  'label', 'branch_number',
  'address', 'street', 'street_number', 'city', 'state', 'postal_code', 'country', 'country_code',
  'is_default',
] as const;

function pickUnitFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of UNIT_WRITABLE_COLUMNS) {
    if (body[col] !== undefined) out[col] = body[col];
  }
  return out;
}

/** Resolve the workspace_id of the parent party, or null if it isn't reachable by the scope. */
async function parentWorkspace(
  parent: { company_id?: string; contact_id?: string },
  scope: CrmScope,
): Promise<string | null> {
  const table = parent.company_id ? 'crm_companies' : 'crm_contacts';
  const id = parent.company_id ?? parent.contact_id;
  if (!id) return null;
  const { data } = await supabase.from(table).select('workspace_id').eq('id', id).maybeSingle();
  const ws = (data as { workspace_id?: string } | null)?.workspace_id;
  if (!ws || !scopeAllows(scope, ws)) return null;
  return ws;
}

/** Fetch a unit row only if its workspace is reachable by the caller. */
async function unitInScope(unitId: string, scope: CrmScope) {
  const { data } = await supabase
    .from('crm_address_units')
    .select('id, workspace_id, is_default, company_id, contact_id')
    .eq('id', unitId)
    .maybeSingle();
  if (!data || !scopeAllows(scope, (data as { workspace_id?: string }).workspace_id)) return null;
  return data as { id: string; workspace_id: string; is_default: boolean; company_id: string | null; contact_id: string | null };
}

/** At most one default unit per party — clear the previous default before setting a new one. */
async function clearOtherDefaults(parent: { company_id?: string | null; contact_id?: string | null }, exceptId?: string) {
  let q = supabase.from('crm_address_units').update({ is_default: false });
  q = parent.company_id ? q.eq('company_id', parent.company_id) : q.eq('contact_id', parent.contact_id!);
  if (exceptId) q = q.neq('id', exceptId);
  await q.eq('is_default', true);
}

export async function handleAddressUnits(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Owner + super_admin included so the primary business persona can manage a party's
    // address sub-units (was ['admin','factory']). Reads now also go via table RLS on the
    // client; this gate still covers writes. Tenant isolation enforced by the scope below.
    const auth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner', 'factory'] });
    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: corsHeaders },
      );
    }
    const user = auth.user;
    const scope = await getCrmScope(supabase, auth);

    const url = new URL(req.url);
    const path = url.pathname.replace(/^(\/functions\/v1)?(\/crm-api)?\/address-units/, '').split('/').filter(Boolean);
    const method = req.method;

    // GET /address-units?company_id= | ?contact_id=  — list a party's units
    if (method === 'GET' && path.length === 0) {
      const companyId = url.searchParams.get('company_id') || undefined;
      const contactId = url.searchParams.get('contact_id') || undefined;
      if (!companyId && !contactId) {
        return new Response(JSON.stringify({ error: 'company_id or contact_id is required' }), { status: 400, headers: corsHeaders });
      }
      const ws = await parentWorkspace({ company_id: companyId, contact_id: contactId }, scope);
      if (!ws) {
        return new Response(JSON.stringify({ error: 'Party not found' }), { status: 404, headers: corsHeaders });
      }
      let q = supabase.from('crm_address_units').select('*').order('created_at', { ascending: true });
      q = companyId ? q.eq('company_id', companyId) : q.eq('contact_id', contactId!);
      const { data, error } = await q;
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ data }), { status: 200, headers: corsHeaders });
    }

    // POST /address-units — create
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const companyId = (body.company_id as string | undefined) || undefined;
      const contactId = (body.contact_id as string | undefined) || undefined;
      if ((companyId ? 1 : 0) + (contactId ? 1 : 0) !== 1) {
        return new Response(JSON.stringify({ error: 'Exactly one of company_id / contact_id is required' }), { status: 400, headers: corsHeaders });
      }
      if (!body.label || String(body.label).trim() === '') {
        return new Response(JSON.stringify({ error: 'label is required' }), { status: 400, headers: corsHeaders });
      }
      const ws = await parentWorkspace({ company_id: companyId, contact_id: contactId }, scope);
      if (!ws) {
        return new Response(JSON.stringify({ error: 'Party not found' }), { status: 404, headers: corsHeaders });
      }

      const fields = pickUnitFields(body);
      if (fields.is_default === true) await clearOtherDefaults({ company_id: companyId, contact_id: contactId });

      const { data, error } = await supabase
        .from('crm_address_units')
        .insert({
          ...fields,
          company_id: companyId ?? null,
          contact_id: contactId ?? null,
          workspace_id: ws,
          created_by: user.id,
        })
        .select();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ data: data?.[0] }), { status: 201, headers: corsHeaders });
    }

    // PATCH /address-units/{id} — update
    if (method === 'PATCH' && path.length === 1) {
      const unit = await unitInScope(path[0], scope);
      if (!unit) return new Response(JSON.stringify({ error: 'Address unit not found' }), { status: 404, headers: corsHeaders });
      const body = await req.json();
      const fields = pickUnitFields(body);
      if (fields.is_default === true) {
        await clearOtherDefaults({ company_id: unit.company_id, contact_id: unit.contact_id }, unit.id);
      }
      const { data, error } = await supabase
        .from('crm_address_units')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', unit.id)
        .select();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ data: data?.[0] }), { status: 200, headers: corsHeaders });
    }

    // DELETE /address-units/{id}
    if (method === 'DELETE' && path.length === 1) {
      const unit = await unitInScope(path[0], scope);
      if (!unit) return new Response(JSON.stringify({ error: 'Address unit not found' }), { status: 404, headers: corsHeaders });
      const { error } = await supabase.from('crm_address_units').delete().eq('id', unit.id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
}
