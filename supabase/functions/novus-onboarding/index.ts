// deno-lint-ignore-file no-explicit-any
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace, isPlatformOperator } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { novusBaseUrl } from '../_shared/fiscal/novus.ts';
import { normalizeVat } from '../_shared/crm/vatNormalize.generated.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

// Novus Onboarding API v1.0. Spec: src/modules/myaade/NovusProvider/Onboarding API/.

const ACK_COLUMNS: Record<string, string> = {
  contract_delivered: 'ack_contract_delivered',
  contract_signed: 'ack_contract_signed',
  statement_accepted: 'ack_statement_accepted',
};

const WEBHOOK_EVENTS = [
  'request.status_changed', 'request.provisioned', 'request.provisioning_failed',
  'client.statement_recalled',
];

interface NovusCtx { baseUrl: string; apiKey: string; isSandbox: boolean }

function isValidGreekVat(v: string): boolean {
  if (!/^\d{9}$/.test(v) || /^(\d)\1{8}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(v[i]) * (1 << (8 - i));
  return (sum % 11) % 10 === Number(v[8]);
}

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
const isPhone = (v: string) => /^(\+\d{8,15}|\d{10})$/.test(v.replace(/[\s.-]/g, ''));

async function novusCtx(supabase: any): Promise<NovusCtx> {
  const [keyRes, sandboxRes, baseRes] = await Promise.all([
    resolveSecret(supabase, 'NOVUS_API_KEY'),
    resolveSecret(supabase, 'NOVUS_SANDBOX'),
    resolveSecret(supabase, 'NOVUS_API_BASE_URL'),
  ]);
  const isSandbox = (sandboxRes.value ?? 'true') !== 'false';
  const apiKey = keyRes.value ?? '';
  if (!apiKey) {
    throw new HttpError(503, 'The Novus master key is not configured — set NOVUS_API_KEY before onboarding anyone.');
  }
  return { baseUrl: baseRes.value || novusBaseUrl(isSandbox), apiKey, isSandbox };
}

async function novusCall(
  ctx: NovusCtx,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<{ status: number; body: any; retryAfter?: string }> {
  const headers: Record<string, string> = {
    'API-KEY': ctx.apiKey,
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${ctx.baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    const timedOut = (e as Error).name === 'TimeoutError';
    throw new HttpError(503, timedOut
      ? 'Novus did not answer within 30 seconds. Nothing was changed — try again shortly.'
      : `Could not reach Novus (${(e as Error).message}). Nothing was changed — try again shortly.`);
  }

  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body, retryAfter: res.headers.get('Retry-After') ?? undefined };
}

function novusError(status: number, body: any, retryAfter?: string): string {
  const err = body?.error;
  if (status === 429) {
    return `Novus is rate limiting us (60 calls/minute across the platform)${retryAfter ? ` — try again in ${retryAfter}s` : ''}.`;
  }
  const detail = Array.isArray(err?.details) && err.details.length
    ? ` (${err.details.map((d: any) => `${d.field}: ${d.message}`).join('; ')})`
    : '';
  const ctx = err?.context?.existingRequestId ? ` [request ${err.context.existingRequestId}]` : '';
  return `${err?.message ?? `Novus returned HTTP ${status}`}${detail}${ctx}`;
}

function mapRequest(data: any) {
  const c = data?.contract ?? null;
  const p = data?.provisioning ?? null;
  const a = data?.aadeStatement ?? null;
  return {
    novus_request_id: data?.requestId ?? null,
    request_type: data?.requestType ?? null,
    status: data?.status ?? null,
    message: data?.message ?? null,
    vat_number: data?.vatNumber ?? null,
    contract_number: c?.contractNumber ?? null,
    contract_date: c?.contractDate ?? null,
    contract_template_version: c?.templateVersion ?? null,
    contract_signed_version: c?.signedVersion ?? null,
    contract_sha256: c?.sha256 ?? null,
    provisioning_status: p?.status ?? null,
    provisioning_client_added: p?.clientAdded ?? null,
    provisioning_client_linked: p?.clientLinked ?? null,
    provisioning_contract_uploaded: p?.contractUploaded ?? null,
    provisioning_statement_sent: p?.statementSent ?? null,
    provisioning_error: p?.error ?? null,
    aade_statement_status: a?.status ?? null,
    aade_accept_date: a?.acceptDate ?? null,
    last_synced_at: new Date().toISOString(),
    sync_error: null,
  };
}

async function syncFromNovus(supabase: any, ctx: NovusCtx, row: any): Promise<void> {
  if (!row?.novus_request_id) return;
  try {
    const { status, body, retryAfter } = await novusCall(ctx, `/api/v1/requests/${row.novus_request_id}`);
    if (status !== 200 || !body?.success) {
      await supabase.from('workspace_einvoice_onboarding')
        .update({ sync_error: novusError(status, body, retryAfter), last_synced_at: new Date().toISOString() })
        .eq('id', row.id);
      return;
    }
    await supabase.from('workspace_einvoice_onboarding').update(mapRequest(body.data)).eq('id', row.id);
  } catch (e) {
    await supabase.from('workspace_einvoice_onboarding')
      .update({ sync_error: (e as Error).message, last_synced_at: new Date().toISOString() })
      .eq('id', row.id);
  }
}

// Novus has already acted, so a failed local write is a STALE COPY, not a failed action.
async function persist(supabase: any, rowId: string, data: any): Promise<string | undefined> {
  const { error } = await supabase.from('workspace_einvoice_onboarding').update(mapRequest(data)).eq('id', rowId);
  return error ? `Novus accepted this, but our copy did not save (${error.message}). Refresh to re-sync.` : undefined;
}

async function ladder(supabase: any, workspaceId: string) {
  const { data, error } = await supabase.rpc('get_einvoice_onboarding', { p_workspace_id: workspaceId });
  if (error) throw new HttpError(500, error.message);
  return data;
}

function requireRow(row: any) {
  if (!row) throw new HttpError(409, 'No onboarding has been started for this workspace yet.');
  return row;
}

function validateApplication(fs: any, draft: any): string[] {
  const bad: string[] = [];
  const companyVat = normalizeVat(fs?.business_vat) ?? '';
  const adminVat = normalizeVat(draft?.administrator_vat) ?? '';

  if (!isValidGreekVat(companyVat)) bad.push('Company VAT number is not a valid nine-digit ΑΦΜ');
  if (!isValidGreekVat(adminVat)) bad.push("Administrator's ΑΦΜ is not a valid nine-digit ΑΦΜ");
  if (!isEmail(String(fs?.business_email ?? ''))) bad.push('Business email is not a valid address');
  if (!isPhone(String(fs?.business_phone ?? ''))) bad.push('Business phone must be +30… or a 10-digit Greek number');
  if (draft?.contact_backup_phone && !isPhone(String(draft.contact_backup_phone))) {
    bad.push('Backup phone must be +30… or a 10-digit Greek number');
  }

  const types: string[] = Array.isArray(draft?.transaction_types) ? draft.transaction_types : [];
  if (!types.length) bad.push('Pick at least one of B2B or B2C');
  if (types.some((t) => t !== 'B2B' && t !== 'B2C')) bad.push('Only B2B and B2C can be declared — B2G is a separate registration');

  if (types.includes('B2C')) {
    if (!String(draft?.isp_provider_name ?? '').trim()) bad.push('ISP provider is required for B2C');
    if (!String(draft?.isp_contract_number ?? '').trim()) bad.push('ISP contract number is required for B2C');
    const d = draft?.isp_contract_date;
    if (!d) bad.push('ISP contract date is required for B2C');
    else if (String(d) > new Date().toISOString().slice(0, 10)) bad.push('ISP contract date cannot be in the future');
  }
  return bad;
}

Deno.serve(withApiLogging('novus-onboarding', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, auth.error ?? 'Sign in to continue.');
  const supabase = auth.supabase;

  const contentType = req.headers.get('content-type') ?? '';
  const isUpload = contentType.includes('multipart/form-data');

  let action: string;
  let body: Record<string, any> = {};
  let form: FormData | null = null;
  if (isUpload) {
    form = await req.formData();
    action = String(form.get('action') ?? 'upload_signed');
    body = { workspace_id: form.get('workspace_id') };
  } else {
    body = await req.json().catch(() => ({}));
    action = String(body.action ?? '');
  }

  if (action.startsWith('webhook_')) {
    if (!(await isPlatformOperator(supabase, auth.userId))) throw new HttpError(404, 'Not found.');
    const ctx = await novusCtx(supabase);

    if (action === 'webhook_status') {
      const { status, body: b, retryAfter } = await novusCall(ctx, '/api/v1/webhooks');
      if (status !== 200) throw new HttpError(502, novusError(status, b, retryAfter));
      const [secret, endpointId] = await Promise.all([
        resolveSecret(supabase, 'NOVUS_WEBHOOK_SECRET'),
        resolveSecret(supabase, 'NOVUS_WEBHOOK_ENDPOINT_ID'),
      ]);
      return json({
        success: true, endpoints: b?.data ?? [], is_sandbox: ctx.isSandbox,
        secret_stored: !!secret.value, endpoint_id: endpointId.value || null,
      });
    }

    if (action === 'webhook_register') {
      const url = String(body.url ?? '');
      if (!url.startsWith('https://')) throw new HttpError(400, 'The webhook URL must be https.');
      const { status, body: b, retryAfter } = await novusCall(ctx, '/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events: WEBHOOK_EVENTS }),
      });
      if (status !== 201 || !b?.success) throw new HttpError(502, novusError(status, b, retryAfter));
      // Returned exactly once — losing it means deleting the endpoint and registering again.
      const { error: secretErr } = await supabase.from('platform_secrets').upsert(
        [
          { key: 'NOVUS_WEBHOOK_SECRET', value: b.data.secret, description: 'HMAC secret for Novus onboarding webhooks (returned once at registration).' },
          { key: 'NOVUS_WEBHOOK_ENDPOINT_ID', value: b.data.endpointId, description: 'Novus webhook endpoint id, for deregistration.' },
        ],
        { onConflict: 'key' },
      );
      if (secretErr) throw new HttpError(500, `Registered at Novus but could not store the secret: ${secretErr.message}. Delete endpoint ${b.data.endpointId} and register again.`);
      return json({ success: true, endpointId: b.data.endpointId, events: WEBHOOK_EVENTS });
    }

    if (action === 'webhook_delete') {
      const stored = await resolveSecret(supabase, 'NOVUS_WEBHOOK_ENDPOINT_ID');
      const endpointId = String(body.endpoint_id || stored.value || '');
      if (!endpointId) throw new HttpError(409, 'No webhook endpoint is registered.');
      const { status, body: b, retryAfter } = await novusCall(ctx, `/api/v1/webhooks/${endpointId}`, { method: 'DELETE' });
      if (status !== 204 && status !== 200 && status !== 404) throw new HttpError(502, novusError(status, b, retryAfter));
      const { error: clearErr } = await supabase.from('platform_secrets').upsert(
        [{ key: 'NOVUS_WEBHOOK_SECRET', value: '' }, { key: 'NOVUS_WEBHOOK_ENDPOINT_ID', value: '' }],
        { onConflict: 'key' },
      );
      if (clearErr) throw new HttpError(500, `Endpoint ${endpointId} was deleted at Novus but the stored secret did not clear (${clearErr.message}). Clear NOVUS_WEBHOOK_SECRET by hand.`);
      return json({ success: true, deleted: endpointId });
    }

    if (action === 'webhook_deliveries') {
      const { status, body: b, retryAfter } = await novusCall(ctx, '/api/v1/webhooks/deliveries?page=1&pageSize=50');
      if (status !== 200) throw new HttpError(502, novusError(status, b, retryAfter));
      return json({ success: true, ...(b?.data ?? {}) });
    }
    throw new HttpError(400, `Unknown webhook action "${action}".`);
  }

  const workspaceId = String(body.workspace_id ?? '');
  if (!workspaceId) throw new HttpError(400, 'workspace_id is required.');
  if (!(await userCanAccessWorkspace(supabase, auth.userId, workspaceId))) throw new HttpError(404, 'Not found.');

  const { data: row } = await supabase
    .from('workspace_einvoice_onboarding').select('*').eq('workspace_id', workspaceId).maybeSingle();

  if (action === 'status') {
    if (row?.novus_request_id) await syncFromNovus(supabase, await novusCtx(supabase), row);
    return json({ success: true, data: await ladder(supabase, workspaceId) });
  }

  if (action === 'history') {
    const r = requireRow(row);
    if (!r.novus_request_id) return json({ success: true, history: [] });
    const ctx = await novusCtx(supabase);
    const { status, body: b, retryAfter } = await novusCall(ctx, `/api/v1/requests/${r.novus_request_id}/history`);
    if (status !== 200 || !b?.success) {
      throw new HttpError(status === 404 || status === 429 ? status : 502, novusError(status, b, retryAfter));
    }
    return json({ success: true, history: b.data ?? [] });
  }

  const { data: canManage } = await (auth.supabaseAsUser ?? supabase)
    .rpc('is_workspace_finance_manager', { workspace_id: workspaceId });
  if (!canManage) throw new HttpError(403, 'Only a workspace finance manager can run e-invoicing onboarding.');

  if (action === 'save_application') {
    if (row?.novus_request_id) throw new HttpError(409, 'This application has already been sent to Novus and cannot be edited here.');
    const types = (Array.isArray(body.transaction_types) ? body.transaction_types : [])
      .filter((t: string) => t === 'B2B' || t === 'B2C');
    if (!types.length) throw new HttpError(422, 'Pick at least one of B2B or B2C.');
    // Allowlisted: a request that could spread into `status` could claim its own approval.
    const { error } = await supabase.from('workspace_einvoice_onboarding').upsert({
      workspace_id: workspaceId,
      administrator_full_name: body.administrator_full_name ?? null,
      administrator_vat: normalizeVat(body.administrator_vat) ?? null,
      transaction_types: types,
      isp_provider_name: body.isp_provider_name ?? null,
      isp_contract_number: body.isp_contract_number ?? null,
      isp_contract_date: body.isp_contract_date || null,
      contact_backup_phone: body.contact_backup_phone ?? null,
      created_by: row?.created_by ?? auth.userId,
    }, { onConflict: 'workspace_id' });
    if (error) throw new HttpError(500, error.message);
    return json({ success: true, data: await ladder(supabase, workspaceId) });
  }

  if (action === 'create') {
    if (row?.novus_request_id) {
      await syncFromNovus(supabase, await novusCtx(supabase), row);
      return json({ success: true, data: await ladder(supabase, workspaceId) });
    }
    const draft = requireRow(row);
    const check = await ladder(supabase, workspaceId);
    const missing: string[] = check?.prerequisites_missing ?? [];
    if (missing.length) throw new HttpError(422, `Still missing: ${missing.join(', ')}.`);

    const { data: fs } = await supabase.from('finance_settings')
      .select('business_name, business_vat, business_tax_office, business_address, business_street_number, business_city, business_postal_code, business_email, business_phone, business_company_type')
      .eq('workspace_id', workspaceId).maybeSingle();
    if (!fs) throw new HttpError(422, 'This workspace has no business identity yet.');

    const invalid = validateApplication(fs, draft);
    if (invalid.length) throw new HttpError(422, `${invalid.join('; ')}.`);

    const street = [fs.business_address, fs.business_street_number].filter(Boolean).join(' ').trim();
    const payload: Record<string, any> = {
      companyDetails: {
        legalName: fs.business_name,
        tradeName: fs.business_company_type || undefined,
        vatNumber: normalizeVat(fs.business_vat),
        taxOffice: fs.business_tax_office,
        transactionTypes: draft.transaction_types,
      },
      address: { city: fs.business_city, streetAddress: street, postalCode: fs.business_postal_code },
      contactInfo: {
        email: fs.business_email,
        phone: fs.business_phone,
        backupPhone: draft.contact_backup_phone || undefined,
      },
      administrator: {
        fullName: draft.administrator_full_name,
        vatNumber: normalizeVat(draft.administrator_vat),
      },
    };
    if (draft.transaction_types.includes('B2C')) {
      payload.ispDetails = {
        providerName: draft.isp_provider_name,
        contractNumber: draft.isp_contract_number,
        contractDate: draft.isp_contract_date,
      };
    }

    if (!draft.idempotency_key) {
      throw new HttpError(500, 'This application has no idempotency key — refusing to send, because a retry could create a second contract.');
    }
    const ctx = await novusCtx(supabase);
    const { status, body: b, retryAfter } = await novusCall(ctx, '/api/v1/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Minted with the row, not here: a key per attempt is a second contract number per lost reply.
      idempotencyKey: draft.idempotency_key,
      body: JSON.stringify(payload),
    });

    if (status === 409 && b?.error?.code === 'DUPLICATE_OPEN_REQUEST' && b?.error?.context?.existingRequestId) {
      const adoptedId = String(b.error.context.existingRequestId);
      const { error: adoptErr } = await supabase.from('workspace_einvoice_onboarding')
        .update({ novus_request_id: adoptedId, is_sandbox: ctx.isSandbox }).eq('id', draft.id);
      if (adoptErr) throw new HttpError(500, `Novus already holds request ${adoptedId} for this ΑΦΜ and we could not record it (${adoptErr.message}).`);
      await syncFromNovus(supabase, ctx, { ...draft, novus_request_id: adoptedId });
      return json({ success: true, data: await ladder(supabase, workspaceId) });
    }
    if ((status !== 201 && status !== 200) || !b?.success) {
      throw new HttpError(
        status === 409 || status === 422 || status === 429 ? status : 502,
        novusError(status, b, retryAfter),
      );
    }

    const { error } = await supabase.from('workspace_einvoice_onboarding')
      .update({ ...mapRequest(b.data), is_sandbox: ctx.isSandbox }).eq('id', draft.id);
    // The contract exists at Novus whatever happens here — re-sending would mint a second.
    if (error) throw new HttpError(500, `Novus created request ${b.data?.requestId} but we could not store it (${error.message}). Do not re-send — contact support with that id.`);
    return json({ success: true, data: await ladder(supabase, workspaceId) });
  }

  if (action === 'contract') {
    const r = requireRow(row);
    if (!r.novus_request_id) throw new HttpError(409, 'Nothing has been sent to Novus yet.');
    if (r.request_type === 'LINK_EXISTING') throw new HttpError(409, 'A linked VAT has no contract to sign.');
    const ctx = await novusCtx(supabase);
    const kind = body.kind === 'signed' ? 'signed' : 'unsigned';
    const wanted = Number(body.version);
    const version = Number.isInteger(wanted) && wanted > 0 ? `&version=${wanted}` : '';
    let res: Response;
    try {
      res = await fetch(`${ctx.baseUrl}/api/v1/requests/${r.novus_request_id}/contract?kind=${kind}${version}`, {
        headers: { 'API-KEY': ctx.apiKey }, signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new HttpError(503, `Could not reach Novus to fetch the contract (${(e as Error).message}).`);
    }
    if (!res.ok) {
      const t = await res.text();
      throw new HttpError(
        res.status === 404 || res.status === 409 ? res.status : 502,
        `Could not fetch the contract: ${t.slice(0, 300)}`,
      );
    }
    // Proxied, not stored: the download needs our master key, so Novus's own URL is unforwardable.
    return new Response(await res.arrayBuffer(), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="novus-contract-${r.contract_number ?? r.novus_request_id}.pdf"`,
      },
    });
  }

  if (action === 'upload_signed') {
    const r = requireRow(row);
    if (!r.novus_request_id) throw new HttpError(409, 'Nothing has been sent to Novus yet.');
    if (r.request_type === 'LINK_EXISTING') throw new HttpError(409, 'A linked VAT has no contract to sign.');
    const file = form?.get('contractFile');
    if (!(file instanceof File)) throw new HttpError(400, 'Attach the signed PDF as `contractFile`.');
    if (file.size === 0) throw new HttpError(400, 'That file is empty.');
    if (file.size > 15 * 1024 * 1024) throw new HttpError(413, 'The signed PDF must be 15 MB or smaller.');

    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== '%PDF-') {
      throw new HttpError(415, 'That file is not a PDF — Novus checks the contents, not the name.');
    }

    const ctx = await novusCtx(supabase);
    const out = new FormData();
    out.append('contractFile', file, file.name || 'signed.pdf');
    const { status, body: b, retryAfter } = await novusCall(ctx, `/api/v1/requests/${r.novus_request_id}/signed-contract`, {
      method: 'POST', body: out,
    });
    if (status !== 200 || !b?.success) {
      throw new HttpError(status >= 400 && status < 500 ? status : 502, novusError(status, b, retryAfter));
    }
    const warning = await persist(supabase, r.id, b.data);
    return json({ success: true, warning, data: await ladder(supabase, workspaceId) });
  }

  if (action === 'acknowledge') {
    const r = requireRow(row);
    const col = ACK_COLUMNS[String(body.step ?? '')];
    if (!col) throw new HttpError(400, `"${body.step}" is not a step anybody can acknowledge.`);
    const patch = body.undo
      ? { [`${col}_at`]: null, [`${col}_by`]: null }
      : { [`${col}_at`]: new Date().toISOString(), [`${col}_by`]: auth.userId };
    const { error } = await supabase.from('workspace_einvoice_onboarding').update(patch).eq('id', r.id);
    if (error) throw new HttpError(500, error.message);
    if (r.novus_request_id) await syncFromNovus(supabase, await novusCtx(supabase), r);
    return json({ success: true, data: await ladder(supabase, workspaceId) });
  }

  if (action === 'cancel') {
    const r = requireRow(row);
    if (!r.novus_request_id) {
      const { error } = await supabase.from('workspace_einvoice_onboarding').delete().eq('id', r.id);
      if (error) throw new HttpError(500, error.message);
      return json({ success: true, data: await ladder(supabase, workspaceId) });
    }
    const ctx = await novusCtx(supabase);
    const { status, body: b, retryAfter } = await novusCall(ctx, `/api/v1/requests/${r.novus_request_id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: String(body.reason ?? '').slice(0, 500) || undefined }),
    });
    if (status !== 200 || !b?.success) {
      throw new HttpError(status === 409 || status === 404 || status === 429 ? status : 502, novusError(status, b, retryAfter));
    }
    const warning = await persist(supabase, r.id, b.data);
    return json({ success: true, warning, data: await ladder(supabase, workspaceId) });
  }

  throw new HttpError(400, `Unknown action "${action}".`);
}));
