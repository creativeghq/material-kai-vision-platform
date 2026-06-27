// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { getStripe, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';

// Sales/Finance — create a Stripe Checkout session for an invoice.
//
// Two entry modes:
//   1. Authenticated admin/finance: body { invoice_id }
//      Mints (or rotates) a pay_token first if missing; returns checkout URL + pay link.
//   2. Public unauth: body { pay_token, success_url, cancel_url }
//      Resolves the token via SECURITY DEFINER RPC, refuses if expired or already paid,
//      and returns a hosted Stripe Checkout URL.
//
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
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// PUBLIC_APP_URL is not a Stripe secret — keep it lazy locally.
const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Resolve platform_secrets → Deno.env BEFORE reading STRIPE_SECRET_KEY.
  // Env-first / DB-fallback. No-op on subsequent requests (memoised).
  await bootstrapForFunction();

  // Safety rail: payments require a configured provider. If STRIPE_SECRET_KEY
  // is missing in BOTH env and platform_secrets, no provider can accept the
  // invoice payment — canonical 503 routes the admin to the right settings.
  const stripe = getStripe();
  if (!stripe) return noPaymentProviderResponse(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: AdminBody | PublicBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const isAdminMode = 'invoice_id' in body && body.invoice_id;
  const isPublicMode = 'pay_token' in body && body.pay_token;
  if (!isAdminMode && !isPublicMode) {
    return json({ error: 'Provide invoice_id (admin) or pay_token (public)' }, 400);
  }

  try {
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: String(row.currency || 'eur').toLowerCase(),
            product_data: { name: `Invoice ${row.internal_number}` },
            unit_amount: Math.round(Number(row.amount_due) * 100),
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          type: 'invoice_payment',
          invoice_id: row.invoice_id,
          workspace_id: row.workspace_id,
          internal_number: row.internal_number,
        },
      },
      success_url: pb.success_url || `${publicAppUrl()}/pay/${pb.pay_token}?status=success`,
      cancel_url: pb.cancel_url || `${publicAppUrl()}/pay/${pb.pay_token}?status=cancelled`,
    });

    await supabase
      .from('invoices')
      .update({
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripe_checkout_session_id: session.id,
      })
      .eq('id', row.invoice_id);

    return json({
      ok: true,
      checkout_url: session.url,
      session_id: session.id,
      invoice_id: row.invoice_id,
      internal_number: row.internal_number,
      amount: Number(row.amount_due),
      currency: row.currency,
      customer_display: row.customer_display,
    });
  } catch (err: any) {
    console.error('finance-pay-invoice error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
});
