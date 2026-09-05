/**
 * Revolut Business connection management (#315) — per-workspace BYOK.
 *
 * Actions (POST JSON `{ action, workspace_id, ... }`), all gated on the caller being a
 * finance manager of the target workspace via the RLS-bound user client — the service
 * client is used only AFTER that check passes (CLAUDE.md invariant 1; 404 on mismatch).
 *
 *   init             mint the RSA keypair server-side + store the redirect URI.
 *                    The private key never leaves the server; the response carries the
 *                    public key + redirect URI for the operator to paste into the
 *                    Revolut dashboard (which hands back a client_id).
 *   authorize-url    the consent URL to send the operator to once client_id is saved.
 *   oauth-complete   exchange the auth code from the consent redirect for tokens.
 *   register-webhook create the webhooks-v2 subscription and store its signing secret.
 *   accounts         live Revolut accounts + the current finance_bank_accounts mapping.
 *   map-account      link/unlink a Revolut account (currency pocket) to a bank account row.
 *   sync-now         run the shared sync core for this workspace inline.
 *   disconnect       drop tokens + webhook; keypair and client_id survive for reconnect.
 */

// deno-lint-ignore-file no-explicit-any

import { authenticate } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import {
  createCard,
  createCounterparty,
  createPayment,
  createPaymentDraft,
  createPayoutLink,
  exchangeAuthCode,
  exchangeMoney,
  generateRevolutKeypair,
  getExchangeRate,
  getExpenseReceipt,
  issuerDomainFrom,
  listAccounts,
  listCards,
  listExpenses,
  listTeamMembers,
  resolveRevolutConfig,
  revolutFetch,
  revolutJson,
  revolutHosts,
  setCardFrozen,
  type RevolutConfigRow,
} from '../_shared/revolut/client.ts';
import { syncWorkspaceRevolut } from '../_shared/revolut/sync-core.ts';

/** Webhooks v2 lives under /api/2.0 on the same host family. */
function webhooksV2Base(cfg: RevolutConfigRow): string {
  return revolutHosts(cfg.environment).api.replace('/api/1.0', '/api/2.0');
}

/**
 * Refuse to settle anything with an INTERNAL leg (#351 D1).
 *
 * A pocket transfer produces `out €1,000` + `in €1,000`, both ours, and the auto-matcher stamps
 * them `ignored` — NOT `matched` — so they stayed offerable in the feed's row menu, and the server
 * only checked provider, direction and not-already-matched. Matching the inbound leg to an invoice
 * of the same amount records a bank-transfer payment and the invoice reads settled though no
 * customer paid a thing.
 *
 * `docs/banking-revolut.md` already warns about exactly this — *"the feed is per-leg: match a row
 * in isolation and an internal pocket move settles a customer invoice."* The hazard was documented
 * and the UI permitted it. #359 CM-12 fixed the AUTOMATIC half; this is the manual one.
 *
 * The same `legShapeIsComplete` predicate, so a transaction whose shape is not fully known is
 * refused rather than assumed external.
 */
async function assertNotInternalLeg(service: any, workspaceId: string, tx: any): Promise<void> {
  const { loadLegShapes, legShapeIsComplete } = await import('../_shared/revolut/reconcile.ts');
  const shapes = await loadLegShapes(service, workspaceId, [String(tx.transaction_id ?? '')]);
  const shape = shapes.get(String(tx.transaction_id ?? ''));
  if (!legShapeIsComplete(shape)) {
    throw new HttpError(
      409,
      'This transaction has not fully synced yet, so we cannot tell whether it is money from outside. Try again after the next sync.',
    );
  }
  const otherSide = tx.direction === 'in' ? shape!.outLegs : shape!.inLegs;
  if (otherSide > 0) {
    throw new HttpError(
      400,
      'Both sides of this transfer are your own accounts — it is a transfer between your pockets, not money from a customer or to a supplier.',
    );
  }
}

Deno.serve(withApiLogging('revolut-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');
  const service = auth.supabase;

  const body = await req.json().catch(() => null) as Record<string, any> | null;
  const action = String(body?.action ?? '');
  const workspaceId = String(body?.workspace_id ?? '');
  if (!action || !workspaceId) throw new HttpError(400, 'action and workspace_id are required');

  // Tenancy gate: finance manager of THIS workspace, checked under the caller's RLS.
  const { data: isMgr } = await auth.supabaseAsUser!
    .rpc('is_workspace_finance_manager', { p_workspace_id: workspaceId });
  if (!isMgr) throw new HttpError(404, 'not found');

  // Entitlement gate (the real security line; nav/route guards are UX only).
  if (!(await isWorkspaceEntitled(service, workspaceId, 'banking-revolut'))) {
    throw new HttpError(402, 'Revolut Business module is not enabled for this workspace');
  }

  switch (action) {
    case 'init': {
      const redirectUri = String(body?.redirect_uri ?? '');
      if (!/^https:\/\/[^\s]+$/.test(redirectUri) && !redirectUri.startsWith('http://localhost')) {
        throw new HttpError(400, 'redirect_uri must be an https URL');
      }
      const existing = await resolveRevolutConfig(service, workspaceId);
      if (existing?.private_key && !body?.force) {
        // Re-running setup must not silently invalidate a key already registered in the
        // Revolut dashboard; the UI passes force=true after an explicit confirmation.
        throw new HttpError(400, 'keypair already exists — pass force=true to regenerate');
      }
      const pair = await generateRevolutKeypair(issuerDomainFrom(redirectUri));
      const { error } = await service.from('workspace_revolut_config').upsert({
        workspace_id: workspaceId,
        public_key: pair.publicKey,
        private_key: pair.privateKey,
        oauth_redirect_uri: redirectUri,
        // A fresh key invalidates any previous connection.
        refresh_token: null,
        access_token: null,
        access_token_expires_at: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' });
      if (error) throw new HttpError(500, `failed to store keypair: ${error.message}`);
      return jsonResponse({ ok: true, public_key: pair.publicKey, redirect_uri: redirectUri });
    }

    case 'authorize-url': {
      const cfg = await requireConfig(service, workspaceId);
      if (!cfg.client_id) throw new HttpError(400, 'save the client_id from the Revolut dashboard first');
      if (!cfg.oauth_redirect_uri) throw new HttpError(400, 'run init first');
      // Request ONLY the scopes we use. Omitting `scope` grants everything including
      // READ_SENSITIVE_CARD_DATA — and Revolut hard-requires IP whitelisting for any
      // token carrying that scope (error 9002 on every call), which is impossible from
      // dynamic-IP edge functions. READ/WRITE/PAY covers the entire module.
      const url = `${revolutHosts(cfg.environment).authorize}?client_id=${encodeURIComponent(cfg.client_id)}` +
        `&redirect_uri=${encodeURIComponent(cfg.oauth_redirect_uri)}&response_type=code` +
        `&scope=${encodeURIComponent('READ,WRITE,PAY')}`;
      return jsonResponse({ ok: true, url });
    }

    case 'oauth-complete': {
      const code = String(body?.code ?? '');
      if (!code) throw new HttpError(400, 'code is required');
      const cfg = await requireConfig(service, workspaceId);
      if (!cfg.oauth_redirect_uri) throw new HttpError(400, 'run init first');
      // Idempotent against callback double-fire: if a parallel exchange already landed
      // tokens, this duplicate must not surface an error for an already-good connection.
      if (cfg.refresh_token && cfg.connected_at) return jsonResponse({ ok: true, already: true });
      try {
        await exchangeAuthCode(service, cfg, code, issuerDomainFrom(cfg.oauth_redirect_uri));
      } catch (err) {
        const fresh = await resolveRevolutConfig(service, workspaceId);
        if (fresh?.refresh_token) return jsonResponse({ ok: true, already: true });
        throw err;
      }
      // Provision the pocket bank-account rows right away — the user should see their
      // Revolut accounts under Finance → Banks the moment the connection lands.
      try {
        const fresh = await resolveRevolutConfig(service, workspaceId);
        if (fresh) {
          const { ensureRevolutBankAccounts } = await import('../_shared/revolut/sync-core.ts');
          await ensureRevolutBankAccounts(service, fresh);
        }
      } catch (err) {
        console.warn('[revolut-api] pocket provisioning after connect failed:', err instanceof Error ? err.message : err);
      }
      return jsonResponse({ ok: true });
    }

    case 'register-webhook': {
      const cfg = await requireConfig(service, workspaceId);
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      if (!supabaseUrl) throw new HttpError(500, 'SUPABASE_URL unset');
      const hookUrl = `${supabaseUrl}/functions/v1/revolut-webhooks?ws=${workspaceId}`;
      // Re-registration (e.g. to widen the event list) must not leave the old
      // subscription alive delivering duplicates — best-effort delete first.
      if (cfg.webhook_id) {
        try {
          await fetch(`${webhooksV2Base(cfg)}/webhooks/${cfg.webhook_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${await tokenFor(service, cfg)}` },
          });
        } catch { /* old hook may already be gone */ }
      }
      // The shared client prefixes the v1 base; webhooks v2 needs its own absolute call.
      const v2 = await fetch(`${webhooksV2Base(cfg)}/webhooks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await tokenFor(service, cfg)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: hookUrl,
          events: ['TransactionCreated', 'TransactionStateChanged', 'PayoutLinkCreated', 'PayoutLinkStateChanged'],
        }),
      });
      if (!v2.ok) {
        const text = await v2.text().catch(() => '');
        throw new HttpError(502, `webhook registration failed (${v2.status}): ${text.slice(0, 200)}`);
      }
      const out = await v2.json() as { id?: string; signing_secret?: string };
      if (!out?.id || !out?.signing_secret) throw new HttpError(502, 'webhook response missing id/signing_secret');
      const { error } = await service.from('workspace_revolut_config').update({
        webhook_id: out.id,
        webhook_signing_secret: out.signing_secret,
        webhook_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(500, `failed to store webhook: ${error.message}`);
      return jsonResponse({ ok: true, webhook_url: hookUrl });
    }

    case 'accounts': {
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const accounts = await listAccounts(service, cfg, issuer);
      const { data: mapped } = await service
        .from('finance_bank_accounts')
        .select('id, name, currency, revolut_account_id')
        .eq('workspace_id', workspaceId);
      return jsonResponse({ ok: true, accounts, bank_accounts: mapped ?? [] });
    }

    case 'map-account': {
      const revolutAccountId = String(body?.revolut_account_id ?? '');
      if (!revolutAccountId) throw new HttpError(400, 'revolut_account_id is required');
      const bankAccountId = body?.bank_account_id ? String(body.bank_account_id) : null;

      // Clear any previous holder of this Revolut account within the workspace.
      await service.from('finance_bank_accounts')
        .update({ revolut_account_id: null })
        .eq('workspace_id', workspaceId)
        .eq('revolut_account_id', revolutAccountId);

      if (bankAccountId) {
        // The target row must belong to THIS workspace — 404 otherwise (no id probing).
        const { data: target } = await service
          .from('finance_bank_accounts')
          .select('id, iban, account_ref')
          .eq('id', bankAccountId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (!target) throw new HttpError(404, 'not found');
        const { error } = await service.from('finance_bank_accounts')
          .update({ revolut_account_id: revolutAccountId })
          .eq('id', bankAccountId);
        if (error) throw new HttpError(500, `mapping failed: ${error.message}`);

        // Auto-fill the row's IBAN/BIC from Revolut's bank details when they are empty,
        // so invoices show the right IBAN with zero typing. Best-effort: a details
        // failure must not undo the mapping.
        if (!target.iban) {
          try {
            const cfg = await requireConfig(service, workspaceId);
            const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
            const details = await revolutJson<Array<{ iban?: string; bic?: string }>>(
              service, cfg, issuer, `/accounts/${revolutAccountId}/bank-details`,
            );
            const d = (details ?? []).find((x) => x.iban) ?? (details ?? [])[0];
            if (d?.iban) {
              await service.from('finance_bank_accounts')
                .update({
                  iban: d.iban,
                  ...(target.account_ref ? {} : d.bic ? { account_ref: d.bic } : {}),
                })
                .eq('id', bankAccountId);
            }
          } catch (err) {
            console.warn('[revolut-api] bank-details autofill skipped:', err instanceof Error ? err.message : err);
          }
        }
      }
      return jsonResponse({ ok: true });
    }

    case 'validate-account-name': {
      // CoP/VoP — does this IBAN/account actually belong to the named holder? Used from
      // the CRM bank area before a counterparty IBAN is trusted (#315 scope pt 1).
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const name = String(body?.name ?? '').trim();
      if (!name) throw new HttpError(400, 'name is required');
      const iban = body?.iban ? String(body.iban).replace(/\s+/g, '').toUpperCase() : undefined;
      const accountNo = body?.account_no ? String(body.account_no) : undefined;
      const sortCode = body?.sort_code ? String(body.sort_code) : undefined;
      if (!iban && !accountNo) throw new HttpError(400, 'iban or account_no is required');

      const payload: Record<string, unknown> = {
        ...(iban ? { iban } : {}),
        ...(accountNo ? { account_no: accountNo } : {}),
        ...(sortCode ? { sort_code: sortCode } : {}),
      };
      // Default to a company check — CRM bank rows overwhelmingly belong to companies;
      // pass company=false for a person (name is split into first/last).
      if (body?.company === false) {
        const parts = name.split(/\s+/);
        payload.individual_name = {
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || parts[0],
        };
      } else {
        payload.company_name = name;
      }

      const res = await revolutFetch(service, cfg, issuer, '/account-name-validation', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new HttpError(502, `name validation failed (${res.status}): ${JSON.stringify(out).slice(0, 200)}`);
      }
      // Persist the verdict on the CRM bank row when the caller names one, so the
      // verification is VISIBLE afterwards instead of evaporating with the edit session.
      const crmBankId = body?.crm_bank_account_id ? String(body.crm_bank_account_id) : null;
      if (crmBankId) {
        await service.from('crm_bank_accounts')
          .update({
            vop_result: String((out as any).result_code ?? (out as any).result ?? 'cannot_be_checked'),
            vop_checked_at: new Date().toISOString(),
          })
          .eq('id', crmBankId)
          .eq('workspace_id', workspaceId);
      }
      // Pass Revolut's verdict through verbatim (result_code: matched | close_match |
      // not_matched | cannot_be_checked, plus any suggested actual name).
      return jsonResponse({ ok: true, ...out });
    }

    case 'reconcile': {
      // Re-run both matchers (auto after every sync too): incoming → invoices,
      // outgoing transfers → supplier bills.
      const { reconcileWorkspaceRevolut, reconcileOutgoingRevolut } = await import('../_shared/revolut/reconcile.ts');
      const rec = await reconcileWorkspaceRevolut(service, workspaceId);
      const outRec = await reconcileOutgoingRevolut(service, workspaceId);
      return jsonResponse({
        ok: true,
        ...rec,
        billsSettled: outRec.settled,
        outgoingUnmatched: outRec.unmatched,
        outgoingErrors: outRec.errors,
      });
    }

    case 'confirm-match': {
      // Human confirms a suggested (or manual) invoice for a statement line.
      const rowId = String(body?.transaction_row_id ?? '');
      const invoiceId = String(body?.invoice_id ?? '');
      if (!rowId || !invoiceId) throw new HttpError(400, 'transaction_row_id and invoice_id are required');

      const { data: tx } = await service
        .from('revolut_bank_transactions')
        .select('*')
        .eq('id', rowId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!tx) throw new HttpError(404, 'not found');
      if (tx.provider !== 'revolut') throw new HttpError(400, 'stripe/viva feed rows were settled by their provider webhooks — matching them again would double-book');
      if (tx.match_status === 'matched') throw new HttpError(400, 'line is already matched');
      if (tx.direction !== 'in') throw new HttpError(400, 'only incoming lines can settle an invoice');
      await assertNotInternalLeg(service, workspaceId, tx);

      const { data: inv } = await service
        .from('invoices')
        .select('id')
        .eq('id', invoiceId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!inv) throw new HttpError(404, 'not found');

      const { settleTransaction } = await import('../_shared/revolut/reconcile.ts');
      const s = await settleTransaction(service, tx, invoiceId, 'manual');
      if (!s.ok) throw new HttpError(502, s.error ?? 'settle failed');
      return jsonResponse({ ok: true });
    }

    case 'confirm-bill-match': {
      // Human matches an OUTGOING revolut transfer to a supplier bill from the feed's
      // row menu. Same write path as the auto matcher: payments (out) + allocation.
      const rowId = String(body?.transaction_row_id ?? '');
      const billId = String(body?.bill_id ?? '');
      if (!rowId || !billId) throw new HttpError(400, 'transaction_row_id and bill_id are required');

      const { data: tx } = await service
        .from('revolut_bank_transactions')
        .select('*')
        .eq('id', rowId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!tx) throw new HttpError(404, 'not found');
      if (tx.provider !== 'revolut') throw new HttpError(400, 'only bank-feed (Revolut) lines can settle bills — provider rows are informational');
      if (tx.direction !== 'out') throw new HttpError(400, 'only outgoing lines can settle a supplier bill');
      if (tx.match_status === 'matched') throw new HttpError(400, 'line is already matched');
      await assertNotInternalLeg(service, workspaceId, tx);

      const { data: bill } = await service
        .from('supplier_bills')
        .select('id, supplier_bill_number, supplier_company_id, supplier_contact_id, amount_due, currency')
        .eq('id', billId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!bill) throw new HttpError(404, 'not found');
      const txCcy = String(tx.currency ?? 'EUR').toUpperCase();
      if (String(bill.currency ?? 'EUR').toUpperCase() !== txCcy) {
        throw new HttpError(400, 'currency mismatch between the transfer and the bill');
      }

      const { data: pay, error: payErr } = await service.from('payments').insert({
        workspace_id: workspaceId,
        direction: 'out',
        amount: Number(tx.amount),
        currency: txCcy,
        method: 'bank_transfer',
        paid_at: tx.booked_at ?? new Date().toISOString(),
        counterparty_company_id: bill.supplier_company_id,
        counterparty_contact_id: bill.supplier_contact_id,
        bank_account_id: tx.bank_account_id ?? null,
        reference: `Bank transfer (Revolut) ${tx.provider_ref}`,
        notes: `Manually matched to bill ${bill.supplier_bill_number ?? bill.id}`,
        provider: 'revolut',
        provider_ref: tx.provider_ref,
      }).select('id').single();
      if (payErr && !/duplicate|unique/i.test(payErr.message ?? '')) throw new HttpError(500, payErr.message);
      let payId = pay?.id as string | undefined;
      if (!payId) {
        const { data: existing } = await service.from('payments')
          .select('id').eq('provider', 'revolut').eq('provider_ref', tx.provider_ref).maybeSingle();
        payId = existing?.id;
      }
      if (!payId) throw new HttpError(500, 'payment row could not be created');

      const applied = Math.min(Number(tx.amount), Number(bill.amount_due));
      if (!(applied > 0)) throw new HttpError(400, 'the bill has nothing due');
      const { error: allocErr } = await service.from('payment_allocations').insert({
        payment_id: payId,
        supplier_bill_id: bill.id,
        amount: applied,
        amount_doc_currency: applied,
        fx_rate: 1,
      });
      if (allocErr) throw new HttpError(502, `allocation failed: ${allocErr.message}`);
      await service.from('revolut_bank_transactions').update({
        match_status: 'matched',
        match_method: 'manual',
        matched_at: new Date().toISOString(),
        reconciled_payment_id: payId,
        updated_at: new Date().toISOString(),
      }).eq('id', rowId);
      return jsonResponse({ ok: true, applied });
    }

    case 'ignore-transaction': {
      const rowId = String(body?.transaction_row_id ?? '');
      if (!rowId) throw new HttpError(400, 'transaction_row_id is required');
      const ignore = body?.ignore !== false;
      const { data: tx } = await service
        .from('revolut_bank_transactions')
        .select('id, match_status')
        .eq('id', rowId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!tx) throw new HttpError(404, 'not found');
      if (tx.match_status === 'matched') throw new HttpError(400, 'a matched line cannot be ignored');
      const { error } = await service
        .from('revolut_bank_transactions')
        .update({
          match_status: ignore ? 'ignored' : 'unmatched',
          suggested_invoice_ids: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rowId);
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ ok: true });
    }

    case 'sync-now': {
      const cfg = await requireConfig(service, workspaceId);
      // Setup begun, OAuth never finished. That is a precondition the caller can fix, not an
      // upstream failure: as a 502 it paged Sentry for a workspace that had simply not
      // connected yet (KAI-SX), and it stamped `last_sync_error` on a config that had never
      // tried to sync. 4xx is what api-logger does not report.
      if (!cfg.refresh_token) {
        throw new HttpError(409, 'Revolut is not connected yet — finish connecting the account first');
      }
      const result = await syncWorkspaceRevolut(service, cfg);
      if (!result.ok) throw new HttpError(502, result.error ?? 'sync failed');
      return jsonResponse({ ok: true, fetched: result.fetched, upserted: result.upserted });
    }

    case 'create-counterparty': {
      // Mirror a CRM bank row as a Revolut counterparty — the prerequisite for paying it.
      // VoP-GATED: the account name is verified first; a non-match blocks unless the
      // caller explicitly overrides (force=true), and the verdict is stored either way.
      const crmBankId = String(body?.crm_bank_account_id ?? '');
      if (!crmBankId) throw new HttpError(400, 'crm_bank_account_id is required');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');

      const { data: bank } = await service
        .from('crm_bank_accounts')
        .select('*, company:crm_companies!company_id(name), contact:crm_contacts!contact_id(name)')
        .eq('id', crmBankId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!bank) throw new HttpError(404, 'not found');
      if (bank.revolut_counterparty_id) return jsonResponse({ ok: true, counterparty_id: bank.revolut_counterparty_id, already: true });
      const holderName = String(bank.account_holder || bank.company?.name || bank.contact?.name || '').trim();
      const iban = String(bank.iban ?? '').replace(/\s+/g, '').toUpperCase();
      if (!holderName || !iban) throw new HttpError(400, 'the CRM bank row needs an account holder name and an IBAN');
      const isCompany = !!bank.company_id;

      let vop = 'cannot_be_checked';
      try {
        const { revolutFetch: rf } = await import('../_shared/revolut/client.ts');
        const vopBody: Record<string, unknown> = { iban };
        if (isCompany) vopBody.company_name = holderName;
        else {
          const parts = holderName.split(/\s+/);
          vopBody.individual_name = { first_name: parts[0], last_name: parts.slice(1).join(' ') || parts[0] };
        }
        const res = await rf(service, cfg, issuer, '/account-name-validation', { method: 'POST', body: JSON.stringify(vopBody) });
        const out = await res.json().catch(() => ({}));
        if (res.ok) vop = String((out as any).result_code ?? (out as any).result ?? 'cannot_be_checked');
      } catch { /* verdict stays cannot_be_checked */ }
      await service.from('crm_bank_accounts')
        .update({ vop_result: vop, vop_checked_at: new Date().toISOString() })
        .eq('id', crmBankId);
      if (vop === 'not_matched' && !body?.force) {
        throw new HttpError(400, `Account name does NOT match this IBAN (VoP). Verify with the counterparty; pass force=true only if you are certain.`);
      }

      const cpBody: Record<string, unknown> = { iban, currency: bank.currency || 'EUR' };
      if (bank.account_ref) cpBody.bic = bank.account_ref;
      if (isCompany) cpBody.company_name = holderName;
      else {
        const parts = holderName.split(/\s+/);
        cpBody.individual_name = { first_name: parts[0], last_name: parts.slice(1).join(' ') || parts[0] };
      }
      const cp = await createCounterparty(service, cfg, issuer, cpBody);
      const { error } = await service.from('crm_bank_accounts')
        .update({ revolut_counterparty_id: cp.id })
        .eq('id', crmBankId);
      if (error) throw new HttpError(500, `counterparty created but link failed: ${error.message}`);
      return jsonResponse({ ok: true, counterparty_id: cp.id, vop_result: vop });
    }

    case 'send-payment': {
      // Money OUT: mode 'draft' prepares it for human approval in the Revolut app;
      // mode 'payment' moves money immediately. Both are audited in revolut_payouts
      // with an idempotency request_id before Revolut is called.
      const crmBankId = String(body?.crm_bank_account_id ?? '');
      const sourceAccountId = String(body?.source_revolut_account_id ?? '');
      const amount = Number(body?.amount ?? 0);
      const currency = String(body?.currency ?? 'EUR').toUpperCase();
      const reference = String(body?.reference ?? '').slice(0, 140);
      const mode = body?.mode === 'payment' ? 'payment' : 'draft';
      const supplierBillId = body?.supplier_bill_id ? String(body.supplier_bill_id) : null;
      if (!crmBankId || !sourceAccountId) throw new HttpError(400, 'crm_bank_account_id and source_revolut_account_id are required');
      if (!(amount > 0)) throw new HttpError(400, 'amount must be positive');

      /**
       * The caller's idempotency key (#359 CM-19).
       *
       * `request_id` was a fresh `crypto.randomUUID()` per call, which is the opposite of an
       * idempotency key: two clicks produced two request ids and Revolut executed both. It is an
       * IRREVERSIBLE bank transfer, and the eleventh instance of the double-submit class platform
       * wide — the only one whose consequence is money leaving twice.
       *
       * The dialog now mints one id when it opens and sends it with every attempt, so a repeat is
       * deduplicated by Revolut itself rather than by hoping the button was disabled in time.
       * Validated as a UUID because it is passed to the provider.
       */
      const clientRequestId = typeof body?.request_id === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id)
        ? body.request_id
        : null;

      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const { data: bank } = await service
        .from('crm_bank_accounts')
        .select('id, account_holder, revolut_counterparty_id, company:crm_companies!company_id(name), contact:crm_contacts!contact_id(name)')
        .eq('id', crmBankId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!bank) throw new HttpError(404, 'not found');
      if (!bank.revolut_counterparty_id) throw new HttpError(400, 'create the Revolut counterparty for this bank first (VoP-gated)');

      // Tenancy-checked before it is stored: an id from the request body that lands in a foreign
      // key is invariant 1's exact shape, and a payout pointing at another workspace's bill would
      // settle it from the feed.
      if (supplierBillId) {
        const { data: billRow } = await service
          .from('supplier_bills')
          .select('id')
          .eq('id', supplierBillId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (!billRow) throw new HttpError(404, 'not found');
      }

      const requestId = clientRequestId ?? crypto.randomUUID();

      // A repeat of the SAME instruction is not a second payment. The audit row is keyed on the
      // request id, so an existing one means Revolut has already been told — answer with what
      // happened rather than telling it again.
      const { data: priorPayout } = await service
        .from('revolut_payouts')
        .select('id, provider_id, state, kind')
        .eq('workspace_id', workspaceId)
        .eq('request_id', requestId)
        .maybeSingle();
      if (priorPayout) {
        return jsonResponse({
          ok: true,
          mode: priorPayout.kind,
          duplicate: true,
          ...(priorPayout.kind === 'draft' ? { draft_id: priorPayout.provider_id } : { payment_id: priorPayout.provider_id }),
          note: 'This payment instruction was already sent — nothing was sent twice.',
        });
      }

      const bankAny = bank as any;
      const cpName = String(bankAny.account_holder || bankAny.company?.name || bankAny.contact?.name || '');
      const { data: audit, error: auditErr } = await service.from('revolut_payouts').insert({
        workspace_id: workspaceId,
        request_id: requestId,
        kind: mode,
        amount, currency,
        source_revolut_account_id: sourceAccountId,
        crm_bank_account_id: crmBankId,
        counterparty_name: cpName,
        reference,
        // The LINK (#359 CM-19). The reference text is a convenience for whoever reads the bank
        // statement; the bill this pays is a foreign key, set by the screen that already knew it.
        supplier_bill_id: supplierBillId,
        created_by: auth.userId,
      }).select('id').single();
      if (auditErr || !audit) throw new HttpError(500, `audit insert failed: ${auditErr?.message}`);

      try {
        if (mode === 'draft') {
          const draft = await createPaymentDraft(service, cfg, issuer, {
            title: reference || `Payment to ${cpName}`,
            payments: [{
              account_id: sourceAccountId,
              receiver: { counterparty_id: bank.revolut_counterparty_id },
              amount, currency,
              reference: reference || undefined,
            }],
          });
          await service.from('revolut_payouts').update({ provider_id: draft.id, state: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', audit.id);
          return jsonResponse({ ok: true, mode, draft_id: draft.id, note: 'Approve the draft in the Revolut app to execute it.' });
        }
        const pay = await createPayment(service, cfg, issuer, {
          request_id: requestId,
          account_id: sourceAccountId,
          receiver: { counterparty_id: bank.revolut_counterparty_id },
          amount, currency,
          reference: reference || undefined,
        });
        await service.from('revolut_payouts').update({ provider_id: pay.id, state: pay.state ?? 'pending', updated_at: new Date().toISOString() }).eq('id', audit.id);
        return jsonResponse({ ok: true, mode, payment_id: pay.id, state: pay.state });
      } catch (err) {
        await service.from('revolut_payouts').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', audit.id);
        throw err;
      }
    }

    case 'pay-due-bills': {
      // One multi-payment DRAFT covering the due supplier bills — a single in-app
      // approval executes the whole run. Bills whose supplier has no VoP-linked
      // Revolut counterparty are skipped and reported, never guessed.
      const sourceAccountId = String(body?.source_revolut_account_id ?? '');
      if (!sourceAccountId) throw new HttpError(400, 'source_revolut_account_id is required');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');

      const billIds: string[] | null = Array.isArray(body?.bill_ids) ? body.bill_ids.map(String) : null;
      let q = service
        .from('supplier_bills')
        .select('id, supplier_bill_number, supplier_name, supplier_company_id, supplier_contact_id, amount_due, currency, due_at')
        .eq('workspace_id', workspaceId)
        .gt('amount_due', 0)
        .order('due_at', { ascending: true })
        .limit(25);
      q = billIds ? q.in('id', billIds) : q.lte('due_at', new Date().toISOString().slice(0, 10));
      const { data: bills, error: billErr } = await q;
      if (billErr) throw new HttpError(500, billErr.message);
      if (!bills?.length) return jsonResponse({ ok: true, drafted: 0, skipped: [], note: 'No due bills.' });

      const payments: Array<{ account_id: string; receiver: { counterparty_id: string }; amount: number; currency: string; reference?: string }> = [];
      const auditRows: Array<Record<string, unknown>> = [];
      const skipped: Array<{ bill: string; reason: string }> = [];
      const requestId = crypto.randomUUID();

      /**
       * A bill already out for payment is NOT drafted again.
       *
       * Nothing stopped a second run covering the same bills: a double-click, or a retry after
       * the draft call timed out with the draft already created at Revolut. The operator then
       * has two drafts that look alike, and approving both pays every supplier twice. The
       * approval step is what makes this survivable, not what makes it safe — the whole point of
       * a bill run is that one approval executes many payments, so "there are two of them" is
       * exactly the thing an approver is least likely to catch.
       *
       * A payout that FAILED is not a payment, so those do not block a genuine retry. Anything
       * else — drafted, awaiting approval, executed — does.
       */
      const DEAD_PAYOUT_STATES = ['failed', 'cancelled', 'declined', 'expired', 'reverted'];
      const { data: livePayouts, error: livePayoutErr } = await service
        .from('revolut_payouts')
        .select('supplier_bill_id, state')
        .eq('workspace_id', workspaceId)
        .in('supplier_bill_id', (bills as any[]).map((b) => b.id));
      // Not knowing is not the same as "none". Refuse rather than risk a second bill run.
      if (livePayoutErr) {
        throw new HttpError(503, 'Could not check which bills already have a payment out; the run was refused rather than risk paying suppliers twice.');
      }
      const alreadyOut = new Set(
        (livePayouts ?? [])
          .filter((r: any) => !DEAD_PAYOUT_STATES.includes(String(r.state ?? '').toLowerCase()))
          .map((r: any) => String(r.supplier_bill_id)),
      );

      for (const bill of bills as any[]) {
        if (alreadyOut.has(String(bill.id))) {
          skipped.push({ bill: bill.supplier_bill_number ?? bill.id, reason: 'a payment for this bill is already drafted or sent' });
          continue;
        }
        let bq = service
          .from('crm_bank_accounts')
          .select('id, revolut_counterparty_id, account_holder')
          .eq('workspace_id', workspaceId)
          .not('revolut_counterparty_id', 'is', null)
          .order('is_primary', { ascending: false })
          .limit(1);
        bq = bill.supplier_company_id
          ? bq.eq('company_id', bill.supplier_company_id)
          : bq.eq('contact_id', bill.supplier_contact_id ?? '00000000-0000-0000-0000-000000000000');
        const { data: bank } = await bq.maybeSingle();
        if (!bank?.revolut_counterparty_id) {
          skipped.push({ bill: bill.supplier_bill_number ?? bill.id, reason: 'supplier has no VoP-linked Revolut counterparty' });
          continue;
        }
        payments.push({
          account_id: sourceAccountId,
          receiver: { counterparty_id: bank.revolut_counterparty_id },
          amount: Number(bill.amount_due),
          currency: String(bill.currency ?? 'EUR').toUpperCase(),
          reference: String(bill.supplier_bill_number ?? '').slice(0, 140) || undefined,
        });
        auditRows.push({
          workspace_id: workspaceId,
          request_id: `${requestId}:${bill.id}`,
          kind: 'draft',
          // WE INSTRUCTED THIS PAYMENT, SO WE KNOW WHICH BILL IT PAYS (#359 CM-19).
          //
          // `supplier_bill_id` is the real binding — `reconcileOutgoingRevolut` reads it first and
          // only falls back to matching the reference TEXT when it is absent, which CM-19 calls
          // "guessing at something we recorded". Three of the four instruction paths set it
          // (`send-payment`, `confirm-bill-match`, the reconciler itself); this one — the bulk run,
          // the path that pays the most bills at once — did not, so every bill paid through it
          // reconciled by guess. It is also what the duplicate guard above reads.
          supplier_bill_id: bill.id,
          amount: Number(bill.amount_due),
          currency: String(bill.currency ?? 'EUR').toUpperCase(),
          source_revolut_account_id: sourceAccountId,
          crm_bank_account_id: bank.id,
          counterparty_name: bill.supplier_name ?? bank.account_holder ?? null,
          reference: `Bill ${bill.supplier_bill_number ?? bill.id}`,
          created_by: auth.userId,
        });
      }
      if (payments.length === 0) return jsonResponse({ ok: true, drafted: 0, skipped });

      const { error: auditErr } = await service.from('revolut_payouts').insert(auditRows);
      if (auditErr) throw new HttpError(500, `audit insert failed: ${auditErr.message}`);
      const draft = await createPaymentDraft(service, cfg, issuer, {
        title: `Supplier bill run — ${payments.length} payment(s)`,
        payments,
      });
      await service.from('revolut_payouts')
        .update({ provider_id: draft.id, state: 'pending_approval', updated_at: new Date().toISOString() })
        .like('request_id', `${requestId}:%`);
      return jsonResponse({ ok: true, drafted: payments.length, draft_id: draft.id, skipped, note: 'Approve the draft in the Revolut app to pay the whole run.' });
    }

    case 'create-card-invitation': {
      // Invite someone (e.g. a new hire) to Revolut so a card can be issued to them.
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'a valid email is required');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const res = await revolutFetch(service, cfg, issuer, '/card-invitations', {
        method: 'POST',
        body: JSON.stringify({ email, request_id: crypto.randomUUID() }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(502, `invitation failed (${res.status}): ${JSON.stringify(out).slice(0, 200)}`);
      return jsonResponse({ ok: true, invitation: out });
    }

    case 'set-card-limit': {
      // Weekly/monthly spending cap on a card (budget control per salesperson).
      const cardId = String(body?.card_id ?? '');
      const amount = Number(body?.amount ?? 0);
      const period = body?.period === 'week' ? 'week' : 'month';
      const currency = String(body?.currency ?? 'EUR').toUpperCase();
      if (!cardId) throw new HttpError(400, 'card_id is required');
      if (!(amount > 0)) throw new HttpError(400, 'amount must be positive');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const res = await revolutFetch(service, cfg, issuer, `/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify({ spending_limits: { [period]: { amount, currency } } }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new HttpError(502, `limit update failed (${res.status}): ${text.slice(0, 200)}`);
      }
      return jsonResponse({ ok: true });
    }

    case 'create-payout-link': {
      // Refund/pay someone WITHOUT knowing their IBAN — they claim via the link.
      const name = String(body?.counterparty_name ?? '').trim();
      const sourceAccountId = String(body?.source_revolut_account_id ?? '');
      const amount = Number(body?.amount ?? 0);
      const currency = String(body?.currency ?? 'EUR').toUpperCase();
      const reference = String(body?.reference ?? '').slice(0, 140);
      if (!name || !sourceAccountId) throw new HttpError(400, 'counterparty_name and source_revolut_account_id are required');
      if (!(amount > 0)) throw new HttpError(400, 'amount must be positive');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');

      const requestId = crypto.randomUUID();
      const { data: audit, error: auditErr } = await service.from('revolut_payouts').insert({
        workspace_id: workspaceId, request_id: requestId, kind: 'payout_link',
        amount, currency, source_revolut_account_id: sourceAccountId,
        counterparty_name: name, reference, created_by: auth.userId,
      }).select('id').single();
      if (auditErr || !audit) throw new HttpError(500, `audit insert failed: ${auditErr?.message}`);

      try {
        const link = await createPayoutLink(service, cfg, issuer, {
          counterparty_name: name, request_id: requestId,
          account_id: sourceAccountId, amount, currency,
          reference: reference || undefined,
        });
        await service.from('revolut_payouts').update({
          provider_id: link.id, provider_url: link.url ?? null,
          state: link.state ?? 'created', updated_at: new Date().toISOString(),
        }).eq('id', audit.id);
        return jsonResponse({ ok: true, link_id: link.id, url: link.url ?? null });
      } catch (err) {
        await service.from('revolut_payouts').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', audit.id);
        throw err;
      }
    }

    case 'fx-rate': {
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const from = String(body?.from ?? '').toUpperCase();
      const to = String(body?.to ?? '').toUpperCase();
      const amount = Number(body?.amount ?? 1);
      if (!from || !to) throw new HttpError(400, 'from and to currencies are required');
      const rate = await getExchangeRate(service, cfg, issuer, from, to, amount);
      return jsonResponse({ ok: true, rate });
    }

    case 'exchange': {
      // Treasury conversion between the business's own pockets.
      const fromAccountId = String(body?.from_account_id ?? '');
      const toAccountId = String(body?.to_account_id ?? '');
      const fromCurrency = String(body?.from_currency ?? '').toUpperCase();
      const toCurrency = String(body?.to_currency ?? '').toUpperCase();
      const amount = Number(body?.amount ?? 0);
      if (!fromAccountId || !toAccountId || !fromCurrency || !toCurrency) {
        throw new HttpError(400, 'from/to account ids and currencies are required');
      }
      if (!(amount > 0)) throw new HttpError(400, 'amount must be positive');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');

      const requestId = crypto.randomUUID();
      const { data: audit, error: auditErr } = await service.from('revolut_payouts').insert({
        workspace_id: workspaceId, request_id: requestId, kind: 'exchange',
        amount, currency: fromCurrency, source_revolut_account_id: fromAccountId,
        counterparty_name: null, reference: `FX ${fromCurrency}→${toCurrency}`, created_by: auth.userId,
      }).select('id').single();
      if (auditErr || !audit) throw new HttpError(500, `audit insert failed: ${auditErr?.message}`);

      try {
        const fx = await exchangeMoney(service, cfg, issuer, {
          request_id: requestId,
          from: { account_id: fromAccountId, currency: fromCurrency, amount },
          to: { account_id: toAccountId, currency: toCurrency },
        });
        await service.from('revolut_payouts').update({
          provider_id: fx.id ?? null, state: fx.state ?? 'completed', updated_at: new Date().toISOString(),
        }).eq('id', audit.id);
        return jsonResponse({ ok: true, exchange_id: fx.id ?? null, state: fx.state ?? null });
      } catch (err) {
        await service.from('revolut_payouts').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', audit.id);
        throw err;
      }
    }

    case 'sync-labels': {
      // One-way push: platform finance categories → a "Platform categories" Revolut
      // label group, so staff labelling transactions in Revolut sees the SAME
      // vocabulary the platform's P&L uses. Names only; never deletes.
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const { data: cats } = await service
        .from('finance_categories')
        .select('name')
        .eq('workspace_id', workspaceId)
        .limit(200);
      const wanted = [...new Set((cats ?? []).map((c: any) => String(c.name ?? '').trim()).filter(Boolean))];
      if (wanted.length === 0) return jsonResponse({ ok: true, created: 0, note: 'No finance categories to sync.' });

      const groups = await revolutJson<Array<{ id: string; name: string }>>(service, cfg, issuer, '/label-groups');
      let group = (groups ?? []).find((g) => g.name === 'Platform categories');
      if (!group) {
        group = await revolutJson<{ id: string; name: string }>(service, cfg, issuer, '/label-groups', {
          method: 'POST',
          body: JSON.stringify({ name: 'Platform categories' }),
        });
      }
      const labels = await revolutJson<Array<{ id: string; name: string }>>(
        service, cfg, issuer, `/label-groups/${group.id}/labels`,
      ).catch(() => [] as Array<{ id: string; name: string }>);
      const existing = new Set((labels ?? []).map((l) => l.name));
      let created = 0;
      for (const name of wanted) {
        if (existing.has(name)) continue;
        await revolutJson(service, cfg, issuer, `/label-groups/${group.id}/labels`, {
          method: 'POST',
          body: JSON.stringify({ name: name.slice(0, 50) }),
        }).then(() => { created++; }).catch((err) => console.warn('[revolut-api] label create failed:', err?.message ?? err));
      }
      return jsonResponse({ ok: true, group_id: group.id, created, total: wanted.length });
    }

    case 'team-members': {
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const members = await listTeamMembers(service, cfg, issuer);
      return jsonResponse({ ok: true, members });
    }

    case 'cards': {
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const cards = await listCards(service, cfg, issuer);
      return jsonResponse({ ok: true, cards });
    }

    case 'create-card': {
      // Virtual cards only — instant, no shipping address plumbing.
      const holderId = String(body?.holder_id ?? '');
      if (!holderId) throw new HttpError(400, 'holder_id (Revolut team member) is required');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const card = await createCard(service, cfg, issuer, {
        holder_id: holderId,
        label: body?.label ? String(body.label).slice(0, 30) : undefined,
        virtual: true,
      });
      return jsonResponse({ ok: true, card });
    }

    case 'freeze-card':
    case 'unfreeze-card': {
      const cardId = String(body?.card_id ?? '');
      if (!cardId) throw new HttpError(400, 'card_id is required');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const res = await setCardFrozen(service, cfg, issuer, cardId, action === 'freeze-card');
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new HttpError(502, `${action} failed (${res.status}): ${text.slice(0, 200)}`);
      }
      return jsonResponse({ ok: true });
    }

    case 'import-expenses': {
      // Card→person attribution: pull card expenses into per-employee monthly reports.
      const cfg = await requireConfig(service, workspaceId);
      const { importRevolutExpenses } = await import('../_shared/revolut/expenses-import.ts');
      const out = await importRevolutExpenses(service, cfg);
      if (!out.ok) throw new HttpError(502, out.errors[0] ?? 'expense import failed');
      return jsonResponse(out);
    }

    case 'expenses': {
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const from = body?.from ? String(body.from) : new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
      const expenses = await listExpenses(service, cfg, issuer, { from, count: 100 });
      return jsonResponse({ ok: true, expenses });
    }

    case 'expense-receipt': {
      // Receipt passthrough — fetched on demand, never persisted (no storage GC surface).
      const expenseId = String(body?.expense_id ?? '');
      const receiptId = String(body?.receipt_id ?? '');
      if (!expenseId || !receiptId) throw new HttpError(400, 'expense_id and receipt_id are required');
      const cfg = await requireConfig(service, workspaceId);
      const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
      const { bytes, contentType } = await getExpenseReceipt(service, cfg, issuer, expenseId, receiptId);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return jsonResponse({ ok: true, content_type: contentType, base64: btoa(bin) });
    }

    case 'disconnect': {
      const cfg = await requireConfig(service, workspaceId);
      // Best-effort webhook teardown; a failure here must not block the disconnect.
      if (cfg.webhook_id) {
        try {
          await fetch(`${webhooksV2Base(cfg)}/webhooks/${cfg.webhook_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${await tokenFor(service, cfg)}` },
          });
        } catch { /* token may already be dead — that is fine */ }
      }
      const { error } = await service.from('workspace_revolut_config').update({
        refresh_token: null,
        access_token: null,
        access_token_expires_at: null,
        connected_at: null,
        webhook_id: null,
        webhook_signing_secret: null,
        webhook_verified_at: null,
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(500, `disconnect failed: ${error.message}`);
      return jsonResponse({ ok: true });
    }

    default:
      throw new HttpError(400, `unknown action "${action}"`);
  }
}));

async function requireConfig(service: any, workspaceId: string): Promise<RevolutConfigRow> {
  const cfg = await resolveRevolutConfig(service, workspaceId);
  if (!cfg) throw new HttpError(400, 'Revolut is not set up for this workspace — run init first');
  return cfg;
}

async function tokenFor(service: any, cfg: RevolutConfigRow): Promise<string> {
  const { getRevolutAccessToken } = await import('../_shared/revolut/client.ts');
  return await getRevolutAccessToken(service, cfg, issuerDomainFrom(cfg.oauth_redirect_uri ?? ''));
}
