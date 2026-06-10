/**
 * myaade-rgwspublic2
 *
 * SOAP 1.2 client for ΑΑΔΕ RgWsPublic2 — Greek business lookup by ΑΦΜ.
 *
 *   POST /functions/v1/myaade-rgwspublic2
 *     body: { afm: string, company_id?: string }
 *
 *   Returns: { ok, valid_afm, basic_rec, activities, error?, source, checked_at, secret_sources }
 *
 * Auth model:
 *   - Caller must be an authenticated user (we use the user's JWT to identify them).
 *   - TAXISnet creds come from the shared resolveAadeCredentials helper
 *     (env-first → DB fallback, common to every myaade-* function).
 *
 * Side effects ΑΑΔΕ users should know about:
 *   - Every lookup writes an audit entry to the looked-up ΑΦΜ's TAXISnet inbox.
 *   - There is a monthly quota on the TAXISnet account. We minimize calls via
 *     `crm_companies.aade_data` cache (90-day TTL — refreshed on demand).
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import {
  resolveAadeCredentials,
  buildSoapEnvelope,
  postSoap,
  pickTag,
  pickAllTagBlocks,
  summarizeAadeError,
  xmlEscape,
} from '../_shared/aade/soap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

const AADE_ENDPOINT = 'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2';
const CACHE_FRESH_MS = 90 * 24 * 3600 * 1000;

interface LookupBody {
  afm: string;
  company_id?: string;
}

interface FirmActivity {
  code: string | null;
  description: string | null;
  kind: number | null;
  kind_description: string | null;
}

interface BasicRec {
  afm: string | null;
  doy: string | null;
  doy_descr: string | null;
  i_ni_flag_descr: string | null;
  deactivation_flag: string | null;
  deactivation_flag_descr: string | null;
  firm_flag_descr: string | null;
  onomasia: string | null;
  commer_title: string | null;
  legal_status_descr: string | null;
  postal_address: string | null;
  postal_address_no: string | null;
  postal_zip_code: string | null;
  postal_area_description: string | null;
  regist_date: string | null;
  stop_date: string | null;
  normal_vat_system_flag: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseBasicRec(xml: string): BasicRec | null {
  const block = pickAllTagBlocks(xml, 'basic_rec')[0] ?? pickAllTagBlocks(xml, 'BasicRec')[0];
  if (!block) return null;
  return {
    afm: pickTag(block, 'afm'),
    doy: pickTag(block, 'doy'),
    doy_descr: pickTag(block, 'doy_descr'),
    i_ni_flag_descr: pickTag(block, 'i_ni_flag_descr'),
    deactivation_flag: pickTag(block, 'deactivation_flag'),
    deactivation_flag_descr: pickTag(block, 'deactivation_flag_descr'),
    firm_flag_descr: pickTag(block, 'firm_flag_descr'),
    onomasia: pickTag(block, 'onomasia'),
    commer_title: pickTag(block, 'commer_title'),
    legal_status_descr: pickTag(block, 'legal_status_descr'),
    postal_address: pickTag(block, 'postal_address'),
    postal_address_no: pickTag(block, 'postal_address_no'),
    postal_zip_code: pickTag(block, 'postal_zip_code'),
    postal_area_description: pickTag(block, 'postal_area_description'),
    regist_date: pickTag(block, 'regist_date'),
    stop_date: pickTag(block, 'stop_date'),
    normal_vat_system_flag: pickTag(block, 'normal_vat_system_flag'),
  };
}

function parseActivities(xml: string): FirmActivity[] {
  // ΑΑΔΕ returns activities as repeated <item> blocks inside <firm_act_tab>. The legacy
  // <FirmActivity> shape (seen in some Go clients' docs) is kept as a fallback in case
  // ΑΑΔΕ varies it across deployments.
  const blocks = [
    ...pickAllTagBlocks(xml, 'firm_act_tab').flatMap((b) => pickAllTagBlocks(b, 'item')),
    ...pickAllTagBlocks(xml, 'FirmActivity'),
  ];
  return blocks.map((b) => ({
    code: pickTag(b, 'firm_act_code'),
    description: pickTag(b, 'firm_act_descr'),
    kind: (() => { const v = pickTag(b, 'firm_act_kind'); return v ? Number(v) : null; })(),
    kind_description: pickTag(b, 'firm_act_kind_descr'),
  })).filter((a) => a.code || a.description);
}

/** Operation-specific SOAP body for rgWsPublic2AfmMethod. */
function buildRgWsPublic2Body(afmCalledBy: string, afmCalledFor: string): string {
  return `<srv:rgWsPublic2AfmMethod xmlns:srv="http://rgwspublic2/RgWsPublic2">
    <srv:INPUT_REC>
      <srv:afm_called_by>${xmlEscape(afmCalledBy)}</srv:afm_called_by>
      <srv:afm_called_for>${xmlEscape(afmCalledFor)}</srv:afm_called_for>
    </srv:INPUT_REC>
  </srv:rgWsPublic2AfmMethod>`;
}

Deno.serve(withApiLogging('myaade-rgwspublic2', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth (user JWT)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as LookupBody;
    const rawAfm = (body.afm || '').replace(/[^0-9]/g, '');
    if (rawAfm.length !== 9) {
      return jsonResponse({ error: 'invalid_afm', message: 'Greek ΑΦΜ must be exactly 9 digits.' }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const creds = await resolveAadeCredentials(admin);

    if (!creds.username || !creds.password) {
      return jsonResponse({
        error: 'aade_not_configured',
        message: 'ΑΑΔΕ web-service credentials not set. Configure AADE_USERNAME and AADE_PASSWORD at /admin/modules/myaade.',
        secret_sources: { username: creds.sources.username, password: creds.sources.password },
      }, 503);
    }

    // 90-day cache check (skips the SOAP call + TAXISnet notification)
    if (body.company_id) {
      const { data: cached } = await admin
        .from('crm_companies')
        .select('aade_data, aade_data_at, vat_number')
        .eq('id', body.company_id)
        .maybeSingle();
      const sameAfm = cached?.vat_number && cached.vat_number.replace(/[^0-9]/g, '').endsWith(rawAfm);
      const fresh = cached?.aade_data_at && (Date.now() - new Date(cached.aade_data_at).getTime() < CACHE_FRESH_MS);
      if (sameAfm && fresh && cached!.aade_data) {
        return jsonResponse({
          ok: true,
          source: 'cache',
          checked_at: cached!.aade_data_at,
          ...cached!.aade_data as Record<string, unknown>,
        });
      }
    }

    // SOAP call
    const envelope = buildSoapEnvelope(
      { username: creds.username, password: creds.password },
      buildRgWsPublic2Body(creds.afmCalledBy, rawAfm),
    );
    const { ok: httpOk, xml, httpStatus, err: networkErr } = await postSoap(AADE_ENDPOINT, envelope);

    if (networkErr) {
      return jsonResponse({
        error: 'aade_unreachable',
        message: `ΑΑΔΕ web-service unreachable: ${networkErr}`,
        source: 'aade',
        checked_at: new Date().toISOString(),
      }, 503);
    }

    const aadeError = summarizeAadeError(xml);
    if (!httpOk || aadeError) {
      // Surface the real ΑΑΔΕ message to Supabase logs so future failures don't
      // require digging into the response body to diagnose.
      console.error('[myaade-rgwspublic2] ΑΑΔΕ rejected lookup:', {
        http_status: httpStatus,
        aade_code: aadeError?.code,
        aade_message: aadeError?.message,
        creds_source: creds.sources,
        // First 800 chars of the raw response so we can spot envelope/parse issues too
        xml_head: xml.slice(0, 800),
      });
      return jsonResponse({
        error: 'aade_error',
        message: aadeError?.message ?? `ΑΑΔΕ responded with HTTP ${httpStatus}.`,
        code: aadeError?.code ?? null,
        http_status: httpStatus,
        source: 'aade',
        checked_at: new Date().toISOString(),
      }, httpStatus >= 400 ? httpStatus : 400);
    }

    const basicRec = parseBasicRec(xml);
    const activities = parseActivities(xml);

    if (!basicRec) {
      return jsonResponse({
        error: 'aade_empty',
        message: 'ΑΑΔΕ returned no basic record — the ΑΦΜ may not exist.',
        source: 'aade',
        checked_at: new Date().toISOString(),
      }, 404);
    }

    const result = {
      ok: true,
      source: 'aade' as const,
      checked_at: new Date().toISOString(),
      valid_afm: basicRec.deactivation_flag === '1',
      basic_rec: basicRec,
      activities,
      secret_sources: creds.sources,
    };

    // Cache + mirror into structured columns. Only when caller is the company owner OR admin.
    if (body.company_id) {
      const { data: company } = await admin
        .from('crm_companies')
        .select('id, created_by')
        .eq('id', body.company_id)
        .maybeSingle();

      if (company) {
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
          const primaryAct = activities.find((a) => a.kind === 1) ?? activities[0] ?? null;
          const secondaryActs = activities.filter((a) => a.kind !== 1);

          let businessStartDate: string | null = null;
          if (basicRec.regist_date) {
            const m = basicRec.regist_date.match(/^(\d{4}-\d{2}-\d{2})/);
            if (m) businessStartDate = m[1];
          }

          await admin.from('crm_companies').update({
            commercial_title: basicRec.commer_title,
            legal_status: basicRec.legal_status_descr,
            kad_primary: primaryAct?.code ?? null,
            kad_primary_description: primaryAct?.description ?? null,
            kad_secondary: secondaryActs.length > 0 ? secondaryActs : null,
            business_start_date: businessStartDate,
            tax_office: basicRec.doy_descr ?? null,
            aade_data: { basic_rec: basicRec, activities },
            aade_data_at: result.checked_at,
            // ΑΑΔΕ active-flag is authoritative for Greek businesses — also fill the VIES-style columns
            vat_validated: basicRec.deactivation_flag === '1' ? true : (basicRec.deactivation_flag === '2' ? false : null),
            vat_validated_at: result.checked_at,
            vat_validated_name: basicRec.onomasia,
            vat_validated_address: basicRec.postal_address
              ? `${basicRec.postal_address} ${basicRec.postal_address_no ?? ''} ${basicRec.postal_zip_code ?? ''} ${basicRec.postal_area_description ?? ''}`.replace(/\s+/g, ' ').trim()
              : null,
            vat_validation_source: 'aade',
            updated_at: new Date().toISOString(),
          }).eq('id', body.company_id);
        }
      }
    }

    return jsonResponse(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('[myaade-rgwspublic2] error:', err);
    return jsonResponse({ error: 'internal_error', detail }, 500);
  }
}));
