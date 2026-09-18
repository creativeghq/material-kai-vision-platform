// deno-lint-ignore-file no-explicit-any
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace, isPlatformOperator } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { novusBaseUrl } from '../_shared/fiscal/novus.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

// Novus Onboarding API v1.0. Spec: src/modules/myaade/NovusProvider/Onboarding API/.

const ACK_COLUMNS: Record<string, string> = {
  contract_delivered: 'ack_contract_delivered',
  contract_signed: 'ack_contract_signed',
  statement_accepted: 'ack_statement_accepted',
};

interface NovusCtx { baseUrl: string; apiKey: string; isSandbox: boolean }

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
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'API-KEY': ctx.apiKey,
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;
  const res = await fetch(`${ctx.baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

function novusError(status: number, body: any): string {
  const err = body?.error;
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
    const { status, body } = await novusCall(ctx, `/api/v1/requests/${row.novus_request_id}`);
    if (status !== 200 || !body?.success) {
      await supabase.from('workspace_einvoice_onboarding')
        .update({ sync_error: novusError(status, body), last_synced_at: new Date().toISOString() })
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
      const { status, body: b } = await novusCall(ctx, '/api/v1/webhooks');
      const secret = await resolveSecret(supabase, 'NOVUS_WEBHOOK_SECRET');
      if (status !== 200) throw new HttpError(502, novusError(status, b));
      return json({ success: true, endpoints: b?.data ?? [], secret_stored: !!secret.value, is_sandbox: ctx.isSandbox });
    }

    if (action === 'webhook_register') {
      const url = String(body.url ?? '');
      if (!url.startsWith('https://')) throw new HttpError(400, 'The webhook URL must be https.');
      const events = ['request.status_changed', 'request.provisioned', 'request.provisioning_failed', 'client.statement_recalled'];
      const { status, body: b } = await novusCall(ctx, '/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events }),
      });
      if (status !== 201 || !b?.success) throw new HttpError(502, novusError(status, b));
      // Returned exactly once — losing it means deleting the endpoint and registering again.
      const { error: secretErr } = await supabase.from('platform_secrets').upsert(
        [
          { key: 'NOVUS_WEBHOOK_SECRET', value: b.data.secret, description: 'HMAC secret for Novus onboarding webhooks (returned once at registration).' },
          { key: 'NOVUS_WEBHOOK_ENDPOINT_ID', value: b.data.endpointId, description: 'Novus webhook endpoint id, for deregistration.' },
        ],
        { onConflict: 'key' },
      );
      if (secretErr) throw new HttpError(500, `Registered at Novus but could not store the secret: ${secretErr.message}. Delete endpoint ${b.data.endpointId} and register again.`);
      return json({ success: true, endpointId: b.data.endpointId, events });
    }

    if (action === 'webhook_deliveries') {
      const { status, body: b } = await novusCall(ctx, '/api/v1/webhooks/deliveries?page=1&pageSize=50');
      if (status !== 200) throw new HttpError(502, novusError(status, b));
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

  const { data: canManage } = await (auth.supabaseAsUser ?? supabase)
    .rpc('is_workspace_finance_manager', { workspace_id: workspaceId });
  if (!canManage) throw new HttpError(403, 'Only a workspace finance manager can run e-invoicing onboarding.');

  if (action === 'save_application') {
    // Allowlisted: a request that could spread into `status` could claim its own approval.
    const patch = {
      workspace_id: workspaceId,
      administrator_full_name: body.administrator_full_name ?? null,
      administrator_vat: body.administrator_vat ?? null,
      transaction_types: Array.isArray(body.transaction_types) && body.transaction_types.length
        ? body.transaction_types.filter((t: string) => t === 'B2B' || t === 'B2C')
        : ['B2B'],
      isp_provider_name: body.isp_provider_name ?? null,
      isp_contract_number: body.isp_contract_number ?? null,
      isp_contract_date: body.isp_contract_date ?? null,
      contact_backup_phone: body.contact_backup_phone ?? null,
      created_by: row?.created_by ?? auth.userId,
    };
    if (row?.novus_request_id) throw new HttpError(409, 'This application has already been sent to Novus and cannot be edited here.');
    const { error } = await supabase.from('workspace_einvoice_onboarding')
      .upsert(patch, { onConflict: 'workspace_id' });
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

    const street = [fs.business_address, fs.business_street_number].filter(Boolean).join(' ').trim();
    const payload: Record<string, any> = {
      companyDetails: {
        legalName: fs.business_name,
        tradeName: fs.business_company_type || undefined,
        vatNumber: String(fs.business_vat).replace(/\D/g, ''),
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
        vatNumber: String(draft.administrator_vat).replace(/\D/g, ''),
      },
    };
    if (draft.transaction_types.includes('B2C')) {
      payload.ispDetails = {
        providerName: draft.isp_provider_name,
        contractNumber: draft.isp_contract_number,
        contractDate: draft.isp_contract_date,
      };
    }

    const ctx = await novusCtx(supabase);
    const { status, body: b } = await novusCall(ctx, '/api/v1/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Minted with the row, not here: a key per attempt is a second contract number per lost reply.
      idempotencyKey: draft.idempotency_key,
      body: JSON.stringify(payload),
    });
    if ((status !== 201 && status !== 200) || !b?.success) throw new HttpError(status === 409 ? 409 : 502, novusError(status, b));

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
    const res = await fetch(`${ctx.baseUrl}/api/v1/requests/${r.novus_request_id}/contract?kind=${kind}`, {
      headers: { 'API-KEY': ctx.apiKey },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new HttpError(res.status === 404 ? 404 : 502, `Could not fetch the contract: ${t.slice(0, 300)}`);
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
    const file = form?.get('contractFile');
    if (!(file instanceof File)) throw new HttpError(400, 'Attach the signed PDF as `contractFile`.');
    if (file.size > 15 * 1024 * 1024) throw new HttpError(413, 'The signed PDF must be 15 MB or smaller.');

    const ctx = await novusCtx(supabase);
    const out = new FormData();
    out.append('contractFile', file, file.name || 'signed.pdf');
    const { status, body: b } = await novusCall(ctx, `/api/v1/requests/${r.novus_request_id}/signed-contract`, {
      method: 'POST', body: out,
    });
    if (status !== 200 || !b?.success) throw new HttpError(status >= 400 && status < 500 ? status : 502, novusError(status, b));
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
    const { status, body: b } = await novusCall(ctx, `/api/v1/requests/${r.novus_request_id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: String(body.reason ?? '').slice(0, 500) || undefined }),
    });
    if (status !== 200 || !b?.success) throw new HttpError(status === 409 ? 409 : 502, novusError(status, b));
    const warning = await persist(supabase, r.id, b.data);
    return json({ success: true, warning, data: await ladder(supabase, workspaceId) });
  }

  throw new HttpError(400, `Unknown action "${action}".`);
}));
