import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { fromSkroutz, skroutzFetch } from '../_shared/commerce/skroutz.ts';
import type { AdapterConnection } from '../_shared/commerce/adapters.ts';

type Row = Record<string, unknown>;

const ACTIONS = ['pull', 'accept', 'reject', 'set_as_ready', 'upload_document'] as const;
type Action = (typeof ACTIONS)[number];

Deno.serve(withApiLogging('store-skroutz-orders', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? 'pull') as Action;
  const connectionId = String(body?.connection_id ?? '');
  if (!connectionId) throw new HttpError(400, 'connection_id is required');
  if (!ACTIONS.includes(action)) throw new HttpError(400, `unknown action: ${action}`);

  const auth = await authenticate(req, { requireUser: true });
  const userId = getUserId(auth);
  if (!userId) throw new HttpError(401, 'Sign in first');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: conn } = await admin.from('store_connections')
    .select('id, workspace_id, platform, credentials, enabled')
    .eq('id', connectionId).maybeSingle();
  if (!conn || conn.platform !== 'skroutz') throw new HttpError(404, 'Not found');
  if (!await userCanAccessWorkspace(admin, userId, conn.workspace_id)) throw new HttpError(404, 'Not found');

  const token = ((conn.credentials ?? {}) as Record<string, string>).api_token;
  if (!token) throw new HttpError(400, 'This connection has no Skroutz API token.');

  const log = (outcome: string, message: string, extra: Row = {}) => admin
    .from('store_order_sync_log').insert({
      workspace_id: conn.workspace_id, connection_id: conn.id, platform: 'skroutz',
      event_type: action, outcome, message, ...extra,
    } as Row);

  if (action === 'pull') {
    const res = await skroutzFetch({ token, path: '/merchants/ecommerce/orders?state=open&per=50' });
    if (!res.ok) {
      await log('error', `Skroutz refused the pull: ${res.status}`);
      throw new HttpError(502, `Skroutz refused the pull: ${res.status} ${await res.text()}`);
    }
    const payload = await res.json();
    const orders: Row[] = payload?.orders ?? [];
    let created = 0; let duplicate = 0; let review = 0; let failed = 0;

    for (const raw of orders) {
      try {
        const canonical = fromSkroutz(raw, conn as unknown as AdapterConnection, 'pull');
        if (!canonical.external_order_id) { failed += 1; continue; }
        const { data, error } = await admin.rpc('upsert_inbound_order', {
          p_connection_id: conn.id, p_payload: canonical,
        });
        if (error) { failed += 1; continue; }
        const outcome = (data as Row)?.outcome;
        if (outcome === 'skipped_dupe') duplicate += 1;
        else if (outcome === 'needs_review') review += 1;
        else created += 1;
      } catch { failed += 1; }
    }

    await admin.from('store_connections')
      .update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('id', conn.id);
    return json({ ok: true, scanned: orders.length, created, duplicate, review, failed });
  }

  const code = String(body?.order_code ?? '');
  if (!code) throw new HttpError(400, 'order_code is required');

  if (action === 'accept' || action === 'reject' || action === 'set_as_ready') {
    const path = `/merchants/ecommerce/orders/${encodeURIComponent(code)}/${action}`;
    const res = await skroutzFetch({ token, path, method: 'POST', body: body?.payload ?? {} });
    const text = await res.text();
    if (!res.ok) {
      await log('error', `Skroutz refused ${action} on ${code}: ${res.status} ${text}`, { external_order_id: code });
      throw new HttpError(502, `Skroutz refused ${action}: ${res.status} ${text}`);
    }
    let state: string | null = null;
    try { state = JSON.parse(text)?.order?.state ?? null; } catch { }
    if (state) {
      await admin.from('store_orders').update({ external_state: state, synced_at: new Date().toISOString() })
        .eq('connection_id', conn.id).eq('external_order_id', code);
    }
    await log('updated', `${action} on ${code}${state ? ` — now ${state}` : ''}`, { external_order_id: code });
    return json({ ok: true, action, order_code: code, state });
  }

  const invoiceId = String(body?.invoice_id ?? '');
  if (!invoiceId) throw new HttpError(400, 'invoice_id is required');

  const { data: inv } = await admin.from('invoices')
    .select('id, workspace_id, status, internal_number, pdf_storage_path')
    .eq('id', invoiceId).maybeSingle();
  if (!inv || inv.workspace_id !== conn.workspace_id) throw new HttpError(404, 'Not found');
  if (String(inv.status ?? '') === 'draft') {
    throw new HttpError(409, 'That document has not been issued, so there is nothing to upload.');
  }
  if (!inv.pdf_storage_path) throw new HttpError(409, 'That document has not been rendered yet.');

  const { data: file, error: dlErr } = await admin.storage.from('pdf-documents').download(inv.pdf_storage_path);
  if (dlErr || !file) throw new HttpError(502, `Could not read the rendered document: ${dlErr?.message ?? 'missing'}`);
  if (file.size > 7 * 1024 * 1024) {
    throw new HttpError(413, 'Skroutz accepts a document up to 7MB and this one is larger.');
  }

  const form = new FormData();
  form.append('invoice', file, `${inv.internal_number ?? invoiceId}.pdf`);
  const res = await fetch(`https://api.skroutz.gr/merchants/ecommerce/orders/${encodeURIComponent(code)}/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.skroutz+json; version=3.0' },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    await log('error', `Skroutz refused the document for ${code}: ${res.status} ${text}`,
      { external_order_id: code, invoice_id: invoiceId });
    throw new HttpError(502, `Skroutz refused the document: ${res.status} ${text}`);
  }

  await log('updated', `Uploaded ${inv.internal_number ?? invoiceId} to Skroutz order ${code}.`,
    { external_order_id: code, invoice_id: invoiceId });
  return json({ ok: true, action, order_code: code, uploaded: inv.internal_number });
}));
