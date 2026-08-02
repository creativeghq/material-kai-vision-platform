// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { getStripe, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
// multi-provider dispatch. Every gate (published ∧ entitled ∧ configured) is
// re-checked server-side at charge time; the client only expresses an intent.
import { dispatchToProvider, resolveWorkspacePaymentProviders } from '../_shared/payments/registry.ts';

// Sales/Finance — create a Stripe Checkout session for an invoice.
// Two entry modes:
//   1. Authenticated admin/finance: body { invoice_id }
//      Mints (or rotates) a pay_token first if missing; returns checkout URL + pay link.
//   2. Public unauth: body { pay_token, success_url, cancel_url }
//      Resolves the token via SECURITY DEFINER RPC, refuses if expired or already paid,
//      and returns a hosted Stripe Checkout URL.
// Stripe webhook (stripe-webhooks/handlePaymentSucceeded) consumes the metadata
// and creates a `payments` row + `payment_allocations` row, which fires the
// status-keeper trigger and flips the invoice to paid / partially_paid.

interface AdminBody {
  invoice_id: string;
  success_url?: string;
  cancel_url?: string;
  /** If true, just mint/refresh the pay_token + return the public link. No checkout session. */
  link_only?: boolean;
}

interface PublicBody {
  pay_token: string;
  success_url?: string;
  cancel_url?: string;
  /** Return the document + payable options only. No checkout session, no side effects. */
  info_only?: boolean;
  /** Requested amount (deposit / part payment). Clamped server-side to [min, amount_due]. */
  amount?: number;
  /**
   * Which provider to charge with. Defaults to 'stripe' so every existing caller
   * (storefront, statement, the pay page) is unchanged. Re-validated server-side
   * against published ∧ entitled ∧ configured — never trusted as given.
   */
  provider?: string;
  /** 'card' (hosted redirect) or 'bank_reference' (Viva RF code). Defaults to 'card'. */
  method?: 'card' | 'bank_reference';
}

/**
 * Viva return leg. Viva takes the customer's success/failure URL from the payment SOURCE
 * configured in the merchant's dashboard — it cannot be set per call — and returns them
 * with `?t={transactionId}&s={orderCode}`. This mode maps that orderCode back to the
 * invoice's pay link so the app can land the customer on the right page.
 */
interface OrderReturnBody {
  /** Viva's orderCode. ALWAYS a string: it is int64 and overflows JS Number. */
  order_code: string;
  provider?: string;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// PUBLIC_APP_URL is not a Stripe secret — keep it lazy locally.
const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';

Deno.serve(withApiLogging('finance-pay-invoice', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Resolve platform_secrets → Deno.env BEFORE reading STRIPE_SECRET_KEY.
  // Env-first / DB-fallback. No-op on subsequent requests (memoised).
  await bootstrapForFunction();

  // We deliberately do NOT gate the whole function on Stripe being configured
  // any more. A workspace may collect via Viva (BYOK) with no platform
  // Stripe key at all, so "no Stripe" is only fatal on the Stripe path itself —
  // checked at the point of use below.
  const stripe = getStripe();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: AdminBody | PublicBody | OrderReturnBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const isAdminMode = 'invoice_id' in body && body.invoice_id;
  const isPublicMode = 'pay_token' in body && body.pay_token;
  const isOrderReturnMode = 'order_code' in body && body.order_code;
  if (!isAdminMode && !isPublicMode && !isOrderReturnMode) {
    return json({ error: 'Provide invoice_id (admin), pay_token (public), or order_code (provider return)' }, 400);
  }

  try {
    // ─── Provider return leg (public, no token) ────────────────────────
    // Resolves a provider order code → the invoice's pay link. Deliberately narrow:
    // it returns only the pay token + a coarse status, never invoice contents, because
    // an orderCode is guessable-ish and unauthenticated. The pay page then re-resolves
    // the token through the usual guarded RPC to render anything.
    if (isOrderReturnMode) {
      const orb = body as OrderReturnBody;
      const { data: intent } = await supabase
        .from('invoice_payment_intents')
        .select('invoice_id, status, method')
        .eq('provider', orb.provider || 'viva')
        .eq('provider_order_code', String(orb.order_code))
        .maybeSingle();

      if (!intent) return json({ error: 'unknown order' }, 404);

      const { data: inv } = await supabase
        .from('invoices')
        .select('id, pay_token, status')
        .eq('id', intent.invoice_id)
        .maybeSingle();

      if (!inv?.pay_token) return json({ error: 'unknown order' }, 404);

      return json({
        ok: true,
        pay_token: inv.pay_token,
        pay_link: `${publicAppUrl().replace(/\/$/, '')}/pay/${inv.pay_token}`,
        intent_status: intent.status,
        invoice_status: inv.status,
      });
    }

    // ─── Authenticated path (admin OR customer-self) ───────────────────
    if (isAdminMode) {
      const wantsLinkOnly = (body as AdminBody).link_only === true;
      // link_only requires admin (mints a public pay token). Other authed callers
      // (e.g. the customer who owns the invoice) can still create a one-shot checkout
      // session — RLS on the user-JWT client is the gate.
      const auth = await authenticate(req, {
        requireUser: true,
        allowedRoles: wantsLinkOnly ? ['admin', 'super_admin', 'owner', 'finance'] : undefined,
      });
      if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

      // Use the caller's JWT for the SELECT so RLS gates access. Customer-self path:
      // the customer's auth user_id is linked to crm_contacts.user_id, the invoices
      // SELECT policy allows workspace members; if the customer is also a workspace
      // member, they read fine. If not, this errors out — by design.
      const { data: inv, error: invErr } = await auth.supabase
        .from('invoices')
        .select('*')
        .eq('id', (body as AdminBody).invoice_id)
        .maybeSingle();
      if (invErr || !inv) return json({ error: 'invoice not found or not accessible' }, 404);

      // authenticate() returns the SERVICE-ROLE client, so the SELECT
      // above does NOT enforce RLS (the "caller's JWT gates access" comment was wrong).
      // Bind the caller to this invoice explicitly: an active member of its workspace
      // (or global admin), OR the linked customer (crm_contacts.user_id). 404 on
      // mismatch to avoid cross-tenant id enumeration.
      const isMember = await userCanAccessWorkspace(supabase, auth.userId, inv.workspace_id);
      let isLinkedCustomer = false;
      if (!isMember && inv.customer_contact_id) {
        const { data: linkedContact } = await supabase
          .from('crm_contacts')
          .select('id')
          .eq('id', inv.customer_contact_id)
          .eq('user_id', auth.userId)
          .maybeSingle();
        isLinkedCustomer = !!linkedContact;
      }
      if (!isMember && !isLinkedCustomer) {
        return json({ error: 'invoice not found or not accessible' }, 404);
      }

      if (inv.status === 'void' || inv.status === 'credit_noted') {
        return json({ error: `invoice is ${inv.status}; cannot collect` }, 409);
      }
      if (Number(inv.amount_due) <= 0) {
        return json({ error: 'invoice has no amount due' }, 409);
      }

      let payLink: string | null = null;
      let token: string | null = null;

      if (wantsLinkOnly) {
        const { data: tk, error: tokenErr } = await supabase.rpc('mint_invoice_pay_token', {
          p_invoice_id: inv.id,
          p_ttl_days: 90,
        });
        if (tokenErr) return json({ error: `mint_invoice_pay_token failed: ${tokenErr.message}` }, 500);
        token = tk as string;
        payLink = `${publicAppUrl().replace(/\/$/, '')}/pay/${token}`;
        return json({ ok: true, pay_link: payLink, pay_token: token, invoice_id: inv.id });
      }

      // This branch creates a Stripe session directly, so Stripe specifically must exist.
      if (!stripe) return noPaymentProviderResponse(corsHeaders);

      // Route funds to the workspace's connected Stripe account when configured.
      const { data: destAcct } = await supabase.rpc('get_workspace_payout_account', { p_workspace_id: inv.workspace_id });

      // Create a Stripe Checkout session right now and return its URL too (so admin can paste either).
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: String(inv.currency || 'eur').toLowerCase(),
              product_data: { name: `Invoice ${inv.internal_number}` },
              unit_amount: Math.round(Number(inv.amount_due) * 100),
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          ...(destAcct ? { transfer_data: { destination: destAcct as string } } : {}),
          metadata: {
            type: 'invoice_payment',
            invoice_id: inv.id,
            workspace_id: inv.workspace_id,
            internal_number: inv.internal_number,
          },
        },
        // Customer-self mode has no token; fall back to the admin invoice page or
        // a generic success page. Frontend should override with a sensible URL.
        success_url: (body as AdminBody).success_url
          || (token ? `${publicAppUrl()}/pay/${token}?status=success` : `${publicAppUrl()}/admin/finance/invoices/${inv.id}?status=success`),
        cancel_url: (body as AdminBody).cancel_url
          || (token ? `${publicAppUrl()}/pay/${token}?status=cancelled` : `${publicAppUrl()}/admin/finance/invoices/${inv.id}?status=cancelled`),
      });

      await supabase
        .from('invoices')
        .update({
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          stripe_checkout_session_id: session.id,
        })
        .eq('id', inv.id);

      return json({
        ok: true,
        pay_link: payLink,
        pay_token: token,
        invoice_id: inv.id,
        checkout_url: session.url,
        session_id: session.id,
      });
    }


    // ─── Public path ───────────────────────────────────────────────────
    const pb = body as PublicBody;
    const { data: rows, error: resErr } = await supabase.rpc('resolve_invoice_pay_token', { p_token: pb.pay_token });
    if (resErr) return json({ error: resErr.message }, 500);
    const row = (rows as any[])?.[0];
    if (!row) return json({ error: 'invalid pay link' }, 404);
    if (row.expired) return json({ error: 'pay link expired — ask the seller for a fresh one' }, 410);
    if (row.status === 'void' || row.status === 'credit_noted') {
      return json({ error: `invoice is ${row.status}` }, 409);
    }
    if (Number(row.amount_due) <= 0) {
      return json({ ok: true, already_paid: true, invoice_id: row.invoice_id }, 200);
    }

    // ── Payable options (gateway-agnostic policy) ────────────────────────
    // The AMOUNT IS ALWAYS DERIVED SERVER-SIDE. The client may express an intent
    // (a requested figure) but never sets the price: we clamp it to [min, amount_due]
    // computed from the invoice's own deposit terms.
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const { data: extra } = await supabase
      .from('invoices').select('deposit_pct, total, status').eq('id', row.invoice_id).maybeSingle();
    const amountDue = r2(Number(row.amount_due));
    const totalAmt = r2(Number((extra as any)?.total ?? amountDue));
    const depositPct = (extra as any)?.deposit_pct != null ? Number((extra as any).deposit_pct) : null;
    const isPreInvoice = (extra as any)?.status === 'draft';
    // A deposit floor only applies to the FIRST payment; once part is paid, the rest is due in full.
    const untouched = amountDue >= totalAmt - 0.005;
    const depositAmount = depositPct && untouched ? Math.min(r2(totalAmt * depositPct / 100), amountDue) : null;
    // Stripe (and every gateway) rejects dust charges.
    const MIN_CHARGE = 0.5;
    const minAmount = Math.max(depositAmount ?? amountDue, MIN_CHARGE);

    if (pb.info_only) {
      // Which providers can this seller actually charge with right now?
      // `configuredOnly` matters on a customer-facing surface: a buyer must never be
      // offered a method that cannot take their money.
      const available = await resolveWorkspacePaymentProviders(supabase, row.workspace_id, {
        configuredOnly: true,
      });
      // Stripe is only genuinely available if the platform key exists too.
      const providers = available.filter((p) => p.slug !== 'stripe' || !!stripe);

      return json({
        ok: true,
        info: true,
        invoice_id: row.invoice_id,
        internal_number: row.internal_number,
        customer_display: row.customer_display,
        currency: row.currency,
        status: row.status,
        is_pre_invoice: isPreInvoice,
        total: totalAmt,
        amount_due: amountDue,
        deposit_pct: depositPct,
        deposit_amount: depositAmount,
        min_amount: Math.min(minAmount, amountDue),
        max_amount: amountDue,
        // The pay page renders a method chooser from this. One entry with one method
        // → it keeps the existing auto-redirect fast path (storefront/statement UX
        // must not regress).
        providers: providers.map((p) => ({
          slug: p.slug,
          label: p.label,
          methods: p.methods,
        })),
      });
    }

    // Resolve the charge amount: requested (clamped) or the full balance.
    let chargeAmount = amountDue;
    if (pb.amount != null) {
      const req = Number(pb.amount);
      if (!Number.isFinite(req) || req <= 0) return json({ error: 'invalid amount' }, 400);
      chargeAmount = r2(req);
      if (chargeAmount > amountDue + 0.005) return json({ error: 'amount exceeds the balance due' }, 400);
      if (chargeAmount < minAmount - 0.005) {
        return json({ error: `minimum payable is ${minAmount.toFixed(2)} ${row.currency}` }, 400);
      }
      chargeAmount = Math.min(chargeAmount, amountDue);
    }
    const isPartial = chargeAmount < amountDue - 0.005;
    const docLabel = isPreInvoice ? 'Pre-invoice' : 'Invoice';
    const lineName = isPartial
      ? `Deposit — ${docLabel} ${row.internal_number}`
      : `${docLabel} ${row.internal_number}`;

    // ── Provider dispatch ────────────────────────────────────────────────
    // Every gate is re-checked here, at the moment money is about to move: the
    // client-supplied provider slug is an intent, never an authorisation.
    const providerSlug = pb.provider || 'stripe';
    const method = pb.method || 'card';
    const currency = String(row.currency || 'EUR').toUpperCase();

    const dispatch = await dispatchToProvider(supabase, row.workspace_id, providerSlug, currency);
    if (!dispatch.ok) {
      // 503 for "seller hasn't finished setup", 400 for a bad request.
      const status = dispatch.code === 'not_configured' || dispatch.code === 'not_published' ? 503 : 400;
      return json({ error: dispatch.error, code: dispatch.code }, status);
    }
    if (providerSlug === 'stripe' && !stripe) return noPaymentProviderResponse(corsHeaders);
    if (!dispatch.provider.methods.includes(method)) {
      return json({ error: `${dispatch.provider.label} does not support ${method}`, code: 'method_unsupported' }, 400);
    }

    let charge;
    try {
      charge = await dispatch.provider.createCharge({
        invoiceId: row.invoice_id,
        amount: chargeAmount,
        currency,
        description: lineName,
        invoiceNumber: row.internal_number,
        method,
        successUrl: pb.success_url || `${publicAppUrl()}/pay/${pb.pay_token}?status=success`,
        cancelUrl: pb.cancel_url || `${publicAppUrl()}/pay/${pb.pay_token}?status=cancelled`,
      }, dispatch.ctx!);
    } catch (err: any) {
      console.error(`[finance-pay-invoice] ${providerSlug} createCharge failed`, err);
      return json({ error: err?.message ?? 'the payment provider rejected the request', code: 'provider_error' }, 502);
    }

    // Record the intent so the webhook can map the provider's order code back to THIS
    // invoice without trusting anything the provider sends us about identity.
    await supabase.from('invoice_payment_intents').insert({
      workspace_id: row.workspace_id,
      invoice_id: row.invoice_id,
      provider: providerSlug,
      method,
      amount: chargeAmount,
      currency,
      provider_order_code: charge.orderCode,
      rf_code: charge.kind === 'bank_reference' ? charge.rfCode : null,
      status: 'pending',
    });

    // Legacy Stripe columns on the invoice — kept for existing reporting.
    if (providerSlug === 'stripe' && charge.kind === 'redirect') {
      await supabase
        .from('invoices')
        .update({ stripe_checkout_session_id: charge.orderCode })
        .eq('id', row.invoice_id);
    }

    const common = {
      ok: true,
      provider: providerSlug,
      method,
      invoice_id: row.invoice_id,
      internal_number: row.internal_number,
      amount: chargeAmount,
      amount_due: amountDue,
      partial: isPartial,
      currency: row.currency,
      customer_display: row.customer_display,
    };

    if (charge.kind === 'bank_reference') {
      // Nothing to redirect to: the buyer pays from their own banking app quoting the
      // RF code, and settlement arrives later via webhook.
      return json({
        ...common,
        payment_kind: 'bank_reference',
        rf_code: charge.rfCode,
        order_code: charge.orderCode,
      });
    }

    return json({
      ...common,
      payment_kind: 'redirect',
      checkout_url: charge.url,
      // `session_id` kept for back-compat with existing Stripe callers.
      session_id: charge.orderCode,
      order_code: charge.orderCode,
    });
  } catch (err: any) {
    console.error('finance-pay-invoice error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
}));
