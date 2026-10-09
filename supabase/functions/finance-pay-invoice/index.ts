// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isPlatformOperator, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { getStripe, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
// multi-provider dispatch. Every gate (published ∧ entitled ∧ configured) is
// re-checked server-side at charge time; the client only expresses an intent.
import { dispatchToProvider, resolveWorkspacePaymentProviders } from '../_shared/payments/registry.ts';
import { ensureInvoiceRf } from '../_shared/payments/invoice-rf.ts';
import { recordPageEvent } from '../_shared/document-events.ts';
import { recordInvoicePayment } from '../_shared/payments/record-payment.ts';
import { runInBackground } from '../_shared/background.ts';
import { runPaymentProofCheck } from '../_shared/payments/payment-proof-ai.ts';
import { resolveBillingUser } from '../_shared/finance/billing-user.ts';
import { decodeBase64 } from 'jsr:@std/encoding@^1/base64';

/**
 * What the document IS at ΑΑΔΕ, shown on the public page next to what is owed. Read by the
 * token-resolved invoice id only; null until the document has a MARK.
 */
async function fiscalRecord(supabase: any, invoiceId: string) {
  const { data: inv } = await supabase.from('invoices')
    .select('fiscal_mark, fiscal_uid, fiscal_qr_url, fiscal_aade_qr_url, fiscal_connector_slug, issued_at, legal_number')
    .eq('id', invoiceId).maybeSingle();
  if (!inv?.fiscal_mark) return null;
  const [{ data: sub }, { data: conn }] = await Promise.all([
    supabase.from('fiscal_submissions').select('authentication_code')
      .eq('document_table', 'invoices').eq('document_id', invoiceId)
      .not('authentication_code', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    inv.fiscal_connector_slug
      ? supabase.from('fiscal_connectors').select('legal_display_name, legal_website')
        .eq('slug', inv.fiscal_connector_slug).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    legal_number: inv.legal_number ?? null,
    mark: String(inv.fiscal_mark),
    uid: inv.fiscal_uid ?? null,
    authentication_code: (sub as any)?.authentication_code ?? null,
    issued_at: inv.issued_at ?? null,
    provider_url: inv.fiscal_qr_url ?? null,
    aade_url: inv.fiscal_aade_qr_url ?? null,
    provider_name: (conn as any)?.legal_display_name ?? null,
    provider_website: (conn as any)?.legal_website ?? null,
  };
}

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
  /** Return a short-lived link to OUR PDF of the document. */
  pdf?: boolean;
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
  proofs_only?: boolean;
  /** Bank-transfer receipt the payer uploads. The type is sniffed from the bytes, never trusted. */
  upload_proof?: { file_base64: string; file_name?: string; note?: string };
}

const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_MAX_PER_INVOICE = 10;

function sniffProof(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number, sig: number[]) => sig.every((v, k) => b[i + k] === v);
  if (at(0, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', ext: 'pdf' };
  if (at(0, [0x89, 0x50, 0x4e, 0x47])) return { mime: 'image/png', ext: 'png' };
  if (at(0, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return { mime: 'image/webp', ext: 'webp' };
  if (at(4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}

/** The seller's accounts a customer may transfer to: active, shown on invoices, in the document's currency. */
async function bankTransferDetails(supabase: any, workspaceId: string, currency: string) {
  const [{ data: accts }, { data: fs }] = await Promise.all([
    supabase.from('finance_bank_accounts')
      .select('name, iban, bic, currency, is_default, sort_order')
      .eq('workspace_id', workspaceId).eq('is_active', true).eq('show_on_invoice', true).eq('kind', 'bank')
      .order('is_default', { ascending: false }).order('sort_order', { ascending: true }),
    supabase.from('finance_settings').select('business_name').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  const accounts = ((accts ?? []) as any[])
    .filter((a) => String(a.iban ?? '').trim() && (!a.currency || a.currency === currency))
    .map((a) => ({ bank_name: a.name ?? null, iban: String(a.iban).replace(/\s+/g, ''), bic: a.bic ?? null }));
  if (accounts.length === 0) return null;
  return { beneficiary: (fs as any)?.business_name ?? null, accounts };
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


interface ProofActionBody {
  confirm_proof?: { proof_id: string; amount: number; paid_on: string; bank_account_id?: string | null };
  recheck_proof?: { proof_id: string };
}

type PublicProofState = 'checking' | 'checked' | 'received' | 'confirmed' | 'rejected';

/** What the CUSTOMER may see of a proof: a state, never the checks (they would teach a forger). */
async function publicProofs(supabase: any, invoiceId: string) {
  const { data } = await supabase.rpc('get_invoice_payment_proofs', { p_invoice_id: invoiceId });
  return ((data ?? []) as any[]).map((p) => {
    const state: PublicProofState = p.status === 'rejected' ? 'rejected'
      : (p.status === 'accepted' || p.payment_id || p.bank_confirmed) ? 'confirmed'
        : p.ai_status === 'pending' ? 'checking'
          : p.ai_verdict === 'matches' ? 'checked'
            : 'received';
    return { id: p.id, created_at: p.created_at, file_name: p.file_name, state };
  });
}

async function handleProofAction(req: Request, supabase: any, body: ProofActionBody): Promise<Response> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);
  const proofId = body.confirm_proof?.proof_id ?? body.recheck_proof?.proof_id;
  if (typeof proofId !== 'string' || !proofId) return json({ error: 'proof_id required' }, 400);

  const { data: proof } = await supabase.from('invoice_payment_proofs')
    .select('id, invoice_id, workspace_id, status, file_deleted_at').eq('id', proofId).maybeSingle();
  if (!proof) return json({ error: 'not found' }, 404);
  const { data: booked } = await supabase.from('payments').select('id')
    .eq('provider', 'bank_proof').eq('provider_ref', proof.id).maybeSingle();
  // authenticate() hands back the SERVICE-ROLE client, so the manager test is explicit (owner/admin).
  const { data: mem } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', proof.workspace_id).eq('user_id', auth.userId).eq('status', 'active').maybeSingle();
  const isManager = ['owner', 'admin'].includes(String((mem as any)?.role ?? '')) || await isPlatformOperator(supabase, auth.userId);
  if (!isManager) return json({ error: 'not found' }, 404);

  if (body.recheck_proof) {
    if (booked || proof.status !== 'submitted') return json({ error: 'this receipt is already settled' }, 409);
    if (proof.file_deleted_at) return json({ error: 'the receipt file was deleted when the order completed' }, 409);
    const { error: resetErr } = await supabase.from('invoice_payment_proofs').update({ ai_status: 'pending', ai_error: null }).eq('id', proof.id);
    if (resetErr) return json({ error: 'the receipt could not be re-checked right now' }, 500);
    await runPaymentProofCheck(supabase, proof.id, auth.userId);
    const { data: rows } = await supabase.rpc('get_invoice_payment_proofs', { p_invoice_id: proof.invoice_id });
    return json({ ok: true, proof: ((rows ?? []) as any[]).find((r) => r.id === proof.id) ?? null });
  }

  const c = body.confirm_proof!;
  // A replay after a lost response returns what was booked, before any check that the booking changed.
  if (booked) return json({ ok: true, payment_id: booked.id, duplicate: true, issued: null, issue_error: null, proof_stamp_error: null });
  if (proof.status === 'rejected') return json({ error: 'this receipt was rejected' }, 409);
  const { data: inv } = await supabase.from('invoices')
    .select('id, workspace_id, currency, amount_due, status').eq('id', proof.invoice_id).maybeSingle();
  if (!inv || inv.workspace_id !== proof.workspace_id) return json({ error: 'not found' }, 404);
  if (inv.status === 'void' || inv.status === 'credit_noted') return json({ error: 'this document is closed' }, 409);
  const amount = Math.round(Number(c.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'enter the amount received' }, 400);
  if (amount > Number(inv.amount_due) + 0.005) return json({ error: 'that is more than is still owed on this document' }, 400);
  if (typeof c.paid_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.paid_on)) return json({ error: 'enter the date the money arrived' }, 400);
  if (new Date(`${c.paid_on}T00:00:00Z`).getTime() > Date.now() + 36 * 3600 * 1000) return json({ error: 'the payment date is in the future' }, 400);
  let bankAccountId: string | null = null;
  if (c.bank_account_id) {
    const { data: acct } = await supabase.from('finance_bank_accounts')
      .select('id').eq('id', c.bank_account_id).eq('workspace_id', inv.workspace_id).maybeSingle();
    if (!acct) return json({ error: 'unknown bank account' }, 400);
    bankAccountId = acct.id;
  }

  // providerRef = the proof id: a retry after a dropped response replays, it never books twice.
  const res = await recordInvoicePayment(supabase, inv.id, {
    provider: 'bank_proof',
    providerRef: proof.id,
    providerLabel: 'Bank transfer',
    amount,
    currency: String(inv.currency ?? 'EUR'),
    method: 'bank_transfer',
    bankAccountId,
    paidAt: `${c.paid_on}T12:00:00Z`,
    notes: 'Bank transfer, confirmed from the customer receipt',
  });
  if (!res.ok) return json({ error: res.error ?? 'the payment could not be recorded' }, 500);
  const { error: stampErr } = await supabase.from('invoice_payment_proofs')
    .update({ status: 'accepted', reviewed_by: auth.userId }).eq('id', proof.id);
  return json({
    ok: true, payment_id: res.paymentId ?? null, duplicate: !!res.duplicate,
    issued: res.issued ?? null, issue_error: res.issue_error ?? null,
    proof_stamp_error: stampErr?.message ?? null,
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
  const stripe = await getStripe();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: AdminBody | PublicBody | OrderReturnBody | ProofActionBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  if ('confirm_proof' in body || 'recheck_proof' in body) {
    return await handleProofAction(req, supabase, body as ProofActionBody);
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

      const { data: inv, error: invErr } = await auth.supabase
        .from('invoices')
        .select('*')
        .eq('id', (body as AdminBody).invoice_id)
        .maybeSingle();
      if (invErr || !inv) return json({ error: 'invoice not found or not accessible' }, 404);

      // authenticate() returns the SERVICE-ROLE client, so the SELECT above does NOT enforce RLS.
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

      /**
       * The same routing verdict the pay page uses (#359 CM-18).
       *
       * This read `get_workspace_payout_account` and simply omitted `transfer_data` when it came
       * back empty — a charge on the PLATFORM account for a tenant's invoice, settling the
       * tenant's revenue into the operator's balance along with its chargeback liability.
       */
      const { data: routing } = await supabase.rpc('stripe_charge_routing', { p_workspace_id: inv.workspace_id });
      const route = (Array.isArray(routing) ? routing[0] : routing) as
        { destination: string | null; allowed: boolean; reason: string } | null;
      if (!route?.allowed) {
        return json({
          error: 'This workspace has not connected Stripe yet, so a card payment cannot be settled to it. '
            + 'Finish Stripe onboarding in Payments settings, or send the invoice with a bank transfer.',
          code: 'stripe_connect_required',
        }, 409);
      }
      const destAcct = route.destination;

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
        // Customer-self mode has no token; fall back to the invoice page. `/admin/finance` was
        // the fallback here and has never been a route — a card payment made without a share
        // token returned the payer to the catch-all 404, with the charge already taken.
        success_url: (body as AdminBody).success_url
          || (token ? `${publicAppUrl()}/pay/${token}?status=success` : `${publicAppUrl()}/finance/invoices/${inv.id}?status=success`),
        cancel_url: (body as AdminBody).cancel_url
          || (token ? `${publicAppUrl()}/pay/${token}?status=cancelled` : `${publicAppUrl()}/finance/invoices/${inv.id}?status=cancelled`),
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
    if (pb.proofs_only) {
      return json({ ok: true, proofs: await publicProofs(supabase, row.invoice_id), amount_due: Number(row.amount_due) });
    }
    if (pb.pdf) {
      // The token decided WHICH invoice; nothing else from the caller reaches the renderer.
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/finance-invoice-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ invoice_id: row.invoice_id }),
      });
      const out = await res.json().catch(() => null) as { pdf_url?: string; error?: string } | null;
      if (!res.ok || !out?.pdf_url) return json({ error: out?.error ?? 'The PDF could not be produced right now.' }, 502);
      recordPageEvent(supabase, req, 'downloaded', {
        entityType: 'invoice', entityId: row.invoice_id, workspaceId: row.workspace_id,
        metadata: { internal_number: row.internal_number ?? null, surface: 'pay_link' },
      }).catch(() => {});
      return json({ ok: true, pdf_url: out.pdf_url });
    }
    // Cancelled or credited: nothing to pay, but the customer still holds a filed document.
    if (row.status === 'void' || row.status === 'credit_noted') {
      return json({
        ok: true, closed: true, status: row.status, invoice_id: row.invoice_id,
        internal_number: row.internal_number, currency: row.currency,
        fiscal: await fiscalRecord(supabase, row.invoice_id),
      }, 200);
    }
    if (Number(row.amount_due) <= 0) {
      return json({
        ok: true, already_paid: true, invoice_id: row.invoice_id,
        internal_number: row.internal_number, currency: row.currency,
        fiscal: await fiscalRecord(supabase, row.invoice_id),
      }, 200);
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

    if (pb.upload_proof) {
      const up = pb.upload_proof;
      if (typeof up.file_base64 !== 'string' || !up.file_base64) return json({ error: 'attach a file' }, 400);
      if (up.file_base64.length > Math.ceil(PROOF_MAX_BYTES / 3) * 4 + 4) return json({ error: 'the file is larger than 5 MB' }, 413);
      let bytes: Uint8Array;
      try { bytes = decodeBase64(up.file_base64); } catch { return json({ error: 'the file could not be read' }, 400); }
      if (bytes.length === 0) return json({ error: 'the file is empty' }, 400);
      if (bytes.length > PROOF_MAX_BYTES) return json({ error: 'the file is larger than 5 MB' }, 413);
      const kind = sniffProof(bytes);
      if (!kind) return json({ error: 'upload a PDF or an image (JPG, PNG, WEBP, HEIC)' }, 415);
      if (!(await bankTransferDetails(supabase, row.workspace_id, row.currency))) {
        return json({ error: 'this seller does not take bank transfers' }, 409);
      }
      const { count, error: countErr } = await supabase.from('invoice_payment_proofs')
        .select('id', { count: 'exact', head: true }).eq('invoice_id', row.invoice_id);
      if (countErr) return json({ error: 'the upload is unavailable right now — please try again' }, 503);
      if ((count ?? 0) >= PROOF_MAX_PER_INVOICE) return json({ error: 'too many receipts uploaded for this document — contact the seller' }, 429);

      const path = `payment-proofs/${row.workspace_id}/${row.invoice_id}/${crypto.randomUUID()}.${kind.ext}`;
      const { error: upErr } = await supabase.storage.from('pdf-documents')
        .upload(path, bytes, { contentType: kind.mime, upsert: false });
      if (upErr) return json({ error: 'the upload failed — please try again' }, 502);
      const note = typeof up.note === 'string' ? up.note.trim().slice(0, 1000) : '';
      const fileName = typeof up.file_name === 'string' ? up.file_name.trim().slice(0, 200) : null;
      const { data: proof, error: insErr } = await supabase.from('invoice_payment_proofs').insert({
        workspace_id: row.workspace_id, invoice_id: row.invoice_id,
        storage_bucket: 'pdf-documents', storage_object_path: path,
        file_name: fileName, mime_type: kind.mime, size_bytes: bytes.length, note: note || null,
      }).select('id, created_at').single();
      if (insErr || !proof) {
        await supabase.storage.from('pdf-documents').remove([path]).catch(() => {});
        if (insErr?.code === 'P0001') return json({ error: 'too many receipts uploaded for this document — contact the seller' }, 429);
        return json({ error: 'the receipt could not be saved — please try again' }, 500);
      }
      const billingUser = await resolveBillingUser(supabase, row.workspace_id, row.invoice_id);
      await runInBackground(runPaymentProofCheck(supabase, (proof as any).id, billingUser));
      return json({ ok: true, proof: { id: (proof as any).id, created_at: (proof as any).created_at, file_name: fileName, state: 'checking' } });
    }

    if (pb.info_only) {
      // Delivery trail: this branch IS the /pay/:token page render — the customer
      // has the invoice open in front of them. Recorded here rather than on the
      // checkout call, which is an intent to pay, not a view. Fire-and-forget: a
      // failed analytics write must never stop someone paying an invoice.
      recordPageEvent(supabase, req, 'viewed', {
        entityType: 'invoice',
        entityId: row.invoice_id,
        workspaceId: row.workspace_id,
        metadata: { internal_number: row.internal_number ?? null, surface: 'pay_link' },
      }).catch(() => {});

      // Which providers can this seller actually charge with right now?
      // `configuredOnly` matters on a customer-facing surface: a buyer must never be
      // offered a method that cannot take their money.
      const available = await resolveWorkspacePaymentProviders(supabase, row.workspace_id, {
        configuredOnly: true,
      });
      // Stripe is only genuinely available if the platform key exists too.
      const providers = available.filter((p) => p.slug !== 'stripe' || !!stripe);
      const [bankTransfer, { data: lines }, { data: head }, proofs] = await Promise.all([
        bankTransferDetails(supabase, row.workspace_id, row.currency),
        supabase.from('invoice_items').select('description, sku, quantity, unit, unit_price, discounted_price, line_total')
          .eq('invoice_id', row.invoice_id).order('added_at', { ascending: true }),
        supabase.from('invoices').select('created_at, subtotal_net, vat_amount, total_withheld_amount, total_fees_amount, total_stamp_duty_amount, total_other_taxes_amount, total_deductions_amount').eq('id', row.invoice_id).maybeSingle(),
        publicProofs(supabase, row.invoice_id),
      ]);

      return json({
        ok: true,
        info: true,
        invoice_id: row.invoice_id,
        internal_number: row.internal_number,
        customer_display: row.customer_display,
        currency: row.currency,
        status: row.status,
        is_pre_invoice: isPreInvoice,
        fiscal: await fiscalRecord(supabase, row.invoice_id),
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
        bank_transfer: bankTransfer,
        created_at: (head as any)?.created_at ?? null,
        subtotal_net: (head as any)?.subtotal_net != null ? Number((head as any).subtotal_net) : null,
        vat_amount: (head as any)?.vat_amount != null ? Number((head as any).vat_amount) : null,
        other_totals: {
          withheld: Number((head as any)?.total_withheld_amount ?? 0),
          fees: Number((head as any)?.total_fees_amount ?? 0),
          stamp_duty: Number((head as any)?.total_stamp_duty_amount ?? 0),
          other_taxes: Number((head as any)?.total_other_taxes_amount ?? 0),
          deductions: Number((head as any)?.total_deductions_amount ?? 0),
        },
        lines: ((lines ?? []) as any[]).map((l) => ({
          description: l.description, sku: l.sku ?? null, unit: l.unit ?? null,
          quantity: Number(l.quantity), unit_price: Number(l.unit_price), line_total: Number(l.line_total),
          discount: l.discounted_price != null ? Number(l.discounted_price) : null,
        })),
        proofs,
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
    // Legacy callers that omit the provider get the workspace's FIRST configured one
    // (registry order: stripe, viva, revolut) — a hardcoded 'stripe' default left
    // Stripe-less workspaces dead on those paths.
    let providerSlug = pb.provider;
    if (!providerSlug) {
      const avail = await resolveWorkspacePaymentProviders(supabase, row.workspace_id, { configuredOnly: true });
      providerSlug = avail[0]?.slug ?? 'stripe';
    }
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

    // Viva bank transfer for the FULL balance → reuse the document's own never-expiring RF
    // (the one printed on the invoice/email), so the buyer sees the SAME code, and one
    // order settles the invoice. A partial/deposit falls through to a fresh amount-locked RF.
    if (providerSlug === 'viva' && method === 'bank_reference' && !isPartial) {
      const rf = await ensureInvoiceRf(supabase, row.invoice_id);
      if (rf) {
        return json({
          ok: true,
          provider: 'viva',
          method,
          invoice_id: row.invoice_id,
          internal_number: row.internal_number,
          amount: chargeAmount,
          amount_due: amountDue,
          partial: false,
          currency: row.currency,
          customer_display: row.customer_display,
          payment_kind: 'bank_reference',
          rf_code: rf.rfCode,
          order_code: rf.orderCode,
        });
      }
      // ensureInvoiceRf returned null (shouldn't, since dispatch resolved) → fall through.
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
