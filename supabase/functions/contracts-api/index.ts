// deno-lint-ignore-file no-explicit-any
// Contracts & e-signature API. One entity, three contexts (hr | finance | project).
// PUBLIC (token, no auth) — the signer's page:
//   { action:'resolve_token', token }                         → { contract } | { not_found } | { signed }
//   { action:'sign', token, signer_name, signer_email?, signature_image? } → { success, contract_id }
// AUTHED (session JWT) — management:
//   create | list | get | update | send | void
// SECURITY: verify_jwt is disabled so the public sign path works; management actions call
// authenticate() + the module/entitlement gates, then perform the actual writes through a
// USER-context client so the context-branched RLS (hr→admin, finance→finance-manager,
// project→member) is the real enforcement — no service-role body-trust (invariant 1).
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { escapeHtml } from '../_shared/html.ts';
import { recordPageEvent } from '../_shared/document-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;


const CONTEXTS = ['hr', 'finance', 'project', 'realestate'];
// Fields a caller may write (no status / token / workspace / created_by — those are server-set).
const WRITABLE = [
  'contract_type', 'title', 'body_markdown', 'currency', 'value',
  'effective_date', 'expiry_date', 'counterparty_name', 'counterparty_email',
] as const;
const SUBJECT_COLS = ['hr_employee_id', 'customer_company_id', 'supplier_company_id', 'order_id', 'quote_id', 'project_id', 'property_id'] as const;

function pick(body: any, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (body?.[c] !== undefined) out[c] = body[c];
  return out;
}

Deno.serve(withApiLogging('contracts-api', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const action = String(body?.action ?? '').trim();
  if (!action) return json({ error: 'action is required' }, 400);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // ─────────────────────────── PUBLIC (token) ───────────────────────────
  if (action === 'resolve_token' || action === 'sign') {
    const token = String(body?.token ?? '');
    if (token.length < 32) return json({ error: 'invalid token' }, 400);

    const { data: c } = await service
      .from('contracts')
      .select('id, workspace_id, title, body_markdown, status, counterparty_name, effective_date, expiry_date, sign_token_expires_at, created_by, context')
      .eq('sign_token', token)
      .maybeSingle();

    if (!c) return json({ not_found: true });
    const expired = c.sign_token_expires_at && new Date(c.sign_token_expires_at).getTime() < Date.now();

    if (action === 'resolve_token') {
      if (c.status === 'signed') return json({ signed: true, contract: { title: c.title } });
      if (c.status === 'void' || c.status === 'declined' || expired) return json({ not_found: true });

      // Delivery trail: the counterparty has the contract open. Recorded only on
      // the branch that actually returns the body — a lookup that resolves to
      // "voided" or "expired" is not someone reading the contract.
      recordPageEvent(service, req, 'viewed', {
        entityType: 'contract',
        entityId: c.id,
        workspaceId: c.workspace_id,
        metadata: { surface: 'sign_link', title: c.title },
      }).catch(() => {});

      return json({
        contract: {
          title: c.title,
          body_markdown: c.body_markdown,
          counterparty_name: c.counterparty_name,
          effective_date: c.effective_date,
          expiry_date: c.expiry_date,
        },
      });
    }

    // sign
    if (c.status === 'signed') return json({ error: 'This contract is already signed.' }, 409);
    if (c.status !== 'sent' || expired) return json({ error: 'This contract is not open for signing.' }, 410);
    const signerName = String(body?.signer_name ?? '').trim().slice(0, 160);
    if (!signerName) return json({ error: 'signer_name is required' }, 400);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const ua = req.headers.get('user-agent')?.slice(0, 400) ?? null;
    const { error: sigErr } = await service.from('contract_signatures').insert({
      contract_id: c.id,
      workspace_id: c.workspace_id,
      signer_name: signerName,
      signer_email: typeof body?.signer_email === 'string' ? body.signer_email.slice(0, 200) : null,
      // Single-signer design: the person signing via the token IS the counterparty. Stamp it so the
      // column carries meaning (was always NULL) and a future multi-party design has the field populated.
      signer_role: 'counterparty',
      signature_image: typeof body?.signature_image === 'string' ? body.signature_image.slice(0, 200_000) : null,
      ip, user_agent: ua,
    });
    if (sigErr) return json({ error: 'Could not record signature' }, 500);
    await service.from('contracts').update({ status: 'signed', signed_at: new Date().toISOString() }).eq('id', c.id);

    // Terminal outcome on the trail: 'signed' outranks every view, so the list
    // shows the result rather than "viewed 3x" next to a completed contract.
    recordPageEvent(service, req, 'signed', {
      entityType: 'contract',
      entityId: c.id,
      workspaceId: c.workspace_id,
      actorEmail: typeof body?.signer_email === 'string' ? body.signer_email.slice(0, 200) : null,
      metadata: { signer_name: signerName },
    }).catch(() => {});

    // Flows — notify the contract owner. Best-effort.
    try {
      await emitFlowEvent('contract_signed', {
        type: 'contract_signed',
        workspace_id: c.workspace_id,
        user_id: c.created_by,
        contract_id: c.id,
        context: c.context,
        signer_name: signerName,
        title: `Contract signed: "${c.title}"`,
        body: `${signerName} signed "${c.title}".`,
        action_url: '/contracts',
      });
    } catch { /* never fail the public sign on a flow emit */ }

    return json({ success: true, contract_id: c.id });
  }

  // ─────────────────────────── AUTHED (management) ───────────────────────────
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);

  // Gate: tenancy → module publish → entitlement (matches hr-api ordering).
  if (!(await userCanAccessWorkspace(service, userId, workspaceId))) return json({ error: 'not found' }, 404);
  if (!(await isModuleEnabled(service, 'contracts'))) throw new HttpError(404, 'Contracts module is not available');
  const ent = await assertEntitled(service, workspaceId, 'contracts');
  if (!ent.ok) return ent.response;

  // Writes go through the USER client so context-branched RLS is the enforcement.
  //
  // Taken from `authenticate()` rather than rebuilt here (#197 item 4): this file was one of five
  // that hand-rolled the same anon-key + Authorization-header client, each slightly differently.
  // Identical construction, so no behaviour change — the point is that there is now one definition
  // to keep correct instead of five that can drift apart.
  //
  // The local build stays as the fallback for the case where SUPABASE_ANON_KEY is unset, which is
  // exactly the case the old line already handled (badly — with an empty key).
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = auth.supabaseAsUser
    ?? createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });

  if (action === 'create') {
    const context = String(body?.context ?? '');
    if (!CONTEXTS.includes(context)) return json({ error: 'context must be hr | finance | project | realestate' }, 400);
    if (!String(body?.title ?? '').trim()) return json({ error: 'title is required' }, 400);
    const payload: Record<string, unknown> = {
      workspace_id: workspaceId,
      context,
      created_by: userId,
      ...pick(body, WRITABLE),
      ...pick(body, SUBJECT_COLS),
    };

    // Shared-spine link: resolve the free-text counterparty to a crm_contacts row so a contract
    // party is the SAME person the CRM/Finance/RE modules see. Best-effort — never block contract
    // creation on the link (matches the degrade-silently pattern used across ingest paths).
    if (!payload.crm_contact_id && (body?.counterparty_email || body?.counterparty_name)) {
      try {
        const email = String(body?.counterparty_email ?? '').trim().toLowerCase();
        let contactId: string | null = null;
        if (email) {
          const { data: existing } = await asUser.from('crm_contacts')
            .select('id').eq('workspace_id', workspaceId).ilike('email', email).limit(1).maybeSingle();
          contactId = existing?.id ?? null;
        }
        if (!contactId) {
          const { data: created, error: createError } = await asUser.from('crm_contacts')
            .insert({ workspace_id: workspaceId, name: String(body?.counterparty_name ?? email ?? 'Contract counterparty'), email: email || null, created_by: userId, lead_source: 'contract' })
            .select('id').single();
          // Degrading silently is intended; degrading INVISIBLY is not. `asUser` means an RLS
          // denial resolves rather than throws, so without this the spine link would just never
          // form and every contract would quietly carry a null crm_contact_id.
          if (createError) console.error('[contracts-api] spine link: crm_contacts insert failed:', createError.message);
          contactId = created?.id ?? null;
        }
        if (contactId) payload.crm_contact_id = contactId;
      } catch (e) { console.error('[contracts-api] spine link threw — contract has no crm_contact_id:', e); }
    }

    const { data, error } = await asUser.from('contracts').insert(payload).select().single();
    if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);
    return json({ contract: data });
  }

  if (action === 'list') {
    let q = asUser.from('contracts').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200);
    if (body?.context) q = q.eq('context', String(body.context));
    for (const col of SUBJECT_COLS) if (body?.[col]) q = q.eq(col, String(body[col]));
    if (body?.status) q = q.eq('status', String(body.status));
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 400);
    return json({ contracts: data ?? [] });
  }

  if (action === 'get') {
    const id = String(body?.id ?? '');
    if (!id) return json({ error: 'id is required' }, 400);
    const { data, error } = await asUser.from('contracts').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: 'not found' }, 404);
    const { data: sigs } = await asUser.from('contract_signatures').select('*').eq('contract_id', id).order('signed_at', { ascending: true });
    return json({ contract: data, signatures: sigs ?? [] });
  }

  if (action === 'update') {
    const id = String(body?.id ?? '');
    if (!id) return json({ error: 'id is required' }, 400);
    const patch = pick(body, WRITABLE);
    if (Object.keys(patch).length === 0) return json({ error: 'nothing to update' }, 400);
    const { data, error } = await asUser.from('contracts').update(patch).eq('id', id).eq('workspace_id', workspaceId).select().maybeSingle();
    if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);
    if (!data) return json({ error: 'not found' }, 404);
    return json({ contract: data });
  }

  if (action === 'send') {
    const id = String(body?.id ?? '');
    if (!id) return json({ error: 'id is required' }, 400);
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await asUser.from('contracts')
      .update({ status: 'sent', sign_token: token, sign_token_expires_at: expires, sent_at: new Date().toISOString() })
      .eq('id', id).eq('workspace_id', workspaceId).select().maybeSingle();
    if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);
    if (!data) return json({ error: 'not found' }, 404);

    // Actually email the counterparty the signing link (the whole point of "send"). Best-effort — the
    // token/link is still returned so the caller can copy it if the email can't go out. Transactional
    // (a signing request), so it uses the workspace's own sender via workspace_id.
    let emailed = false;
    const toEmail = String((data as { counterparty_email?: string }).counterparty_email ?? '').trim();
    if (toEmail) {
      try {
        const appBase = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
        const signUrl = `${appBase}/sign/${token}`;
        const title = String((data as { title?: string }).title ?? 'a contract');
        const party = String((data as { counterparty_name?: string }).counterparty_name ?? '').trim();
        const html = `<p>${party ? `Hello ${escapeHtml(party)},` : 'Hello,'}</p>`
          + `<p>You have a document to review and sign: <strong>${escapeHtml(title)}</strong>.</p>`
          + `<p><a href="${signUrl}">Open and sign the document</a></p>`
          + `<p>This link expires in 30 days. If you weren't expecting this, you can ignore this email.</p>`;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/email-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            action: 'send', to: toEmail, subject: `Signature requested: ${title}`,
            html, emailType: 'transactional', workspace_id: workspaceId,
            tags: { feature: 'contracts', contract_id: id },
          }),
        });
        emailed = resp.ok;
      } catch (_) { /* best-effort; link still returned */ }
    }
    return json({ contract: data, sign_token: token, sign_path: `/sign/${token}`, emailed });
  }

  if (action === 'void') {
    const id = String(body?.id ?? '');
    if (!id) return json({ error: 'id is required' }, 400);
    const { data, error } = await asUser.from('contracts').update({ status: 'void', sign_token: null }).eq('id', id).eq('workspace_id', workspaceId).select().maybeSingle();
    if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);
    if (!data) return json({ error: 'not found' }, 404);
    return json({ contract: data });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
