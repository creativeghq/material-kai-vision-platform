import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope, scopeAllows, isUuid, type CrmScope } from './_scope.ts';
import { callDataForSEO } from '../../_shared/tools/dataforseo-dispatch.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

/**
 * Google Business Profile mirror for a CRM party.
 *
 *   GET  /crm-api/google-business?company_id= | ?contact_id=   → the stored snapshot (or null)
 *   POST /crm-api/google-business  {company_id|contact_id, query?}  → look it up + store it
 *
 * The GET is free and reads what we already have. The POST spends: it reaches DataForSEO's
 * Business Data endpoint on the OPERATOR's credential, so it goes through the shared dispatcher,
 * which reserves the caller's credits BEFORE the upstream call (invariant 10).
 *
 * What comes back is a mirror, not an update. Nothing here writes to crm_companies /
 * crm_contacts: Google's address for a business and ours are two independent claims, and the
 * whole value of having both is being able to see that they disagree. Merging them destroys
 * exactly the information the operator opened the panel to get.
 */

/** Party rows carry the VAT country code, where Greece is `EL`; ISO — which DataForSEO's
 *  location table is keyed on — says `GR`. Sending `EL` was not an error: it fell through to
 *  the client's default location, which is the United States. A Greek supplier searched in
 *  Michigan returns "no listing", and no layer says why. */
const VAT_TO_ISO_COUNTRY: Record<string, string> = { EL: 'GR', UK: 'GB' };

function isoCountry(code: string | null | undefined): string | null {
  const cc = (code || '').trim().toUpperCase();
  if (!cc || cc.length !== 2) return null;
  return VAT_TO_ISO_COUNTRY[cc] ?? cc;
}

interface PartyRow {
  id: string;
  workspace_id: string;
  name: string | null;
  address: string | null;
  street: string | null;
  street_number: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  country_code: string | null;
}

/** Load the party, but only when the caller's workspace scope actually reaches it (BOLA). */
async function loadParty(
  parent: { company_id?: string; contact_id?: string },
  scope: CrmScope,
): Promise<{ table: 'crm_companies' | 'crm_contacts'; row: PartyRow } | null> {
  const table = parent.company_id ? 'crm_companies' : 'crm_contacts';
  const id = parent.company_id ?? parent.contact_id;
  if (!isUuid(id)) return null;
  const { data } = await supabase
    .from(table)
    .select('id, workspace_id, name, address, street, street_number, city, postal_code, country, country_code')
    .eq('id', id)
    .maybeSingle();
  const row = data as PartyRow | null;
  // 404, not 403, on a scope miss — a distinct 403 confirms the id exists (id enumeration).
  if (!row || !scopeAllows(scope, row.workspace_id)) return null;
  return { table, row };
}

/** The text we hand Google: the business name plus the town, which is what disambiguates it. */
function defaultQuery(row: PartyRow): string {
  return [row.name, row.city || row.postal_code].filter(Boolean).join(', ').trim();
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Project one DataForSEO `google_my_business_info` item onto our columns.
 *
 * Field names come from the live payload rather than the docs, and several have two spellings
 * across DataForSEO's own responses (`url` vs `website`, `check_url` vs `cid_url`), so each one
 * is read defensively. The whole item is kept in `raw` regardless — a mirror that quietly drops
 * the half we did not think to map is not a mirror.
 */
function projectItem(item: Record<string, any>) {
  const rating = item?.rating ?? {};
  return {
    place_id: str(item?.place_id),
    cid: str(item?.cid),
    feature_id: str(item?.feature_id),
    title: str(item?.title),
    category: str(item?.category),
    additional_categories: Array.isArray(item?.additional_categories) ? item.additional_categories : null,
    description: str(item?.description) ?? str(item?.snippet),
    address: str(item?.address),
    address_info: item?.address_info ?? null,
    latitude: num(item?.latitude),
    longitude: num(item?.longitude),
    phone: str(item?.phone),
    website: str(item?.url) ?? str(item?.website) ?? str(item?.domain),
    maps_url: str(item?.check_url) ?? str(item?.cid_url),
    rating: num(rating?.value),
    reviews_count: num(rating?.votes_count),
    price_level: str(item?.price_level),
    is_claimed: typeof item?.is_claimed === 'boolean' ? item.is_claimed : null,
    work_hours: item?.work_time?.work_hours ?? item?.work_time ?? null,
    attributes: item?.attributes ?? null,
    main_image: str(item?.main_image),
    total_photos: num(item?.total_photos),
    raw: item ?? null,
  };
}

/** Read the current mirror for a party (newest wins). */
async function currentSnapshot(parent: { company_id?: string; contact_id?: string }) {
  let q = supabase.from('crm_google_business_profiles').select('*');
  q = parent.company_id ? q.eq('company_id', parent.company_id) : q.eq('contact_id', parent.contact_id!);
  const { data } = await q.order('fetched_at', { ascending: false }).limit(1);
  return (data as unknown[] | null)?.[0] ?? null;
}

export async function handleGoogleBusiness(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await authenticate(req, {
      allowedRoles: ['admin', 'super_admin', 'owner', 'supplier', 'architect', 'sales', 'factory'],
    });
    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: corsHeaders },
      );
    }
    const scope = await getCrmScope(supabase, auth);

    const url = new URL(req.url);
    const path = url.pathname
      .replace(/^(\/functions\/v1)?(\/crm-api)?\/google-business/, '')
      .split('/').filter(Boolean);

    // ── GET — what we already know. Free, and never triggers a lookup. ──────────
    if (req.method === 'GET' && path.length === 0) {
      const companyId = url.searchParams.get('company_id') || undefined;
      const contactId = url.searchParams.get('contact_id') || undefined;
      if ((companyId ? 1 : 0) + (contactId ? 1 : 0) !== 1) {
        return new Response(JSON.stringify({ error: 'Exactly one of company_id / contact_id is required' }), { status: 400, headers: corsHeaders });
      }
      const party = await loadParty({ company_id: companyId, contact_id: contactId }, scope);
      if (!party) return new Response(JSON.stringify({ error: 'Party not found' }), { status: 404, headers: corsHeaders });
      const snapshot = await currentSnapshot({ company_id: companyId, contact_id: contactId });
      return new Response(
        JSON.stringify({ data: snapshot, suggested_query: defaultQuery(party.row) }),
        { status: 200, headers: corsHeaders },
      );
    }

    // ── POST — look the party up on Google and mirror the answer. Costs credits. ──
    if (req.method === 'POST' && path.length === 0) {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      const companyId = (body.company_id as string | undefined) || undefined;
      const contactId = (body.contact_id as string | undefined) || undefined;
      if ((companyId ? 1 : 0) + (contactId ? 1 : 0) !== 1) {
        return new Response(JSON.stringify({ error: 'Exactly one of company_id / contact_id is required' }), { status: 400, headers: corsHeaders });
      }
      const party = await loadParty({ company_id: companyId, contact_id: contactId }, scope);
      if (!party) return new Response(JSON.stringify({ error: 'Party not found' }), { status: 404, headers: corsHeaders });

      const query = String(body.query ?? '').trim().slice(0, 200) || defaultQuery(party.row);
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'This record has no name to search Google with. Add a name, or type what to look for.' }),
          { status: 400, headers: corsHeaders },
        );
      }
      const countryCode = isoCountry(party.row.country_code);

      const result = await callDataForSEO(
        'business_google_my_business_info',
        { keyword: query, country_code: countryCode, language_code: 'en' },
        { user_id: auth.userId ?? undefined, workspace_id: party.row.workspace_id },
      );

      const items = (result.data?.items ?? []) as Array<Record<string, any>>;
      const first = items[0];

      // Three outcomes, three stored rows. "We asked and Google has no listing" and "we never
      // got an answer" look identical on screen unless the row says which one happened — the
      // silent-zero shape (rule 3): an absent rating is not a rating of zero.
      const base = {
        workspace_id: party.row.workspace_id,
        company_id: companyId ?? null,
        contact_id: contactId ?? null,
        query,
        location_country_code: countryCode,
        requested_by: auth.userId ?? null,
        fetched_at: new Date().toISOString(),
      };
      const row = !result.ok
        ? { ...base, fetch_status: 'failed', source_error: result.error ?? 'lookup failed' }
        : first
          ? { ...base, fetch_status: 'ok', ...projectItem(first) }
          : { ...base, fetch_status: 'no_match' };

      // Insert FIRST, then drop the superseded rows. The other order leaves a party with no
      // mirror at all if the insert fails — "never looked" instead of "this is what we found",
      // which is a different and wrong answer.
      const { data: inserted, error } = await supabase
        .from('crm_google_business_profiles')
        .insert(row)
        .select()
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      }
      let prune = supabase.from('crm_google_business_profiles').delete().neq('id', (inserted as { id: string }).id);
      prune = companyId ? prune.eq('company_id', companyId) : prune.eq('contact_id', contactId!);
      await prune;

      // A failed lookup is reported as a failure (502) with the row still stored, so the panel
      // can say "we could not reach Google" rather than "this business has no listing".
      return new Response(
        JSON.stringify({ data: inserted, error: result.ok ? undefined : result.error }),
        { status: result.ok ? 200 : 502, headers: corsHeaders },
      );
    }

    // ── DELETE /{id} — discard a wrong match. ───────────────────────────────────
    if (req.method === 'DELETE' && path.length === 1) {
      if (!isUuid(path[0])) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
      const { data } = await supabase
        .from('crm_google_business_profiles')
        .select('id, workspace_id')
        .eq('id', path[0])
        .maybeSingle();
      const found = data as { id: string; workspace_id: string } | null;
      if (!found || !scopeAllows(scope, found.workspace_id)) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
      }
      const { error } = await supabase.from('crm_google_business_profiles').delete().eq('id', found.id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
}
