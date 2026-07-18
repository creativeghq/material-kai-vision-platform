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
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

const AADE_ENDPOINT = 'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2';
const CACHE_FRESH_MS = 90 * 24 * 3600 * 1000;

interface LookupBody {
  afm: string;
  company_id?: string;
  /** Why this lookup was made — audited because every live call notifies the looked-up ΑΦΜ. */
  reason?: 'own_business' | 'crm_enrichment' | 'invoice_counterparty' | string;
  workspace_id?: string;
  /** 'creds-status' → report the EFFECTIVE codes (workspace row, else operator root default).
   *  'verify-reseller-application' → operator vets a reseller applicant's ΑΦΜ (see below). */
  action?: 'creds-status' | 'verify-reseller-application' | string;
  /** For action='verify-reseller-application': the reseller_applications row to check. */
  application_id?: string;
  /** When true, also return an English translation of the Greek descriptive fields
   *  (name / activity / tax office / street / city) as `basic_rec_en`, so a bilingual
   *  form can fill BOTH language slots from one lookup. Off by default — only the
   *  own-business prefill opts in, so CRM/reseller lookups stay LLM-free. */
  translate?: boolean;
}

/** English translation of the Greek descriptive fields ΑΑΔΕ returns. */
interface BasicRecEn {
  onomasia: string | null;
  commer_title: string | null;
  doy_descr: string | null;
  postal_address: string | null;
  postal_area_description: string | null;
  primary_activity_descr: string | null;
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

/**
 * Translate the Greek descriptive fields to English via Claude Haiku so a bilingual
 * form can fill both slots. Company/street/city are transliterated to Latin script when
 * no established English form exists; tax office + activity are real translations.
 * Best-effort: any failure returns null and the caller just keeps the Greek slots.
 */
async function translateBasicRec(
  basicRec: BasicRec,
  primaryActivityDescr: string | null,
): Promise<BasicRecEn | null> {
  const src = {
    onomasia: basicRec.onomasia,
    commer_title: basicRec.commer_title,
    doy_descr: basicRec.doy_descr,
    postal_address: basicRec.postal_address,
    postal_area_description: basicRec.postal_area_description,
    primary_activity_descr: primaryActivityDescr,
  };
  // Nothing to translate.
  if (!Object.values(src).some((v) => v && v.trim())) return null;

  const schema = z.object({
    onomasia: z.string().nullable(),
    commer_title: z.string().nullable(),
    doy_descr: z.string().nullable(),
    postal_address: z.string().nullable(),
    postal_area_description: z.string().nullable(),
    primary_activity_descr: z.string().nullable(),
  });

  try {
    const { output } = await generateStructuredWithClaude(
      `Convert these Greek business-registry fields to Latin script for an English-language
invoice. Rules per field:
- onomasia, commer_title, postal_address (street), postal_area_description (city), doy_descr
  (tax office): TRANSLITERATE only — Greek letters → Latin letters, keep the same words and
  order. Do NOT translate descriptor words or expand abbreviations. Examples:
  "Δ Θεσσαλονικης" → "D Thessalonikis" (NOT "Tax Office of Thessaloniki");
  "ΑΚΜΕ ΠΛΑΚΙΔΙΑ Α.Ε." → "AKME PLAKIDIA A.E."; "Ερμού" → "Ermou".
- primary_activity_descr: give a natural English TRANSLATION (this is a description, not a name).
Return null for any field whose input is null or empty. Do NOT add, guess, or invent anything.

${JSON.stringify(src, null, 2)}`,
      schema,
      {
        model: 'claude-haiku-4-5-20251001',
        temperature: 0,
        task: 'aade_field_translation',
        systemPrompt: 'You are a precise Greek→Latin transliterator for business-registry data (names/addresses transliterated verbatim, only activity descriptions translated). Output only the requested JSON.',
      },
    );
    return output as BasicRecEn;
  } catch (err) {
    console.error('[myaade-rgwspublic2] translation failed (keeping Greek only):', err);
    return null;
  }
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

    // ── creds-status: surface the EFFECTIVE ΑΑΔΕ codes for the Keys page ────────────
    // Reports whatever a real lookup would use — the workspace's own row, or (only for the
    // operator's root workspace) the platform env/secret default — WITHOUT ever returning the
    // password. Finance-manager gated, same as the get_aade_creds_status RPC.
    if (body.action === 'creds-status') {
      if (!body.workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
      const { data: isMgr } = await userClient.rpc('is_workspace_finance_manager', { p_workspace_id: body.workspace_id });
      if (!isMgr) return jsonResponse({ error: 'not authorized' }, 403);
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const creds = await resolveAadeCredentials(admin, body.workspace_id);
      const source = creds.sources.username === 'workspace'
        ? 'workspace'
        : (creds.username ? 'platform_default' : 'none');
      return jsonResponse({
        source,
        username: creds.username || null,
        afm_called_by: creds.afmCalledBy || null,
        has_password: !!creds.password,
      });
    }

    // ── verify-reseller-application: the OPERATOR vets a reseller applicant's ΑΦΜ ──────
    // Runs the RgWsPublic2 lookup under the operator's (root workspace) Special Access
    // Codes — the operator, not the applicant, consumes the TAXISnet quota and owns the
    // audit notification. Operator-admin gated. Writes the verdict onto the application so
    // approve_reseller_application() can require a passing check.
    if (body.action === 'verify-reseller-application') {
      const appId = body.application_id;
      if (!appId) return jsonResponse({ error: 'application_id required' }, 400);
      const { data: isOp } = await userClient.rpc('is_operator_admin');
      if (!isOp) return jsonResponse({ error: 'not authorized' }, 403);

      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: app } = await admin
        .from('reseller_applications')
        .select('id, vat_number, country_code, operator_workspace_id, status')
        .eq('id', appId)
        .maybeSingle();
      if (!app) return jsonResponse({ error: 'application_not_found' }, 404);
      if (!['pending', 'aade_failed', 'aade_verified'].includes(app.status)) {
        return jsonResponse({ error: 'already_decided', message: `Application is ${app.status}.` }, 409);
      }
      if ((app.country_code || 'EL').toUpperCase() !== 'EL') {
        return jsonResponse({ error: 'unsupported_country', message: 'ΑΑΔΕ verification supports Greek (EL) VAT numbers only.' }, 400);
      }
      const afm = (app.vat_number || '').replace(/[^0-9]/g, '');
      if (afm.length !== 9) {
        return jsonResponse({ error: 'invalid_afm', message: 'Greek ΑΦΜ must be exactly 9 digits.' }, 400);
      }

      const creds = await resolveAadeCredentials(admin, app.operator_workspace_id);
      if (!creds.username || !creds.password) {
        return jsonResponse({
          error: 'aade_not_configured',
          message: 'Operator ΑΑΔΕ Special Access Codes are not configured. Set them under the operator root workspace.',
        }, 503);
      }

      const envelope = buildSoapEnvelope(
        { username: creds.username, password: creds.password },
        buildRgWsPublic2Body(creds.afmCalledBy, afm),
      );
      const { ok: httpOk, xml, httpStatus, err: networkErr } = await postSoap(AADE_ENDPOINT, envelope);
      if (networkErr) {
        return jsonResponse({ error: 'aade_unreachable', message: `ΑΑΔΕ web-service unreachable: ${networkErr}` }, 503);
      }

      const aadeError = summarizeAadeError(xml);
      const basicRec = (!httpOk || aadeError) ? null : parseBasicRec(xml);
      const activities = basicRec ? parseActivities(xml) : [];
      // deactivation_flag '1' = active business, '2' = deactivated. Only an active business passes.
      const validAfm = !!basicRec && basicRec.deactivation_flag === '1';

      try {
        await admin.from('aade_lookup_log').insert({
          looked_up_afm: afm,
          workspace_id: app.operator_workspace_id,
          requested_by: user.id,
          reason: 'reseller_application',
          source: 'aade',
          valid_afm: basicRec ? validAfm : null,
        });
      } catch (logErr) {
        console.error('[myaade-rgwspublic2] reseller audit log insert failed:', logErr);
      }

      const snapshot = basicRec
        ? { basic_rec: basicRec, activities }
        : { error: aadeError?.message ?? `ΑΑΔΕ HTTP ${httpStatus}` };
      const newStatus = validAfm ? 'aade_verified' : 'aade_failed';

      await admin.from('reseller_applications').update({
        aade_valid: validAfm,
        aade_snapshot: snapshot,
        aade_checked_at: new Date().toISOString(),
        status: newStatus,
      }).eq('id', appId);

      return jsonResponse({
        ok: true,
        application_id: appId,
        status: newStatus,
        valid_afm: validAfm,
        basic_rec: basicRec,
        activities,
        aade_error: basicRec ? null : (aadeError?.message ?? `ΑΑΔΕ HTTP ${httpStatus}`),
      });
    }

    const rawAfm = (body.afm || '').replace(/[^0-9]/g, '');
    if (rawAfm.length !== 9) {
      return jsonResponse({ error: 'invalid_afm', message: 'Greek ΑΦΜ must be exactly 9 digits.' }, 400);
    }

    // Pentest #250 H8/C10: the live lookup runs on the target workspace's regulated
    // ΑΑΔΕ Special Access Codes — consuming that tenant's TAXISnet monthly quota and
    // firing the mandatory audit notification under their identity. Require the caller
    // to be a finance-manager of that workspace (mirror the creds-status gate) before
    // resolving its credentials — otherwise a user in workspace A could burn workspace
    // B's quota by passing {afm, workspace_id: B}.
    if (!body.workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
    const { data: isLookupMgr } = await userClient.rpc('is_workspace_finance_manager', { p_workspace_id: body.workspace_id });
    if (!isLookupMgr) return jsonResponse({ error: 'not authorized' }, 403);

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    // Per-workspace Special Access Codes — only the operator's root workspace falls back
    // to the env / platform_secrets default; every tenant uses its own codes.
    const creds = await resolveAadeCredentials(admin, body.workspace_id ?? null);

    // Best-effort internal audit. AADE notifies the looked-up ΑΦΜ's TAXISnet inbox on every
    // live ('aade') call — this is OUR record of who/when/why/which VAT. Never blocks the response.
    const logLookup = async (source: 'aade' | 'cache', validAfm: boolean | null) => {
      try {
        await admin.from('aade_lookup_log').insert({
          looked_up_afm: rawAfm,
          company_id: body.company_id ?? null,
          workspace_id: body.workspace_id ?? null,
          requested_by: user.id,
          reason: body.reason ?? null,
          source,
          valid_afm: validAfm,
        });
      } catch (logErr) {
        console.error('[myaade-rgwspublic2] audit log insert failed:', logErr);
      }
    };

    if (!creds.username || !creds.password) {
      return jsonResponse({
        error: 'aade_not_configured',
        message: 'ΑΑΔΕ Special Access Codes are not set for this workspace. Enter your TAXISnet username + password under Finance → Settings (myAADE credentials).',
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
        // deno-lint-ignore no-explicit-any
        const cachedFlag = (cached!.aade_data as any)?.basic_rec?.deactivation_flag;
        await logLookup('cache', cachedFlag === '1' ? true : (cachedFlag === '2' ? false : null));
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

    // From here a real SOAP call reached ΑΑΔΕ — the TAXISnet notification has fired regardless
    // of whether the record parsed cleanly, so the audit must record the attempt.
    const aadeError = summarizeAadeError(xml);
    if (!httpOk || aadeError) {
      await logLookup('aade', null);
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
      await logLookup('aade', null);
      return jsonResponse({
        error: 'aade_empty',
        message: 'ΑΑΔΕ returned no basic record — the ΑΦΜ may not exist.',
        source: 'aade',
        checked_at: new Date().toISOString(),
      }, 404);
    }

    // English translation for bilingual forms (own-business prefill opts in via translate=true).
    let basicRecEn: BasicRecEn | null = null;
    if (body.translate) {
      const primaryActDescr = (activities.find((a) => a.kind === 1) ?? activities[0] ?? null)?.description ?? null;
      basicRecEn = await translateBasicRec(basicRec, primaryActDescr);
    }

    const result = {
      ok: true,
      source: 'aade' as const,
      checked_at: new Date().toISOString(),
      valid_afm: basicRec.deactivation_flag === '1',
      basic_rec: basicRec,
      basic_rec_en: basicRecEn,
      activities,
      secret_sources: creds.sources,
    };

    await logLookup('aade', result.valid_afm);

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
