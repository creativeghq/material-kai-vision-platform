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
import { assertAllSameWorkspace } from '../_shared/same-workspace.ts';

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
/** An anonymous surface must not accept an unbounded basket. */
const MAX_ORDER_LINES = 100;

type OrderLine = { product_id?: string | null; description?: string; quantity?: number; unit_price?: number };

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
  lines?: OrderLine[];
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
    if (lines.length > MAX_ORDER_LINES) {
      throw new HttpError(400, `An order may carry at most ${MAX_ORDER_LINES} lines.`);
    }

    // Every product id here comes from the body. Both halves look valid on their own — the token
    // resolves to a real account, the id is a real product — and without this nothing checks them
    // against each other, so another tenant's product would be written onto this order.
    await assertAllSameWorkspace(
      service, 'products',
      lines.map((l) => (typeof l.product_id === 'string' ? l.product_id : null)),
      who.workspace_id, 'product');

    // THE PRICE IS OURS. This body is written by whoever holds the link, so a `unit_price` it
    // supplies is a price the customer chose — invariant 8 lists `price` among the fields set
    // server-side only. It also fed the spend gate, so omitting it made the cap see 0 and allow
    // anything.
    //
    // A line we cannot price has an UNKNOWN amount, and unknown must not become zero: it goes to
    // the customer's own administrator for a decision rather than sliding under the cap.
    let allPriced = true;
    const priced: Array<{ raw: OrderLine; qty: number; productId: string | null; unit: number | null }> = [];
    for (const l of lines) {
      const qty = Number(l.quantity ?? 0);
      const productId = typeof l.product_id === 'string' && l.product_id ? l.product_id : null;
      let unit: number | null = null;
      if (productId) {
        const { data: p } = await service.rpc('get_product_price_for_workspace', {
          p_workspace_id: who.workspace_id, p_product_id: productId,
          p_company_id: who.company_id, p_contact_id: null,
          p_audience: 'seller', p_quantity: qty, p_unit: null, p_variant_key: null,
        });
        const pr = (p ?? {}) as any;
        if (pr.unpriced !== true && pr.final_sell != null && Number.isFinite(Number(pr.final_sell))) {
          unit = Number(pr.final_sell);
        }
      }
      if (unit === null) allPriced = false;
      priced.push({ raw: l, qty, productId, unit });
    }
    const amount = priced.reduce((s, l) => s + l.qty * (l.unit ?? 0), 0);

    const { data: gate } = await service.rpc('trade_portal_spend_gate', {
      p_token: token, p_amount: amount,
    });
    const g = (gate ?? {}) as any;
    // An order carrying a line nobody can price is not inside anyone's authority.
    const withinAuthority = allPriced && g.allowed === true;

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
      priced.map((l) => ({
        workspace_id: who.workspace_id,
        order_id: order.id,
        product_id: l.productId,
        description: l.raw.description ?? 'Portal line',
        quantity: l.qty,
        // Null, not zero, when we could not price it: a zero here is a line the merchant would
        // ship for nothing.
        unit_price: l.unit,
      })),
    );
    if (lineErr) throw new HttpError(500, lineErr.message);

    if (!withinAuthority) {
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
      if (apprErr) {
        // Without the request this draft is an ordinary order in the merchant's list, over a cap,
        // with nobody told it needs a decision — worse than losing the basket. Undo it and say so.
        await service.from('order_items').delete().eq('order_id', order.id);
        await service.from('orders').delete().eq('id', order.id);
        throw new HttpError(500,
          'We could not raise the approval request, so the order was not kept. Please try again.');
      }
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
