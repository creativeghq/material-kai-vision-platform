// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { resolveWorkspaceConnector } from '../_shared/fiscal/registry.ts';
import { buildInvoiceInputFromDb, buildCreditNoteInputFromDb, buildDeliveryNoteInputFromDb, type FiscalOverrides } from '../_shared/fiscal/invoice-builder.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

// Sales/Finance — issue an invoice from an accepted quote.
//
// Flow:
//   1. Call `issue_invoice_from_quote(quote_id)` RPC. Creates a draft invoice + items
//      with cost_snapshot copied from quote_items. Idempotent — returns existing invoice
//      if one exists for the quote.
//   2. If body.issue_now=true, flip status draft → issued (stamps issued_at + due_at).
//   3. If body.submit_fiscal=true, transmit to the workspace's legal_invoice connector
//      (Novus → myDATA).
//
// Auth: admin / super_admin / owner / finance.

interface RequestBody {
  /** Create/find the invoice from this quote. Provide this OR invoice_id. */
  quote_id?: string;
  /** Operate on an existing invoice directly (e.g. submit a manual invoice to myDATA). */
  invoice_id?: string;
  /** Submit a credit note (myDATA 5.1) to the workspace's legal_invoice connector. */
  credit_note_id?: string;
  /** Submit a delivery note (myDATA 9.3 movement document) to the legal_invoice connector. */
  delivery_note_id?: string;
  issue_now?: boolean;
  /** Transmit the invoice to the workspace's `legal_invoice` connector (e.g. Novus → myDATA). */
  submit_fiscal?: boolean;
  /** Skip the provider's digital signature step (Novus ?skipSignature=true). */
  skip_signature?: boolean;
  /** Per-call myDATA overrides (invoice type, series/aa, income classification). */
  fiscal_overrides?: FiscalOverrides;
  /** #185 Law 5155 — issue this invoice as a card(7)/IRIS(8) receipt on a registered EFT-POS
   *  terminal. Forces skipSignature=false; the response carries the provider signature and the
   *  doc is held (fiscal_status='awaiting_payment') until pos_complete finalizes it. */
  pos_payment?: { terminal_id: string; pos_nsp_id: number; payment_type?: number };
  /** #185 Law 5155 — finalize a held POS/IRIS receipt after the terminal charge succeeded.
   *  Calls Novus CompletionPosInvoices → transmits to AADE → returns MARK. */
  pos_complete?: { pos_signature_id?: string; invoice_id?: string; transaction_id: string; payment_amount?: number; tip_amount?: number };
  /** Read-only: report whether the master e-invoicing connector key is configured for this
   *  workspace's legal_invoice capability (drives the Finance → Settings → e-Invoicing card). */
  fiscal_status?: { workspace_id: string };
}

// Platform cost per myDATA transmission (markup on Novus ~0.5-1 cr). Root transmits free.
const TRANSMISSION_CREDITS = 2;

type Reservation =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; code: 'insufficient_credits'; error: string; balance: number };

/** Atomically RESERVE (debit up-front) the transmission cost before we hand the document to
 *  the connector. `debit_user_credits` takes a row lock and returns success=false on
 *  insufficient balance — the previous flow only pre-checked the balance then debited AFTER a
 *  successful (paid) submit while swallowing failures, so a debit that lost the race gave away
 *  a free myDATA transmission. Reserving first closes that race; the returned `refund()` gives
 *  the credits back if the submit fails or the document is not accepted. Operator root
 *  transmits free. */
async function reserveTransmission(
  supabase: any, workspaceId: string, userId: string | undefined, description: string,
): Promise<Reservation> {
  const { data: ws } = await supabase.from('workspaces').select('is_root').eq('id', workspaceId).single();
  if (ws?.is_root || !userId) return { ok: true, refund: async () => {} }; // operator root transmits free

  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId, p_amount: TRANSMISSION_CREDITS,
    p_operation_type: 'einvoice_transmission', p_description: description,
    p_workspace_id: workspaceId ?? null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.success) {
    const balance = Number(row?.new_balance ?? 0);
    return {
      ok: false, code: 'insufficient_credits', balance,
      error: row?.error_message
        || `Not enough credits to transmit to myDATA (need ${TRANSMISSION_CREDITS}, have ${balance}). Please top up.`,
    };
  }
  return {
    ok: true,
    refund: async () => {
      const { error: rErr } = await supabase.rpc('refund_credits', {
        p_user_id: userId, p_amount: TRANSMISSION_CREDITS,
        p_operation_type: 'einvoice_transmission_refund',
        p_description: `Refund — ${description} (transmission not completed)`,
        p_workspace_id: workspaceId ?? null,
      });
      // A failed refund credits the USER's favour, never the platform's — log loudly for
      // manual reconciliation but do not fail the request over it.
      if (rErr) console.error('transmission refund FAILED — manual reconciliation needed', { userId, description, rErr });
    },
  };
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Authoritative buyer risk-gate, enforced server-side at ISSUANCE/TRANSMISSION (the client
 * NewInvoiceDialog shows the same banner, but a client-only gate is bypassable). Returns the
 * list of HARD blocks per the workspace's finance_settings risk rules. Drafts are never gated —
 * only the act of issuing or transmitting. `vat_validated===false` ⇒ ΑΑΔΕ-inactive / VIES-rejected;
 * null ⇒ never validated. Credit limit lives on the CRM party row; outstanding excludes this doc.
 */
async function buyerRiskBlocks(supabase: any, invoiceId: string): Promise<string[]> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('workspace_id, customer_company_id, customer_contact_id, total, document_type')
    .eq('id', invoiceId)
    .single();
  if (!inv) return [];

  const { data: s } = await supabase
    .from('finance_settings')
    .select('risk_block_inactive_vat, risk_block_unvalidated_vat, risk_warn_over_credit_limit, risk_block_over_credit_limit')
    .eq('workspace_id', inv.workspace_id)
    .maybeSingle();
  // No settings row ⇒ safe defaults (block inactive only).
  const rules = {
    block_inactive: s?.risk_block_inactive_vat ?? true,
    block_unvalidated: s?.risk_block_unvalidated_vat ?? false,
    block_over: s?.risk_block_over_credit_limit ?? false,
  };

  const blocks: string[] = [];
  const isCompany = !!inv.customer_company_id;
  const buyerId = inv.customer_company_id ?? inv.customer_contact_id;
  if (!buyerId) return blocks;

  // Companies carry vat_validated; contacts (retail/individuals) may not — only credit applies there.
  const cols = isCompany ? 'vat_number, vat_validated, credit_limit' : 'vat_number, credit_limit';
  const { data: buyer } = await supabase
    .from(isCompany ? 'crm_companies' : 'crm_contacts')
    .select(cols)
    .eq('id', buyerId)
    .maybeSingle();
  if (!buyer) return blocks;

  const hasVat = !!(buyer.vat_number && String(buyer.vat_number).trim());

  // myDATA correctness backstop: an invoice (τιμολόγιο, doc family 1.x/2.x) REQUIRES a
  // buyer VAT/ΑΦΜ — AADE rejects it for a VAT-less party. A private individual must be
  // issued a retail receipt (11.x). Block here (with a clear message) rather than let the
  // transmission fail downstream. The client dialog gates this too, but the gate is bypassable.
  const docFamily = String(inv.document_type ?? '').split('.')[0];
  if ((docFamily === '1' || docFamily === '2') && !hasVat) {
    blocks.push('an invoice (τιμολόγιο) requires a buyer VAT number — issue a retail receipt (11.x) for a private individual');
  }

  if (isCompany && hasVat) {
    if (rules.block_inactive && buyer.vat_validated === false) blocks.push('the buyer ΑΦΜ is inactive / not recognised');
    if (rules.block_unvalidated && (buyer.vat_validated === null || buyer.vat_validated === undefined)) blocks.push('the buyer VAT has never been validated');
  }

  if (rules.block_over && buyer.credit_limit != null && Number(buyer.credit_limit) > 0) {
    const col = isCompany ? 'customer_company_id' : 'customer_contact_id';
    const { data: openRows } = await supabase
      .from('invoices')
      .select('amount_due')
      .eq('workspace_id', inv.workspace_id)
      .eq(col, buyerId)
      .neq('id', invoiceId)
      .in('status', ['issued', 'partially_paid', 'overdue']);
    const outstanding = (openRows ?? []).reduce((acc: number, r: any) => acc + (Number(r.amount_due) || 0), 0);
    if (outstanding + (Number(inv.total) || 0) > Number(buyer.credit_limit)) {
      blocks.push('this invoice exceeds the buyer credit limit');
    }
  }
  return blocks;
}

/**
 * Quote→invoice auto-correct: the invoices.document_type column defaults to '1.1'
 * and issue_invoice_from_quote does NOT set it, so a quote for a VAT-less private
 * individual would produce an invoice (τιμολόγιο) that AADE rejects. Flip it to a
 * retail receipt (11.1) here — only on the quote path, where the doc type was the
 * unchosen default (ad-hoc invoices are gated in the dialog + by buyerRiskBlocks).
 */
async function autoReceiptForConsumerQuote(supabase: any, invoiceId: string): Promise<void> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('document_type, customer_company_id, customer_contact_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv) return;
  const fam = String(inv.document_type ?? '').split('.')[0];
  if (fam !== '1' && fam !== '2') return; // only invoice families require a VAT buyer
  const isCompany = !!inv.customer_company_id;
  const buyerId = inv.customer_company_id ?? inv.customer_contact_id;
  if (!buyerId) return;
  const { data: buyer } = await supabase
    .from(isCompany ? 'crm_companies' : 'crm_contacts')
    .select('vat_number')
    .eq('id', buyerId)
    .maybeSingle();
  const hasVat = !!(buyer?.vat_number && String(buyer.vat_number).trim());
  if (!hasVat) {
    await supabase.from('invoices').update({ document_type: '11.1' }).eq('id', invoiceId);
  }
}

/** Emit invoice_issued / receipt_issued so seeded flows notify + email the customer. */
async function emitDocumentIssued(supabase: any, invoiceId: string): Promise<void> {
  try {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, internal_number, legal_number, document_type, total, currency, customer_company_id, customer_contact_id, workspace_id')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!inv) return;
    const isReceipt = String(inv.document_type ?? '').startsWith('11');
    let name: string | null = null, email: string | null = null, userId: string | null = null;
    if (inv.customer_company_id) {
      const { data: c } = await supabase.from('crm_companies').select('name, email').eq('id', inv.customer_company_id).maybeSingle();
      name = c?.name ?? null; email = c?.email ?? null;
    } else if (inv.customer_contact_id) {
      const { data: c } = await supabase.from('crm_contacts').select('name, first_name, last_name, email, user_id').eq('id', inv.customer_contact_id).maybeSingle();
      name = c?.name || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || null; email = c?.email ?? null; userId = c?.user_id ?? null;
    }
    const num = inv.legal_number ?? inv.internal_number ?? '';
    const amount = `${Number(inv.total ?? 0).toFixed(2)} ${inv.currency ?? 'EUR'}`;
    const docWord = isReceipt ? 'Receipt' : 'Invoice';
    await emitFlowEvent(isReceipt ? 'receipt_issued' : 'invoice_issued', {
      type: isReceipt ? 'receipt_issued' : 'invoice_issued',
      user_id: userId ?? undefined,
      customer_email: email ?? undefined,
      customer_name: name ?? undefined,
      invoice_id: inv.id,
      document_number: num,
      document_type: inv.document_type ?? undefined,
      amount,
      currency: inv.currency ?? 'EUR',
      workspace_id: inv.workspace_id,
      title: `${docWord} ${num} issued`,
      body: `${docWord} ${num} for ${amount}${name ? ` to ${name}` : ''} has been issued.`,
      action_url: `/finance/invoices/${inv.id}`,
    }).catch(() => {});
  } catch { /* best-effort */ }
}

/**
 * #202 — is this user a FINANCE MANAGER (not just an allowed-in accountant) for the
 * workspace that owns this quote? Managers = workspace owner/admin OR a global
 * admin/super_admin/finance role. Runs under service role (auth.uid() is null), so we
 * resolve membership + global role by the authenticated user id directly.
 */
async function isFinanceManagerForQuote(
  supabase: ReturnType<typeof createClient>,
  quoteId: string,
  userId: string,
): Promise<boolean> {
  const { data: q } = await supabase.from('quotes').select('workspace_id').eq('id', quoteId).maybeSingle();
  if (!q?.workspace_id) return false;
  const [{ data: mem }, { data: prof }] = await Promise.all([
    supabase.from('workspace_members').select('role').eq('workspace_id', q.workspace_id).eq('user_id', userId).maybeSingle(),
    supabase.from('user_profiles').select('roles!user_profiles_role_id_fkey(name)').eq('user_id', userId).maybeSingle(),
  ]);
  const wsManager = !!mem && ['owner', 'admin'].includes((mem as any).role);
  const globalRole = (prof as any)?.roles?.name as string | undefined;
  const globalManager = !!globalRole && ['admin', 'super_admin', 'finance'].includes(globalRole);
  return wsManager || globalManager;
}

Deno.serve(withApiLogging('finance-issue-invoice', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req, {
      requireUser: true,
      // 'accountant' is allowed in so they can SUBMIT/transmit existing documents to myDATA
      // (#202). The privileged CREATE path (issue a new invoice from a quote) is guarded
      // separately below to managers only — an accountant can transmit + pay, never create.
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance', 'accountant'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.quote_id && !body.invoice_id && !body.credit_note_id && !body.delivery_note_id && !body.pos_complete && !body.fiscal_status) {
      return json({ error: 'quote_id, invoice_id, credit_note_id, delivery_note_id, pos_complete or fiscal_status is required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ── Read-only e-invoicing connector status (no document, no billing) ───────
    // Tells the Finance → Settings → e-Invoicing card whether the operator master key
    // is configured + whether we're pointing at sandbox or live, for THIS workspace's
    // legal_invoice binding. Any allowed finance role for the workspace may read it.
    if (body.fiscal_status) {
      const wsId = body.fiscal_status.workspace_id;
      if (!wsId) return json({ error: 'fiscal_status.workspace_id is required' }, 400);
      if (!(await userCanAccessWorkspace(supabase, auth.user!.id, wsId))) {
        return json({ error: 'Forbidden' }, 403);
      }
      const r = await resolveWorkspaceConnector(supabase, wsId, 'legal_invoice');
      if (r.ok) {
        return json({
          ok: true,
          connector_slug: r.resolved.slug,
          master_key_configured: r.resolved.isConfigured,
          is_sandbox: r.resolved.ctx.isSandbox,
        });
      }
      // not_configured / no_binding / not_implemented — surface the code + reason verbatim.
      return json({
        ok: true,
        connector_slug: 'novus',
        master_key_configured: false,
        is_sandbox: true,
        code: r.code,
        reason: r.error,
      });
    }

    // ── #185 POS/IRIS completion path ─────────────────────────────────────────
    // The terminal charge succeeded (transaction_id from the bank/NSP); finalize the held
    // receipt via Novus CompletionPosInvoices → AADE → MARK. Reserves transmission credits here
    // (the original submit refunded them because the doc was only held, not transmitted).
    if (body.pos_complete) {
      const pc = body.pos_complete;
      if (!pc.transaction_id) return json({ error: 'pos_complete.transaction_id is required' }, 400);
      if (!pc.pos_signature_id && !pc.invoice_id) return json({ error: 'pos_complete needs pos_signature_id or invoice_id' }, 400);

      let sigQuery = supabase.from('pos_signatures').select('*').eq('status', 'awaiting_payment');
      sigQuery = pc.pos_signature_id ? sigQuery.eq('id', pc.pos_signature_id) : sigQuery.eq('invoice_id', pc.invoice_id!);
      const { data: sig } = await sigQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!sig) return json({ error: 'No awaiting-payment signature found for this receipt' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, (sig as any).workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }
      if ((sig as any).expiry_date && new Date((sig as any).expiry_date).getTime() < Date.now()) {
        await supabase.from('pos_signatures').update({ status: 'expired', is_expired: true, updated_at: new Date().toISOString() }).eq('id', (sig as any).id);
        return json({ ok: false, code: 'signature_expired', error: 'The POS signature has expired. Re-issue the receipt.' }, 409);
      }

      const resolved: any = await resolveWorkspaceConnector(supabase, (sig as any).workspace_id, 'legal_invoice');
      if (!resolved.ok) return json({ ok: false, code: resolved.code, error: resolved.error }, 400);
      if (!resolved.resolved.connector.completePosInvoice) {
        return json({ ok: false, error: 'Connector does not support POS completion' }, 400);
      }

      const reserve = await reserveTransmission(supabase, (sig as any).workspace_id, auth.userId, `myDATA POS completion for receipt ${(sig as any).invoice_id ?? (sig as any).id}`);
      if (!reserve.ok) return json({ ok: false, code: reserve.code, balance: reserve.balance, error: reserve.error }, 402);

      try {
        const completion = await resolved.resolved.connector.completePosInvoice({
          signatureToken: (sig as any).signature_token,
          transactionId: pc.transaction_id,
          paymentAmount: pc.payment_amount ?? Number((sig as any).payment_amount),
          paymentType: (sig as any).payment_type ?? undefined,
          tipAmount: pc.tip_amount ?? Number((sig as any).tip_amount ?? 0),
        }, resolved.resolved.ctx);

        await supabase.from('fiscal_submissions').insert({
          workspace_id: (sig as any).workspace_id,
          invoice_id: (sig as any).invoice_id,
          connector_slug: resolved.resolved.slug,
          capability: 'legal_invoice',
          status: completion.ok ? 'accepted' : 'error',
          mark: completion.mark ?? null,
          is_offline: false,
          response_payload: completion.raw ?? null,
          error_message: completion.errorMessage ?? null,
        });

        if (!completion.ok) {
          await reserve.refund();
          return json({ ok: false, code: 'pos_completion_failed', error: completion.errorMessage ?? 'POS completion failed' }, 502);
        }

        await supabase.from('pos_signatures').update({
          status: 'completed', transaction_id: pc.transaction_id,
          final_mark: completion.mark ?? null, final_payment_type: completion.finalPaymentType ?? null,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', (sig as any).id);

        if ((sig as any).invoice_id) {
          await supabase.from('invoices').update({
            fiscal_status: 'accepted', fiscal_mark: completion.mark ?? null,
            fiscal_connector_slug: resolved.resolved.slug, fiscal_submitted_at: new Date().toISOString(),
          }).eq('id', (sig as any).invoice_id);
        }

        return json({ ok: true, pos_signature_id: (sig as any).id, invoice_id: (sig as any).invoice_id, fiscal: { ok: true, status: 'accepted', mark: completion.mark, finalPaymentType: completion.finalPaymentType } });
      } catch (err: any) {
        await reserve.refund();
        return json({ ok: false, error: err?.message ?? 'POS completion failed' }, 500);
      }
    }

    // ── Credit-note submission path (myDATA 5.1) ──────────────────────────────
    // A credit note is already created + the invoice already netted by issue_credit_note;
    // here we transmit it to the legal_invoice connector and stamp the MARK back.
    if (body.credit_note_id) {
      const { data: cnRow } = await supabase
        .from('credit_notes').select('workspace_id, fiscal_status, invoice_id')
        .eq('id', body.credit_note_id).maybeSingle();
      if (!cnRow) return json({ error: 'credit note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, cnRow.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }

      if (cnRow.fiscal_status === 'accepted') {
        return json({ ok: true, credit_note_id: body.credit_note_id, fiscal: { ok: true, skipped: true, reason: 'already_accepted' } });
      }

      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: cnRow.workspace_id, p_module_slug: 'sales-finance',
      });
      if (!entitled) {
        return json({ ok: false, code: 'not_entitled', error: 'Workspace not entitled to e-Invoicing.' }, 402);
      }

      const resolved = await resolveWorkspaceConnector(supabase, cnRow.workspace_id, 'legal_invoice');
      if (!resolved.ok) return json({ ok: false, code: resolved.code, error: resolved.error }, 400);

      // Reserve the transmission credits atomically before handing off to the connector.
      const cnReserve = await reserveTransmission(supabase, cnRow.workspace_id, auth.userId, `myDATA credit note ${body.credit_note_id}`);
      if (!cnReserve.ok) return json({ ok: false, code: cnReserve.code, balance: cnReserve.balance, error: cnReserve.error }, 402);

      try {
        const input = await buildCreditNoteInputFromDb(supabase, body.credit_note_id, body.fiscal_overrides ?? {});
        const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
          skipSignature: body.skip_signature,
        });

        await supabase.from('fiscal_submissions').insert({
          workspace_id: cnRow.workspace_id,
          invoice_id: cnRow.invoice_id, // correlated source invoice, for audit linkage
          connector_slug: resolved.resolved.slug,
          capability: 'legal_invoice',
          status: result.status,
          mark: result.mark ?? null,
          uid: result.uid ?? null,
          authentication_code: result.authenticationCode ?? null,
          qr_url: result.qrUrl ?? null,
          invoice_url: result.invoiceUrl ?? null,
          fiscal_invoice_type: input.header.invoiceType,
          series: input.header.series,
          aa: input.header.aa,
          is_offline: result.isOffline,
          transmission_failure: result.transmissionFailure ?? false,
          provider_credits: result.providerCredits ?? null,
          request_payload: input,
          response_payload: result.raw ?? null,
          error_code: result.errorCode ?? null,
          error_message: result.errorMessage ?? null,
        });

        const accepted = result.status === 'accepted' || result.status === 'offline';
        await supabase.from('credit_notes').update({
          fiscal_status: result.status,
          fiscal_mark: result.mark ?? null,
          status: accepted ? 'submitted' : 'failed',
          updated_at: new Date().toISOString(),
        }).eq('id', body.credit_note_id);

        // Document didn't transmit → give the reserved credits back.
        if (!accepted) await cnReserve.refund();

        const { data: finalCn } = await supabase.from('credit_notes').select('*').eq('id', body.credit_note_id).single();
        return json({ ok: true, credit_note_id: body.credit_note_id, credit_note: finalCn, fiscal: { ok: true, ...result } });
      } catch (err: any) {
        await cnReserve.refund();
        return json({ ok: false, error: err?.message ?? 'credit note submission failed' }, 500);
      }
    }

    // ── Delivery-note submission path (myDATA 9.3 movement document) ──────────
    // The note already exists + stock already moved by issue_delivery_note; here we
    // transmit the movement document and stamp the MARK back onto delivery_notes.
    if (body.delivery_note_id) {
      const { data: dnRow } = await supabase
        .from('delivery_notes').select('workspace_id, fiscal_status')
        .eq('id', body.delivery_note_id).maybeSingle();
      if (!dnRow) return json({ error: 'delivery note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, dnRow.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }

      if (dnRow.fiscal_status === 'accepted') {
        return json({ ok: true, delivery_note_id: body.delivery_note_id, fiscal: { ok: true, skipped: true, reason: 'already_accepted' } });
      }

      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: dnRow.workspace_id, p_module_slug: 'sales-finance',
      });
      if (!entitled) {
        return json({ ok: false, code: 'not_entitled', error: 'Workspace not entitled to e-Invoicing.' }, 402);
      }

      const resolved = await resolveWorkspaceConnector(supabase, dnRow.workspace_id, 'legal_invoice');
      if (!resolved.ok) return json({ ok: false, code: resolved.code, error: resolved.error }, 400);

      // Reserve the transmission credits atomically before handing off to the connector.
      const dnReserve = await reserveTransmission(supabase, dnRow.workspace_id, auth.userId, `myDATA delivery note ${body.delivery_note_id}`);
      if (!dnReserve.ok) return json({ ok: false, code: dnReserve.code, balance: dnReserve.balance, error: dnReserve.error }, 402);

      try {
        const input = await buildDeliveryNoteInputFromDb(supabase, body.delivery_note_id, body.fiscal_overrides ?? {});
        const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
          skipSignature: body.skip_signature,
        });

        await supabase.from('fiscal_submissions').insert({
          workspace_id: dnRow.workspace_id,
          connector_slug: resolved.resolved.slug,
          capability: 'legal_invoice',
          status: result.status,
          mark: result.mark ?? null,
          uid: result.uid ?? null,
          authentication_code: result.authenticationCode ?? null,
          qr_url: result.qrUrl ?? null,
          invoice_url: result.invoiceUrl ?? null,
          fiscal_invoice_type: input.header.invoiceType,
          series: input.header.series,
          aa: input.header.aa,
          is_offline: result.isOffline,
          transmission_failure: result.transmissionFailure ?? false,
          provider_credits: result.providerCredits ?? null,
          request_payload: input,
          response_payload: result.raw ?? null,
          error_code: result.errorCode ?? null,
          error_message: result.errorMessage ?? null,
        });

        const accepted = result.status === 'accepted' || result.status === 'offline';
        await supabase.from('delivery_notes').update({
          fiscal_status: result.status,
          fiscal_mark: result.mark ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', body.delivery_note_id);

        // Document didn't transmit → give the reserved credits back.
        if (!accepted) await dnReserve.refund();

        const { data: finalDn } = await supabase.from('delivery_notes').select('*').eq('id', body.delivery_note_id).single();
        return json({ ok: true, delivery_note_id: body.delivery_note_id, delivery_note: finalDn, fiscal: { ok: true, ...result } });
      } catch (err: any) {
        await dnReserve.refund();
        return json({ ok: false, error: err?.message ?? 'delivery note submission failed' }, 500);
      }
    }

    // 1. Resolve the invoice: existing invoice_id, or idempotent create from quote.
    let invoiceId: string;
    if (body.invoice_id) {
      invoiceId = body.invoice_id;
      // Bind direct-invoice operations (issue / submit to myDATA) to the caller's workspace.
      // Without this, any finance user could issue/transmit another tenant's invoice by id.
      const { data: invWs } = await supabase.from('invoices').select('workspace_id').eq('id', invoiceId).maybeSingle();
      if (!invWs) return json({ error: 'invoice not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, invWs.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }
    } else {
      // CREATE path (issue a new invoice from a quote) — managers only. Block accountants
      // (and any other non-manager allowed in for the submit path). auth.uid() is null under
      // service role, so resolve the caller's role for the quote's workspace explicitly.
      const mgr = await isFinanceManagerForQuote(supabase, body.quote_id!, auth.userId!);
      if (!mgr) {
        return json({ error: 'Only a finance manager can issue a new invoice. Accountants may transmit and pay existing documents.' }, 403);
      }
      const { data: created, error: rpcErr } = await supabase.rpc('issue_invoice_from_quote', {
        p_quote_id: body.quote_id,
      });
      if (rpcErr) return json({ error: `issue_invoice_from_quote failed: ${rpcErr.message}` }, 500);
      invoiceId = created as string;
      // VAT-less private individual → retail receipt, never an invoice (AADE would reject).
      await autoReceiptForConsumerQuote(supabase, invoiceId);
    }

    // 1b. Buyer risk-gate — authoritative server-side enforcement. Only gates the act of
    //     issuing or transmitting (drafts are always allowed). Mirrors the client banner.
    if (body.issue_now || body.submit_fiscal) {
      const blocks = await buyerRiskBlocks(supabase, invoiceId);
      if (blocks.length > 0) {
        return json({
          error: `Invoice blocked by risk check: ${blocks.join('; ')}. Fix the buyer in CRM or relax the rule under Finance → Settings → Buyer risk checks.`,
          code: 'buyer_risk_blocked',
          blocks,
        }, 422);
      }
    }

    // 2. Optional issue (draft → issued)
    let invoiceState: any = null;
    if (body.issue_now) {
      // Skip if already issued — mark_invoice_issued errors out on non-draft state.
      const { data: current } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();
      if (current?.status === 'draft') {
        const { error: issueErr } = await supabase.rpc('mark_invoice_issued', {
          p_invoice_id: invoiceId,
        });
        if (issueErr) return json({ error: `mark_invoice_issued failed: ${issueErr.message}` }, 500);
        // Notify + email the customer via the seeded flow (fire-and-forget).
        await emitDocumentIssued(supabase, invoiceId);
      }
    }

    // 3b. Optional fiscal submission via the workspace's legal_invoice connector
    //     (e.g. Novus → myDATA). Connector-driven, per-capability (C3). Graceful
    //     when no key is configured yet — returns a clear not_configured result.
    let fiscalResult: any = null;
    if (body.submit_fiscal) {
      const { data: invRow } = await supabase
        .from('invoices')
        .select('workspace_id, fiscal_status')
        .eq('id', invoiceId)
        .single();

      // Monetization gate (#181/#212): the workspace must own the Finance (sales-finance) module.
      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: invRow!.workspace_id,
        p_module_slug: 'sales-finance',
      });

      if (invRow?.fiscal_status === 'accepted') {
        fiscalResult = { ok: true, skipped: true, reason: 'already_accepted' };
      } else if (!entitled) {
        fiscalResult = {
          ok: false,
          code: 'not_entitled',
          error: 'This workspace is not entitled to e-Invoicing. The operator must enable it for this workspace.',
        };
      } else {
        const resolved: any = await resolveWorkspaceConnector(supabase, invRow!.workspace_id, 'legal_invoice');
        // Reserve transmission credits atomically before the connector handoff (see reserveTransmission).
        const reserve = resolved.ok
          ? await reserveTransmission(supabase, invRow!.workspace_id, auth.userId, `myDATA transmission for invoice ${invoiceId}`)
          : null;
        if (!resolved.ok) {
          fiscalResult = { ok: false, code: resolved.code, error: resolved.error };
        } else if (!reserve!.ok) {
          fiscalResult = { ok: false, code: reserve!.code, balance: reserve!.balance, error: reserve!.error };
        } else {
          try {
            // #185 POS/IRIS receipt — merge the EFT-POS terminal into the overrides and force
            // signing so Novus returns a provider signature instead of transmitting to AADE.
            const effOverrides: FiscalOverrides = { ...(body.fiscal_overrides ?? {}) };
            if (body.pos_payment) {
              effOverrides.posPayment = {
                type: body.pos_payment.payment_type ?? 7,
                terminalId: body.pos_payment.terminal_id,
                posNspId: body.pos_payment.pos_nsp_id,
              };
            }
            const input = await buildInvoiceInputFromDb(supabase, invoiceId, effOverrides);
            const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
              // POS receipts must be signed (skipSignature=false) to obtain the Law-5155 token.
              skipSignature: body.pos_payment ? false : body.skip_signature,
            });

            await supabase.from('fiscal_submissions').insert({
              workspace_id: invRow!.workspace_id,
              invoice_id: invoiceId,
              connector_slug: resolved.resolved.slug,
              capability: 'legal_invoice',
              status: result.status,
              mark: result.mark ?? null,
              uid: result.uid ?? null,
              authentication_code: result.authenticationCode ?? null,
              qr_url: result.qrUrl ?? null,
              invoice_url: result.invoiceUrl ?? null,
              fiscal_invoice_type: input.header.invoiceType,
              series: input.header.series,
              aa: input.header.aa,
              is_offline: result.isOffline,
              transmission_failure: result.transmissionFailure ?? false,
              provider_credits: result.providerCredits ?? null,
              request_payload: input,
              response_payload: result.raw ?? null,
              error_code: result.errorCode ?? null,
              error_message: result.errorMessage ?? null,
            });

            // #185 Held card/IRIS receipt: persist the signature for the terminal charge, mark the
            // invoice awaiting_payment, and refund the reservation — AADE transmission happens at
            // pos_complete (which reserves its own credits).
            if (result.status === 'awaiting_payment') {
              const firstSig = result.providerSignature?.[0];
              await supabase.from('pos_signatures').insert({
                workspace_id: invRow!.workspace_id,
                invoice_id: invoiceId,
                terminal_id: body.pos_payment?.terminal_id ?? null,
                pos_nsp_id: body.pos_payment?.pos_nsp_id ?? null,
                payment_type: body.pos_payment?.payment_type ?? 7,
                signature_token: firstSig?.token ?? '',
                signature_data: firstSig?.data ?? null,
                invoice_uid: firstSig?.invoiceUid ?? result.uid ?? null,
                payment_amount: input.summary.totalGrossValue,
                payment_balance: firstSig?.paymentBalance ?? null,
                expiry_date: firstSig?.expiryDate ?? null,
                is_expired: firstSig?.isExpired ?? false,
                created_by: auth.userId ?? null,
              });
              await supabase.from('invoices').update({ fiscal_status: 'awaiting_payment' }).eq('id', invoiceId);
              await reserve!.refund();
              fiscalResult = { ok: true, ...result };
              // fall through to read final state + respond below
            } else {

            const accepted = result.status === 'accepted' || result.status === 'offline';
            if (accepted) {
              await supabase
                .from('invoices')
                .update({
                  fiscal_status: result.status,
                  fiscal_mark: result.mark ?? null,
                  fiscal_uid: result.uid ?? null,
                  fiscal_qr_url: result.qrUrl ?? null,
                  fiscal_connector_slug: resolved.resolved.slug,
                  fiscal_submitted_at: new Date().toISOString(),
                })
                .eq('id', invoiceId);
            } else {
              await supabase.from('invoices').update({ fiscal_status: result.status }).eq('id', invoiceId);
            }

            // #181 the transmission was reserved (debited) up-front. Operator root reserves
            // free; sub-tenants keep the debit on an accepted/offline doc and get it back if
            // the document did not transmit.
            if (!accepted) await reserve!.refund();

            fiscalResult = { ok: true, ...result };
            } // end non-awaiting_payment branch
          } catch (err: any) {
            await reserve!.refund();
            fiscalResult = { ok: false, error: err?.message ?? 'fiscal submission failed' };
          }
        }
      }
    }

    // 4. Read final state for the response
    const { data: finalInvoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    return json({
      ok: true,
      invoice_id: invoiceId,
      invoice: finalInvoice,
      fiscal: fiscalResult,
    });
  } catch (err: any) {
    console.error('finance-issue-invoice error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
}));
