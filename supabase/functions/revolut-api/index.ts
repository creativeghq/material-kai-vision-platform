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
      const url = `${revolutHosts(cfg.environment).authorize}?client_id=${encodeURIComponent(cfg.client_id)}` +
        `&redirect_uri=${encodeURIComponent(cfg.oauth_redirect_uri)}&response_type=code`;
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
      // The shared client prefixes the v1 base; webhooks v2 needs its own absolute call.
      const v2 = await fetch(`${webhooksV2Base(cfg)}/webhooks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await tokenFor(service, cfg)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: hookUrl,
          events: ['TransactionCreated', 'TransactionStateChanged'],
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
      // Pass Revolut's verdict through verbatim (result_code: matched | close_match |
      // not_matched | cannot_be_checked, plus any suggested actual name).
      return jsonResponse({ ok: true, ...out });
    }

    case 'reconcile': {
      // Re-run the matcher over unmatched incoming lines (auto after every sync too).
      const { reconcileWorkspaceRevolut } = await import('../_shared/revolut/reconcile.ts');
      const rec = await reconcileWorkspaceRevolut(service, workspaceId);
      return jsonResponse({ ok: true, ...rec });
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
      if (tx.match_status === 'matched') throw new HttpError(400, 'line is already matched');
      if (tx.direction !== 'in') throw new HttpError(400, 'only incoming lines can settle an invoice');

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
      if (!crmBankId || !sourceAccountId) throw new HttpError(400, 'crm_bank_account_id and source_revolut_account_id are required');
      if (!(amount > 0)) throw new HttpError(400, 'amount must be positive');

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

      const requestId = crypto.randomUUID();
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
