// deno-lint-ignore-file no-explicit-any
import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { normalizeVat } from '../_shared/crm/vatNormalize.generated.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { resolveWorkspaceConnector } from '../_shared/fiscal/registry.ts';
import { buildInvoiceInputFromDb, buildCreditNoteInputFromDb, buildDeliveryNoteInputFromDb, type FiscalOverrides } from '../_shared/fiscal/invoice-builder.ts';
import { emitDocumentIssued } from '../_shared/fiscal/document-issued.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// Sales/Finance — issue an invoice from an accepted quote.
// Flow:
//   1. Call `issue_invoice_from_quote(quote_id)` RPC. Creates a draft invoice + items
//      with cost_snapshot copied from quote_items. Idempotent — returns existing invoice
//      if one exists for the quote.
//   2. If body.issue_now=true, flip status draft → issued (stamps issued_at + due_at).
//   3. If body.submit_fiscal=true, transmit to the workspace's legal_invoice connector
//      (Novus → myDATA).
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
  /** Cancel an already-transmitted delivery note (myDATA 9.3) at the provider. This is the ONLY
   *  document myDATA lets us withdraw — a transmitted INVOICE is immutable and is corrected by a
   *  credit note instead (the provider has no CancelInvoice route: probed 2026-09-06, HTTP 404). */
  cancel_delivery_note?: { delivery_note_id: string };
  issue_now?: boolean;
  /** Transmit the invoice to the workspace's `legal_invoice` connector (e.g. Novus → myDATA). */
  submit_fiscal?: boolean;
  /** Skip the provider's digital signature step (Novus ?skipSignature=true). */
  skip_signature?: boolean;
  /** Per-call myDATA overrides (invoice type, series/aa, income classification). */
  fiscal_overrides?: FiscalOverrides;
  /** Law 5155 — issue this invoice as a card(7)/IRIS(8) receipt on a registered EFT-POS
   *  terminal. Forces skipSignature=false; the response carries the provider signature and the
   *  doc is held (fiscal_status='awaiting_payment') until pos_complete finalizes it. */
  pos_payment?: { terminal_id: string; pos_nsp_id: number; payment_type?: number };
  /** Law 5155 — finalize a held POS/IRIS receipt after the terminal charge succeeded.
   *  Calls Novus CompletionPosInvoices → transmits to AADE → returns MARK. */
  pos_complete?: { pos_signature_id?: string; invoice_id?: string; transaction_id: string; payment_amount?: number; tip_amount?: number };
  /** Read-only: report whether the master e-invoicing connector key is configured for this
   *  workspace's legal_invoice capability (drives the Finance → Settings → e-Invoicing card). */
  fiscal_status?: { workspace_id: string };
  /** Trusted server-side relay for the invoice_issued / receipt_issued flow event. The browser
   *  cannot emit these directly (they are in flow-engine's SERVER_ONLY_EVENTS #256), so the
   *  manual "New invoice" path calls this after mark_invoice_issued to fire the notify/email flow. */
  emit_issued?: { invoice_id: string };
}

// Platform cost per myDATA transmission (markup on Novus ~0.5-1 cr). Root transmits free.
const TRANSMISSION_CREDITS = 2;

type Reservation =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; code: 'insufficient_credits'; error: string; balance: number };

/** Atomically RESERVE (debit up-front) the transmission cost before we hand the document to
 *  the connector. `debit_credits` (workspace pool → personal) takes a row lock and returns success=false on
 *  insufficient balance — the previous flow only pre-checked the balance then debited AFTER a
 *  successful (paid) submit while swallowing failures, so a debit that lost the race gave away
 *  a free myDATA transmission. Reserving first closes that race; the returned `refund()` gives
 *  the credits back if the submit fails or the document is not accepted. Operator root
 *  transmits free. */
async function reserveTransmission(
  // `string | null`, because that is what `auth.userId` IS at every call site — null at
  // 'secret'/'anon' level. The `!userId` check below treats null and undefined identically, so
  // this widening is the signature catching up with the callers, not a behaviour change.
  supabase: any, workspaceId: string, userId: string | null | undefined, description: string,
  /** Which document this debit is for. Stamped onto the credit_transactions row so
   *  finance-fiscal-offline-recovery can find and reverse it when a document that went
   *  OFFLINE (credits kept) is later refused by AADE (#193). Without it the cron would have
   *  to match on the description string. */
  doc?: { table: 'invoices' | 'credit_notes' | 'delivery_notes'; id: string },
): Promise<Reservation> {
  const { data: ws } = await supabase.from('workspaces').select('is_root').eq('id', workspaceId).single();
  if (ws?.is_root || !userId) return { ok: true, refund: async () => {} }; // operator root transmits free

  const meta = doc ? { einvoice_document_table: doc.table, einvoice_document_id: doc.id } : null;
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId, p_amount: TRANSMISSION_CREDITS,
    p_operation_type: 'einvoice_transmission', p_description: description,
    p_metadata: meta,
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
        p_metadata: meta,
        p_workspace_id: workspaceId ?? null,
      });
      // A failed refund credits the USER's favour, never the platform's — log loudly for
      // manual reconciliation but do not fail the request over it.
      if (rErr) console.error('transmission refund FAILED — manual reconciliation needed', { userId, description, rErr });
    },
  };
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
    .select('risk_block_inactive_vat, risk_block_unvalidated_vat, risk_warn_over_credit_limit, risk_block_over_credit_limit, risk_block_min_order, risk_block_unpaid_invoice, min_order_value')
    .eq('workspace_id', inv.workspace_id)
    .maybeSingle();
  // No settings row ⇒ safe defaults (block inactive only).
  const rules = {
    block_inactive: s?.risk_block_inactive_vat ?? true,
    block_unvalidated: s?.risk_block_unvalidated_vat ?? false,
    block_over: s?.risk_block_over_credit_limit ?? false,
    // These two are offered in Finance → Settings → "Buyer risk
    // rules" as **Block** switches (and persisted fine) but NOTHING read them — this
    // select listed only the four columns above, so an operator could enable
    // "Block issuance while the buyer has an unpaid / overdue invoice" and every
    // invoice issued regardless. A financial control that reported active while
    // being absent. Default false: enabling stays an explicit operator choice, so
    // this cannot start blocking issuance for anyone who has not asked for it.
    block_min_order: s?.risk_block_min_order ?? false,
    block_unpaid: s?.risk_block_unpaid_invoice ?? false,
  };

  const blocks: string[] = [];

  // Minimum order value — depends only on the invoice total, so it is checked before
  // the buyer lookup (it must apply to buyer-less documents too). Guarded on > 0: a
  // null/0 minimum means "no minimum", never "block everything".
  const minOrderValue = Number(s?.min_order_value ?? 0);
  if (rules.block_min_order && minOrderValue > 0 && (Number(inv.total) || 0) < minOrderValue) {
    blocks.push(`this document is below the minimum order value (${minOrderValue})`);
  }

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

  // Both the credit-limit and the unpaid-invoice rule need the buyer's OPEN documents.
  // Fetch once and share rather than querying twice when both are enabled.
  // `['issued','partially_paid','overdue']` is this function's existing definition of
  // "outstanding" (it backed the credit-limit rule); reused verbatim so "unpaid /
  // overdue" in the settings copy means exactly the same thing everywhere.
  const needsOpenDocs =
    (rules.block_over && buyer.credit_limit != null && Number(buyer.credit_limit) > 0) ||
    rules.block_unpaid;

  let openRows: any[] = [];
  if (needsOpenDocs) {
    const col = isCompany ? 'customer_company_id' : 'customer_contact_id';
    const { data } = await supabase
      .from('invoices')
      .select('amount_due, status')
      .eq('workspace_id', inv.workspace_id)
      .eq(col, buyerId)
      .neq('id', invoiceId)
      .in('status', ['issued', 'partially_paid', 'overdue']);
    openRows = data ?? [];
  }

  if (rules.block_unpaid && openRows.length > 0) {
    const overdue = openRows.filter((r: any) => r.status === 'overdue').length;
    blocks.push(
      overdue > 0
        ? `the buyer has ${overdue} overdue invoice(s)`
        : `the buyer has ${openRows.length} unpaid invoice(s)`,
    );
  }

  if (rules.block_over && buyer.credit_limit != null && Number(buyer.credit_limit) > 0) {
    const outstanding = openRows.reduce((acc: number, r: any) => acc + (Number(r.amount_due) || 0), 0);
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

// `emitDocumentIssued` moved to `_shared/fiscal/document-issued.ts`: the online-payment path
// (`record-payment.ts`) issues a paid draft and has to fire the same event.

/**
 * Whose credits a SERVER-initiated transmission debits.
 *
 * A webhook has no user: `reserveTransmission` with a null user id transmits for FREE, which is
 * the operator-root exemption leaking to every tenant whose draft was paid online. The document
 * belongs to a workspace, so the workspace pays — through whoever created the invoice, else its
 * owner. Null only when the workspace has neither, in which case the caller's existing rule
 * (no user → no debit) applies and is logged as such.
 */
async function resolveBillingUser(supabase: any, workspaceId: string, invoiceId: string): Promise<string | null> {
  const { data: inv } = await supabase.from('invoices').select('created_by').eq('id', invoiceId).maybeSingle();
  if (inv?.created_by) return inv.created_by as string;
  const { data: owner } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) console.warn('[finance-issue-invoice] no billing user for workspace', workspaceId, '— transmission will not be debited');
  return (owner?.user_id as string | undefined) ?? null;
}

/**
 * Is this user a FINANCE MANAGER (not just an allowed-in accountant) for the
 * workspace that owns this quote? Managers = workspace owner/admin OR a global
 * admin/super_admin/finance role. Runs under service role (auth.uid() is null), so we
 * resolve membership + global role by the authenticated user id directly.
 */
async function isFinanceManagerForQuote(
  supabase: DbClient,
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

export type DocumentTable = 'invoices' | 'credit_notes' | 'delivery_notes';

interface AcceptedSubmission {
  status: string;
  mark: string | null;
  uid: string | null;
  qr_url: string | null;
  invoice_url: string | null;
  connector_slug: string | null;
  is_offline: boolean | null;
}

/**
 * Has this EXACT document already been accepted by the authority?
 *
 * Keyed on (document_table, document_id), not on `invoice_id`: a credit note stores the SOURCE
 * invoice's id there, so keying on it would let one invoice's submission answer for its credit
 * note and vice versa.
 *
 * `failed` is deliberately distinct from "no row". A read that errored means we do not KNOW
 * whether the document was sent, and a caller must treat that as "do not send" — the whole point
 * of the guard is that transmitting twice cannot be undone.
 */
async function findAcceptedSubmission(
  supabase: DbClient,
  documentTable: DocumentTable,
  documentId: string,
): Promise<{ row: AcceptedSubmission | null; failed: boolean }> {
  const { data, error } = await supabase
    .from('fiscal_submissions')
    .select('status, mark, uid, qr_url, invoice_url, connector_slug, is_offline')
    .eq('document_table', documentTable)
    .eq('document_id', documentId)
    .in('status', ['accepted', 'offline'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { row: null, failed: true };
  return { row: (data?.[0] as AcceptedSubmission | undefined) ?? null, failed: false };
}

/**
 * Put the MARK back on a document whose transmission succeeded but whose stamp write was lost.
 * Reads from the durable submission row, so it cannot invent a fiscal fact.
 */
async function stampInvoiceFromSubmission(
  supabase: DbClient,
  invoiceId: string,
  sub: AcceptedSubmission,
): Promise<void> {
  await supabase
    .from('invoices')
    .update({
      fiscal_status: sub.status,
      fiscal_mark: sub.mark,
      fiscal_uid: sub.uid,
      fiscal_qr_url: sub.qr_url,
      fiscal_connector_slug: sub.connector_slug,
      fiscal_error: null,
    })
    .eq('id', invoiceId);
}

Deno.serve(withApiLogging('finance-issue-invoice', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req, {
      requireUser: true,
      // 'accountant' is allowed in so they can SUBMIT/transmit existing documents to myDATA
      // . The privileged CREATE path (issue a new invoice from a quote) is guarded
      // separately below to managers only — an accountant can transmit + pay, never create.
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance', 'accountant'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.quote_id && !body.invoice_id && !body.credit_note_id && !body.delivery_note_id && !body.cancel_delivery_note && !body.pos_complete && !body.fiscal_status && !body.emit_issued) {
      return json({ error: 'quote_id, invoice_id, credit_note_id, delivery_note_id, cancel_delivery_note, pos_complete, fiscal_status or emit_issued is required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ── Trusted relay: fire invoice_issued / receipt_issued for an already-issued invoice ──────
    // The manual NewInvoiceDialog / InvoiceDetailPage path issues via the mark_invoice_issued RPC
    // client-side, then calls this to emit the flow event from trusted server code (the browser
    // can't — invoice_issued/receipt_issued are SERVER_ONLY_EVENTS in flow-engine, #256). We only
    // relay for an invoice the caller can access; no document is created or mutated here.
    if (body.emit_issued) {
      const invId = body.emit_issued.invoice_id;
      if (!invId) return json({ error: 'emit_issued.invoice_id is required' }, 400);
      const { data: invRow } = await supabase.from('invoices').select('workspace_id').eq('id', invId).maybeSingle();
      if (!invRow) return json({ error: 'Invoice not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.user!.id, (invRow as any).workspace_id))) {
        return json({ error: 'Forbidden' }, 404); // 404 (not 403) to avoid id enumeration
      }
      await emitDocumentIssued(supabase, invId);
      return json({ ok: true });
    }

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

    // ── POS/IRIS completion path ─────────────────────────────────────────
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

      // CompletionPosInvoices transmits synchronously and returns the MARK, so this path never
      // lands in the offline sweep — stamped anyway so every transmission debit is traceable to
      // its document by the same key.
      const reserve = await reserveTransmission(supabase, (sig as any).workspace_id, auth.userId, `myDATA POS completion for receipt ${(sig as any).invoice_id ?? (sig as any).id}`,
        (sig as any).invoice_id ? { table: 'invoices', id: (sig as any).invoice_id } : undefined);
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
          document_table: 'invoices',
          document_id: (sig as any).invoice_id,
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
        .from('credit_notes').select('id, workspace_id, fiscal_status, invoice_id')
        .eq('id', body.credit_note_id).maybeSingle();
      if (!cnRow) return json({ error: 'credit note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, cnRow.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }

      if (cnRow.fiscal_status === 'accepted') {
        return json({ ok: true, credit_note_id: body.credit_note_id, fiscal: { ok: true, skipped: true, reason: 'already_accepted' } });
      }

      // Same claim as the invoice path: the SUBMISSION is the record of what ΑΑΔΕ was told, and
      // `credit_notes.fiscal_status` is written after the connector returns. A credit note reverses
      // a real document — sending it twice credits the customer twice.
      const cnPrior = await findAcceptedSubmission(supabase, 'credit_notes', cnRow.id);
      if (cnPrior.failed) {
        return json({ ok: false, code: 'submission_history_unavailable',
          error: 'Could not read the transmission history for this credit note, so it was not re-sent. Try again.' }, 503);
      }
      if (cnPrior.row) {
        await supabase.from('credit_notes').update({
          fiscal_status: cnPrior.row.status,
          fiscal_mark: cnPrior.row.mark,
          fiscal_uid: cnPrior.row.uid,
        }).eq('id', body.credit_note_id);
        return json({ ok: true, credit_note_id: body.credit_note_id,
          fiscal: { ok: true, skipped: true, reason: 'already_transmitted_stamp_repaired', mark: cnPrior.row.mark } });
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
      const cnReserve = await reserveTransmission(supabase, cnRow.workspace_id, auth.userId, `myDATA credit note ${body.credit_note_id}`,
        { table: 'credit_notes', id: body.credit_note_id });
      if (!cnReserve.ok) return json({ ok: false, code: cnReserve.code, balance: cnReserve.balance, error: cnReserve.error }, 402);

      try {
        const input = await buildCreditNoteInputFromDb(supabase, body.credit_note_id, body.fiscal_overrides ?? {});
        const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
          skipSignature: body.skip_signature,
        });

        await supabase.from('fiscal_submissions').insert({
          workspace_id: cnRow.workspace_id,
          invoice_id: cnRow.invoice_id, // correlated source invoice, for audit linkage
          // ...and this is the document that was actually transmitted. Without the pair, the PDF's
          // authentication-code lookup could hand invoice I the code belonging to its credit note.
          document_table: 'credit_notes',
          // The loaded row's id, not the body's: cnRow was fetched by that id and its workspace was
          // ownership-checked above, so this is the verified value (sameWorkspaceFkSweep).
          document_id: cnRow.id,
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
          fiscal_uid: result.uid ?? null,
          fiscal_qr_url: result.qrUrl ?? null,
          // Offline documents are aged from here by finance-fiscal-offline-recovery, which
          // cannot tell "submitted 5 minutes ago" from "stuck since last month" without it.
          fiscal_submitted_at: new Date().toISOString(),
          fiscal_error: result.errorMessage ?? null,
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

    // ── Delivery-note CANCELLATION path (myDATA 9.3) ──────────────────────────
    // The only cancellation myDATA offers. An invoice is never withdrawn — it is corrected by a
    // credit note (5.1 wholesale / 11.4 retail), which is the immutability rule, not a gap.
    //
    // THE PROVIDER'S DUPLICATE GUARD IS RACY. A second CancelDeliveryNote for the same MARK
    // usually comes back 251 "already been cancelled" — but a fast retry got Success twice, a
    // second cancellation MARK and a second 0.25-credit charge (both observed, #319). A guard
    // that holds except under retry is no guard, so the stored mark is OURS: taken with a
    // conditional update BEFORE calling out, so a caller that lost the race — or is retrying a
    // request whose response never arrived — is told the note is already cancelled.
    if (body.cancel_delivery_note) {
      const dnId = body.cancel_delivery_note.delivery_note_id;
      if (!dnId) return json({ error: 'cancel_delivery_note.delivery_note_id is required' }, 400);

      const { data: note } = await supabase
        .from('delivery_notes')
        .select('id, workspace_id, kind, fiscal_status, fiscal_mark, fiscal_cancellation_mark, delivery_note_number')
        .eq('id', dnId).maybeSingle();
      if (!note) return json({ error: 'delivery note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, (note as any).workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 404); // 404, not 403 — no id enumeration
      }
      // Everything below writes the id from the LOADED, AUTHORIZED row rather than the one the
      // caller sent. Same value, different provenance — and provenance is the whole point: a
      // workspace-scoped foreign key must be one we proved belongs to this caller, not one they
      // named. (Pinned by tests/unit/sameWorkspaceFkSweep.test.ts.)
      const noteId = String((note as any).id);
      if ((note as any).fiscal_cancellation_mark) {
        return json({ ok: true, delivery_note_id: noteId, skipped: true, reason: 'already_cancelled',
          cancellation_mark: (note as any).fiscal_cancellation_mark });
      }
      if (!(note as any).fiscal_mark) {
        return json({ ok: false, code: 'not_transmitted',
          error: 'This delivery note has no myDATA MARK, so there is nothing to cancel at AADE.' }, 400);
      }

      // The same gate the credit-note, delivery-note and invoice paths apply. Filing a
      // cancellation with AADE through the operator's connector is the module's work like any
      // other transmission, and it spends credits.
      const { data: cancelEntitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: (note as any).workspace_id, p_module_slug: 'sales-finance',
      });
      if (!cancelEntitled) {
        return json({ ok: false, code: 'not_entitled', error: 'Workspace not entitled to e-Invoicing.' }, 402);
      }

      const resolvedCancel: any = await resolveWorkspaceConnector(supabase, (note as any).workspace_id, 'legal_invoice');
      if (!resolvedCancel.ok) return json({ ok: false, code: resolvedCancel.code, error: resolvedCancel.error }, 400);
      // ROUTED BY THE NOTE'S OWN KIND. myDATA keeps two cancellation routes — one for goods
      // leaving (a dispatch note) and one for goods arriving (a receipt) — and answers 301
      // "not found" when a MARK reaches the wrong one. Sending every note through the delivery
      // route would have failed on exactly the notes nobody tests: the inbound ones.
      const isReceivingNote = (note as any).kind === 'receipt';
      const cancelFn = isReceivingNote
        ? resolvedCancel.resolved.connector.cancelReceivingNote
        : resolvedCancel.resolved.connector.cancelDeliveryNote;
      if (!cancelFn) {
        return json({ ok: false, error: `Connector does not support ${isReceivingNote ? 'receiving' : 'delivery'}-note cancellation` }, 400);
      }

      const { data: fsRow } = await supabase
        .from('finance_settings').select('business_vat').eq('workspace_id', (note as any).workspace_id).maybeSingle();
      // `normalizeVat`, not a local `replace(/^EL/i,'')`: `business_vat` is free text and
      // 'GR 800 370 260' survives that regex untouched, so the provider answers 401 for a
      // workspace that is perfectly authorized. One rule, one implementation.
      const issuerVat = normalizeVat((fsRow as any)?.business_vat) ?? '';
      if (!issuerVat) {
        return json({ ok: false, code: 'issuer_vat_missing',
          error: 'This workspace has no business VAT number in Finance → Settings, so AADE cannot be told who is cancelling.' }, 400);
      }

      // A cancellation costs provider credits too (0.25), so reserve before the callout.
      const cancelReserve = await reserveTransmission(
        supabase, (note as any).workspace_id, auth.userId, `myDATA cancel delivery note ${noteId}`,
        { table: 'delivery_notes', id: noteId });
      if (!cancelReserve.ok) {
        return json({ ok: false, code: cancelReserve.code, balance: cancelReserve.balance, error: cancelReserve.error }, 402);
      }

      // CLAIM. A concurrent caller that gets 0 rows here must not call the provider.
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimErr } = await supabase
        .from('delivery_notes')
        .update({ fiscal_cancelled_at: claimedAt, updated_at: claimedAt })
        .eq('id', noteId)
        .is('fiscal_cancellation_mark', null)
        .is('fiscal_cancelled_at', null)
        .select('id');
      if (claimErr || !claimed?.length) {
        await cancelReserve.refund();
        return json({ ok: true, delivery_note_id: noteId, skipped: true, reason: 'cancellation_already_in_progress' });
      }

      try {
        const cancelRes = await cancelFn(
          { invoiceMark: String((note as any).fiscal_mark), issuerVatNumber: issuerVat },
          resolvedCancel.resolved.ctx,
        );

        await supabase.from('fiscal_submissions').insert({
          workspace_id: (note as any).workspace_id,
          document_table: 'delivery_notes',
          document_id: noteId,
          connector_slug: resolvedCancel.resolved.slug,
          capability: 'legal_invoice',
          // 'cancelled', NOT 'accepted'. `findAcceptedSubmission` replays the newest
          // accepted/offline row for a document onto that document as its fiscal MARK, to repair
          // a lost stamp. An 'accepted' row here holds the CANCELLATION mark, so the next
          // transmit attempt on this note would overwrite its real AADE MARK with the
          // cancellation's and report the cancelled document as accepted.
          status: cancelRes.ok ? 'cancelled' : 'rejected',
          mark: cancelRes.cancellationMark ?? null,
          fiscal_invoice_type: isReceivingNote ? 'cancel_receiving' : 'cancel_9.3',
          is_offline: false,
          provider_credits: cancelRes.providerCredits ?? null,
          request_payload: { mark: (note as any).fiscal_mark, entityVatNumber: issuerVat },
          response_payload: cancelRes.raw ?? null,
          error_code: cancelRes.errorCode ?? null,
          error_message: cancelRes.errorMessage ?? null,
        });

        if (!cancelRes.ok) {
          // Release the claim so a corrected retry is possible, and hand the credits back.
          await supabase.from('delivery_notes')
            .update({ fiscal_cancelled_at: null, fiscal_error: cancelRes.errorMessage ?? null, updated_at: new Date().toISOString() })
            .eq('id', noteId);
          await cancelReserve.refund();
          return json({ ok: false, code: cancelRes.errorCode ?? 'cancel_failed',
            error: cancelRes.errorMessage ?? 'Cancellation was refused by the provider.' }, 400);
        }

        await supabase.from('delivery_notes').update({
          fiscal_cancellation_mark: cancelRes.cancellationMark ?? null,
          fiscal_status: 'cancelled',
          fiscal_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', noteId);

        return json({ ok: true, delivery_note_id: noteId, cancellation_mark: cancelRes.cancellationMark });
      } catch (err: any) {
        // The callout may well have reached AADE, so the claim STAYS: re-sending is the one
        // outcome we must not risk. The note is reported as needing a look rather than retried.
        await supabase.from('delivery_notes')
          .update({ fiscal_error: `Cancellation failed mid-flight: ${err?.message ?? err}`, updated_at: new Date().toISOString() })
          .eq('id', noteId);
        // The claim stays, so every retry from here answers 'already_in_progress' — a
        // success-shaped response for a permanently stuck document. Nothing else would ever
        // surface it, so say so out loud: a person has to check AADE and clear it.
        await emitFlowEventToWorkspaceRoles(
          (note as any).workspace_id, ['owner', 'admin', 'accountant'], 'fiscal_document_rejected',
          (uid) => ({
            type: 'fiscal_document_rejected',
            user_id: uid,
            title: 'A delivery-note cancellation did not come back',
            body: `The cancellation for delivery note ${(note as any).delivery_note_number ?? noteId} was sent to myDATA but the provider did not answer. It may have gone through. Check the note at AADE before doing anything else with it — it will not be retried automatically.`,
            action_url: `/finance?tab=doc_delivery&id=${noteId}`,
            workspace_id: (note as any).workspace_id,
          }),
        );
        return json({ ok: false, code: 'cancel_indeterminate',
          error: 'The cancellation was sent but the provider did not answer. It may have gone through - check the note at AADE before retrying.' }, 502);
      }
    }

    // ── Delivery-note submission path (myDATA 9.3 movement document) ──────────
    // The note already exists + stock already moved by issue_delivery_note; here we
    // transmit the movement document and stamp the MARK back onto delivery_notes.
    if (body.delivery_note_id) {
      const { data: dnRow } = await supabase
        .from('delivery_notes').select('id, workspace_id, fiscal_status')
        .eq('id', body.delivery_note_id).maybeSingle();
      if (!dnRow) return json({ error: 'delivery note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, dnRow.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }

      if (dnRow.fiscal_status === 'accepted') {
        return json({ ok: true, delivery_note_id: body.delivery_note_id, fiscal: { ok: true, skipped: true, reason: 'already_accepted' } });
      }

      // A movement document transmitted twice is two movements on the record for one lorry.
      const dnPrior = await findAcceptedSubmission(supabase, 'delivery_notes', dnRow.id);
      if (dnPrior.failed) {
        return json({ ok: false, code: 'submission_history_unavailable',
          error: 'Could not read the transmission history for this delivery note, so it was not re-sent. Try again.' }, 503);
      }
      if (dnPrior.row) {
        await supabase.from('delivery_notes').update({
          fiscal_status: dnPrior.row.status,
          fiscal_mark: dnPrior.row.mark,
          fiscal_uid: dnPrior.row.uid,
        }).eq('id', body.delivery_note_id);
        return json({ ok: true, delivery_note_id: body.delivery_note_id,
          fiscal: { ok: true, skipped: true, reason: 'already_transmitted_stamp_repaired', mark: dnPrior.row.mark } });
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
      const dnReserve = await reserveTransmission(supabase, dnRow.workspace_id, auth.userId, `myDATA delivery note ${body.delivery_note_id}`,
        { table: 'delivery_notes', id: body.delivery_note_id });
      if (!dnReserve.ok) return json({ ok: false, code: dnReserve.code, balance: dnReserve.balance, error: dnReserve.error }, 402);

      try {
        const input = await buildDeliveryNoteInputFromDb(supabase, body.delivery_note_id, body.fiscal_overrides ?? {});
        const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
          skipSignature: body.skip_signature,
        });

        await supabase.from('fiscal_submissions').insert({
          workspace_id: dnRow.workspace_id,
          document_table: 'delivery_notes',
          document_id: dnRow.id,
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
          fiscal_uid: result.uid ?? null,
          fiscal_qr_url: result.qrUrl ?? null,
          // See the credit-note path: the offline-recovery sweep ages documents from this.
          fiscal_submitted_at: new Date().toISOString(),
          fiscal_error: result.errorMessage ?? null,
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
      // A 'secret' caller is another edge function (record-payment transmitting a draft it just
      // issued on a full online payment); it has no user to bind, and the service key IS the
      // authorisation. Every other level must be a member of the document's workspace.
      if (auth.level !== 'secret' && !(await userCanAccessWorkspace(supabase, auth.userId, invWs.workspace_id))) {
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

      // Monetization gate: the workspace must own the Finance (sales-finance) module.
      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: invRow!.workspace_id,
        p_module_slug: 'sales-finance',
      });

      // The claim is the SUBMISSION, not the document's status column.
      //
      // `invoices.fiscal_status` is written AFTER the connector returns. If that write is lost —
      // RLS, a dropped connection, a transient PostgREST failure — the document still reads
      // "not accepted" while ΑΑΔΕ holds a MARK for it, and the operator, told it failed, presses
      // the button again. That mints a SECOND legal document for one sale. Anti-regression rule 4:
      // the duplicate guard reads the row written on the SUCCESS path, never the status column
      // written after it.
      const prior = await findAcceptedSubmission(supabase, 'invoices', invoiceId);
      if (prior.failed) {
        // Cannot prove the document was NOT already sent. Refusing is the only safe answer:
        // the cost of a wrong "no" is a retry, the cost of a wrong "yes" is a duplicate filing.
        fiscalResult = {
          ok: false,
          code: 'submission_history_unavailable',
          error: 'Could not read this document\'s transmission history, so it was not re-sent. Try again.',
        };
      } else if (invRow?.fiscal_status === 'accepted') {
        fiscalResult = { ok: true, skipped: true, reason: 'already_accepted' };
      } else if (prior.row) {
        // Transmitted, but the stamp never landed. Repair the document from the durable record
        // instead of calling ΑΑΔΕ again, and say so rather than reporting a fresh success.
        await stampInvoiceFromSubmission(supabase, invoiceId, prior.row);
        fiscalResult = {
          ok: true,
          skipped: true,
          reason: 'already_transmitted_stamp_repaired',
          status: prior.row.status,
          mark: prior.row.mark,
          uid: prior.row.uid,
        };
      } else if (!entitled) {
        fiscalResult = {
          ok: false,
          code: 'not_entitled',
          error: 'This workspace is not entitled to e-Invoicing. The operator must enable it for this workspace.',
        };
      } else {
        const resolved: any = await resolveWorkspaceConnector(supabase, invRow!.workspace_id, 'legal_invoice');
        // Reserve transmission credits atomically before the connector handoff (see reserveTransmission).
        // A server-initiated call has no user of its own; the workspace pays (resolveBillingUser).
        const billingUserId = auth.level === 'secret'
          ? await resolveBillingUser(supabase, invRow!.workspace_id, invoiceId)
          : auth.userId;
        const reserve = resolved.ok
          ? await reserveTransmission(supabase, invRow!.workspace_id, billingUserId, `myDATA transmission for invoice ${invoiceId}`,
              { table: 'invoices', id: invoiceId })
          : null;
        if (!resolved.ok) {
          fiscalResult = { ok: false, code: resolved.code, error: resolved.error };
        } else if (!reserve!.ok) {
          fiscalResult = { ok: false, code: reserve!.code, balance: reserve!.balance, error: reserve!.error };
        } else {
          try {
            // POS/IRIS receipt — merge the EFT-POS terminal into the overrides and force
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
            let result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
              // POS receipts must be signed (skipSignature=false) to obtain the Law-5155 token.
              skipSignature: body.pos_payment ? false : body.skip_signature,
            });

            // ── ERROR 228: THE DOCUMENT IS ALREADY FILED, AND THE PROVIDER JUST TOLD US ITS MARK
            //
            // The dangerous case is not the double-click — it is the send whose RESPONSE WAS
            // LOST. The first call reached AADE, no submission row was written because nothing
            // came back, the operator retries, and 228 arrives looking like a refusal: credits
            // refunded, `fiscal_status='rejected'`, while the document sits registered at AADE
            // with a MARK nobody recorded.
            //
            // The MARK is NOT adopted on the provider's word alone. The same 228 is what a
            // NUMBERING COLLISION produces — two different documents issued under one series+AA —
            // and adopting it there would stamp this invoice with another document's legal
            // number. So we fetch the filed document and adopt only when it is demonstrably the
            // same one: same series, same AA, and the same gross total. Anything else is reported
            // as the collision it is, for a human to resolve.
            if (result.status === 'rejected' && result.duplicateOf?.mark && resolved.resolved.connector.fetchTransmitted) {
              const filed = await resolved.resolved.connector.fetchTransmitted(
                { invoiceMark: result.duplicateOf.mark, issuerVatNumber: input.issuer.vatNumber },
                resolved.resolved.ctx,
              );
              const doc = (filed.raw as any)?.providerTransmittedDocs?.[0];
              const sameDocument =
                filed.status === 'accepted'
                && String(doc?.invoiceHeader?.series ?? '') === String(input.header.series)
                && String(doc?.invoiceHeader?.aa ?? '') === String(input.header.aa)
                && Math.abs(Number(doc?.invoiceSummary?.totalGrossValue ?? NaN) - Number(input.summary.totalGrossValue)) < 0.01;

              if (sameDocument) {
                result = {
                  ...result,
                  status: 'accepted',
                  mark: filed.mark,
                  uid: filed.uid ?? result.uid,
                  authenticationCode: filed.authenticationCode,
                  invoiceUrl: filed.invoiceUrl,
                  errorCode: undefined,
                  errorMessage: undefined,
                  recoveredFromDuplicate: true,
                };
              } else {
                // Same series+AA, different document. Naming it is the whole point: silently
                // failing here leaves two documents fighting over one legal number.
                result = {
                  ...result,
                  errorMessage:
                    `myDATA already holds a document under series ${input.header.series} / ${input.header.aa} ` +
                    `(MARK ${result.duplicateOf.mark}) and it is NOT this one — the totals do not match. ` +
                    `This is a numbering collision: give this document a new number before re-sending.`,
                };
              }
            }

            await supabase.from('fiscal_submissions').insert({
              workspace_id: invRow!.workspace_id,
              invoice_id: invoiceId,
              document_table: 'invoices',
              document_id: invoiceId,
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

            // Held card/IRIS receipt: persist the signature for the terminal charge, mark the
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
              const { error: stampErr } = await supabase
                .from('invoices')
                .update({
                  fiscal_status: result.status,
                  fiscal_mark: result.mark ?? null,
                  fiscal_uid: result.uid ?? null,
                  fiscal_qr_url: result.qrUrl ?? null,
                  fiscal_connector_slug: resolved.resolved.slug,
                  fiscal_submitted_at: new Date().toISOString(),
                  fiscal_error: null,
                })
                .eq('id', invoiceId);
              // The document IS transmitted; ΑΑΔΕ holds a MARK for it whatever this row says.
              // Report the stamp failure rather than swallowing it, and say plainly that the
              // document was sent — the submission row above is the durable record, and the
              // retry guard reads it, so pressing the button again repairs instead of re-sending.
              if (stampErr) {
                console.error('fiscal stamp write FAILED after a successful transmission', {
                  invoiceId, mark: result.mark, stampErr,
                });
                fiscalResult = {
                  ok: true,
                  ...result,
                  stamp_failed: true,
                  warning: 'The document was transmitted and accepted, but recording the MARK on it failed. '
                    + 'It has NOT been sent twice — re-issuing will repair the record.',
                };
              }
            } else {
              // Keep the refusal reason ON the document, not only in fiscal_submissions —
              // otherwise the invoice page can say "rejected" but never why.
              await supabase.from('invoices').update({
                fiscal_status: result.status,
                fiscal_submitted_at: new Date().toISOString(),
                fiscal_error: result.errorMessage ?? null,
              }).eq('id', invoiceId);
            }

            // The transmission was reserved (debited) up-front. Operator root reserves
            // free; sub-tenants keep the debit on an accepted/offline doc and get it back if
            // the document did not transmit.
            if (!accepted) await reserve!.refund();

            // Preserve a stamp_failed verdict set above: overwriting it here would report a
            // clean success for a document whose record is knowingly incomplete.
            fiscalResult = fiscalResult?.stamp_failed ? fiscalResult : { ok: true, ...result };
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
