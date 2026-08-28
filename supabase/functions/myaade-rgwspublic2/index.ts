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
import { mergeKad } from '../_shared/kad.ts';
import {
  resolveAadeCredentials,
  buildSoapEnvelope,
  postSoap,
  pickTag,
  pickAllTagBlocks,
  summarizeAadeError,
} from '../_shared/aade/soap.ts';
// The envelope + basic_rec parse are shared with the inbound issuer-name resolver, which asks
// ΑΑΔΕ the same question about suppliers ΓΕΜΗ has never heard of.
import {
  RGWSPUBLIC2_ENDPOINT,
  buildRgWsPublic2Body,
  parseBasicRec,
  type BasicRec,
} from '../_shared/aade/rgwspublic2.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
// Generated mirror of src/services/crm/vatNormalize.ts — the receipt key must match crm_vat_norm.
import { normalizeVat as vatReceiptKey } from '../_shared/crm/vatNormalize.generated.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

const AADE_ENDPOINT = RGWSPUBLIC2_ENDPOINT;
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  db: DbClient,
  basicRec: BasicRec,
  primaryActivityDescr: string | null,
  // Who this translation is billed to. The caller resolves the workspace by VERIFYING the
  // body-supplied id against membership rather than passing it through — the debit already
  // falls back to the personal wallet for a non-member, so stamping the claimed workspace on
  // the usage row would credit a tenant that did not pay (CLAUDE.md invariant 1).
  billedTo: { userId?: string; workspaceId?: string } = {},
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
        userId: billedTo.userId,
        workspaceId: billedTo.workspaceId,
        systemPrompt: await loadPrompt(db, 'tool', 'aade_field_translation'),
      },
    );
    return output as BasicRecEn;
  } catch (err) {
    console.error('[myaade-rgwspublic2] translation failed (keeping Greek only):', err);
    return null;
  }
}

/** Operation-specific SOAP body for rgWsPublic2AfmMethod. */
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

    // H8/C10: the live lookup runs on the target workspace's regulated
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

    // #356 `RE-4` generalised. `company_id` is a body-supplied FK into crm_companies. Resolved
    // ONCE here, against the workspace this request already proved the caller belongs to, so the
    // audit row can never name another tenant's company. A foreign id is dropped rather than
    // rejected: this is a best-effort audit log and refusing the whole lookup over a bad
    // provenance field would be the worse trade.
    const { data: coRow } = body.company_id
      ? await admin.from('crm_companies').select('id')
          .eq('id', String(body.company_id)).eq('workspace_id', body.workspace_id ?? '').maybeSingle()
      : { data: null };
    const safeCompanyId = (coRow as { id?: string } | null)?.id ?? null;

    // Best-effort internal audit. AADE notifies the looked-up ΑΦΜ's TAXISnet inbox on every
    // live ('aade') call — this is OUR record of who/when/why/which VAT. Never blocks the response.
    const logLookup = async (source: 'aade' | 'cache', validAfm: boolean | null) => {
      try {
        await admin.from('aade_lookup_log').insert({
          looked_up_afm: rawAfm,
        // #356 `RE-4` generalised: `company_id` is a body-supplied FK into crm_companies,
        // stored on an audit row that is later joined for display. The workspace is verified
        // above; the company was not, so an audit entry could name another tenant's company.
          company_id: safeCompanyId,
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

    /**
     * RECORD THAT *WE* VERIFIED IT (#353 CRM-7).
     *
     * `crm_companies.vat_validated` is a trust assertion on a record that feeds invoicing, and it
     * sat in the crm-api write allowlist — so any CRM-capable caller could mark a number verified
     * having done no lookup at all. It could not simply be dropped: the real flow is this
     * server-side lookup followed by a client save.
     *
     * The receipt is the missing link. Written only when ΑΑΔΕ actually answered with an ACTIVE
     * business (`deactivation_flag === '1'`), so a save cannot stamp "verified" for a number ΑΑΔΕ
     * reported as deactivated. Keyed on the normalised number (#353 CRM-4) so `EL800370260` and
     * `800 370 260` are one receipt. The workspace is already verified above by
     * `is_workspace_finance_manager`.
     */
    if (body.workspace_id && basicRec.deactivation_flag === '1') {
      const { error: receiptErr } = await admin.from('vat_validation_receipts').upsert({
        workspace_id: body.workspace_id,
        vat_norm: vatReceiptKey(rawAfm) ?? rawAfm,
        source: 'aade',
        validated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,vat_norm' });
      // Logged, never swallowed: a lost receipt presents as "verification never sticks", which
      // is unactionable without this line.
      if (receiptErr) console.error('[myaade-rgwspublic2] could not record validation receipt:', receiptErr.message);
    }

    // English translation for bilingual forms (own-business prefill opts in via translate=true).
    let basicRecEn: BasicRecEn | null = null;
    if (body.translate) {
      const primaryActDescr = (activities.find((a) => a.kind === 1) ?? activities[0] ?? null)?.description ?? null;
      // ── Credit metering: the SOAP lookup is free; the Haiku translation is
      // paid. Debit before it; refund if the translation call fails.
      const AADE_TRANSLATE_CREDIT_COST = 1;
      const { data: dd, error: de } = await admin.rpc('debit_credits', {
        p_user_id: user.id,
        p_amount: AADE_TRANSLATE_CREDIT_COST,
        p_operation_type: 'aade_field_translation',
        p_description: 'ΑΑΔΕ field translation (Haiku)',
        p_metadata: { workspace_id: body.workspace_id ?? null, afm: rawAfm },
        p_workspace_id: body.workspace_id ?? null,
      });
      const drow = Array.isArray(dd) ? dd[0] : dd;
      if (!de && drow?.success) {
        // Attribute to the workspace only when this caller is genuinely a member of it. The
        // debit above already refuses to touch a stranger's pool; this keeps the usage row honest
        // in the other direction, where the pool silently fell back to personal credits.
        const claimedWs = body.workspace_id ?? null;
        const billedWs = await userCanAccessWorkspace(admin, user.id, claimedWs)
          ? claimedWs ?? undefined
          : undefined;
        basicRecEn = await translateBasicRec(admin, basicRec, primaryActDescr, {
          userId: user.id, workspaceId: billedWs,
        });
        if (!basicRecEn) {
          // Translation failed (returned null) → refund.
          try {
            await admin.rpc('refund_credits', {
              p_user_id: user.id,
              p_amount: AADE_TRANSLATE_CREDIT_COST,
              p_operation_type: 'aade_field_translation_refund',
              p_description: 'ΑΑΔΕ field translation refund (failed)',
              p_metadata: { workspace_id: body.workspace_id ?? null, afm: rawAfm },
              p_workspace_id: body.workspace_id ?? null,
            });
          } catch (e) { console.warn('[myaade-rgwspublic2] translation refund failed:', e); }
        }
      } else {
        console.warn('[myaade-rgwspublic2] skipping translation — credit debit failed:', drow?.error_message || de?.message);
      }
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

    // Cache + mirror into structured columns. The write-back gate MUST match the LOOKUP gate: the
    // caller is already a verified finance-manager of body.workspace_id (isLookupMgr, else we 403'd
    // above), and they just spent the TAXISnet quota + triggered the ΑΦΜ's audit notification. The old
    // gate (created_by === user OR GLOBAL role admin/super_admin/owner) was STRICTER than the lookup, so
    // a finance-role user or a workspace-admin member who didn't create the company passed the lookup but
    // the cache never persisted → the 90-day short-circuit could never fire → every repeat re-burned the
    // quota and re-notified the third party. Now: persist whenever the company belongs to the authorized
    // workspace.
    if (body.company_id) {
      const { data: company } = await admin
        .from('crm_companies')
        .select('id, created_by, kad_all, workspace_id')
        .eq('id', body.company_id)
        .maybeSingle();

      if (company) {
        const canWrite = company.workspace_id === body.workspace_id;
        if (canWrite) {
          const primaryAct = activities.find((a) => a.kind === 1) ?? activities[0] ?? null;
          const secondaryActs = activities.filter((a) => a.kind !== 1);
          // Normalized queryable ΚΑΔ (merged with any ΓΕΜΗ entries already on the row).
          const { kad_all, kad_codes } = mergeKad(
            company.kad_all,
            'aade',
            activities.map((a) => ({ code: a.code, description: a.description, primary: a.kind === 1 })),
          );

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
            kad_all,
            kad_codes,
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
