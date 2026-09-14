// deno-lint-ignore-file no-explicit-any
// trade-portal — a trade customer seeing their own account (#441).
//
// The TOKEN is the identity. Everything read or written here is scoped by what it resolves to, and
// a company id in the request body is never trusted (security invariant 1). Nothing mutating is
// exposed to `anon` in the database; the writes happen here, under the service role, after this
// function has resolved the token itself.
//
// The access pattern is JobTread's: a link unique to the recipient, with no account for them to
// create and forget. That is what pastes into a WhatsApp thread, and WhatsApp is our channel.
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Long enough that guessing is not a strategy, minted the way a contract signing token is. */
const mintToken = () => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
const TOKEN_TTL_DAYS = 60;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface Body {
  action?: 'resolve' | 'statement' | 'stock' | 'place_order' | 'mint_link' | 'decide'
    | 'history' | 'approvals';
  token?: string;
  product_id?: string;
  lines?: Array<{ product_id?: string | null; description?: string; quantity?: number; unit_price?: number }>;
  notes?: string;
  portal_user_id?: string;
  approval_id?: string;
  decision?: 'approved' | 'declined';
  reason?: string;
}

Deno.serve(withApiLogging('trade-portal', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const body = (await req.json().catch(() => ({}))) as Body;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── The operator's side. Minting a link is OUR act, so it needs a real member. ──
  if (body.action === 'mint_link') {
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Unauthorized');
    const portalUserId = String(body.portal_user_id ?? '').trim();
    if (!portalUserId) throw new HttpError(400, 'portal_user_id is required');

    const { data: pu } = await service
      .from('trade_portal_users')
      .select('id, account_id, trade_portal_accounts!inner(workspace_id)')
      .eq('id', portalUserId)
      .maybeSingle();
    const workspaceId = (pu as any)?.trade_portal_accounts?.workspace_id as string | undefined;
    // 404 on a mismatch, not 403: a distinguishable refusal is an id oracle.
    if (!pu || !workspaceId) throw new HttpError(404, 'not found');
    if (!(await userCanAccessWorkspace(service, auth.userId, workspaceId))) {
      throw new HttpError(404, 'not found');
    }

    const token = mintToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000).toISOString();
    const { error } = await service.from('trade_portal_links').insert({
      portal_user_id: portalUserId, token, expires_at: expiresAt, created_by: auth.userId,
    });
    if (error) throw new HttpError(500, error.message);
    return json({ ok: true, token, expires_at: expiresAt });
  }

  // ── The customer's side. Everything below is scoped by the token. ──
  const token = String(body.token ?? '').trim();
  if (!token) throw new HttpError(400, 'token is required');

  const { data: resolved } = await service.rpc('trade_portal_resolve', { p_token: token });
  const who = (resolved ?? {}) as any;
  if (!who?.ok) return json({ ok: false, reason: who?.reason ?? 'This link is not valid.' }, 200);

  if (body.action === 'resolve') {
    await service.from('trade_portal_links')
      .update({ last_used_at: new Date().toISOString() }).eq('token', token);
    return json(who);
  }

  if (body.action === 'statement') {
    const { data } = await service.rpc('trade_portal_statement', { p_token: token });
    return json(data);
  }

  if (body.action === 'stock') {
    const productId = String(body.product_id ?? '').trim();
    if (!productId) throw new HttpError(400, 'product_id is required');
    const { data } = await service.rpc('trade_portal_stock', {
      p_token: token, p_product: productId,
    });
    return json(data);
  }

  if (body.action === 'history') {
    // Reorder from history is table stakes, and it is the one screen a trade buyer actually uses.
    // Scoped by the token's company, never by anything the caller sent.
    const { data } = await service
      .from('order_items')
      .select('product_id, description, quantity, unit_price, orders!inner(id, created_at, customer_company_id, workspace_id)')
      .eq('orders.customer_company_id', who.company_id)
      .eq('orders.workspace_id', who.workspace_id)
      .order('created_at', { ascending: false, referencedTable: 'orders' })
      .limit(50);
    const rows = (data ?? []).map((r: any) => ({
      product_id: r.product_id,
      description: r.description,
      quantity: Number(r.quantity ?? 0),
      unit_price: Number(r.unit_price ?? 0),
      ordered_at: r.orders?.created_at ?? null,
    }));
    return json({ ok: true, rows });
  }

  if (body.action === 'approvals') {
    const { data } = await service
      .from('trade_portal_approvals')
      .select('id, amount, limit_at_request, status, created_at, requested_by, order_id')
      .eq('account_id', who.account_id)
      .order('created_at', { ascending: false })
      .limit(50);
    return json({ ok: true, rows: data ?? [] });
  }

  if (body.action === 'decide') {
    // Only the customer's OWN delegated admin decides their colleagues' requests. That is the
    // whole point of the role, and it is why this is not an operator action.
    if (who.role !== 'admin') throw new HttpError(403, 'Only your account administrator can decide this.');
    const approvalId = String(body.approval_id ?? '').trim();
    const decision = body.decision === 'approved' ? 'approved' : 'declined';
    if (!approvalId) throw new HttpError(400, 'approval_id is required');

    const { error } = await service.from('trade_portal_approvals').update({
      status: decision,
      decided_by: who.portal_user_id,
      decided_at: new Date().toISOString(),
      reason: body.reason ?? null,
    }).eq('id', approvalId).eq('account_id', who.account_id).eq('status', 'pending');
    if (error) throw new HttpError(500, error.message);
    return json({ ok: true, status: decision });
  }

  if (body.action === 'place_order') {
    const lines = (body.lines ?? []).filter((l) => Number(l?.quantity ?? 0) > 0);
    if (lines.length === 0) throw new HttpError(400, 'An order needs at least one line.');
    const amount = lines.reduce(
      (s, l) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0,
    );

    const { data: gate } = await service.rpc('trade_portal_spend_gate', {
      p_token: token, p_amount: amount,
    });
    const g = (gate ?? {}) as any;

    // The order is created as a DRAFT either way. Losing somebody's basket because they are over
    // their cap punishes them for a limit their own office set — the draft waits for the decision.
    const { data: order, error: orderErr } = await service.from('orders').insert({
      workspace_id: who.workspace_id,
      customer_company_id: who.company_id,
      order_type: 'sale',
      status: 'draft',
      currency: 'EUR',
      notes: [body.notes, `Placed through the trade portal by ${who.email}`]
        .filter(Boolean).join(' — '),
    }).select('id').single();
    if (orderErr) throw new HttpError(500, orderErr.message);

    const { error: lineErr } = await service.from('order_items').insert(
      lines.map((l) => ({
        workspace_id: who.workspace_id,
        order_id: order.id,
        product_id: l.product_id ?? null,
        description: l.description ?? 'Portal line',
        quantity: Number(l.quantity ?? 0),
        unit_price: Number(l.unit_price ?? 0),
      })),
    );
    if (lineErr) throw new HttpError(500, lineErr.message);

    if (!g.allowed) {
      const { error: apprErr } = await service.from('trade_portal_approvals').insert({
        workspace_id: who.workspace_id,
        account_id: who.account_id,
        requested_by: who.portal_user_id,
        order_id: order.id,
        amount,
        // The cap AS IT WAS. Raising it afterwards must not rewrite why the request existed.
        limit_at_request: g.limit ?? null,
        status: 'pending',
      });
      if (apprErr) throw new HttpError(500, apprErr.message);
      return json({
        ok: true, order_id: order.id, needs_approval: true, code: g.code,
        reason: g.reason,
      });
    }

    return json({
      ok: true, order_id: order.id, needs_approval: false,
      reason: 'Placed as a draft order. We confirm it before anything ships — a portal that '
            + 'confirms its own orders is a portal that ships a typo.',
    });
  }

  throw new HttpError(400, 'Unknown action');
}));
