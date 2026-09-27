import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import {
  MYDATA_PRODUCTION_BASE, buildDeliveryRequest, deliveryRequestProblems, matchHistoryEvent,
  normalizeVat, parseDeliveryResponse, parseDeliveryStatus,
  type DeliveryEventForFiling, type DeliveryNoteForFiling,
} from '../_shared/fiscal/delivery-lifecycle.ts';

const CALL_TIMEOUT_MS = 45_000;
const RECONCILE_AFTER_MS = 2 * 60_000;

interface Creds { aade_user_id: string; subscription_key: string; base_url: string | null }

async function credentialsFor(service: any, workspaceId: string): Promise<Creds> {
  const { data } = await service
    .from('workspace_inbound_credentials')
    .select('aade_user_id, subscription_key, base_url, enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data?.enabled || !data.aade_user_id || !data.subscription_key) {
    throw new HttpError(400, 'Your ΑΑΔΕ myDATA credentials are not configured. Add your own user id and '
      + 'subscription key under Profile → Keys → myDATA Inbox. Lifecycle legs are filed under the '
      + 'business\'s own credentials, never the platform\'s.');
  }
  return data as Creds;
}

function aadeHeaders(creds: Creds): Record<string, string> {
  return {
    'aade-user-id': creds.aade_user_id,
    'Ocp-Apim-Subscription-Key': creds.subscription_key,
  };
}

const baseOf = (creds: Creds) => (creds.base_url || MYDATA_PRODUCTION_BASE).replace(/\/+$/, '');

async function loadNote(service: any, noteId: string) {
  const { data } = await service
    .from('delivery_notes')
    .select('id, workspace_id, fiscal_mark, fiscal_aade_qr_url, fiscal_cancellation_mark')
    .eq('id', noteId).maybeSingle();
  return data as (DeliveryNoteForFiling & { id: string; workspace_id: string; fiscal_cancellation_mark: string | null }) | null;
}

async function ourVatFor(service: any, workspaceId: string): Promise<string> {
  const { data } = await service
    .from('finance_settings').select('business_vat').eq('workspace_id', workspaceId).maybeSingle();
  return normalizeVat(data?.business_vat);
}

async function fetchStatus(creds: Creds, mark: string) {
  const res = await fetch(`${baseOf(creds)}/GetDeliveryNoteStatus?mark=${encodeURIComponent(mark)}`, {
    method: 'GET',
    headers: aadeHeaders(creds),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502,
      `AADE GetDeliveryNoteStatus answered HTTP ${res.status}: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}`);
  }
  return parseDeliveryStatus(text);
}

Deno.serve(withApiLogging('finance-mydata-delivery', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');
  const service = auth.supabase;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? '');

  let note: Awaited<ReturnType<typeof loadNote>> = null;
  let event: (DeliveryEventForFiling & Record<string, any>) | null = null;
  if (action === 'transmit') {
    const eventId = String(body?.event_id ?? '');
    if (!eventId) throw new HttpError(400, 'event_id is required');
    const { data } = await service.from('delivery_note_events').select('*').eq('id', eventId).maybeSingle();
    if (!data) throw new HttpError(404, 'not found');
    event = data;
    note = await loadNote(service, String(data.delivery_note_id));
  } else if (action === 'status' || action === 'reconcile') {
    const noteId = String(body?.delivery_note_id ?? '');
    if (!noteId) throw new HttpError(400, 'delivery_note_id is required');
    note = await loadNote(service, noteId);
  } else {
    throw new HttpError(400, `unknown action ${action}`);
  }
  if (!note) throw new HttpError(404, 'not found');

  const workspaceId = note.workspace_id;
  if (!(await userCanAccessWorkspace(service, auth.userId, workspaceId))) throw new HttpError(404, 'not found');
  const { data: isMgr } = await auth.supabaseAsUser!
    .rpc('is_workspace_finance_manager', { p_workspace_id: workspaceId });
  if (!isMgr) throw new HttpError(404, 'not found');
  if (!(await isWorkspaceEntitled(service, workspaceId, 'sales-finance'))) {
    throw new HttpError(402, 'The Finance module is not enabled for this workspace');
  }

  if (action === 'status') {
    if (!note.fiscal_mark) throw new HttpError(409, 'The movement has no MARK yet, so AADE has no status for it.');
    const creds = await credentialsFor(service, workspaceId);
    return jsonResponse({ ok: true, status: await fetchStatus(creds, note.fiscal_mark) });
  }

  const ourVat = await ourVatFor(service, workspaceId);

  if (action === 'reconcile') {
    if (!note.fiscal_mark) throw new HttpError(409, 'The movement has no MARK yet, so AADE has no history for it.');
    const cutoff = new Date(Date.now() - RECONCILE_AFTER_MS).toISOString();
    const { data: open } = await service.from('delivery_note_events')
      .select('id, event_type, event_timestamp, transmission_claim_token, transmission_claimed_at')
      .eq('delivery_note_id', note.id)
      .is('transmitted_at', null)
      .not('transmission_claim_token', 'is', null)
      .lt('transmission_claimed_at', cutoff)
      .order('event_timestamp', { ascending: true });
    if (!open?.length) return jsonResponse({ ok: true, resolved: [], released: [] });

    const creds = await credentialsFor(service, workspaceId);
    const status = await fetchStatus(creds, note.fiscal_mark);
    const { data: held } = await service.from('delivery_note_events')
      .select('mark').eq('delivery_note_id', note.id).not('mark', 'is', null);
    const inUse = new Set<string>((held ?? []).map((r: { mark: string }) => String(r.mark)));
    const resolved: { event_id: string; mark: string }[] = [];
    const released: string[] = [];

    for (const leg of open) {
      const hit = matchHistoryEvent(
        { event_type: leg.event_type, claimed_at: leg.transmission_claimed_at, event_timestamp: leg.event_timestamp }, ourVat, status.history, inUse,
      );
      const now = new Date().toISOString();
      if (hit?.mark) {
        const { data: stamped } = await service.from('delivery_note_events').update({
          mark: hit.mark, transmitted_at: now, transmission_error: null,
          transmission_indeterminate_at: null, transmission_status_code: 'Success',
        }).eq('id', leg.id).eq('transmission_claim_token', leg.transmission_claim_token)
          .is('transmitted_at', null).select('id');
        if (stamped?.length) { inUse.add(hit.mark); resolved.push({ event_id: leg.id, mark: hit.mark }); }
      } else {
        const { data: freed } = await service.from('delivery_note_events').update({
          transmission_claim_token: null, transmission_claimed_at: null, transmission_indeterminate_at: null,
          transmission_error: 'AADE has no record of this leg, so it was never filed. It can be sent again.',
        }).eq('id', leg.id).eq('transmission_claim_token', leg.transmission_claim_token)
          .is('transmitted_at', null).select('id');
        if (freed?.length) released.push(leg.id);
      }
    }
    return jsonResponse({ ok: true, resolved, released, aade_status: status.statusCode });
  }

  if (!event) throw new HttpError(404, 'not found');
  if (event.transmitted_at) {
    return jsonResponse({ ok: true, already: true, mark: event.mark, transmitted_at: event.transmitted_at });
  }
  if (event.transmission_claim_token) {
    const stale = event.transmission_indeterminate_at
      || Date.now() - new Date(event.transmission_claimed_at).getTime() > RECONCILE_AFTER_MS;
    throw new HttpError(409, stale
      ? 'The last attempt to file this leg did not come back with an answer, so AADE may already hold it. '
        + 'Check it with AADE before anything is sent again.'
      : 'This leg is being filed right now.');
  }
  if (note.fiscal_cancellation_mark) throw new HttpError(409, 'This movement was cancelled with AADE; it has no lifecycle to file.');

  const { data: unfiled } = await service.from('delivery_note_events')
    .select('id, event_timestamp, created_at, actor_vat').eq('delivery_note_id', note.id).is('transmitted_at', null);
  const at = (r: { event_timestamp: string; created_at: string }) =>
    [new Date(r.event_timestamp).getTime(), new Date(r.created_at).getTime()];
  const [ts, cs] = at(event as any);
  const earlier = (unfiled ?? []).some((r: any) => {
    if (r.id === event!.id) return false;
    // Another party's leg is theirs to file; it must not hold ours back.
    if (r.actor_vat && normalizeVat(r.actor_vat) !== ourVat) return false;
    const [t, c] = at(r);
    return t < ts || (t === ts && c < cs);
  });
  if (earlier) throw new HttpError(409, 'An earlier leg of this movement has not been filed yet. File the legs in order.');

  const problems = deliveryRequestProblems(event, note, ourVat);
  if (problems.length) throw new HttpError(400, problems.join(' '));
  const request = buildDeliveryRequest(event, note);
  const creds = await credentialsFor(service, workspaceId);

  const token = crypto.randomUUID();
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await service.from('delivery_note_events').update({
    transmission_claim_token: token, transmission_claimed_at: claimedAt, transmitted_by: auth.userId,
  }).eq('id', event.id).is('transmitted_at', null).is('transmission_claim_token', null).select('id');
  if (claimErr) throw new HttpError(500, claimErr.message);
  if (!claimed?.length) throw new HttpError(409, 'This leg is already being filed.');

  const stamp = (patch: Record<string, unknown>) => service.from('delivery_note_events')
    .update(patch).eq('id', event!.id).eq('transmission_claim_token', token);

  let httpStatus = 0;
  let text = '';
  try {
    const res = await fetch(`${baseOf(creds)}/${request.method}`, {
      method: 'POST',
      headers: { ...aadeHeaders(creds), 'Content-Type': 'application/xml' },
      body: request.body,
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    httpStatus = res.status;
    text = await res.text();
  } catch (err) {
    const reason = `The call to AADE ${request.method} did not complete (${(err as Error).message}). AADE may have registered the leg.`;
    await stamp({
      transmission_indeterminate_at: new Date().toISOString(),
      transmission_status_code: httpStatus ? `HTTP ${httpStatus}` : 'no_response',
      transmission_error: reason,
    });
    return jsonResponse({ ok: false, outcome: 'indeterminate', error: reason }, 200);
  }

  const outcome = parseDeliveryResponse(httpStatus, text, request.markField);
  if (outcome.kind === 'accepted') {
    const { error } = await stamp({
      mark: outcome.mark, transmitted_at: new Date().toISOString(), transmission_error: null,
      transmission_indeterminate_at: null, transmission_status_code: outcome.statusCode,
    });
    if (error) {
      await stamp({ transmission_indeterminate_at: new Date().toISOString(),
        transmission_error: `Filed with AADE as MARK ${outcome.mark}, but recording it failed: ${error.message}` });
      return jsonResponse({ ok: false, outcome: 'indeterminate', mark: outcome.mark, error: error.message }, 200);
    }
    return jsonResponse({ ok: true, outcome: 'accepted', mark: outcome.mark });
  }
  if (outcome.kind === 'refused') {
    await stamp({
      transmission_claim_token: null, transmission_claimed_at: null, transmission_indeterminate_at: null,
      transmission_status_code: outcome.statusCode, transmission_error: outcome.errors.join(' · '),
    });
    return jsonResponse({ ok: false, outcome: 'refused', errors: outcome.errors, status: outcome.statusCode }, 200);
  }
  await stamp({
    transmission_indeterminate_at: new Date().toISOString(),
    transmission_status_code: outcome.statusCode, transmission_error: outcome.reason,
  });
  return jsonResponse({ ok: false, outcome: 'indeterminate', error: outcome.reason }, 200);
}));
