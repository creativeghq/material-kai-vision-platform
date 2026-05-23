/**
 * vies-validate
 *
 * Server-side VIES VAT validation.
 *
 *   POST /functions/v1/vies-validate
 *     body: { country_code: string, vat_number: string, company_id?: string }
 *
 *   Returns: { valid, name, address, checked_at, source: 'vies', skipped_reason?: string }
 *
 * If company_id is provided AND the caller owns the row (created_by) OR is admin,
 * the result is also cached on crm_companies (vat_validated*, vat_validated_at, …).
 *
 * Why server-side:
 *  - VIES has occasional downtime; we want consistent error handling + a single retry policy
 *  - Caching the result on crm_companies needs service-role to bypass RLS for the admin path
 *  - Avoids CORS friction from calling ec.europa.eu directly from the browser
 *
 * VIES is EU-only — non-EU country codes are skipped with skipped_reason='non_eu'.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

// VIES supports EU member states plus a few specials (XI = Northern Ireland, EL = Greece).
// GB (mainland UK) was dropped in 2021 — only XI works for VIES today.
const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK', 'XI',
]);

interface VatRequest {
  country_code: string;
  vat_number: string;
  company_id?: string;
}

interface ViesResponse {
  countryCode: string;
  vatNumber: string;
  requestDate: string;
  valid: boolean;
  name?: string;
  address?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Split a raw VAT number like "EL094019245" into { country, number } using the leading 2 letters when present. */
function normalizeVat(countryCode: string, vatNumber: string): { country: string; number: string } {
  const rawNumber = (vatNumber || '').replace(/\s+/g, '').toUpperCase();
  const rawCountry = (countryCode || '').trim().toUpperCase();

  // If the VAT number itself starts with 2 letters that look like a country code, prefer that
  const m = rawNumber.match(/^([A-Z]{2})(.+)$/);
  if (m && EU_COUNTRY_CODES.has(m[1])) {
    return { country: m[1], number: m[2] };
  }
  return { country: rawCountry, number: rawNumber };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate (we don't enforce role here — anyone authed can validate; cache write is gated below)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as VatRequest;
    const { country, number } = normalizeVat(body.country_code, body.vat_number);

    if (!country || !number) {
      return jsonResponse({ error: 'country_code and vat_number are required' }, 400);
    }

    if (!EU_COUNTRY_CODES.has(country)) {
      return jsonResponse({
        valid: null,
        skipped_reason: 'non_eu',
        message: `VIES validation is only available for EU VAT numbers. ${country} is not in scope.`,
        source: 'vies',
        checked_at: new Date().toISOString(),
      });
    }

    // Call VIES with a generous timeout (it can be slow under load)
    let viesData: ViesResponse | null = null;
    let viesError: string | null = null;

    try {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 15_000);
      const response = await fetch(VIES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ countryCode: country, vatNumber: number }),
        signal: abort.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        viesError = `VIES responded with HTTP ${response.status}`;
      } else {
        viesData = (await response.json()) as ViesResponse;
      }
    } catch (err) {
      viesError = err instanceof Error ? err.message : 'VIES unreachable';
    }

    if (viesError || !viesData) {
      return jsonResponse({
        valid: null,
        skipped_reason: 'vies_unreachable',
        message: viesError || 'VIES did not respond — please try again later.',
        source: 'vies',
        checked_at: new Date().toISOString(),
      }, 503);
    }

    const result = {
      valid: viesData.valid === true,
      name: viesData.name && viesData.name !== '---' ? viesData.name : null,
      address: viesData.address && viesData.address !== '---' ? viesData.address : null,
      country_code: country,
      vat_number: number,
      checked_at: new Date().toISOString(),
      source: 'vies' as const,
    };

    // Cache the result on crm_companies if requested and authorized
    if (body.company_id) {
      const admin = createClient(supabaseUrl, supabaseServiceKey);

      const { data: company } = await admin
        .from('crm_companies')
        .select('id, created_by')
        .eq('id', body.company_id)
        .maybeSingle();

      if (company) {
        // Allow cache update if: caller owns the company OR caller is admin
        let canWrite = company.created_by === user.id;
        if (!canWrite) {
          const { data: profile } = await admin
            .from('user_profiles')
            .select('roles!user_profiles_role_id_fkey(name)')
            .eq('user_id', user.id)
            .maybeSingle();
          // deno-lint-ignore no-explicit-any
          const rn = (profile as any)?.roles?.name;
          canWrite = rn === 'admin' || rn === 'super_admin' || rn === 'owner';
        }

        if (canWrite) {
          await admin.from('crm_companies').update({
            vat_validated: result.valid,
            vat_validated_at: result.checked_at,
            vat_validated_name: result.name,
            vat_validated_address: result.address,
            vat_validation_source: 'vies',
            updated_at: new Date().toISOString(),
          }).eq('id', body.company_id);
        }
      }
    }

    return jsonResponse(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('[vies-validate] error:', err);
    return jsonResponse({ error: 'internal_error', detail }, 500);
  }
});
